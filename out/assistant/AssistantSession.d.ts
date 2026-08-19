import { BackendClient } from '../services/BackendClient';
import { SecretsService } from '../services/SecretsService';
import { WorkspaceService } from '../services/WorkspaceService';
import { ExecutionResult } from '../types';
export interface AssistantReply {
    kind: 'sql' | 'message' | 'error' | 'cancelled';
    /** Generated SQL, when kind === 'sql'. */
    sql?: string;
    /** Plain-English explanation from the backend. */
    explanation?: string;
    /** 0.0 – 1.0 confidence from the backend. */
    confidence?: number;
    /** Alternative interpretations, if the backend produced any. */
    alternatives?: Array<{
        sql: string;
        interpretation: string;
        confidence: number;
    }>;
    /** Clarifying questions when the request is ambiguous. */
    ambiguityQuestions?: Array<{
        id: string;
        question: string;
        options: string[];
    }>;
    /** Human-readable message for kind === 'message' | 'error'. */
    message?: string;
    /** True when the reply was produced while cancellation was requested. */
    wasCancelled?: boolean;
}
export interface ExecuteOutcome {
    kind: 'result' | 'error' | 'cancelled';
    result?: ExecutionResult;
    message?: string;
}
interface HistoryEntry {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}
/**
 * One conversational session. A new instance is created per terminal (or per
 * explicit /reset). Conversation context is preserved server-side via the
 * stable `sessionId`; this class mirrors a lightweight local transcript for
 * /history and display purposes only.
 */
export declare class AssistantSession {
    private readonly getClient;
    private readonly secrets;
    private readonly workspace;
    private sessionId;
    private history;
    private busy;
    private abortController;
    constructor(getClient: () => BackendClient | null, secrets: SecretsService, workspace: WorkspaceService);
    private static newSessionId;
    /** Stable id for this conversation — forwarded to the backend on every turn. */
    get id(): string;
    /** True while a backend request is in flight. */
    get isBusy(): boolean;
    /** Read-only view of the local transcript (for /history). */
    get transcript(): ReadonlyArray<HistoryEntry>;
    /** Active LLM provider label (from settings), for display. */
    get providerLabel(): string;
    /**
     * Submit one natural-language turn. Routes through the EXISTING
     * BackendClient.generate() pipeline — no SQL logic lives here.
     *
     * Throws nothing; all failure modes are folded into the returned reply so
     * the REPL can keep running.
     */
    ask(nlInput: string): Promise<AssistantReply>;
    /**
     * Execute SQL through the EXISTING BackendClient.execute() path. This is a
     * distinct, explicit action — generation never implies execution.
     */
    execute(sql: string): Promise<ExecuteOutcome>;
    /** Request cancellation of the in-flight operation. */
    cancel(): void;
    /** Start a fresh conversation (new session id, cleared local transcript). */
    reset(): void;
    private resolveActiveConnectionId;
    private static describeError;
}
export {};
