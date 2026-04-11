export interface StreamChunk {
    type: 'content' | 'tool' | 'error' | 'done'
    content?: string
    tool?: any
}

export type StreamHandler = (chunk: StreamChunk) => void

export async function streamOllamaResponse(
    baseUrl: string,
    model: string,
    messages: any[],
    onChunk: StreamHandler
): Promise<void> {
    const url = `${baseUrl}/api/generate`

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt: formatMessagesForOllama(messages),
                stream: true
            })
        })

        if (!response.ok) {
            throw new Error(`http ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('no response body')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (!line.trim()) continue
                try {
                    const data = JSON.parse(line)
                    if (data.response) {
                        onChunk({ type: 'content', content: data.response })
                    }
                    if (data.done) {
                        onChunk({ type: 'done' })
                        return
                    }
                } catch {
                    // skip invalid json
                }
            }
        }

        onChunk({ type: 'done' })
    } catch (e: any) {
        onChunk({ type: 'error', content: e?.message || 'stream failed' })
    }
}

export async function streamOpenAIResponse(
    baseUrl: string,
    model: string,
    apiKey: string,
    messages: any[],
    onChunk: StreamHandler
): Promise<void> {
    const url = `${baseUrl}/v1/chat/completions`
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages,
                stream: true
            })
        })

        if (!response.ok) {
            throw new Error(`http ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('no response body')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (!line.trim() || line.startsWith(':')) continue

                const dataStr = line.startsWith('data: ') ? line.slice(6) : line
                if (dataStr === '[DONE]') {
                    onChunk({ type: 'done' })
                    return
                }

                try {
                    const data = JSON.parse(dataStr)
                    const content = data.choices?.[0]?.delta?.content
                    if (content) {
                        onChunk({ type: 'content', content })
                    }
                    if (data.choices?.[0]?.delta?.tool_calls) {
                        onChunk({ type: 'tool', tool: data.choices[0].delta.tool_calls })
                    }
                } catch {
                    // skip invalid json
                }
            }
        }

        onChunk({ type: 'done' })
    } catch (e: any) {
        onChunk({ type: 'error', content: e?.message || 'stream failed' })
    }
}

function formatMessagesForOllama(messages: any[]): string {
    return messages.map(m => {
        const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'
        return `${role}: ${m.content}`
    }).join('\n\n') + '\n\nAssistant:'
}
