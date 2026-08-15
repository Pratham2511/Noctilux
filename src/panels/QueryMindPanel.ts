// ============================================================================
// QueryMindPanel — Main webview panel (chat + SQL + results)
// src/panels/QueryMindPanel.ts
//
// Hosts the React webview that contains ChatPanel, SQLCodeBlock,
// ResultTable, NarrativeCard, ConfidenceBar. All postMessage traffic
// between the webview and the extension host is routed through here.
// ============================================================================

import * as vscode from 'vscode';
import * as path from 'path';
import { WebviewMessage, ChatMessage } from '../types';
import { BackendClient } from '../services/BackendClient';
import { WorkspaceService } from '../services/WorkspaceService';
import { SecretsService } from '../services/SecretsService';

export class QueryMindPanel {
  public static currentPanel: QueryMindPanel | undefined;
  private static readonly viewType = 'querymind.panel';

  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    context: vscode.ExtensionContext,
    client: BackendClient | null,
    workspace: WorkspaceService,
    secrets: SecretsService
  ): QueryMindPanel {
    if (QueryMindPanel.currentPanel) {
      QueryMindPanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
      return QueryMindPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      QueryMindPanel.viewType,
      'QueryMind — Chat',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webview', 'dist')),
        ],
      }
    );
    QueryMindPanel.currentPanel = new QueryMindPanel(panel, context, client, workspace, secrets);
    return QueryMindPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly client: BackendClient | null,
    private readonly workspace: WorkspaceService,
    private readonly secrets: SecretsService
  ) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'icon.svg'));
    this.panel.webview.html = this.getHtml();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      msg => this.onMessage(msg),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  // ─── Message Routing ───────────────────────────────────────────────
  private async onMessage(msg: WebviewMessage): Promise<void> {
    if (!this.client) {
      this.sendError('Backend not ready yet. Please wait a moment and try again.');
      return;
    }

    try {
      switch (msg.type) {
        case 'GENERATE_SQL': {
          const payload = msg.payload as {
            input: string;
            sessionId: string;
            dbConfigId: string;
            disambiguationAnswers?: Record<string, string>;
          };

          // Read preference memory to attach as context
          const memory = await this.workspace.readMemory();

          const result = await this.client.generate({
            nlInput: payload.input,
            dbConfigId: payload.dbConfigId,
            sessionId: payload.sessionId,
            disambiguationAnswers: payload.disambiguationAnswers,
          });

          this.panel.webview.postMessage({
            type: 'SQL_GENERATED',
            requestId: msg.requestId,
            payload: {
              ...result,
              input: payload.input,
              memory: { disambiguationRules: memory.disambiguationRules },
            },
          });
          break;
        }

        case 'EXECUTE_SQL': {
          const payload = msg.payload as {
            sql: string;
            dbConfigId: string;
            rowLimit?: number;
            timeoutSeconds?: number;
          };
          const execResult = await this.client.execute(payload);

          // Write to performance log + history (Contributions #3, #11)
          await this.workspace.appendPerfLog({
            queryFingerprint: hashSql(payload.sql),
            timestamp: Date.now(),
            executionTimeMs: execResult.executionTimeMs,
            rowsScanned: execResult.rowsScanned,
          });
          await this.workspace.appendHistory({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            nlInput: '',
            sql: payload.sql,
            success: !execResult.regressionAlert,
            executionTimeMs: execResult.executionTimeMs,
            rowCount: execResult.rowCount,
          });

          this.panel.webview.postMessage({
            type: 'EXECUTION_COMPLETE',
            requestId: msg.requestId,
            payload: execResult,
          });
          break;
        }

        case 'AMBIGUITY_ANSWERED': {
          const payload = msg.payload as {
            ruleKey: string;
            ruleValue: string;
          };
          const memory = await this.workspace.readMemory();
          memory.disambiguationRules[payload.ruleKey] = payload.ruleValue;
          await this.workspace.writeMemory(memory);
          this.panel.webview.postMessage({
            type: 'SETTINGS_UPDATED',
            requestId: msg.requestId,
            payload: { saved: true },
          });
          break;
        }

        case 'ANNOTATION_ADDED': {
          const payload = msg.payload as any;
          const annotations = await this.workspace.readAnnotations();
          annotations.push(payload.annotation);
          await this.workspace.writeAnnotations(annotations);
          this.panel.webview.postMessage({
            type: 'ANNOTATION_ADDED',
            requestId: msg.requestId,
            payload: { saved: true },
          });
          break;
        }

        case 'GLOSSARY_SAVED': {
          const term = msg.payload as any;
          await this.client.saveGlossaryTerm(term);
          this.panel.webview.postMessage({
            type: 'GLOSSARY_SAVED',
            requestId: msg.requestId,
            payload: { saved: true },
          });
          break;
        }

        default:
          console.warn(`[QueryMind] Unhandled message type: ${msg.type}`);
      }
    } catch (err) {
      this.sendError((err as Error).message);
    }
  }

  private sendError(message: string): void {
    this.panel.webview.postMessage({
      type: 'ERROR',
      payload: { message },
    });
  }

  // ─── HTML Shell ────────────────────────────────────────────────────
  private getHtml(): string {
    const nonce = getNonce();
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'main.js'))
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'main.css'))
    );

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src ${this.panel.webview.cspSource} https:;
                 script-src 'nonce-${nonce}';
                 style-src ${this.panel.webview.cspSource} 'unsafe-inline';" />
  <title>QueryMind</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  // ─── Dispose ───────────────────────────────────────────────────────
  public dispose(): void {
    QueryMindPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function hashSql(sql: string): string {
  // Simple FNV-1a hash for query fingerprinting
  let h = 0x811c9dc5;
  const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}
