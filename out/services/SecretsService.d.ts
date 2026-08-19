import * as vscode from 'vscode';
export declare class SecretsService {
    private readonly context;
    private static readonly GEMINI_KEY;
    private static readonly GROQ_KEY;
    private static readonly KIMI_KEY;
    private static readonly DB_PREFIX;
    constructor(context: vscode.ExtensionContext);
    storeGeminiKey(key: string): Promise<void>;
    getGeminiKey(): Promise<string | undefined>;
    deleteGeminiKey(): Promise<void>;
    storeGroqKey(key: string): Promise<void>;
    getGroqKey(): Promise<string | undefined>;
    storeKimiKey(key: string): Promise<void>;
    getKimiKey(): Promise<string | undefined>;
    deleteKimiKey(): Promise<void>;
    storeDbPassword(dbId: string, pw: string): Promise<void>;
    getDbPassword(dbId: string): Promise<string | undefined>;
    deleteDbPassword(dbId: string): Promise<void>;
    getActiveApiKey(): Promise<string | undefined>;
}
