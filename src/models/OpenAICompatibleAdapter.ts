export type OpenAIChatMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string
    tool_calls?: any[]
    tool_call_id?: string
}

export type OpenAITool = {
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

export type OpenAICompatibleOptions = {
    temperature?: number
    top_p?: number
    max_tokens?: number
}

export class OpenAICompatibleAdapter {
    constructor(
        private modelName: string,
        private baseUrl: string,
        private apiKey?: string
    ) {}

    private buildChatCompletionsUrl(): string {
        const base = this.baseUrl.replace(/\/$/, '')
        return `${base}/v1/chat/completions`
    }

    async generate(prompt: string, options?: OpenAICompatibleOptions): Promise<string> {
        const url = this.buildChatCompletionsUrl()
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        }
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`
        }

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.modelName,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                ...options
            })
        })

        if (!res.ok) {
            const txt = await res.text().catch(() => '')
            throw new Error(`openai generate failed: ${res.status} ${res.statusText} ${txt}`.trim())
        }

        const data = await res.json()
        return String(data?.choices?.[0]?.message?.content ?? '')
    }

    async chat(messages: OpenAIChatMessage[], options?: OpenAICompatibleOptions): Promise<string> {
        const url = this.buildChatCompletionsUrl()
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        }
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`
        }

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.modelName,
                messages,
                stream: false,
                ...options
            })
        })

        if (!res.ok) {
            const txt = await res.text().catch(() => '')
            throw new Error(`openai chat failed: ${res.status} ${res.statusText} ${txt}`.trim())
        }

        const data = await res.json()
        return String(data?.choices?.[0]?.message?.content ?? '')
    }

    async chatWithTools(
        messages: OpenAIChatMessage[],
        tools: OpenAITool[],
        options?: OpenAICompatibleOptions
    ): Promise<{ content: string; toolCalls?: any[] }> {
        const url = this.buildChatCompletionsUrl()
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        }
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`
        }

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.modelName,
                messages,
                tools,
                stream: false,
                ...options
            })
        })

        if (!res.ok) {
            const txt = await res.text().catch(() => '')
            throw new Error(`openai chat with tools failed: ${res.status} ${res.statusText} ${txt}`.trim())
        }

        const data = await res.json()
        const message = data?.choices?.[0]?.message
        return {
            content: String(message?.content ?? ''),
            toolCalls: message?.tool_calls
        }
    }
}
