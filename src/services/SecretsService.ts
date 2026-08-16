import * as vscode from 'vscode';

export class SecretsService {
    private static readonly GEMINI_KEY  = 'noctilux.geminiApiKey';
    private static readonly GROQ_KEY    = 'noctilux.groqApiKey';
    private static readonly DB_PREFIX   = 'noctilux.db.password.';

    constructor(private readonly context: vscode.ExtensionContext) {}

    // --- Gemini ---
    async storeGeminiKey(key: string): Promise<void> {
        await this.context.secrets.store(SecretsService.GEMINI_KEY, key);
    }
    async getGeminiKey(): Promise<string | undefined> {
        return this.context.secrets.get(SecretsService.GEMINI_KEY);
    }
    async deleteGeminiKey(): Promise<void> {
        await this.context.secrets.delete(SecretsService.GEMINI_KEY);
    }

    // --- Groq ---
    async storeGroqKey(key: string): Promise<void> {
        await this.context.secrets.store(SecretsService.GROQ_KEY, key);
    }
    async getGroqKey(): Promise<string | undefined> {
        return this.context.secrets.get(SecretsService.GROQ_KEY);
    }

    // --- Database passwords ---
    async storeDbPassword(dbId: string, password: string): Promise<void> {
        await this.context.secrets.store(
            `${SecretsService.DB_PREFIX}${dbId}`, password
        );
    }
    async getDbPassword(dbId: string): Promise<string | undefined> {
        return this.context.secrets.get(`${SecretsService.DB_PREFIX}${dbId}`);
    }
    async deleteDbPassword(dbId: string): Promise<void> {
        await this.context.secrets.delete(`${SecretsService.DB_PREFIX}${dbId}`);
    }

    // --- Active API key (resolves based on current provider setting) ---
    async getActiveApiKey(): Promise<string | undefined> {
        const provider = vscode.workspace
            .getConfiguration('noctilux')
            .get<string>('llm.provider', 'gemini');
        if (provider === 'groq') { return this.getGroqKey(); }
        return this.getGeminiKey();
    }
}
