// ============================================================================
// SecretsService — VS Code SecretStorage wrapper
// src/services/SecretsService.ts
//
// API keys and database passwords live ONLY here. Never on disk.
// Keys follow the convention:
//   qm.apiKey.<provider>      (e.g., qm.apiKey.openai, qm.apiKey.llama)
//   qm.db.password.<dbId>     (per-connection database password)
//   qm.privmap.salt           (workspace salt for AES-256-GCM priv_map.enc)
// ============================================================================

import * as vscode from 'vscode';
import { randomUUID } from 'crypto';

export class SecretsService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  // ─── API Keys ──────────────────────────────────────────────────────
  async setApiKey(provider: string, key: string): Promise<void> {
    await this.secrets.store(`qm.apiKey.${provider}`, key);
  }

  async getApiKey(provider: string): Promise<string | undefined> {
    return this.secrets.get(`qm.apiKey.${provider}`);
  }

  async deleteApiKey(provider: string): Promise<void> {
    await this.secrets.delete(`qm.apiKey.${provider}`);
  }

  // ─── DB Passwords ──────────────────────────────────────────────────
  async setDbPassword(dbId: string, password: string): Promise<void> {
    await this.secrets.store(`qm.db.password.${dbId}`, password);
  }

  async getDbPassword(dbId: string): Promise<string | undefined> {
    return this.secrets.get(`qm.db.password.${dbId}`);
  }

  async deleteDbPassword(dbId: string): Promise<void> {
    await this.secrets.delete(`qm.db.password.${dbId}`);
  }

  // ─── Privacy Shield Salt ───────────────────────────────────────────
  async ensurePrivacySalt(): Promise<string> {
    let salt = await this.secrets.get('qm.privmap.salt');
    if (!salt) {
      // 32-byte random salt, hex-encoded
      salt = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      await this.secrets.store('qm.privmap.salt', salt);
    }
    return salt;
  }

  // ─── Convenience: prompt user for a secret via InputBox ─────────────
  async promptAndStore(
    key: string,
    prompt: string,
    options: { password?: boolean; placeHolder?: string } = {}
  ): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
      prompt,
      password: options.password ?? true,
      placeHolder: options.placeHolder,
      ignoreFocusOut: true,
    });
    if (value) {
      await this.secrets.store(key, value);
      return value;
    }
    return undefined;
  }
}
