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

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { BackendClient, BackendClientError } from '../services/BackendClient';
import { SecretsService } from '../services/SecretsService';
import { WorkspaceService } from '../services/WorkspaceService';
import { ExecutionResult } from '../types';

// ─── Result types surfaced to the UI layer ────────────────────────────────

export interface AssistantReply {
  kind: 'sql' | 'message' | 'error' | 'cancelled';
  /** Generated SQL, when kind === 'sql'. */
  sql?: string;
  /** Plain-English explanation from the backend. */
  explanation?: string;
  /** 0.0 – 1.0 confidence from the backend. */
  confidence?: number;
  /** Alternative interpretations, if the backend produced any. */
  alternatives?: Array<{ sql: string; interpretation: string; confidence: number }>;
  /** Clarifying questions when the request is ambiguous. */
  ambiguityQuestions?: Array<{ id: string; question: string; options: string[] }>;
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
export class AssistantSession {
  private sessionId: string;
  private history: HistoryEntry[] = [];
  private busy = false;
  private abortController: AbortController | null = null;

  constructor(
    private readonly getClient: () => BackendClient | null,
    private readonly secrets: SecretsService,
    private readonly workspace: WorkspaceService,
  ) {
    this.sessionId = AssistantSession.newSessionId();
  }

  private static newSessionId(): string {
    return crypto.randomUUID();
  }

  /** Stable id for this conversation — forwarded to the backend on every turn. */
  get id(): string {
    return this.sessionId;
  }

  /** True while a backend request is in flight. */
  get isBusy(): boolean {
    return this.busy;
  }

  /** Read-only view of the local transcript (for /history). */
  get transcript(): ReadonlyArray<HistoryEntry> {
    return this.history;
  }

  /** Active LLM provider label (from settings), for display. */
  get providerLabel(): string {
    return vscode.workspace
      .getConfiguration('verbis')
      .get<string>('llm.provider', 'gemini');
  }

  /**
   * Submit one natural-language turn. Routes through the EXISTING
   * BackendClient.generate() pipeline — no SQL logic lives here.
   *
   * Throws nothing; all failure modes are folded into the returned reply so
   * the REPL can keep running.
   */
  async ask(nlInput: string): Promise<AssistantReply> {
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
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        return { kind: 'cancelled', message: 'Request cancelled.', wasCancelled: true };
      }
      return { kind: 'error', message: AssistantSession.describeError(err) };
    } finally {
      this.busy = false;
      this.abortController = null;
    }
  }

  /**
   * Execute SQL through the EXISTING BackendClient.execute() path. This is a
   * distinct, explicit action — generation never implies execution.
   */
  async execute(sql: string): Promise<ExecuteOutcome> {
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
        .get<number>('query.rowLimit', 500);
      const timeoutSeconds = vscode.workspace
        .getConfiguration('verbis')
        .get<number>('execution.timeoutSeconds', 60);

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
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        return { kind: 'cancelled', message: 'Execution cancelled.' };
      }
      return { kind: 'error', message: AssistantSession.describeError(err) };
    } finally {
      this.busy = false;
      this.abortController = null;
    }
  }

  /** Request cancellation of the in-flight operation. */
  cancel(): void {
    this.abortController?.abort();
  }

  /** Start a fresh conversation (new session id, cleared local transcript). */
  reset(): void {
    this.cancel();
    this.sessionId = AssistantSession.newSessionId();
    this.history = [];
    this.busy = false;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async resolveActiveConnectionId(): Promise<string | undefined> {
    const config = await this.workspace.readConfig();
    // The workspace config has no explicit "active" pointer; the most recently
    // added connection is treated as active, consistent with the sidebar.
    return config.connections[config.connections.length - 1]?.id;
  }

  private static describeError(err: unknown): string {
    if (err instanceof BackendClientError) {
      switch (err.kind) {
        case 'auth':       return 'Invalid API key. Run "Verbis: Set API Key".';
        case 'rate_limit': return 'Rate limited by the LLM provider. Wait and retry.';
        case 'timeout':    return 'The backend took too long to respond. Try a simpler question.';
        case 'network':    return 'Could not reach the backend. Is it running?';
        case 'server':     return `Backend error: ${err.message}`;
        default:           return err.message;
      }
    }
    return err instanceof Error ? err.message : String(err);
  }
}
