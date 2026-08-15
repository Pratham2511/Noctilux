// ============================================================================
// BackendClient — HTTP client for the Python FastAPI backend
// src/services/BackendClient.ts
//
// All requests use AbortController (90s end-to-end timeout per Part 9).
// Errors are translated into a typed BackendClientError so callers can
// distinguish 401 (invalid key), 429 (rate limit), 5xx, and network errors.
// ============================================================================

import fetch from 'node-fetch';
import {
  ChatMessage,
  ExecutionResult,
  SchemaInfo,
  SchemaChangeImpact,
  RobustnessReport,
  GlossaryTerm,
  BackendStatus,
} from '../types';

export class BackendClientError extends Error {
  constructor(
    message: string,
    public readonly kind: 'timeout' | 'auth' | 'rate_limit' | 'network' | 'server' | 'unknown',
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'BackendClientError';
  }
}

export class BackendClient {
  constructor(
    private readonly baseUrl: string,        // e.g., http://127.0.0.1:8765
    private readonly defaultTimeoutMs: number = 90_000
  ) {}

  // ─── Health Check ────────────────────────────────────────────────────
  async health(): Promise<{ status: string; version: string }> {
    return this.requestJson('/api/health', 'GET');
  }

  // ─── NL → SQL Generation ─────────────────────────────────────────────
  async generate(payload: {
    nlInput: string;
    dbConfigId: string;
    sessionId: string;
    llmMode?: 'cloud' | 'local' | 'auto';
    disambiguationAnswers?: Record<string, string>;
  }): Promise<{
    sql: string;
    confidence: number;
    alternatives: Array<{ sql: string; interpretation: string; confidence: number }>;
    explanation: string;
    narrative?: string;
    planExplanation?: string;
    ambiguityQuestions?: Array<{ id: string; question: string; options: string[] }>;
    queryNodeId?: string;
  }> {
    return this.requestJson('/api/generate', 'POST', payload);
  }

  // ─── SQL Execution ──────────────────────────────────────────────────
  async execute(payload: {
    sql: string;
    dbConfigId: string;
    rowLimit?: number;
    timeoutSeconds?: number;
  }): Promise<ExecutionResult> {
    return this.requestJson('/api/execute', 'POST', payload);
  }

  // ─── Schema Introspection + ChromaDB Indexing ───────────────────────
  async getSchema(dbConfigId: string): Promise<{ tables: SchemaInfo[]; indexed: boolean }> {
    return this.requestJson(`/api/schema?dbConfigId=${encodeURIComponent(dbConfigId)}`, 'GET');
  }

  // ─── Schema Change Impact Analysis (#9) ─────────────────────────────
  async analyzeImpact(payload: {
    ddl: string;
    dbConfigId: string;
  }): Promise<SchemaChangeImpact> {
    return this.requestJson('/api/schema/impact', 'POST', payload);
  }

  // ─── EvoSchema Robustness Test (#16) ────────────────────────────────
  async runRobustness(payload: {
    dbConfigId: string;
    querySet: Array<{ id: string; sql: string; nlInput: string }>;
  }): Promise<RobustnessReport> {
    return this.requestJson('/api/robustness', 'POST', payload);
  }

  // ─── Business Glossary CRUD (#10) ──────────────────────────────────
  async getGlossary(): Promise<{ terms: GlossaryTerm[] }> {
    return this.requestJson('/api/glossary', 'GET');
  }

  async saveGlossaryTerm(term: GlossaryTerm): Promise<{ success: boolean }> {
    return this.requestJson('/api/glossary', 'POST', term);
  }

  // ─── Shutdown ────────────────────────────────────────────────────────
  async shutdown(): Promise<void> {
    try {
      await this.requestJson('/api/shutdown', 'DELETE');
    } catch {
      // Best-effort
    }
  }

  // ─── Core fetch wrapper ──────────────────────────────────────────────
  private async requestJson<T>(path: string, method: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal as unknown as import('node-fetch').RequestInit['signal'],
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 401) {
          throw new BackendClientError('Invalid API key', 'auth', 401);
        }
        if (res.status === 429) {
          throw new BackendClientError('Rate limited by LLM provider', 'rate_limit', 429);
        }
        if (res.status >= 500) {
          throw new BackendClientError(`Backend error: ${text}`, 'server', res.status);
        }
        throw new BackendClientError(`HTTP ${res.status}: ${text}`, 'unknown', res.status);
      }

      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof BackendClientError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new BackendClientError('Request timed out', 'timeout');
      }
      throw new BackendClientError(`Network error: ${(err as Error).message}`, 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}
