"use strict";
// ============================================================================
// VerbisPanel — Main webview panel (chat + SQL + results)
// src/panels/VerbisPanel.ts
//
// Hosts the React webview that contains ChatPanel, SQLCodeBlock,
// ResultTable, NarrativeCard, ConfidenceBar. All postMessage traffic
// between the webview and the extension host is routed through here.
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
exports.VerbisPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class VerbisPanel {
    context;
    client;
    workspace;
    secrets;
    static currentPanel;
    static viewType = 'verbis.panel';
    panel;
    disposables = [];
    // Fix D — active connection tracking (replaces hardcoded 'default')
    activeConnectionId = null;
    static createOrShow(context, client, workspace, secrets) {
        if (VerbisPanel.currentPanel) {
            VerbisPanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
            return VerbisPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel(VerbisPanel.viewType, 'Verbis — Chat', vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'webview', 'dist')),
            ],
        });
        VerbisPanel.currentPanel = new VerbisPanel(panel, context, client, workspace, secrets);
        return VerbisPanel.currentPanel;
    }
    constructor(panel, context, client, workspace, secrets) {
        this.context = context;
        this.client = client;
        this.workspace = workspace;
        this.secrets = secrets;
        this.panel = panel;
        this.panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'icon.png'));
        this.panel.webview.html = this.getHtml();
        // Seed the webview with the saved connections once it has loaded.
        setTimeout(() => { void this.pushConnections(); }, 500);
        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), undefined, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    }
    // ── Fix D — Connection selection helpers ────────────────────────────
    /** Called by extension.ts when user selects a connection (verbis.selectConnection
     *  command) or after verbis.addConnection creates a new connection. */
    setActiveConnection(connectionId) {
        this.activeConnectionId = connectionId;
    }
    /** Resolve active connection with fallback to first connection in config.json. */
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
    // ─── Message Routing ───────────────────────────────────────────────
    async onMessage(msg) {
        // ─── Handle settings / external-link messages WITHOUT requiring the
        //     Python backend to be ready (these are pure host-side operations).
        if (msg.type === 'STORE_API_KEY') {
            const { provider, key } = msg.payload;
            if (provider === 'gemini') {
                await this.secrets.storeGeminiKey(key);
            }
            if (provider === 'groq') {
                await this.secrets.storeGroqKey(key);
            }
            this.panel.webview.postMessage({
                type: 'SETTINGS_UPDATED',
                requestId: msg.requestId,
                payload: { saved: true, provider },
            });
            return;
        }
        if (msg.type === 'OPEN_EXTERNAL') {
            const url = msg.payload;
            if (typeof url === 'string') {
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
            return;
        }
        // ─── Connection management (host-side; no backend needed) ─────────
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
                id,
                name: form.name,
                dialect: form.dialect,
                host: form.host || 'localhost',
                port: form.port,
                database: form.database,
                user: form.user,
                ssl: form.ssl,
            });
            await this.workspace.writeConfig(cfg);
            this.setActiveConnection(id);
            await this.pushConnections();
            this.panel.webview.postMessage({
                type: 'SETTINGS_UPDATED',
                requestId: msg.requestId,
                payload: { saved: true, connectionId: id },
            });
            return;
        }
        if (msg.type === 'STORE_DB_PASSWORD') {
            const { name, password } = msg.payload;
            // The webview sends the connection display name; resolve it to the
            // most recently added connection with that name (the one just saved).
            const cfg = await this.workspace.readConfig();
            const match = [...cfg.connections].reverse().find(c => c.name === name);
            if (match && password) {
                await this.secrets.storeDbPassword(match.id, password);
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
                    const payload = msg.payload;
                    // Read preference memory to attach as context
                    const memory = await this.workspace.readMemory();
                    // ── Resolve provider + API key from VS Code config + SecretStorage ──
                    const provider = vscode.workspace
                        .getConfiguration('verbis')
                        .get('llm.provider', 'gemini');
                    const apiKey = (await this.secrets.getActiveApiKey()) ?? '';
                    if (!apiKey && provider !== 'local') {
                        this.sendError(`No ${provider} API key set. Run "Verbis: Set Gemini API Key" first.`);
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
                    const payload = msg.payload;
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
                    const payload = msg.payload;
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
                    const payload = msg.payload;
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
                    const term = msg.payload;
                    await this.client.saveGlossaryTerm(term);
                    this.panel.webview.postMessage({
                        type: 'GLOSSARY_SAVED',
                        requestId: msg.requestId,
                        payload: { saved: true },
                    });
                    break;
                }
                // ── Fix D — SELECT_CONNECTION: forward to extension host command ──
                case 'SELECT_CONNECTION': {
                    await vscode.commands.executeCommand('verbis.selectConnection');
                    break;
                }
                // ── Fix C — Text2Schema: NL → schema JSON → DDL → Mermaid ──────
                case 'SCHEMA_CREATE': {
                    const { description, dialect } = msg.payload;
                    const apiKey = await this.secrets.getActiveApiKey() ?? '';
                    const provider = vscode.workspace.getConfiguration('verbis').get('llm.provider', 'gemini');
                    try {
                        const result = await this.client.createSchema({ description, dialect, provider, apiKey });
                        this.panel.webview.postMessage({ type: 'SCHEMA_RESULT', payload: result });
                    }
                    catch (e) {
                        this.panel.webview.postMessage({ type: 'SCHEMA_ERROR', payload: { message: e.message } });
                    }
                    break;
                }
                case 'SCHEMA_REFINE': {
                    const { schema, refinement, dialect } = msg.payload;
                    const apiKey = await this.secrets.getActiveApiKey() ?? '';
                    const provider = vscode.workspace.getConfiguration('verbis').get('llm.provider', 'gemini');
                    try {
                        const result = await this.client.refineSchema({ schema, refinement, dialect, provider, apiKey });
                        this.panel.webview.postMessage({ type: 'SCHEMA_RESULT', payload: result });
                    }
                    catch (e) {
                        this.panel.webview.postMessage({ type: 'SCHEMA_ERROR', payload: { message: e.message } });
                    }
                    break;
                }
                case 'SCHEMA_EXECUTE': {
                    const { ddl } = msg.payload;
                    const connectionId = await this.resolveConnectionId();
                    if (!connectionId) {
                        this.panel.webview.postMessage({
                            type: 'SCHEMA_ERROR',
                            payload: { message: 'No database connection active. Add a connection first via Verbis: Add Database Connection.' },
                        });
                        break;
                    }
                    try {
                        await this.client.execute({
                            sql: ddl,
                            dbConfigId: connectionId, // ← RESOLVED, not hardcoded 'default'
                            rowLimit: 0, // DDL doesn't return rows
                        });
                        // Fix C: refresh schema cache + ChromaDB index so chat knows
                        // about the new tables. Wrapped in try/catch — non-fatal.
                        try {
                            await this.client.refreshSchema(connectionId);
                        }
                        catch (refreshErr) {
                            console.warn('[Verbis] Schema refresh after DDL failed (non-fatal):', refreshErr);
                        }
                        this.panel.webview.postMessage({ type: 'SCHEMA_EXECUTED', payload: {} });
                    }
                    catch (e) {
                        this.panel.webview.postMessage({ type: 'SCHEMA_ERROR', payload: { message: e.message } });
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
    // Public so extension.ts can broadcast to the webview
    postMessage(message) {
        this.panel.webview.postMessage(message);
    }
    /** Push the current connection list to the webview (chat DB selector). */
    async pushConnections() {
        const cfg = await this.workspace.readConfig();
        this.panel.webview.postMessage({
            type: 'CONNECTIONS_UPDATED',
            payload: { connections: cfg.connections },
        });
    }
    sendError(message) {
        this.panel.webview.postMessage({
            type: 'ERROR',
            payload: { message },
        });
    }
    // ─── HTML Shell ────────────────────────────────────────────────────
    getHtml() {
        const nonce = getNonce();
        // Vite outputs assets/index.js + assets/index.css (see webview/vite.config.ts).
        // Previously this pointed at main.js/main.css which do not exist — the
        // chat webview rendered a blank page because the script 404'd.
        const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'index.js')));
        const styleUri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'index.css')));
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
    dispose() {
        VerbisPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
exports.VerbisPanel = VerbisPanel;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function hashSql(sql) {
    // Simple FNV-1a hash for query fingerprinting
    let h = 0x811c9dc5;
    const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim();
    for (let i = 0; i < normalized.length; i++) {
        h ^= normalized.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
}
//# sourceMappingURL=VerbisPanel.js.map