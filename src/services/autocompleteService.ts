/**
 * Tab Autocomplete Service with FIM (Fill-In-The-Middle)
 * Provides intelligent code completion using LLMs
 */

import * as vscode from 'vscode'
import { streamOllamaResponse, streamOpenAIResponse } from './streamingService'
import { SecretStorageService } from './secretStorage'

export interface AutocompleteRequest {
    prefix: string
    suffix: string
    language: string
    filePath: string
    cursorPosition: { line: number; character: number }
}

export interface AutocompleteResult {
    completion: string
    isStreaming: boolean
}

export class AutocompleteService {
    private debounceTimer: NodeJS.Timeout | null = null
    private debounceMs = 250
    private maxContextTokens = 2000
    private isEnabled = true
    private secretStorage: SecretStorageService

    constructor(private context: vscode.ExtensionContext) {
        this.secretStorage = SecretStorageService.getInstance(context)
        this.loadSettings()
        this.setupSettingsListener()
    }

    private loadSettings(): void {
        const config = vscode.workspace.getConfiguration('lexentia.autocomplete')
        this.isEnabled = config.get<boolean>('enabled', true)
        this.debounceMs = config.get<number>('debounceMs', 250)
        this.maxContextTokens = config.get<number>('maxContextTokens', 2000)
    }

    private setupSettingsListener(): void {
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('lexentia.autocomplete')) {
                this.loadSettings()
            }
        })
    }

    /**
     * Trigger autocomplete with debounce
     */
    triggerAutocomplete(request: AutocompleteRequest, callback: (result: AutocompleteResult) => void): void {
        if (!this.isEnabled) return

        // Clear previous timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }

        // Set new timer
        this.debounceTimer = setTimeout(async () => {
            try {
                const result = await this.generateCompletion(request)
                callback(result)
            } catch (error) {
                console.error('Autocomplete error:', error)
            }
        }, this.debounceMs)
    }

    /**
     * Generate completion using FIM (Fill-In-The-Middle)
     * Format: <PRE> {prefix} <SUF> {suffix} <MID>
     */
    private async generateCompletion(request: AutocompleteRequest): Promise<AutocompleteResult> {
        // Truncate context if needed
        const { prefix, suffix } = this.truncateContext(request.prefix, request.suffix)

        // Build FIM prompt
        const fimPrompt = this.buildFIMPrompt(prefix, suffix, request.language)

        // Get model configuration
        const config = vscode.workspace.getConfiguration('lexentia')
        const models = config.get<any[]>('models', [])
        const roleIndex = config.get<string>('roles.autocomplete', '0')
        const modelConfig = models[parseInt(roleIndex)] || models[0]

        if (!modelConfig) {
            throw new Error('No model configured for autocomplete')
        }

        // Get API key from secret storage
        let apiKey = modelConfig.apiKey
        if (apiKey && modelConfig.provider === 'openai-compatible') {
            const storedKey = await this.secretStorage.getApiKey(modelConfig.provider, modelConfig.model)
            if (storedKey) apiKey = storedKey
        }

        // Stream the response
        let completion = ''
        const streamHandler: any = {
            onChunk: (chunk: string) => {
                completion += chunk
            },
            onComplete: () => {
                // Stream complete
            },
            onError: (error: Error) => {
                throw error
            }
        }

        if (modelConfig.provider === 'ollama') {
            await streamOllamaResponse(
                modelConfig.apiBaseUrl || 'http://127.0.0.1:11434',
                modelConfig.model,
                [{ role: 'user', content: fimPrompt }],
                streamHandler
            )
        } else if (modelConfig.provider === 'openai-compatible') {
            await streamOpenAIResponse(
                modelConfig.apiBaseUrl || 'https://api.openai.com/v1',
                modelConfig.model,
                apiKey || '',
                [{ role: 'user', content: fimPrompt }],
                streamHandler
            )
        }

        return {
            completion,
            isStreaming: true
        }
    }

    /**
     * Build FIM (Fill-In-The-Middle) prompt
     */
    private buildFIMPrompt(prefix: string, suffix: string, language: string): string {
        // FIM format varies by model, this is a common format
        return `<PRE>${prefix}<SUF>${suffix}<MID>`
    }

    /**
     * Truncate context to fit within token limits
     */
    private truncateContext(prefix: string, suffix: string): { prefix: string; suffix: string } {
        const prefixTokens = this.estimateTokens(prefix)
        const suffixTokens = this.estimateTokens(suffix)

        if (prefixTokens + suffixTokens <= this.maxContextTokens) {
            return { prefix, suffix }
        }

        // Prioritize prefix (code before cursor) over suffix
        const prefixRatio = 0.7
        const prefixLimit = Math.floor(this.maxContextTokens * prefixRatio)
        const suffixLimit = this.maxContextTokens - prefixLimit

        let truncatedPrefix = prefix
        let truncatedSuffix = suffix

        if (prefixTokens > prefixLimit) {
            truncatedPrefix = this.truncateToTokens(prefix, prefixLimit)
        }

        if (suffixTokens > suffixLimit) {
            truncatedSuffix = this.truncateToTokens(suffix, suffixLimit)
        }

        return { prefix: truncatedPrefix, suffix: truncatedSuffix }
    }

    /**
     * Truncate string to approximate token count
     */
    private truncateToTokens(text: string, maxTokens: number): string {
        const estimatedChars = maxTokens * 4 // Approximate 4 chars per token
        if (text.length <= estimatedChars) {
            return text
        }

        // Truncate from the beginning for suffix, from end for prefix
        const lines = text.split('\n')
        let result = ''
        let currentLength = 0

        for (const line of lines) {
            if (currentLength + line.length > estimatedChars) {
                break
            }
            result += line + '\n'
            currentLength += line.length
        }

        return result.trim()
    }

    /**
     * Estimate token count (rough approximation)
     */
    private estimateTokens(text: string): number {
        // Rough approximation: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4)
    }

    /**
     * Toggle autocomplete on/off
     */
    toggle(): boolean {
        this.isEnabled = !this.isEnabled
        vscode.workspace.getConfiguration('lexentia.autocomplete').update('enabled', this.isEnabled, true)
        return this.isEnabled
    }

    /**
     * Check if autocomplete is enabled
     */
    isAutocompleteEnabled(): boolean {
        return this.isEnabled
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }
    }
}

// Singleton
let autocompleteService: AutocompleteService | null = null

export function getAutocompleteService(context: vscode.ExtensionContext): AutocompleteService {
    if (!autocompleteService) {
        autocompleteService = new AutocompleteService(context)
    }
    return autocompleteService
}
