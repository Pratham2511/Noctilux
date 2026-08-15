// ============================================================================
// extension.ts — VS Code Extension Activation Entry Point
// src/extension.ts
//
// Activation sequence (per Part 1a of spec):
//   1. Initialize WorkspaceService (.qmind/ folder)
//   2. Initialize SecretsService (VS Code SecretStorage)
//   3. Start BackendManager (Python subprocess on localhost)
//   4. Register all commands and keybindings
//   5. On deactivate: graceful backend shutdown
// ============================================================================

import * as vscode from 'vscode';
import * as path from 'path';
import { BackendManager } from './BackendManager';
import { QueryMindPanel } from './panels/QueryMindPanel';
import { SchemaPanel } from './panels/SchemaPanel';
import { QueryTreePanel } from './panels/QueryTreePanel';
import { WorkspaceService } from './services/WorkspaceService';
import { SecretsService } from './services/SecretsService';

let backendManager: BackendManager | undefined;
let workspaceService: WorkspaceService | undefined;
let secretsService: SecretsService | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.info('[QueryMind] Activating extension v3.0.0…');

  // ─── 1. Determine workspace root ────────────────────────────────────
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      'QueryMind requires an open workspace folder. Open a folder and try again.'
    );
    return;
  }
  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // ─── 2. Initialize services ──────────────────────────────────────────
  workspaceService = new WorkspaceService(workspaceRoot);
  secretsService = new SecretsService(context.secrets);

  // Ensure privacy salt exists (Novel Contribution #2 — Privacy Shield)
  await secretsService.ensurePrivacySalt();

  // ─── 3. Read config & start backend ──────────────────────────────────
  const config = vscode.workspace.getConfiguration('querymind');
  const pythonPath = config.get<string>('backend.pythonPath', 'python3');
  const startPort = config.get<number>('backend.startPort', 8765);
  const backendScriptPath = path.join(context.extensionPath, 'python_backend', 'main.py');

  backendManager = new BackendManager(
    pythonPath,
    backendScriptPath,
    workspaceRoot,
    startPort
  );

  // Fire-and-forget — don't block activation on backend ready
  backendManager.start().then(status => {
    vscode.window.setStatusBarMessage(
      `QueryMind backend: ${status.state}${status.port ? ` (port ${status.port})` : ''}`,
      3000
    );
  });

  backendManager.on('status', (status) => {
    QueryMindPanel.currentPanel?.panel.webview.postMessage({
      type: 'BACKEND_STATUS',
      payload: status,
    });
  });

  // ─── 4. Register commands ───────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('querymind.openChat', () => {
      if (!workspaceService || !secretsService || !backendManager) return;
      QueryMindPanel.createOrShow(
        context,
        backendManager.getClient(),
        workspaceService,
        secretsService
      );
    }),

    vscode.commands.registerCommand('querymind.runLastQuery', async () => {
      if (!workspaceService || !backendManager?.getClient()) return;
      const history = await workspaceService.readHistory();
      if (history.length === 0) {
        vscode.window.showInformationMessage('No previous queries to re-run.');
        return;
      }
      const last = history[history.length - 1];
      const client = backendManager.getClient()!;
      try {
        const result = await client.execute({ sql: last.sql, dbConfigId: 'default' });
        vscode.window.showInformationMessage(
          `Query executed in ${result.executionTimeMs}ms — ${result.rowCount} rows.`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Re-execution failed: ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand('querymind.showSchema', () => {
      if (!backendManager) return;
      SchemaPanel.createOrShow(context, backendManager.getClient());
    }),

    vscode.commands.registerCommand('querymind.openQueryTree', () => {
      if (!workspaceService) return;
      QueryTreePanel.createOrShow(context, workspaceService);
    }),

    vscode.commands.registerCommand('querymind.addConnection', async () => {
      if (!workspaceService || !secretsService) return;
      const name = await vscode.window.showInputBox({ prompt: 'Connection name', placeHolder: 'Production Postgres' });
      if (!name) return;
      const dialect = await vscode.window.showQuickPick(
        ['postgresql', 'mysql', 'sqlite', 'mssql', 'mongodb'],
        { placeHolder: 'Database dialect' }
      );
      if (!dialect) return;
      const host = await vscode.window.showInputBox({ prompt: 'Host', placeHolder: 'localhost' });
      if (host === undefined) return;
      const portStr = await vscode.window.showInputBox({ prompt: 'Port', placeHolder: '5432' });
      if (portStr === undefined) return;
      const database = await vscode.window.showInputBox({ prompt: 'Database name' });
      if (database === undefined) return;
      const user = await vscode.window.showInputBox({ prompt: 'User' });
      if (user === undefined) return;
      const password = await vscode.window.showInputBox({
        prompt: 'Password (will be stored in OS keychain, never on disk)',
        password: true,
      });
      const id = crypto.randomUUID();
      if (password) {
        await secretsService.setDbPassword(id, password);
      }
      const cfg = await workspaceService.readConfig();
      cfg.connections.push({
        id, name, dialect: dialect as any, host: host || 'localhost',
        port: parseInt(portStr || '5432', 10), database, user,
      });
      await workspaceService.writeConfig(cfg);
      vscode.window.showInformationMessage(`Connection "${name}" saved.`);
    }),

    vscode.commands.registerCommand('querymind.runRobustnessTest', async () => {
      if (!backendManager?.getClient() || !workspaceService) return;
      const history = await workspaceService.readHistory();
      if (history.length === 0) {
        vscode.window.showWarningMessage('No saved queries to test. Run some queries first.');
        return;
      }
      const report = await backendManager.getClient()!.runRobustness({
        dbConfigId: 'default',
        querySet: history.map(h => ({ id: h.id, sql: h.sql, nlInput: h.nlInput })),
      });
      vscode.window.showInformationMessage(
        `Robustness score: ${report.overallScore}% (${report.survivedAll}/${report.totalQueries} survived all perturbations).`
      );
      vscode.window.showTextDocument(
        vscode.Uri.parse(
          `querymind://robustness/${encodeURIComponent(JSON.stringify(report))}`
        )
      );
    }),

    vscode.commands.registerCommand('querymind.restartBackend', async () => {
      if (!backendManager) return;
      vscode.window.showInformationMessage('Restarting QueryMind backend…');
      await backendManager.restart();
    }),

    vscode.commands.registerCommand('querymind.openGlossaryEditor', () => {
      if (!workspaceService || !backendManager) return;
      QueryMindPanel.createOrShow(
        context,
        backendManager.getClient(),
        workspaceService,
        secretsService!
      );
      // Switch webview to glossary tab via postMessage
      QueryMindPanel.currentPanel?.panel.webview.postMessage({
        type: 'GLOSSARY_SAVED',
        payload: { openEditor: true },
      });
    })
  );

  // ─── 5. Register URI handler for robustness report ─────────────────
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('querymind', {
      provideTextDocumentContent(uri: vscode.Uri): string {
        const json = decodeURIComponent(uri.path.slice(1));
        try {
          const obj = JSON.parse(json);
          return [
            '# Schema Evolution Robustness Report',
            '',
            `Overall Robustness Score: ${obj.overallScore}%  (${obj.survivedAll} of ${obj.totalQueries} queries survive all perturbations)`,
            '',
            `Most fragile perturbation type: ${obj.mostFragile}`,
            `Most resilient perturbation type: ${obj.mostResilient}`,
            '',
            '## Per-Perturbation Breakdown',
            '',
            ...obj.perPerturbation.map((p: any) =>
              `- **${p.perturbationType}**: breakage ${p.breakageRate}%, hallucination ${p.hallucinationRate}%`
            ),
            '',
            '## Recommendations',
            '',
            ...(obj.recommendations || []).map((r: string) => `- ${r}`),
          ].join('\n');
        } catch {
          return 'Invalid robustness report payload.';
        }
      },
    })
  );

  console.info('[QueryMind] Extension activated successfully.');
}

export async function deactivate(): Promise<void> {
  console.info('[QueryMind] Deactivating extension…');
  await backendManager?.stop();
}
