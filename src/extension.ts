// ============================================================================
// extension.ts — VS Code Extension Activation Entry Point
// src/extension.ts
//
// Activation sequence:
//   0. Initialize SecretsService + first-run Gemini API key prompt
//   1. Initialize WorkspaceService (.qmind/ folder)
//   2. Start BackendManager (Python subprocess on localhost)
//   3. Register all commands (noctilux.*) and keybindings
//   4. On deactivate: graceful backend shutdown
// ============================================================================

import * as vscode from 'vscode';
import * as path from 'path';
import { BackendManager } from './BackendManager';
import { NoctiluxPanel } from './panels/NoctiluxPanel';
import { SchemaPanel } from './panels/SchemaPanel';
import { QueryTreePanel } from './panels/QueryTreePanel';
import { WorkspaceService } from './services/WorkspaceService';
import { SecretsService } from './services/SecretsService';

let backendManager: BackendManager | undefined;
let workspaceService: WorkspaceService | undefined;
let secretsService: SecretsService | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.info('[Noctilux] Activating extension v1.0.0…');

  // ─── 0. Initialize SecretsService (VS Code SecretStorage) ─────────────
  secretsService = new SecretsService(context);

  // ── First-run API key prompt ──────────────────────────────────────
  const existingKey = await secretsService.getGeminiKey();
  if (!existingKey) {
    const action = await vscode.window.showInformationMessage(
      'Welcome to Noctilux! A free Gemini API key is needed to generate queries.',
      'Set API Key',
      'Get Free Key',
      'Later'
    );
    if (action === 'Set API Key') {
      await promptForApiKey(secretsService, 'gemini');
    } else if (action === 'Get Free Key') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://aistudio.google.com/app/apikey')
      );
    }
  }

  // ─── 1. Determine workspace root ────────────────────────────────────
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      'Noctilux requires an open workspace folder. Open a folder and try again.'
    );
    return;
  }
  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // ─── 2. Initialize workspace service ──────────────────────────────────
  workspaceService = new WorkspaceService(workspaceRoot);

  // ─── 3. Read config & start backend ──────────────────────────────────
  const config = vscode.workspace.getConfiguration('noctilux');
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
      `Noctilux backend: ${status.state}${status.port ? ` (port ${status.port})` : ''}`,
      3000
    );
  });

  backendManager.on('status', (status) => {
    NoctiluxPanel.currentPanel?.panel.webview.postMessage({
      type: 'BACKEND_STATUS',
      payload: status,
    });
  });

  // ─── 4. Register commands ───────────────────────────────────────────
  context.subscriptions.push(

    vscode.commands.registerCommand('noctilux.setApiKey', async () => {
      const provider = await vscode.window.showQuickPick(
        ['gemini', 'groq'],
        { title: 'Which provider are you setting a key for?' }
      );
      if (provider) {
        await promptForApiKey(secretsService, provider as 'gemini' | 'groq');
      }
    }),

    vscode.commands.registerCommand('noctilux.clearApiKey', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Remove stored Noctilux API key?',
        { modal: true },
        'Remove'
      );
      if (confirm === 'Remove') {
        await secretsService.deleteGeminiKey();
        vscode.window.showInformationMessage('API key removed.');
      }
    }),

    vscode.commands.registerCommand('noctilux.openChat', () => {
      if (!workspaceService || !secretsService || !backendManager) return;
      NoctiluxPanel.createOrShow(
        context,
        backendManager.getClient(),
        workspaceService,
        secretsService
      );
    }),

    vscode.commands.registerCommand('noctilux.runLastQuery', async () => {
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

    vscode.commands.registerCommand('noctilux.showSchema', () => {
      if (!backendManager) return;
      SchemaPanel.createOrShow(context, backendManager.getClient());
    }),

    vscode.commands.registerCommand('noctilux.openQueryTree', () => {
      if (!workspaceService) return;
      QueryTreePanel.createOrShow(context, workspaceService);
    }),

    vscode.commands.registerCommand('noctilux.addConnection', async () => {
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
        await secretsService.storeDbPassword(id, password);
      }
      const cfg = await workspaceService.readConfig();
      cfg.connections.push({
        id, name, dialect: dialect as any, host: host || 'localhost',
        port: parseInt(portStr || '5432', 10), database, user,
      });
      await workspaceService.writeConfig(cfg);
      vscode.window.showInformationMessage(`Connection "${name}" saved.`);
    }),

    vscode.commands.registerCommand('noctilux.runRobustnessTest', async () => {
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
          `noctilux://robustness/${encodeURIComponent(JSON.stringify(report))}`
        )
      );
    }),

    vscode.commands.registerCommand('noctilux.restartBackend', async () => {
      if (!backendManager) return;
      vscode.window.showInformationMessage('Restarting Noctilux backend…');
      await backendManager.restart();
    }),

    vscode.commands.registerCommand('noctilux.openGlossaryEditor', () => {
      if (!workspaceService || !backendManager) return;
      NoctiluxPanel.createOrShow(
        context,
        backendManager.getClient(),
        workspaceService,
        secretsService!
      );
      // Switch webview to glossary tab via postMessage
      NoctiluxPanel.currentPanel?.panel.webview.postMessage({
        type: 'GLOSSARY_SAVED',
        payload: { openEditor: true },
      });
    })
  );

  // ─── 5. Register URI handler for robustness report ─────────────────
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('noctilux', {
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

  console.info('[Noctilux] Extension activated successfully.');
}

export async function deactivate(): Promise<void> {
  console.info('[Noctilux] Deactivating extension…');
  await backendManager?.stop();
}

// ── Helper — reusable key prompt ─────────────────────────────────────
async function promptForApiKey(
  secrets: SecretsService,
  provider: 'gemini' | 'groq'
): Promise<void> {
  const labels = {
    gemini: {
      title: 'Noctilux — Gemini API Key',
      prompt: 'Free key at aistudio.google.com → Create API Key',
      placeholder: 'AIzaSy...',
      validator: (v: string) =>
        v.startsWith('AIza') ? null : 'Gemini keys start with AIza'
    },
    groq: {
      title: 'Noctilux — Groq API Key',
      prompt: 'Free key at console.groq.com → API Keys',
      placeholder: 'gsk_...',
      validator: (v: string) =>
        v.startsWith('gsk_') ? null : 'Groq keys start with gsk_'
    }
  };

  const cfg = labels[provider];
  const key = await vscode.window.showInputBox({
    title: cfg.title,
    prompt: cfg.prompt,
    password: true,
    ignoreFocusOut: true,
    placeHolder: cfg.placeholder,
    validateInput: cfg.validator
  });

  if (key) {
    if (provider === 'gemini') { await secrets.storeGeminiKey(key); }
    else { await secrets.storeGroqKey(key); }
    vscode.window.showInformationMessage(
      `✅ ${provider === 'gemini' ? 'Gemini' : 'Groq'} key saved securely.`
    );
  }
}
