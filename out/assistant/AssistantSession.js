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
/**
 * One conversational session. A new instance is created per terminal (or per
 * explicit /reset). Conversation context is preserved server-side via the
 * stable `sessionId`; this class mirrors a lightweight local transcript for
 * /history and display purposes only.
 */
class AssistantSession {
    getClient;
    secrets;
    workspace;
    sessionId;
    history = [];
    busy = false;
    abortController = null;
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
        this.busy = true;
        this.abortController = new AbortController();
        this.history.push({ role: 'user', content: nlInput, timestamp: Date.now() });
        try {
            const provider = this.providerLabel;
            const apiKey = await this.secrets.getActiveApiKey();
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
    /** Start a fresh conversation (new session id, cleared local transcript). */
    reset() {
        this.cancel();
        this.sessionId = AssistantSession.newSessionId();
        this.history = [];
        this.busy = false;
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
                case 'rate_limit': return 'Rate limited by the LLM provider. Wait and retry.';
                case 'timeout': return 'The backend took too long to respond. Try a simpler question.';
                case 'network': return 'Could not reach the backend. Is it running?';
                case 'server': return `Backend error: ${err.message}`;
                default: return err.message;
            }
        }
        return err instanceof Error ? err.message : String(err);
    }
}
exports.AssistantSession = AssistantSession;
//# sourceMappingURL=AssistantSession.js.map