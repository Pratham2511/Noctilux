import * as vscode from 'vscode';

export class SecretsService {
    private static readonly GEMINI_KEY = 'verbis.geminiApiKey';
    private static readonly GROQ_KEY   = 'verbis.groqApiKey';
    private static readonly KIMI_KEY   = 'verbis.kimiApiKey';
    private static readonly DB_PREFIX  = 'verbis.db.password.';

    constructor(private readonly context: vscode.ExtensionContext) {}

    async storeGeminiKey(key: string): Promise<void> {
        await this.context.secrets.store(SecretsService.GEMINI_KEY, key);
    }
    async getGeminiKey(): Promise<string | undefined> {
        return this.context.secrets.get(SecretsService.GEMINI_KEY);
    }
    async deleteGeminiKey(): Promise<void> {
        await this.context.secrets.delete(SecretsService.GEMINI_KEY);
    }

    async storeGroqKey(key: string): Promise<void> {
        await this.context.secrets.store(SecretsService.GROQ_KEY, key);
    }
    async getGroqKey(): Promise<string | undefined> {
        return this.context.secrets.get(SecretsService.GROQ_KEY);
    }

    async storeKimiKey(key: string): Promise<void> {
        await this.context.secrets.store(SecretsService.KIMI_KEY, key);
    }
    async getKimiKey(): Promise<string | undefined> {
        return this.context.secrets.get(SecretsService.KIMI_KEY);
    }
    async deleteKimiKey(): Promise<void> {
        await this.context.secrets.delete(SecretsService.KIMI_KEY);
    }

    async storeDbPassword(dbId: string, pw: string): Promise<void> {
        await this.context.secrets.store(`${SecretsService.DB_PREFIX}${dbId}`, pw);
    }
    async getDbPassword(dbId: string): Promise<string | undefined> {
        return this.context.secrets.get(`${SecretsService.DB_PREFIX}${dbId}`);
    }
    async deleteDbPassword(dbId: string): Promise<void> {
        await this.context.secrets.delete(`${SecretsService.DB_PREFIX}${dbId}`);
    }

    async getActiveApiKey(): Promise<string | undefined> {
        const provider = vscode.workspace
            .getConfiguration('verbis')
            .get<string>('llm.provider', 'gemini');
        if (provider === 'groq') return this.getGroqKey();
        if (provider === 'kimi') return this.getKimiKey();
        return this.getGeminiKey();
    }
}
