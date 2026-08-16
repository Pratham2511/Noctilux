// ============================================================================
// WorkspaceService — .qmind/ file I/O wrapper
// src/services/WorkspaceService.ts
//
// Implements Novel Contribution #8 (Project-Scoped Persistent Workspaces).
// All .qmind/ files are written atomically (write-tmp + rename) to prevent
// corruption if VS Code crashes mid-write.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  DBConfig,
  SchemaInfo,
  MemoryStore,
  QueryTree,
  Annotation,
  GlossaryTerm,
  PerfLogEntry,
} from '../types';

const QMIND_DIR = '.qmind';

export class WorkspaceService {
  private qmindPath: string;

  constructor(private readonly workspaceRoot: string) {
    this.qmindPath = path.join(workspaceRoot, QMIND_DIR);
    this.ensureStructure();
  }

  // ─── Directory Initialization ─────────────────────────────────────
  private ensureStructure(): void {
    const subdirs = ['sessions'];
    try {
      if (!fs.existsSync(this.qmindPath)) {
        fs.mkdirSync(this.qmindPath, { recursive: true });
      }
      for (const sub of subdirs) {
        const p = path.join(this.qmindPath, sub);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
      }
    } catch (err) {
      vscode.window.showWarningMessage(
        `Noctilux: Could not initialize .qmind/ at ${this.qmindPath}: ${(err as Error).message}`
      );
    }
  }

