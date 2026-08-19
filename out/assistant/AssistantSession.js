"use strict";
// ============================================================================
// Verbis — AssistantSession
// src/assistant/AssistantSession.ts
//
// UI-independent conversational agent controller. Owns one conversation's
// state (session id, history, busy flag, cancellation) and delegates ALL
// intelligence to the existing backend pipeline via BackendClient.
//
// This is the single source of truth for "what a conversation with Verbis
// means". The terminal REPL (and any future UI) drives this class; it never
// re-implements SQL generation, execution, or provider routing itself.
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
exports.AssistantSession = void 0;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
const BackendClient_1 = require("../services/BackendClient");
class AssistantSession {
    getClient;
    secrets;
    workspace;
    sessionId;
    history = [];
    busy = false;
    abortController = null;
    /**
     * Session-scoped API key, held ONLY in memory. Never written to
     * SecretStorage or disk. Set when the user explicitly chooses "use a
     * different key for this session"; discarded on /reset, /exit, terminal
     * close, and window reload.
     */
    sessionApiKey = null;
    credentialSource = 'unset';
    /** True once the user has made (or skipped) the explicit key-source choice. */
    credentialChoiceMade = false;
    constructor(getClient, secrets, workspace) {
        this.getClient = getClient;
        this.secrets = secrets;
        this.workspace = workspace;
        this.sessionId = AssistantSession.newSessionId();
    }
    static newSessionId() {
        return crypto.randomUUID();
    }
    /** Stable id for this conversation — forwarded to the backend on every turn. */
    get id() {
        return this.sessionId;
    }
    /** True while a backend request is in flight. */
    get isBusy() {
        return this.busy;
    }
    /** Read-only view of the local transcript (for /history). */
    get transcript() {
        return this.history;
    }
    /** Active LLM provider label (from settings), for display. */
    get providerLabel() {
        return vscode.workspace
            .getConfiguration('verbis')
            .get('llm.provider', 'gemini');
    }
    /** Human-readable credential source for /status — never reveals the key. */
    get credentialSourceLabel() {
        switch (this.credentialSource) {
            case 'configured': return 'Existing configured key';
            case 'session': return 'Session-specific key (not saved)';
            default: return 'Not chosen yet';
        }
    }
    /**
     * Resolve the API key for this turn. A session-specific key (if the user
     * set one) takes precedence over the configured key; otherwise the
     * configured key from SecretStorage is used.
     */
    async resolveApiKey() {
        if (this.credentialSource === 'session' && this.sessionApiKey) {
            return this.sessionApiKey;
        }
        return this.secrets.getActiveApiKey();
    }
    /**
     * Explicit API-key source choice (P2). Runs once per session, before the
     * first backend request. If a configured key exists, the user must choose
     * how to authenticate — Verbis never silently consumes a stored key.
     *
     * Returns true when a usable credential is available; false when the user
     * cancelled or no key exists (caller should surface the returned message).
     */
    async ensureCredentialChoice() {
        if (this.credentialChoiceMade) {
            // Choice already made this session — just verify a key is present.
            const key = await this.resolveApiKey();
            return key
                ? { ok: true }
                : { ok: false, message: 'No API key available. Run "Verbis: Set API Key".' };
        }
        const configuredKey = await this.secrets.getActiveApiKey();
        const provider = this.providerLabel;
        if (!configuredKey) {
            // No stored key — nothing to choose between; guide the user to set one.
            this.credentialSource = 'unset';
            // Don't mark choice made: if they later set a key, we prompt then.
            return {
                ok: false,
                message: `No ${provider} API key is configured. Run "Verbis: Set API Key" first, then ask again.`,
            };
        }
        // A stored key exists — require an explicit, informed choice.
        const USE_EXISTING = 'Use existing configured key';
        const USE_SESSION = 'Use a different key for this session only';
        const MANAGE = 'Manage keys…';
        const pick = await vscode.window.showQuickPick([
            { label: USE_EXISTING, description: `Use the ${provider} key stored in VS Code SecretStorage` },
            { label: USE_SESSION, description: 'Paste a key used only for this terminal session — never saved' },
            { label: MANAGE, description: 'Set or remove stored keys' },
        ], {
            title: 'Verbis: API Key Source',
            placeHolder: 'A configured API key was found. How should Verbis authenticate this session?',
            ignoreFocusOut: true,
        });
        if (!pick) {
            // Cancelled — no silent consumption.
            return { ok: false, message: 'Cancelled — no API key was used. Ask again when ready.' };
        }
        if (pick.label === MANAGE) {
            await vscode.commands.executeCommand('verbis.setApiKey');
            // Re-resolve after management; treat as configured if a key now exists.
            const nowKey = await this.secrets.getActiveApiKey();
            if (nowKey) {
                this.credentialSource = 'configured';
                this.credentialChoiceMade = true;
                return { ok: true };
            }
            return { ok: false, message: 'No API key configured. Run "Verbis: Set API Key".' };
        }
        if (pick.label === USE_SESSION) {
            const key = await vscode.window.showInputBox({
                title: `Verbis — Session-only ${provider} API Key`,
                prompt: 'This key is kept in memory for this terminal session only and is never saved.',
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'Paste your API key',
                validateInput: (v) => v.trim().length < 10 ? 'Key looks too short — paste the full API key' : null,
            });
            if (!key) {
                return { ok: false, message: 'Cancelled — no session key set. Ask again when ready.' };
            }
            this.sessionApiKey = key.trim();
            this.credentialSource = 'session';
            this.credentialChoiceMade = true;
            return { ok: true };
        }
        // USE_EXISTING
        this.credentialSource = 'configured';
        this.credentialChoiceMade = true;
        return { ok: true };
    }
    /**
     * Submit one natural-language turn. Routes through the EXISTING
     * BackendClient.generate() pipeline — no SQL logic lives here.
     *
     * Throws nothing; all failure modes are folded into the returned reply so
     * the REPL can keep running.
     */
    async ask(nlInput) {
        if (this.busy) {
            return { kind: 'message', message: 'Still working on the previous request. Use /cancel or wait.' };
        }
        const client = this.getClient();
        if (!client) {
            return { kind: 'error', message: 'Backend is not running. Start it with "Verbis: Restart Python Backend".' };
        }
        // Explicit credential-source choice (P2) — never silently consume a key.
        const cred = await this.ensureCredentialChoice();
        if (!cred.ok) {
            return { kind: 'message', message: cred.message ?? 'No API key available.' };
        }
        this.busy = true;
        this.abortController = new AbortController();
        this.history.push({ role: 'user', content: nlInput, timestamp: Date.now() });
        try {
            const provider = this.providerLabel;
            const apiKey = await this.resolveApiKey();
            const dbConfigId = await this.resolveActiveConnectionId();
            const res = await client.generate({
                nlInput,
                dbConfigId: dbConfigId ?? 'default',
                sessionId: this.sessionId,
                apiKey,
                provider,
            });
            if (this.abortController.signal.aborted) {
                return { kind: 'cancelled', message: 'Request cancelled.', wasCancelled: true };
            }
            // Ambiguity: backend wants clarification before producing SQL.
            if (res.ambiguityQuestions && res.ambiguityQuestions.length > 0) {
                const msg = res.ambiguityQuestions
                    .map((q, i) => `${i + 1}. ${q.question}\n   Options: ${q.options.join(' | ')}`)
                    .join('\n');
                this.history.push({ role: 'assistant', content: msg, timestamp: Date.now() });
                return {
                    kind: 'message',
                    message: `I need clarification:\n${msg}\n\nAnswer and re-ask, or /cancel.`,
                    ambiguityQuestions: res.ambiguityQuestions,
                };
            }
            const confidencePct = Math.round((res.confidence ?? 0) * 100);
            this.history.push({
                role: 'assistant',
                content: res.sql ?? res.explanation ?? '(no output)',
                timestamp: Date.now(),
            });
            return {
                kind: 'sql',
                sql: res.sql,
                explanation: res.explanation,
                confidence: res.confidence,
                alternatives: res.alternatives,
                message: `Confidence: ${confidencePct}%`,
            };
        }
        catch (err) {
            if (this.abortController?.signal.aborted) {
                return { kind: 'cancelled', message: 'Request cancelled.', wasCancelled: true };
            }
            return { kind: 'error', message: AssistantSession.describeError(err) };
        }
        finally {
            this.busy = false;
            this.abortController = null;
        }
    }
    /**
     * Execute SQL through the EXISTING BackendClient.execute() path. This is a
     * distinct, explicit action — generation never implies execution.
     */
    async execute(sql) {
        if (this.busy) {
            return { kind: 'error', message: 'Busy — wait for the current request.' };
        }
        const client = this.getClient();
        if (!client) {
            return { kind: 'error', message: 'Backend is not running.' };
        }
        this.busy = true;
        this.abortController = new AbortController();
        try {
            const dbConfigId = await this.resolveActiveConnectionId();
            if (!dbConfigId) {
                return { kind: 'error', message: 'No active database connection. Add one from the Verbis sidebar.' };
            }
            const rowLimit = vscode.workspace
                .getConfiguration('verbis')
                .get('query.rowLimit', 500);
            const timeoutSeconds = vscode.workspace
                .getConfiguration('verbis')
                .get('execution.timeoutSeconds', 60);
            const result = await client.execute({ sql, dbConfigId, rowLimit, timeoutSeconds });
            if (this.abortController.signal.aborted) {
                return { kind: 'cancelled', message: 'Execution cancelled.' };
            }
            // Persist to history via the existing workspace service.
            await this.workspace.appendHistory({
                id: crypto.randomUUID(),
                nlInput: '(terminal)',
                sql,
                timestamp: Date.now(),
                success: true,
                executionTimeMs: result.executionTimeMs,
                rowCount: result.rowCount,
            });
            return { kind: 'result', result };
        }
        catch (err) {
            if (this.abortController?.signal.aborted) {
                return { kind: 'cancelled', message: 'Execution cancelled.' };
            }
            return { kind: 'error', message: AssistantSession.describeError(err) };
        }
        finally {
            this.busy = false;
            this.abortController = null;
        }
    }
    /** Request cancellation of the in-flight operation. */
    cancel() {
        this.abortController?.abort();
    }
    /**
     * Start a fresh conversation (new session id, cleared local transcript).
     * Also discards any session-specific API key and resets the credential
     * choice, so the next session re-prompts for the key source.
     */
    reset() {
        this.cancel();
        this.sessionId = AssistantSession.newSessionId();
        this.history = [];
        this.busy = false;
        this.discardSessionKey();
    }
    /**
     * Discard the session-specific API key (if any) and reset the credential
     * choice. Called on /reset, /exit, terminal close, and window reload so a
     * session-only key never outlives its session.
     */
    discardSessionKey() {
        this.sessionApiKey = null;
        this.credentialSource = 'unset';
        this.credentialChoiceMade = false;
    }
    // ─── Internals ──────────────────────────────────────────────────────────
    async resolveActiveConnectionId() {
        const config = await this.workspace.readConfig();
        // The workspace config has no explicit "active" pointer; the most recently
        // added connection is treated as active, consistent with the sidebar.
        return config.connections[config.connections.length - 1]?.id;
    }
    static describeError(err) {
        if (err instanceof BackendClient_1.BackendClientError) {
            switch (err.kind) {
                case 'auth': return 'Invalid API key. Run "Verbis: Set API Key".';
                case 'rate_limit': return 'Rate limited by the LLM provider. Wait a moment and retry.';
                case 'timeout': return 'The backend took too long to respond. Try a simpler question.';
                case 'network': return 'Could not reach the backend. Is it running? Try "Verbis: Restart Python Backend".';
                case 'server': return err.message; // already cleaned by extractDetail
                default: return err.message; // 404 + other: cleaned by extractDetail
            }
        }
        return err instanceof Error ? err.message : String(err);
    }
}
exports.AssistantSession = AssistantSession;
//# sourceMappingURL=AssistantSession.js.map