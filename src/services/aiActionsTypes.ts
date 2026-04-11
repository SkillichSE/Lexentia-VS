/**
 * types for ai actions visualization and audit logging
 * all comments in english lowercase only
 */

export type AiActionStepType =
    | 'intent_classification'
    | 'context_gathering'
    | 'rag_search'
    | 'reasoning_planning'
    | 'tool_usage'
    | 'code_generation'
    | 'diff_application'
    | 'complete'

export interface AiActionStep {
    id: string
    type: AiActionStepType
    label: string
    status: 'pending' | 'running' | 'complete' | 'error'
    startTime: number
    endTime?: number
    duration?: number
    metadata: {
        tokensIn?: number
        tokensOut?: number
        latency?: number
        toolsUsed?: string[]
        contextFiles?: string[]
        rawPrompt?: string
        intermediateOutput?: string
        [key: string]: any
    }
    children?: AiActionStep[]
}

export interface AiActionSession {
    id: string
    userQuery: string
    startTime: number
    endTime?: number
    steps: AiActionStep[]
    currentStepId?: string
    finalResponse?: string
}

export type IntentType =
    | 'general_chat'
    | 'code_explain'
    | 'code_edit'
    | 'code_generate'
    | 'code_review'
    | 'debug_help'
    | 'refactor'
    | 'test_generate'

export interface IntentClassification {
    intent: IntentType
    confidence: number
    requiresContext: boolean
    contextScope: 'none' | 'current_file' | 'related_files' | 'full_project'
    reasoning: string
}

export interface ContextChip {
    id: string
    type: 'file' | 'symbol' | 'terminal_error' | 'selection' | 'rag_result' | 'memory'
    label: string
    value: string
    relevance: number
    content?: string
}

export interface AuditEntry {
    id: string
    timestamp: number
    type: 'prompt' | 'response' | 'tool_call' | 'tool_result' | 'error'
    sessionId: string
    stepId?: string
    content: string
    metadata: {
        tokens?: number
        model?: string
        provider?: string
        latency?: number
        [key: string]: any
    }
}

export interface ExportOptions {
    format: 'json' | 'markdown' | 'png'
    includeRawPrompts: boolean
    includeMetadata: boolean
    sessionIds?: string[]
}
