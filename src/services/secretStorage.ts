/**
 * SecretStorage Service - Secure storage for API keys and sensitive data
 * Uses VS Code's SecretStorage API to store sensitive information
 */

import * as vscode from 'vscode'

export class SecretStorageService {
    private static instance: SecretStorageService

    private constructor(private readonly secretStorage: vscode.SecretStorage) {}

    static getInstance(context: vscode.ExtensionContext): SecretStorageService {
        if (!SecretStorageService.instance) {
            SecretStorageService.instance = new SecretStorageService(context.secrets)
        }
        return SecretStorageService.instance
    }

    /**
     * Store an API key securely
     */
    async storeApiKey(provider: string, model: string, apiKey: string): Promise<void> {
        const key = `lexentia.apiKey.${provider}.${model}`
        await this.secretStorage.store(key, apiKey)
    }

    /**
     * Retrieve an API key
     */
    async getApiKey(provider: string, model: string): Promise<string | undefined> {
        const key = `lexentia.apiKey.${provider}.${model}`
        return await this.secretStorage.get(key)
    }

    /**
     * Delete an API key
     */
    async deleteApiKey(provider: string, model: string): Promise<void> {
        const key = `lexentia.apiKey.${provider}.${model}`
        await this.secretStorage.delete(key)
    }

    /**
     * Store any secret value
     */
    async storeSecret(key: string, value: string): Promise<void> {
        const prefixedKey = `lexentia.${key}`
        await this.secretStorage.store(prefixedKey, value)
    }

    /**
     * Retrieve any secret value
     */
    async getSecret(key: string): Promise<string | undefined> {
        const prefixedKey = `lexentia.${key}`
        return await this.secretStorage.get(prefixedKey)
    }

    /**
     * Delete any secret value
     */
    async deleteSecret(key: string): Promise<void> {
        const prefixedKey = `lexentia.${key}`
        await this.secretStorage.delete(prefixedKey)
    }

    /**
     * Clear all lexentia secrets
     */
    async clearAllSecrets(): Promise<void> {
        // VS Code SecretStorage doesn't have a way to list keys
        // This is a limitation - we need to track keys ourselves if needed
        // For now, this is a placeholder for future implementation
    }
}
