/**
 * Security Service
 * Enforces security policies: Local-Only mode and Telemetry Control
 */

import * as vscode from 'vscode'

export class SecurityService {
    private static instance: SecurityService

    private constructor() {}

    static getInstance(): SecurityService {
        if (!SecurityService.instance) {
            SecurityService.instance = new SecurityService()
        }
        return SecurityService.instance
    }

    /**
     * Check if Local-Only mode is enabled
     * When enabled, only local models (Ollama) are allowed
     */
    isLocalOnlyMode(): boolean {
        const config = vscode.workspace.getConfiguration('lexentia.security')
        return config.get<boolean>('localOnly', false)
    }

    /**
     * Check if telemetry is disabled
     * When disabled, no data should be sent to external services
     */
    isTelemetryDisabled(): boolean {
        const config = vscode.workspace.getConfiguration('lexentia.security')
        return config.get<boolean>('disableTelemetry', true)
    }

    /**
     * Validate that a provider is allowed based on security settings
     */
    isProviderAllowed(provider: string): boolean {
        if (this.isLocalOnlyMode()) {
            return provider === 'ollama'
        }
        return true
    }

    /**
     * Validate that an API request can be made
     * Returns false if telemetry is disabled and the request is to an external service
     */
    canMakeApiRequest(provider: string, baseUrl: string): boolean {
        if (this.isTelemetryDisabled()) {
            // If telemetry is disabled, only allow local requests
            const isLocal = baseUrl.includes('localhost') || 
                           baseUrl.includes('127.0.0.1') ||
                           baseUrl.startsWith('http://192.168.') ||
                           baseUrl.startsWith('http://10.')
            
            if (!isLocal && provider !== 'ollama') {
                return false
            }
        }

        if (this.isLocalOnlyMode() && provider !== 'ollama') {
            return false
        }

        return true
    }

    /**
     * Get security status for display
     */
    getSecurityStatus(): {
        localOnly: boolean
        telemetryDisabled: boolean
        allowedProviders: string[]
    } {
        return {
            localOnly: this.isLocalOnlyMode(),
            telemetryDisabled: this.isTelemetryDisabled(),
            allowedProviders: this.isLocalOnlyMode() ? ['ollama'] : ['ollama', 'openai-compatible', 'anthropic']
        }
    }

    /**
     * Show security warning if needed
     */
    async showSecurityWarningIfBlocked(provider: string, baseUrl: string): Promise<boolean> {
        if (!this.canMakeApiRequest(provider, baseUrl)) {
            const reasons: string[] = []

            if (this.isLocalOnlyMode() && provider !== 'ollama') {
                reasons.push('Local-Only mode is enabled (only Ollama allowed)')
            }

            if (this.isTelemetryDisabled() && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
                reasons.push('Telemetry is disabled (external requests blocked)')
            }

            const message = reasons.join('\n')
            await vscode.window.showWarningMessage(
                `Request blocked:\n${message}\n\nCheck settings to adjust security policies.`,
                'Open Settings'
            )

            return true // Blocked
        }

        return false // Not blocked
    }
}
