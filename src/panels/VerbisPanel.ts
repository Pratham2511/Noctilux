// ============================================================================
// VerbisPanel — Main webview panel (chat + SQL + results)
// src/panels/VerbisPanel.ts
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

export class VerbisPanel {
  public static currentPanel: VerbisPanel | undefined;
  private static readonly viewType = 'verbis.panel';

  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    context: vscode.ExtensionContext,
    client: BackendClient | null,
    workspace: WorkspaceService,
    secrets: SecretsService
  ): VerbisPanel {
    if (VerbisPanel.currentPanel) {
      VerbisPanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
      return VerbisPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      VerbisPanel.viewType,
      'Verbis — Chat',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webview', 'dist')),
        ],
      }
    );
    VerbisPanel.currentPanel = new VerbisPanel(panel, context, client, workspace, secrets);
    return VerbisPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly client: BackendClient | null,
    private readonly workspace: WorkspaceService,
    private readonly secrets: SecretsService
  ) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'icon.png'));
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
    // ─── Handle settings / external-link messages WITHOUT requiring the
    //     Python backend to be ready (these are pure host-side operations).
    if (msg.type === 'STORE_API_KEY') {
      const { provider, key } = msg.payload as { provider: 'gemini' | 'groq'; key: string };
      if (provider === 'gemini') { await this.secrets.storeGeminiKey(key); }
      if (provider === 'groq')   { await this.secrets.storeGroqKey(key); }
      this.panel.webview.postMessage({
        type: 'SETTINGS_UPDATED',
        requestId: msg.requestId,
        payload: { saved: true, provider },
      });
      return;
    }
    if (msg.type === 'OPEN_EXTERNAL') {
      const url = msg.payload as string;
      if (typeof url === 'string') {
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
      return;
    }

    // All remaining message types require the backend to be ready.
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

          // ── Resolve provider + API key from VS Code config + SecretStorage ──
          const provider = vscode.workspace
            .getConfiguration('verbis')
            .get<string>('llm.provider', 'gemini');
          const apiKey = (await this.secrets.getActiveApiKey()) ?? '';
          if (!apiKey && provider !== 'local') {
            this.sendError(
              `No ${provider} API key set. Run "Verbis: Set Gemini API Key" first.`
            );
            return;
          }

          const result = await this.client.generate({
            nlInput: payload.input,
            dbConfigId: payload.dbConfigId,
            sessionId: payload.sessionId,
            disambiguationAnswers: payload.disambiguationAnswers,
            apiKey,
            provider,
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
          console.warn(`[Verbis] Unhandled message type: ${msg.type}`);
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
  <title>Verbis</title>
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
    VerbisPanel.currentPanel = undefined;
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
