export type OllamaChatMessage = {
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string
    tool_calls?: any[]
    images?: string[]
}

export type OllamaTool = {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: {
            type: 'object'
            properties: Record<string, any>
            required?: string[]
        }
    }
}

export type OllamaChatOptions = {
    temperature?: number
    top_p?: number
    num_predict?: number
}

export class OllamaAdapter {
    constructor(
        private modelName: string,
        private baseUrl: string = 'http://127.0.0.1:11434'
    ) {}

    private buildUrl(path: string): string {
        const base = this.baseUrl.replace(/\/$/, '')
        return `${base}${path}`
    }

    private async postJson(path: string, payload: Record<string, unknown>) {
        const res = await fetch(this.buildUrl(path), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!res.ok) {
            const txt = await res.text().catch(() => '')
            throw new Error(`ollama request failed (${path}): ${res.status} ${res.statusText} ${txt}`.trim())
        }

        return res.json()
    }

    async generate(prompt: string, options?: OllamaChatOptions): Promise<string> {
        const res = await fetch(this.buildUrl('/api/generate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.modelName,
                prompt,
                stream: false,
                options
            })
        })

        if (!res.ok) {
            throw new Error(`ollama generate failed: ${res.status} ${res.statusText}`)
        }

        const data = await res.json()
        return String(data?.response ?? '')
    }

    async chat(messages: OllamaChatMessage[], options?: OllamaChatOptions): Promise<string> {
        const payload = {
            model: this.modelName,
            messages,
            stream: false,
            options
        }

        try {
            const data = await this.postJson('/api/chat', payload)
            if (data?.message?.content !== undefined) return String(data.message.content)
            if (data?.choices?.[0]?.message?.content !== undefined) return String(data.choices[0].message.content)
            if (typeof data?.error === 'string') throw new Error(data.error)
            throw new Error('unexpected response payload')
        } catch (error) {
            const data = await this.postJson('/v1/chat/completions', payload)
            if (data?.choices?.[0]?.message?.content !== undefined) return String(data.choices[0].message.content)
            if (typeof data?.error === 'string') throw new Error(data.error)
            throw error
        }
    }

    async chatWithTools(
        messages: OllamaChatMessage[],
        tools: OllamaTool[],
        options?: OllamaChatOptions
    ): Promise<{ content: string; toolCalls?: any[] }> {
        const payload = {
            model: this.modelName,
            messages,
            tools,
            stream: false,
            options
        }

        try {
            const data = await this.postJson('/api/chat', payload)
            if (typeof data?.error === 'string') throw new Error(data.error)
            if (data?.message || data?.choices) {
                const message = data?.message ?? data?.choices?.[0]?.message ?? {}
                return {
                    content: String(message?.content ?? ''),
                    toolCalls: message?.tool_calls
                }
            }
            throw new Error('unexpected response payload')
        } catch (error) {
            const data = await this.postJson('/v1/chat/completions', payload)
            if (typeof data?.error === 'string') throw new Error(data.error)
            const message = data?.choices?.[0]?.message ?? {}
            return {
                content: String(message?.content ?? ''),
                toolCalls: message?.tool_calls
            }
        }
    }
}
