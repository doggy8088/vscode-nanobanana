import * as vscode from 'vscode';
import { SECRETS } from '../constants';

export interface GeminiApiKeyProvider {
  getGeminiApiKey(): Promise<string | undefined>;
}

export class ApiKeyStore implements GeminiApiKeyProvider {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getGeminiApiKey(): Promise<string | undefined> {
    return this.secrets.get(SECRETS.geminiApiKey);
  }

  async setGeminiApiKey(value: string): Promise<void> {
    await this.secrets.store(SECRETS.geminiApiKey, value);
  }
}
