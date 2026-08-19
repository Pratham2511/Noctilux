import { DBConfig, SchemaInfo, MemoryStore, QueryTree, Annotation, GlossaryTerm, PerfLogEntry } from '../types';
export declare class WorkspaceService {
    private readonly workspaceRoot;
    private qmindPath;
    constructor(workspaceRoot: string);
    private ensureStructure;
    private readJson;
    private writeJson;
    readConfig(): Promise<{
        connections: DBConfig[];
        backendPort?: number;
        llm: {
            mode: string;
            cloudEndpoint?: string;
            cloudModel?: string;
            localModel?: string;
        };
        rowLimit: number;
        timeoutSeconds: number;
        readOnlyByDefault: boolean;
    }>;
    writeConfig(cfg: unknown): Promise<void>;
    readSchemaCache(): Promise<SchemaInfo[]>;
    writeSchemaCache(schema: SchemaInfo[]): Promise<void>;
    readMemory(): Promise<MemoryStore>;
    writeMemory(memory: MemoryStore): Promise<void>;
    readHistory(): Promise<Array<{
        id: string;
        timestamp: number;
        nlInput: string;
        sql: string;
        success: boolean;
        executionTimeMs?: number;
        rowCount?: number;
    }>>;
    appendHistory(entry: {
        id: string;
        timestamp: number;
        nlInput: string;
        sql: string;
        success: boolean;
        executionTimeMs?: number;
        rowCount?: number;
    }): Promise<void>;
    readQueryTree(): Promise<QueryTree>;
    writeQueryTree(tree: QueryTree): Promise<void>;
    readAnnotations(): Promise<Annotation[]>;
    writeAnnotations(annotations: Annotation[]): Promise<void>;
    readGlossary(): Promise<{
        terms: GlossaryTerm[];
        joinPaths: Array<{
            from: string;
            to: string;
            via: string;
        }>;
    }>;
    writeGlossary(data: {
        terms: GlossaryTerm[];
        joinPaths: Array<{
            from: string;
            to: string;
            via: string;
        }>;
    }): Promise<void>;
    readPerfLog(): Promise<PerfLogEntry[]>;
    appendPerfLog(entry: PerfLogEntry): Promise<void>;
    readPiiRules(): Promise<Record<string, {
        pattern: string;
        mask: string;
    }>>;
    appendPiiAudit(line: string): Promise<void>;
    writeErDiagram(svg: string): Promise<void>;
    saveSession(date: string, messages: unknown[]): Promise<void>;
    writeEncryptedPrivMap(buf: Buffer): Promise<void>;
    readEncryptedPrivMap(): Promise<Buffer | null>;
    get qmindDir(): string;
}
