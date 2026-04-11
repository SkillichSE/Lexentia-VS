import { ChatMessage } from './modelService'

const MAX_CONTEXT_TOKENS = 8000
const TOKEN_PER_CHAR = 0.3

export function estimateTokens(text: string): number {
    return Math.ceil(text.length * TOKEN_PER_CHAR)
}

export function compressContext(messages: ChatMessage[]): ChatMessage[] {
    const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)

    if (totalTokens <= MAX_CONTEXT_TOKENS) {
        return messages
    }

    // keep system and recent messages
    const compressed: ChatMessage[] = []
    let currentTokens = 0

    // always keep first message (usually system)
    if (messages.length > 0) {
        compressed.push(messages[0])
        currentTokens += estimateTokens(messages[0].content)
    }

    // add recent messages until limit
    for (let i = messages.length - 1; i > 0; i--) {
        const msg = messages[i]
        const msgTokens = estimateTokens(msg.content)

        if (currentTokens + msgTokens > MAX_CONTEXT_TOKENS) {
            compressed.splice(1, 0, {
                role: 'assistant',
                content: `... ${i - 1} earlier messages omitted for context ...`
            })
            break
        }

        compressed.splice(1, 0, msg)
        currentTokens += msgTokens
    }

    return compressed
}

export function summarizeOldMessages(messages: ChatMessage[]): string {
    if (messages.length <= 5) return ''

    const oldMessages = messages.slice(0, -5)
    const summary = oldMessages.map(m => {
        const role = m.role === 'user' ? 'user' : 'assistant'
        const content = m.content.slice(0, 100)
        return `${role}: ${content}${m.content.length > 100 ? '...' : ''}`
    }).join('\n')

    return `summary of earlier conversation:\n${summary}`
}
