import { OllamaAdapter, type OllamaChatMessage, type OllamaTool } from '../models/OllamaAdapter'
import { OpenAICompatibleAdapter, type OpenAIChatMessage, type OpenAITool } from '../models/OpenAICompatibleAdapter'
import { formatToolsForAPI, buildToolsSystemPrompt, type ToolCall, type ToolResult } from './modelTools'

export type ChatRole = 'user' | 'assistant' | 'tool'

export type ChatMessage = {
    role: ChatRole
    content: string
    tool_calls?: any[]
    tool_call_id?: string
}

export type ModelResult =
    | { type: 'clarify'; question: string; options: string[] }
    | { type: 'plan'; title?: string; introduction?: string; steps: string[] }
    | { type: 'final'; content: string; toolCalls?: ToolCall[]; toolResults?: ToolResult[] }

export type ModelOptions = {
    temperature?: number
    topP?: number
}

export type ModelProfile = {
    id: string
    name: string
    provider: 'ollama' | 'openai-compatible'
    model: string
    baseUrl: string
    apiKey?: string
    customSystemPrompt?: string
}

export class ModelService {
    async next(
        messages: ChatMessage[],
        profile: ModelProfile,
        options?: ModelOptions
    ): Promise<ModelResult> {
        const temperature = options?.temperature ?? 0.7
        const topP = options?.topP ?? 0.9

        let systemText = buildAdaptiveSystemPrompt(profile.model, profile.customSystemPrompt)
        systemText = buildToolsSystemPrompt(systemText)

        let content = ''
        let toolCalls: ToolCall[] | undefined
        const tools = formatToolsForAPI()

        if (profile.provider === 'ollama') {
            const adapter = new OllamaAdapter(profile.model, profile.baseUrl)
            const ollamaMessages: OllamaChatMessage[] = [
                { role: 'system', content: systemText },
                ...messages.map((m) => ({
                    role: m.role as 'user' | 'assistant' | 'system' | 'tool',
                    content: m.content,
                    tool_calls: m.tool_calls
                }))
            ]
            const ollamaTools: OllamaTool[] = tools.map((t) => ({
                type: 'function',
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters
                }
            }))
            const result = await adapter.chatWithTools(ollamaMessages, ollamaTools, { temperature, top_p: topP })
            content = result.content
            if (result.toolCalls) {
                toolCalls = result.toolCalls.map((tc: any) => ({
                    id: tc.id || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    name: tc.function?.name || tc.name,
                    arguments: safeParseArguments(tc.function?.arguments || tc.arguments)
                }))
            }
        } else {
            const adapter = new OpenAICompatibleAdapter(profile.model, profile.baseUrl, profile.apiKey)
            const oaMessages: OpenAIChatMessage[] = [
                { role: 'system', content: systemText },
                ...messages.map((m) => ({
                    role: m.role as 'system' | 'user' | 'assistant' | 'tool',
                    content: m.content,
                    tool_calls: m.tool_calls,
                    tool_call_id: m.tool_call_id
                }))
            ]
            const openAITools: OpenAITool[] = tools.map((t) => ({
                type: 'function',
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters
                }
            }))
            const result = await adapter.chatWithTools(oaMessages, openAITools, { temperature, top_p: topP })
            content = result.content
            if (result.toolCalls) {
                toolCalls = result.toolCalls.map((tc: any) => ({
                    id: tc.id || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    name: tc.function?.name || tc.name,
                    arguments: safeParseArguments(tc.function?.arguments || tc.arguments)
                }))
            }
        }

        return { type: 'final', content, toolCalls }
    }
}

export const modelService = new ModelService()

function safeParseArguments(value: unknown): Record<string, any> {
    if (!value) return {}
    if (typeof value === 'object') return value as Record<string, any>
    if (typeof value === 'string') {
        try {
            return JSON.parse(value)
        } catch {
            return {}
        }
    }
    return {}
}

function buildAdaptiveSystemPrompt(modelName: string, customSystemPrompt?: string): string {
    if (customSystemPrompt?.trim()) return customSystemPrompt.trim()

    const size = inferModelSizeB(modelName)
    const base = 'you are a helpful coding assistant.'
    if (size !== null && size <= 8) {
        return `${base} keep answers concise, ask for clarification before complex multi-step edits, and avoid unnecessary tool calls.`
    }
    if (size !== null && size <= 40) {
        return `${base} provide structured plans for coding tasks, prefer accurate incremental edits, and use tools only when explicitly required.`
    }
    return `${base} be proactive, provide robust reasoning for code changes, and use tools deliberately with minimal side effects.`
}

function inferModelSizeB(modelName: string): number | null {
    const match = modelName.toLowerCase().match(/(\d+(?:\.\d+)?)\s*b/)
    if (!match) return null
    const size = Number(match[1])
    return Number.isFinite(size) ? size : null
}
