/**
 * Context Engine - Advanced RAG with AST parsing
 * Provides intelligent code context gathering using hybrid search
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { EventEmitter } from 'events'

// Types for AST-based code chunks
interface CodeChunk {
    id: string
    filePath: string
    content: string
    startLine: number
    endLine: number
    type: 'function' | 'class' | 'interface' | 'variable' | 'import' | 'block' | 'file'
    name: string
    parent?: string
    children: string[]
    embedding?: number[]
    metadata: {
        language: string
        signature?: string
        docs?: string
        complexity: number
        imports: string[]
        exports: string[]
    }
}

interface SearchQuery {
    text: string
    embedding?: number[]
    filters?: {
        fileTypes?: string[]
        maxResults?: number
        minScore?: number
    }
}

interface SearchResult {
    chunk: CodeChunk
    score: number
    matchType: 'embedding' | 'keyword' | 'hybrid'
}

// Background indexing worker
export class ContextEngine extends EventEmitter {
    private index: Map<string, CodeChunk> = new Map()
    private fileGraph: Map<string, Set<string>> = new Map() // file -> related files
    private embeddingCache: Map<string, number[]> = new Map()
    private isIndexing = false
    private indexVersion = 0

    constructor(private context: vscode.ExtensionContext) {
        super()
    }

    async initialize(): Promise<void> {
        // Load persisted index if available
        const persisted = this.context.globalState.get<{ index: CodeChunk[], version: number }>('contextIndex')
        if (persisted) {
            this.indexVersion = persisted.version
            for (const chunk of persisted.index) {
                this.index.set(chunk.id, chunk)
            }
        }

        // Start background indexing
        this.startBackgroundIndexing()
    }

    /**
     * Start background indexing of the workspace
     */
    private startBackgroundIndexing(): void {
        if (this.isIndexing) return

        this.isIndexing = true
        this.emit('indexingStarted')

        // Use setImmediate to not block the main thread
        setImmediate(async () => {
            try {
                await this.indexWorkspace()
            } finally {
                this.isIndexing = false
                this.emit('indexingComplete')
            }
        })
    }

    /**
     * Index the entire workspace using AST parsing
     */
    async indexWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders) return

        const newIndex = new Map<string, CodeChunk>()
        const newGraph = new Map<string, Set<string>>()

        for (const folder of workspaceFolders) {
            const files = await this.findCodeFiles(folder.uri.fsPath)

            for (const file of files) {
                try {
                    const chunks = await this.parseFileWithAST(file)
                    for (const chunk of chunks) {
                        newIndex.set(chunk.id, chunk)

                        // Build file relationships
                        if (!newGraph.has(file)) {
                            newGraph.set(file, new Set())
                        }

                        // Add imports as relationships
                        for (const imp of chunk.metadata.imports) {
                            const resolvedPath = this.resolveImport(file, imp)
                            if (resolvedPath) {
                                newGraph.get(file)?.add(resolvedPath)
                            }
                        }
                    }
                } catch (err) {
                    console.error(`Failed to parse ${file}:`, err)
                }
            }
        }

        // Atomic swap
        this.index = newIndex
        this.fileGraph = newGraph
        this.indexVersion++

        // Persist index
        await this.persistIndex()
    }

    /**
     * Parse a file using AST-based chunking
     */
    private async parseFileWithAST(filePath: string): Promise<CodeChunk[]> {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
        const text = Buffer.from(content).toString('utf-8')
        const ext = path.extname(filePath)
        const language = this.getLanguageFromExt(ext)

        const chunks: CodeChunk[] = []

        // Create file-level chunk
        const fileChunk: CodeChunk = {
            id: `file:${filePath}`,
            filePath,
            content: text,
            startLine: 1,
            endLine: text.split('\n').length,
            type: 'file',
            name: path.basename(filePath),
            children: [],
            metadata: {
                language,
                complexity: 0,
                imports: this.extractImports(text, language),
                exports: this.extractExports(text, language)
            }
        }
        chunks.push(fileChunk)

        // Parse AST-based chunks based on language
        const astChunks = this.parseAST(text, language, filePath)
        for (const chunk of astChunks) {
            chunk.parent = fileChunk.id
            fileChunk.children.push(chunk.id)
            chunks.push(chunk)
        }

        return chunks
    }

    /**
     * Simple regex-based AST parsing (in production, use Tree-sitter)
     */
    private parseAST(content: string, language: string, filePath: string): CodeChunk[] {
        const chunks: CodeChunk[] = []
        const lines = content.split('\n')

        if (language === 'typescript' || language === 'javascript') {
            // Find functions
            const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function)/g
            let match

            while ((match = functionRegex.exec(content)) !== null) {
                const name = match[1] || match[2]
                const startPos = match.index
                const lineNumber = content.substring(0, startPos).split('\n').length

                // Find function body (simplified - matches braces)
                const bodyStart = content.indexOf('{', startPos)
                if (bodyStart === -1) continue

                let braceCount = 1
                let bodyEnd = bodyStart + 1
                while (braceCount > 0 && bodyEnd < content.length) {
                    if (content[bodyEnd] === '{') braceCount++
                    if (content[bodyEnd] === '}') braceCount--
                    bodyEnd++
                }

                const chunkContent = content.substring(startPos, bodyEnd)
                const endLineNumber = content.substring(0, bodyEnd).split('\n').length

                chunks.push({
                    id: `func:${filePath}:${name}:${lineNumber}`,
                    filePath,
                    content: chunkContent,
                    startLine: lineNumber,
                    endLine: endLineNumber,
                    type: 'function',
                    name,
                    children: [],
                    metadata: {
                        language,
                        signature: match[0],
                        complexity: this.calculateComplexity(chunkContent),
                        imports: [],
                        exports: []
                    }
                })
            }

            // Find classes
            const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/g
            while ((match = classRegex.exec(content)) !== null) {
                const name = match[1]
                const startPos = match.index
                const lineNumber = content.substring(0, startPos).split('\n').length

                const bodyStart = content.indexOf('{', startPos)
                if (bodyStart === -1) continue

                let braceCount = 1
                let bodyEnd = bodyStart + 1
                while (braceCount > 0 && bodyEnd < content.length) {
                    if (content[bodyEnd] === '{') braceCount++
                    if (content[bodyEnd] === '}') braceCount--
                    bodyEnd++
                }

                const chunkContent = content.substring(startPos, bodyEnd)
                const endLineNumber = content.substring(0, bodyEnd).split('\n').length

                chunks.push({
                    id: `class:${filePath}:${name}:${lineNumber}`,
                    filePath,
                    content: chunkContent,
                    startLine: lineNumber,
                    endLine: endLineNumber,
                    type: 'class',
                    name,
                    children: [],
                    metadata: {
                        language,
                        signature: match[0],
                        complexity: this.calculateComplexity(chunkContent),
                        imports: [],
                        exports: [name]
                    }
                })
            }
        }

        return chunks
    }

    /**
     * Hybrid search combining BM25 keyword search and embedding similarity
     */
    async search(query: SearchQuery): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const seen = new Set<string>()

        // Keyword search (BM25-like)
        const keywordResults = this.keywordSearch(query.text, query.filters?.maxResults || 20)

        // Embedding search (if available)
        let embeddingResults: SearchResult[] = []
        if (query.embedding) {
            embeddingResults = await this.embeddingSearch(query.embedding, query.filters?.maxResults || 20)
        }

        // Merge results with hybrid scoring
        const allResults = new Map<string, SearchResult>()

        for (const r of keywordResults) {
            allResults.set(r.chunk.id, { ...r, score: r.score * 0.4, matchType: 'keyword' })
        }

        for (const r of embeddingResults) {
            const existing = allResults.get(r.chunk.id)
            if (existing) {
                // Hybrid score: combine both
                existing.score = existing.score + r.score * 0.6
                existing.matchType = 'hybrid'
            } else {
                allResults.set(r.chunk.id, { ...r, score: r.score * 0.6, matchType: 'embedding' })
            }
        }

        // Sort by score
        const sorted = Array.from(allResults.values())
            .sort((a, b) => b.score - a.score)
            .filter(r => r.score >= (query.filters?.minScore || 0.1))
            .slice(0, query.filters?.maxResults || 10)

        return sorted
    }

    /**
     * Simple BM25-like keyword search
     */
    private keywordSearch(query: string, maxResults: number): SearchResult[] {
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
        const results: SearchResult[] = []

        for (const [id, chunk] of this.index) {
            const content = chunk.content.toLowerCase()
            const name = chunk.name.toLowerCase()

            let score = 0
            for (const term of terms) {
                // Exact name match gets high score
                if (name.includes(term)) {
                    score += 3
                }
                // Content match
                const occurrences = (content.match(new RegExp(term, 'g')) || []).length
                score += occurrences * 0.5
            }

            if (score > 0) {
                results.push({ chunk, score, matchType: 'keyword' })
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, maxResults)
    }

    /**
     * Embedding-based similarity search
     */
    private async embeddingSearch(embedding: number[], maxResults: number): Promise<SearchResult[]> {
        const results: SearchResult[] = []

        for (const [id, chunk] of this.index) {
            if (!chunk.embedding) continue

            const similarity = this.cosineSimilarity(embedding, chunk.embedding)
            if (similarity > 0.5) {
                results.push({ chunk, score: similarity, matchType: 'embedding' })
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, maxResults)
    }

    /**
     * Get related files based on imports and graph
     */
    getRelatedFiles(filePath: string, depth: number = 1): string[] {
        const related = new Set<string>()
        const visited = new Set<string>()

        const traverse = (file: string, currentDepth: number) => {
            if (visited.has(file) || currentDepth > depth) return
            visited.add(file)

            const neighbors = this.fileGraph.get(file)
            if (neighbors) {
                for (const neighbor of neighbors) {
                    related.add(neighbor)
                    traverse(neighbor, currentDepth + 1)
                }
            }
        }

        traverse(filePath, 0)
        return Array.from(related)
    }

    /**
     * Get context for a specific query with smart chunking
     */
    async getContext(query: string, options: {
        maxTokens?: number
        includeRelated?: boolean
        currentFile?: string
    } = {}): Promise<string> {
        const { maxTokens = 4000, includeRelated = true, currentFile } = options

        let context = ''
        let tokenCount = 0

        // Search for relevant chunks
        const results = await this.search({
            text: query,
            filters: { maxResults: 10, minScore: 0.2 }
        })

        // Add chunks to context, respecting token limit
        for (const result of results) {
            const chunk = result.chunk
            const chunkTokens = this.estimateTokens(chunk.content)

            if (tokenCount + chunkTokens > maxTokens) break

            context += `\n// File: ${chunk.filePath} (${chunk.type}: ${chunk.name})\n${chunk.content}\n`
            tokenCount += chunkTokens
        }

        // Include related files if requested
        if (includeRelated && currentFile) {
            const related = this.getRelatedFiles(currentFile, 1)
            for (const file of related.slice(0, 3)) {
                const chunk = this.index.get(`file:${file}`)
                if (chunk) {
                    const chunkTokens = this.estimateTokens(chunk.content)
                    if (tokenCount + chunkTokens <= maxTokens) {
                        context += `\n// Related file: ${file}\n${chunk.content.substring(0, 2000)}\n`
                        tokenCount += chunkTokens
                    }
                }
            }
        }

        return context.trim()
    }

    // Helper methods
    private async findCodeFiles(dir: string): Promise<string[]> {
        const files: string[] = []
        const patterns = [
            '**/*.{ts,tsx,js,jsx,py,java,go,rs,c,cpp,h,hpp}',
            '!**/node_modules/**',
            '!**/.git/**',
            '!**/dist/**',
            '!**/build/**'
        ]

        // Read .gitignore if it exists
        const gitignorePath = path.join(dir, '.gitignore')
        let gitignorePatterns: string[] = []

        try {
            const gitignoreContent = await vscode.workspace.fs.readFile(vscode.Uri.file(gitignorePath))
            const text = Buffer.from(gitignoreContent).toString('utf-8')
            gitignorePatterns = text.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(pattern => {
                    if (pattern.endsWith('/')) {
                        return `**/${pattern}/**`
                    }
                    if (pattern.startsWith('/')) {
                        return `**${pattern}`
                    }
                    return `**/${pattern}/**`
                })
        } catch {
            // .gitignore doesn't exist, that's fine
        }

        // Combine default ignore patterns with .gitignore
        const ignorePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**' +
            (gitignorePatterns.length > 0 ? ',' + gitignorePatterns.join(',') : '')

        const uris = await vscode.workspace.findFiles(
            patterns[0],
            ignorePattern,
            1000
        )

        return uris.map(u => u.fsPath)
    }

    private getLanguageFromExt(ext: string): string {
        const map: Record<string, string> = {
            '.ts': 'typescript', '.tsx': 'typescript',
            '.js': 'javascript', '.jsx': 'javascript',
            '.py': 'python', '.java': 'java',
            '.go': 'go', '.rs': 'rust',
            '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp'
        }
        return map[ext] || 'text'
    }

    private extractImports(content: string, language: string): string[] {
        const imports: string[] = []
        if (language === 'typescript' || language === 'javascript') {
            const regex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g
            let match
            while ((match = regex.exec(content)) !== null) {
                imports.push(match[1])
            }
        }
        return imports
    }

    private extractExports(content: string, language: string): string[] {
        const exports: string[] = []
        if (language === 'typescript' || language === 'javascript') {
            const regex = /export\s+(?:default\s+)?(?:class|function|interface|const|let|var)\s+(\w+)/g
            let match
            while ((match = regex.exec(content)) !== null) {
                exports.push(match[1])
            }
        }
        return exports
    }

    private calculateComplexity(content: string): number {
        let score = 0
        score += (content.match(/if|else|switch|case/g) || []).length
        score += (content.match(/for|while|do/g) || []).length * 2
        score += (content.match(/catch|try|finally/g) || []).length
        score += (content.match(/&&|\|\|/g) || []).length
        return score
    }

    private resolveImport(fromFile: string, importPath: string): string | null {
        // Simplified resolution - in production use proper module resolution
        if (importPath.startsWith('.')) {
            return path.resolve(path.dirname(fromFile), importPath)
        }
        return null
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0, magA = 0, magB = 0
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i]
            magA += a[i] * a[i]
            magB += b[i] * b[i]
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB))
    }

    private estimateTokens(text: string): number {
        // Rough estimate: ~4 chars per token
        return Math.ceil(text.length / 4)
    }

    private async persistIndex(): Promise<void> {
        const data = {
            index: Array.from(this.index.values()),
            version: this.indexVersion,
            timestamp: Date.now()
        }
        await this.context.globalState.update('contextIndex', data)
    }
}

// Singleton instance
let contextEngine: ContextEngine | null = null

export function getContextEngine(context: vscode.ExtensionContext): ContextEngine {
    if (!contextEngine) {
        contextEngine = new ContextEngine(context)
    }
    return contextEngine
}
