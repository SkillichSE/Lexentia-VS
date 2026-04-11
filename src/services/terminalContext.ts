/**
 * Terminal Context Provider
 * Captures terminal output for @terminal context provider
 */

import * as vscode from 'vscode'
import { EventEmitter } from 'events'

export interface TerminalLine {
    timestamp: number
    content: string
    terminalId: string
}

export class TerminalContextProvider extends EventEmitter {
    private terminalLines: Map<string, TerminalLine[]> = new Map()
    private maxLines = 50
    private disposables: vscode.Disposable[] = []

    constructor() {
        super()
        this.setupTerminalListeners()
    }

    private setupTerminalListeners(): void {
        // Listen for terminal creation
        const terminalCreation = vscode.window.onDidOpenTerminal(terminal => {
            this.terminalLines.set(terminal.processId.toString(), [])
            this.setupTerminalOutputListener(terminal)
        })
        this.disposables.push(terminalCreation)

        // Listen for terminal close
        const terminalClose = vscode.window.onDidCloseTerminal(terminal => {
            this.terminalLines.delete(terminal.processId.toString())
        })
        this.disposables.push(terminalClose)

        // Listen for existing terminals
        vscode.window.terminals.forEach(terminal => {
            if (!this.terminalLines.has(terminal.processId.toString())) {
                this.terminalLines.set(terminal.processId.toString(), [])
                this.setupTerminalOutputListener(terminal)
            }
        })
    }

    private setupTerminalOutputListener(terminal: vscode.Terminal): void {
        // Note: VS Code doesn't provide direct access to terminal output
        // This is a simplified implementation that would need to be enhanced
        // with a custom terminal profile or shell wrapper in production

        // For now, we'll track terminal state via the creation listener
    }

    /**
     * Get last N lines from terminal
     */
    getTerminalLines(terminalId?: string, count = 50): TerminalLine[] {
        const lines = terminalId 
            ? this.terminalLines.get(terminalId) || []
            : this.getAllLines()

        return lines.slice(-count)
    }

    /**
     * Get all lines from all terminals
     */
    private getAllLines(): TerminalLine[] {
        const allLines: TerminalLine[] = []
        for (const lines of this.terminalLines.values()) {
            allLines.push(...lines)
        }
        return allLines.sort((a, b) => a.timestamp - b.timestamp)
    }

    /**
     * Format terminal lines for context
     */
    formatForContext(terminalId?: string, count = 50): string {
        const lines = this.getTerminalLines(terminalId, count)
        if (lines.length === 0) {
            return 'No terminal output available.'
        }

        return lines.map(line => line.content).join('\n')
    }

    /**
     * Capture output from a command execution
     */
    async captureCommandOutput(command: string, cwd?: string): Promise<string> {
        const terminal = vscode.window.createTerminal('Lexentia Command')
        
        // Execute command
        terminal.sendText(cwd ? `cd "${cwd}" && ${command}` : command)

        // Wait for execution (simplified - in production use proper async handling)
        await new Promise(resolve => setTimeout(resolve, 1000))

        // For production, we would need to implement proper output capture
        // This is a placeholder for the actual implementation
        return `Command executed: ${command}\n(Output capture requires terminal integration)`
    }

    /**
     * Get active terminal ID
     */
    getActiveTerminalId(): string | undefined {
        const activeTerminal = vscode.window.activeTerminal
        return activeTerminal?.processId.toString()
    }

    /**
     * Dispose of all listeners
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose())
        this.terminalLines.clear()
    }
}

// Singleton
let terminalProvider: TerminalContextProvider | null = null

export function getTerminalContextProvider(): TerminalContextProvider {
    if (!terminalProvider) {
        terminalProvider = new TerminalContextProvider()
    }
    return terminalProvider
}
