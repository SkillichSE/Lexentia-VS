/**
 * Chain of Thought Orchestrator
 * Manages the reasoning cycle for AI actions
 */

import * as vscode from 'vscode'
import { MCPToolExecutor, ToolResult } from './mcpTools'

// Thought step types
export type ThoughtStepType = 'reasoning' | 'planning' | 'tool_use' | 'observation' | 'conclusion'

export interface ThoughtStep {
    id: string
    type: ThoughtStepType
    content: string
    timestamp: number
    toolCall?: {
        name: string
        args: Record<string, any>
        result?: ToolResult
    }
    metadata?: Record<string, any>
}

export interface ChainSession {
    id: string
    query: string
    steps: ThoughtStep[]
    status: 'running' | 'completed' | 'error'
    startTime: number
    endTime?: number
}

// Chain of Thought orchestrator
export class ChainOfThoughtOrchestrator {
    private sessions: Map<string, ChainSession> = new Map()
    private toolExecutor: MCPToolExecutor

    constructor(private context: vscode.ExtensionContext) {
        this.toolExecutor = new MCPToolExecutor(context)
    }

    /**
     * Start a new chain of thought session
     */
    async startSession(query: string): Promise<ChainSession> {
        const session: ChainSession = {
            id: `cot-${Date.now()}`,
            query,
            steps: [],
            status: 'running',
            startTime: Date.now()
        }

        this.sessions.set(session.id, session)

        // Initial reasoning step
        this.addStep(session.id, {
            type: 'reasoning',
            content: `Analyzing user query: "${query}"`
        })

        return session
    }

    /**
     * Execute a tool within a chain session
     */
    async executeTool(
        sessionId: string,
        toolName: string,
        args: Record<string, any>
    ): Promise<ToolResult> {
        const session = this.sessions.get(sessionId)
        if (!session) {
            return { success: false, content: '', error: 'Session not found' }
        }

        // Add planning step
        this.addStep(sessionId, {
            type: 'planning',
            content: `Planning to use tool: ${toolName} with args: ${JSON.stringify(args)}`
        })

        // Execute tool
        const result = await this.toolExecutor.executeTool(toolName, args)

        // Add tool use step
        this.addStep(sessionId, {
            type: 'tool_use',
            content: result.success
                ? `Executed ${toolName} successfully`
                : `Failed to execute ${toolName}: ${result.error}`,
            toolCall: {
                name: toolName,
                args,
                result
            }
        })

        // Add observation step
        this.addStep(sessionId, {
            type: 'observation',
            content: result.content.substring(0, 1000) // Truncate long results
        })

        return result
    }

    /**
     * Add a reasoning step
     */
    addReasoning(sessionId: string, content: string): void {
        this.addStep(sessionId, {
            type: 'reasoning',
            content
        })
    }

    /**
     * Conclude the chain session
     */
    concludeSession(sessionId: string, conclusion: string): void {
        const session = this.sessions.get(sessionId)
        if (!session) return

        this.addStep(sessionId, {
            type: 'conclusion',
            content: conclusion
        })

        session.status = 'completed'
        session.endTime = Date.now()
    }

    /**
     * Get session by ID
     */
    getSession(id: string): ChainSession | undefined {
        return this.sessions.get(id)
    }

    /**
     * Get all active sessions
     */
    getActiveSessions(): ChainSession[] {
        return Array.from(this.sessions.values())
            .filter(s => s.status === 'running')
    }

    /**
     * Format chain as prompt for LLM
     */
    formatChainForPrompt(sessionId: string): string {
        const session = this.sessions.get(sessionId)
        if (!session) return ''

        const lines = [
            '## Chain of Thought',
            '',
            `Query: ${session.query}`,
            ''
        ]

        for (const step of session.steps) {
            const emoji = {
                reasoning: '🤔',
                planning: '📋',
                tool_use: '🔧',
                observation: '👁️',
                conclusion: '✅'
            }[step.type]

            lines.push(`${emoji} **${step.type.toUpperCase()}**: ${step.content}`)

            if (step.toolCall?.result && step.type === 'tool_use') {
                const result = step.toolCall.result
                if (result.success) {
                    lines.push(`   Result: ${result.content.substring(0, 200)}...`)
                } else {
                    lines.push(`   Error: ${result.error}`)
                }
            }

            lines.push('')
        }

        return lines.join('\n')
    }

    /**
     * Get system prompt for chain of thought
     */
    getSystemPrompt(): string {
        return `You are an AI assistant with access to tools. Follow this reasoning process:

1. **REASONING**: Analyze what the user needs and what information you have
2. **PLANNING**: Decide which tools to use and in what order
3. **TOOL_USE**: Execute tools to gather information
4. **OBSERVATION**: Review the results from tools
5. **CONCLUSION**: Provide your final answer based on all observations

Available tools:
${this.toolExecutor.getToolDefinitions()}

When you need to use a tool, respond with:
TOOL_CALL: {"name": "tool_name", "args": {"param": "value"}}

After each tool result, continue reasoning until you can provide a complete answer.`
    }

    private addStep(sessionId: string, step: Omit<ThoughtStep, 'id' | 'timestamp'>): void {
        const session = this.sessions.get(sessionId)
        if (!session) return

        session.steps.push({
            ...step,
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now()
        })
    }
}

// Singleton
let orchestrator: ChainOfThoughtOrchestrator | null = null

export function getChainOrchestrator(context: vscode.ExtensionContext): ChainOfThoughtOrchestrator {
    if (!orchestrator) {
        orchestrator = new ChainOfThoughtOrchestrator(context)
    }
    return orchestrator
}