  // ─── Atomic JSON read/write helpers ────────────────────────────────
  private async readJson<T>(file: string, fallback: T): Promise<T> {
    const fp = path.join(this.qmindPath, file);
    try {
      const raw = await fs.promises.readFile(fp, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson<T>(file: string, data: T): Promise<void> {
    const fp = path.join(this.qmindPath, file);
    const tmp = `${fp}.tmp`;
    const content = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(tmp, content, 'utf8');
    await fs.promises.rename(tmp, fp); // atomic on POSIX
  }

  // ─── config.json ───────────────────────────────────────────────────
  async readConfig(): Promise<{
    connections: DBConfig[];
    backendPort?: number;
    llm: { mode: string; cloudEndpoint?: string; cloudModel?: string; localModel?: string };
    rowLimit: number;
    timeoutSeconds: number;
    readOnlyByDefault: boolean;
  }> {
    return this.readJson('config.json', {
      connections: [],
      llm: { mode: 'auto' },
      rowLimit: 500,
      timeoutSeconds: 60,
      readOnlyByDefault: true,
    });
  }

  async writeConfig(cfg: unknown): Promise<void> {
    await this.writeJson('config.json', cfg);
  }

  // ─── schema_cache.json ────────────────────────────────────────────
  async readSchemaCache(): Promise<SchemaInfo[]> {
    return this.readJson<SchemaInfo[]>('schema_cache.json', []);
  }

  async writeSchemaCache(schema: SchemaInfo[]): Promise<void> {
    await this.writeJson('schema_cache.json', schema);
  }

  // ─── memory.json — Adaptive Preference Memory (#1) + Disambiguation (#7)
  async readMemory(): Promise<MemoryStore> {
    return this.readJson<MemoryStore>('memory.json', {
      domainVocabulary: {},
      preferredPatterns: [],
      disambiguationRules: {},
      sqlCorrectionHistory: [],
      lastUpdated: Date.now(),
    });
  }

  async writeMemory(memory: MemoryStore): Promise<void> {
    memory.lastUpdated = Date.now();
    await this.writeJson('memory.json', memory);
  }

  // ─── history.json — Query Genealogy (#3) ───────────────────────────
  async readHistory(): Promise<Array<{
    id: string;
    timestamp: number;
    nlInput: string;
    sql: string;
    success: boolean;
    executionTimeMs?: number;
    rowCount?: number;
  }>> {
    return this.readJson('history.json', []);
  }

  async appendHistory(entry: {
    id: string;
    timestamp: number;
    nlInput: string;
    sql: string;
    success: boolean;
    executionTimeMs?: number;
    rowCount?: number;
  }): Promise<void> {
    const history = await this.readHistory();
    history.push(entry);
    // Keep last 5000 entries to avoid unbounded growth
    const trimmed = history.slice(-5000);
    await this.writeJson('history.json', trimmed);
  }

  // ─── query_tree.json — Interactive DAG (#14) ───────────────────────
  async readQueryTree(): Promise<QueryTree> {
    return this.readJson<QueryTree>('query_tree.json', {
      nodes: {},
      rootIds: [],
      checkpoints: [],
    });
  }

  async writeQueryTree(tree: QueryTree): Promise<void> {
    await this.writeJson('query_tree.json', tree);
  }

  // ─── annotations.json — Collaborative Annotations (#15) ────────────
  async readAnnotations(): Promise<Annotation[]> {
    return this.readJson<Annotation[]>('annotations.json', []);
  }

  async writeAnnotations(annotations: Annotation[]): Promise<void> {
    await this.writeJson('annotations.json', annotations);
  }

  // ─── glossary.json — Business Glossary (#10) ───────────────────────
  async readGlossary(): Promise<{ terms: GlossaryTerm[]; joinPaths: Array<{ from: string; to: string; via: string }> }> {
    return this.readJson('glossary.json', { terms: [], joinPaths: [] });
  }

  async writeGlossary(data: { terms: GlossaryTerm[]; joinPaths: Array<{ from: string; to: string; via: string }> }): Promise<void> {
    await this.writeJson('glossary.json', data);
  }

  // ─── perf_log.json — Performance Regression Detector (#11) ─────────
  async readPerfLog(): Promise<PerfLogEntry[]> {
    return this.readJson<PerfLogEntry[]>('perf_log.json', []);
  }

  async appendPerfLog(entry: PerfLogEntry): Promise<void> {
    const log = await this.readPerfLog();
    log.push(entry);
    // Keep last 10000 entries
    const trimmed = log.slice(-10000);
    await this.writeJson('perf_log.json', trimmed);
  }

  // ─── pii_rules.json — Configurable masking rules (#13) ─────────────
  async readPiiRules(): Promise<Record<string, { pattern: string; mask: string }>> {
    return this.readJson('pii_rules.json', {
      email: { pattern: '^[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}$', mask: 'xxx@xxx.com' },
      phone: { pattern: '^\\+?\\d{10,15}$', mask: 'XXX-XXX-XXXX' },
      ssn: { pattern: '^\\d{3}-?\\d{2}-?\\d{4}$', mask: 'XXX-XX-XXXX' },
      credit_card: { pattern: '^\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}$', mask: '****-****-****-1234' },
    });
  }

  // ─── pii_audit.log — Compliance audit trail ─────────────────────────
  async appendPiiAudit(line: string): Promise<void> {
    const fp = path.join(this.qmindPath, 'pii_audit.log');
    await fs.promises.appendFile(fp, line + '\n', 'utf8');
  }

  // ─── er_diagram.svg — Auto-generated ER diagram (#3c) ──────────────
  async writeErDiagram(svg: string): Promise<void> {
    const fp = path.join(this.qmindPath, 'er_diagram.svg');
    await fs.promises.writeFile(fp, svg, 'utf8');
  }

  // ─── sessions/<date>.json — Chat history persistence ───────────────
  async saveSession(date: string, messages: unknown[]): Promise<void> {
    await this.writeJson(`sessions/${date}.json`, messages);
  }

  // ─── priv_map.enc — AES-256-GCM encrypted schema tokenization map ──
  async writeEncryptedPrivMap(buf: Buffer): Promise<void> {
    const fp = path.join(this.qmindPath, 'priv_map.enc');
    await fs.promises.writeFile(fp, buf);
  }

  async readEncryptedPrivMap(): Promise<Buffer | null> {
    const fp = path.join(this.qmindPath, 'priv_map.enc');
    try {
      return await fs.promises.readFile(fp);
    } catch {
      return null;
    }
  }

  get qmindDir(): string {
    return this.qmindPath;
  }
}
