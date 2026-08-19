"use strict";
// ============================================================================
// ChatViewProvider — Sidebar chat webview (like Copilot Chat / Cline)
// src/views/ChatViewProvider.ts
//
// Implements vscode.WebviewViewProvider so the Verbis chat lives in the
// Verbis activity-bar container as a native sidebar view, instead of (or in
// addition to) an editor tab. Shares the same React bundle as VerbisPanel.
// ============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class ChatViewProvider {
    context;
    getClient;
    workspace;
    secrets;
    static viewType = 'verbis.chatView';
    view;
    activeConnectionId = null;
    constructor(context, getClient, workspace, secrets) {
        this.context = context;
        this.getClient = getClient;
        this.workspace = workspace;
        this.secrets = secrets;
    }
    // ─── WebviewViewProvider ────────────────────────────────────────────
    resolveWebviewView(webviewView, _ctx, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist')),
            ],
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(msg => this.onMessage(msg));
        // Seed connections once the webview script has had a moment to load.
        setTimeout(() => { void this.pushConnections(); }, 500);
        webviewView.onDidDispose(() => { this.view = undefined; });
    }
    // ─── Public API (used by extension.ts) ──────────────────────────────
    postMessage(message) {
        this.view?.webview.postMessage(message);
    }
    setActiveConnection(connectionId) {
        this.activeConnectionId = connectionId;
    }
    async pushConnections() {
        const cfg = await this.workspace.readConfig();
        this.view?.webview.postMessage({
            type: 'CONNECTIONS_UPDATED',
            payload: { connections: cfg.connections },
        });
    }
    /** Reveal the sidebar chat view (used by verbis.openChat). */
    show() {
        this.view?.show?.(true);
    }
    async resolveConnectionId() {
        if (this.activeConnectionId) {
            return this.activeConnectionId;
        }
        const cfg = await this.workspace.readConfig();
        if (cfg.connections.length > 0) {
            this.activeConnectionId = cfg.connections[0].id;
            return this.activeConnectionId;
        }
        return null;
    }
    // ─── Message routing ────────────────────────────────────────────────
    async onMessage(msg) {
        // Host-side messages that don't need the backend
        if (msg.type === 'STORE_API_KEY') {
            const { provider, key } = msg.payload;
            if (provider === 'gemini') {
                await this.secrets.storeGeminiKey(key);
            }
            if (provider === 'groq') {
                await this.secrets.storeGroqKey(key);
            }
            this.postMessage({ type: 'SETTINGS_UPDATED', requestId: msg.requestId, payload: { saved: true, provider } });
            return;
        }
        if (msg.type === 'OPEN_EXTERNAL') {
            const url = msg.payload;
            if (typeof url === 'string') {
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
            return;
        }
        if (msg.type === 'GET_CONNECTIONS') {
            await this.pushConnections();
            return;
        }
        if (msg.type === 'CONNECTION_FORM_SAVE') {
            const form = msg.payload;
            if (!form.name || !form.database || !form.user) {
                this.sendError('Connection name, database and user are required.');
                return;
            }
            const cfg = await this.workspace.readConfig();
            const id = crypto.randomUUID();
            cfg.connections.push({
                id, name: form.name, dialect: form.dialect,
                host: form.host || 'localhost', port: form.port,
                database: form.database, user: form.user, ssl: form.ssl,
            });
            await this.workspace.writeConfig(cfg);
            this.setActiveConnection(id);
            await this.pushConnections();
            this.postMessage({ type: 'SETTINGS_UPDATED', requestId: msg.requestId, payload: { saved: true, connectionId: id } });
            return;
        }
        if (msg.type === 'STORE_DB_PASSWORD') {
            const { name, password } = msg.payload;
            const cfg = await this.workspace.readConfig();
            const match = [...cfg.connections].reverse().find(c => c.name === name);
            if (match && password) {
                await this.secrets.storeDbPassword(match.id, password);
            }
            return;
        }
        const client = this.getClient();
        if (!client) {
            this.sendError('Backend not ready yet. Please wait a moment and try again.');
            return;
        }
        try {
            switch (msg.type) {
                case 'GENERATE_SQL': {
                    const payload = msg.payload;
                    const memory = await this.workspace.readMemory();
                    const provider = vscode.workspace.getConfiguration('verbis').get('llm.provider', 'gemini');
                    const apiKey = (await this.secrets.getActiveApiKey()) ?? '';
                    if (!apiKey && provider !== 'local') {
                        this.sendError(`No ${provider} API key set. Run "Verbis: Set API Key" first.`);
                        return;
                    }
                    const result = await client.generate({
                        nlInput: payload.input,
                        dbConfigId: payload.dbConfigId,
                        sessionId: payload.sessionId,
                        disambiguationAnswers: payload.disambiguationAnswers,
                        apiKey,
                        provider,
                    });
                    this.postMessage({
                        type: 'SQL_GENERATED',
                        requestId: msg.requestId,
                        payload: { ...result, input: payload.input, memory: { disambiguationRules: memory.disambiguationRules } },
                    });
                    break;
                }
                case 'EXECUTE_SQL': {
                    const payload = msg.payload;
                    const execResult = await client.execute(payload);
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
                    this.postMessage({ type: 'EXECUTION_COMPLETE', requestId: msg.requestId, payload: execResult });
                    break;
                }
                case 'AMBIGUITY_ANSWERED': {
                    const payload = msg.payload;
                    const memory = await this.workspace.readMemory();
                    memory.disambiguationRules[payload.ruleKey] = payload.ruleValue;
                    await this.workspace.writeMemory(memory);
                    this.postMessage({ type: 'SETTINGS_UPDATED', requestId: msg.requestId, payload: { saved: true } });
                    break;
                }
                case 'ANNOTATION_ADDED': {
                    const payload = msg.payload;
                    const annotations = await this.workspace.readAnnotations();
                    annotations.push(payload.annotation);
                    await this.workspace.writeAnnotations(annotations);
                    this.postMessage({ type: 'ANNOTATION_ADDED', requestId: msg.requestId, payload: { saved: true } });
                    break;
                }
                case 'GLOSSARY_SAVED': {
                    await client.saveGlossaryTerm(msg.payload);
                    this.postMessage({ type: 'GLOSSARY_SAVED', requestId: msg.requestId, payload: { saved: true } });
                    break;
                }
                case 'SELECT_CONNECTION': {
                    await vscode.commands.executeCommand('verbis.selectConnection');
                    break;
                }
                case 'SCHEMA_CREATE': {
                    const { description, dialect } = msg.payload;
                    const apiKey = await this.secrets.getActiveApiKey() ?? '';
                    const provider = vscode.workspace.getConfiguration('verbis').get('llm.provider', 'gemini');
                    try {
                        const result = await client.createSchema({ description, dialect, provider, apiKey });
                        this.postMessage({ type: 'SCHEMA_RESULT', payload: result });
                    }
                    catch (e) {
                        this.postMessage({ type: 'SCHEMA_ERROR', payload: { message: e.message } });
                    }
                    break;
                }
                case 'SCHEMA_REFINE': {
                    const { schema, refinement, dialect } = msg.payload;
                    const apiKey = await this.secrets.getActiveApiKey() ?? '';
                    const provider = vscode.workspace.getConfiguration('verbis').get('llm.provider', 'gemini');
                    try {
                        const result = await client.refineSchema({ schema, refinement, dialect, provider, apiKey });
                        this.postMessage({ type: 'SCHEMA_RESULT', payload: result });
                    }
                    catch (e) {
                        this.postMessage({ type: 'SCHEMA_ERROR', payload: { message: e.message } });
                    }
                    break;
                }
                case 'SCHEMA_EXECUTE': {
                    const { ddl } = msg.payload;
                    const connectionId = await this.resolveConnectionId();
                    if (!connectionId) {
                        this.postMessage({ type: 'SCHEMA_ERROR', payload: { message: 'No database connection active. Add a connection first via Verbis: Add Database Connection.' } });
                        break;
                    }
                    try {
                        await client.execute({ sql: ddl, dbConfigId: connectionId, rowLimit: 0 });
                        try {
                            await client.refreshSchema(connectionId);
                        }
                        catch (e) {
                            console.warn('[Verbis] Schema refresh failed (non-fatal):', e);
                        }
                        this.postMessage({ type: 'SCHEMA_EXECUTED', payload: {} });
                    }
                    catch (e) {
                        this.postMessage({ type: 'SCHEMA_ERROR', payload: { message: e.message } });
                    }
                    break;
                }
                default:
                    console.warn(`[Verbis] Unhandled message type: ${msg.type}`);
            }
        }
        catch (err) {
            this.sendError(err.message);
        }
    }
    sendError(message) {
        this.postMessage({ type: 'ERROR', payload: { message } });
    }
    // ─── HTML shell (same Vite bundle as VerbisPanel) ───────────────────
    getHtml(webview) {
        const nonce = getNonce();
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'index.js')));
        const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'index.css')));
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src ${webview.cspSource} https:;
                 script-src 'nonce-${nonce}';
                 style-src ${webview.cspSource} 'unsafe-inline';" />
  <title>Verbis</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function hashSql(sql) {
    let h = 0x811c9dc5;
    const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim();
    for (let i = 0; i < normalized.length; i++) {
        h ^= normalized.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
}
//# sourceMappingURL=ChatViewProvider.js.map