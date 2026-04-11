import * as vscode from 'vscode'

export interface CodeChunk {
    id: string
    file: string
    content: string
    lineStart: number
    lineEnd: number
    tokens: string[]
}

export interface SearchResult {
    chunk: CodeChunk
    score: number
}

const codeIndex: Map<string, CodeChunk> = new Map()
let isIndexing = false

export async function indexCodebase(): Promise<number> {
    if (isIndexing) return 0
    isIndexing = true
    codeIndex.clear()

    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) {
        isIndexing = false
        return 0
    }

    const files = await vscode.workspace.findFiles('**/*.{ts,js,py,json,md}', '**/node_modules/**', 500)
    let count = 0

    for (const file of files) {
        try {
            const content = await vscode.workspace.fs.readFile(file)
            const text = new TextDecoder().decode(content)
            const relPath = vscode.workspace.asRelativePath(file)

            const chunks = chunkCode(relPath, text)
            for (const chunk of chunks) {
                codeIndex.set(chunk.id, chunk)
                count++
            }
        } catch {
            // skip files that cannot be read
        }
    }

    isIndexing = false
    return count
}

export function searchCodebase(query: string, topK: number = 5): SearchResult[] {
    const queryTokens = tokenize(query)
    const results: SearchResult[] = []

    for (const chunk of codeIndex.values()) {
        const score = calculateSimilarity(queryTokens, chunk.tokens)
        if (score > 0) {
            results.push({ chunk, score })
        }
    }

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
}

export function getIndexedFiles(): string[] {
    const files = new Set<string>()
    for (const chunk of codeIndex.values()) {
        files.add(chunk.file)
    }
    return Array.from(files)
}

function chunkCode(file: string, content: string): CodeChunk[] {
    const lines = content.split('\n')
    const chunks: CodeChunk[] = []
    const chunkSize = 30

    for (let i = 0; i < lines.length; i += chunkSize) {
        const chunkLines = lines.slice(i, i + chunkSize)
        const chunkContent = chunkLines.join('\n')

        chunks.push({
            id: `${file}_${i}`,
            file,
            content: chunkContent,
            lineStart: i + 1,
            lineEnd: Math.min(i + chunkSize, lines.length),
            tokens: tokenize(chunkContent)
        })
    }

    return chunks
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !isStopWord(t))
}

function isStopWord(token: string): boolean {
    const stopWords = new Set([
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
        'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
        'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy',
        'did', 'she', 'use', 'her', 'way', 'many', 'oil', 'sit', 'set', 'run',
        'eat', 'far', 'sea', 'eye', 'ago', 'off', 'too', 'any', 'say', 'man',
        'try', 'ask', 'end', 'why', 'let', 'put', 'say', 'she', 'try', 'way',
        'own', 'say', 'too', 'old', 'tell', 'very', 'when', 'much', 'would',
        'there', 'their', 'what', 'said', 'each', 'which', 'will', 'about',
        'could', 'other', 'after', 'first', 'never', 'these', 'think', 'where',
        'being', 'every', 'great', 'might', 'shall', 'still', 'those', 'while',
        'this', 'that', 'with', 'have', 'from', 'they', 'know', 'want', 'been',
        'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just',
        'like', 'long', 'make', 'over', 'such', 'take', 'than', 'them', 'well',
        'were', 'into', 'look', 'more', 'only', 'back', 'call', 'came', 'come',
        'could', 'find', 'give', 'going', 'had', 'has', 'have', 'her', 'here',
        'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two',
        'who', 'boy', 'did', 'she', 'use', 'her', 'way', 'many', 'oil', 'sit',
        'set', 'run', 'eat', 'far', 'sea', 'eye', 'ago', 'off', 'too', 'any',
        'say', 'man', 'try', 'ask', 'end', 'why', 'let', 'put', 'say', 'she',
        'try', 'way', 'own', 'say', 'too', 'old', 'tell', 'very', 'when', 'much'
    ])
    return stopWords.has(token)
}

function calculateSimilarity(queryTokens: string[], docTokens: string[]): number {
    const querySet = new Set(queryTokens)
    const docSet = new Set(docTokens)

    let intersection = 0
    for (const token of querySet) {
        if (docSet.has(token)) {
            intersection++
        }
    }

    if (intersection === 0) return 0

    const union = new Set([...querySet, ...docSet]).size
    return intersection / union
}
