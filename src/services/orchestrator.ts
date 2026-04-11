/**
 * Orchestrator - Central command layer
 * Handles @mentions, slash commands, and coordinates all services
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getContextEngine } from './contextEngine'
import { getChainOrchestrator, ChainSession } from './chainOfThought'
import { getDiffEngine } from './diffEngine'
import { MCPToolExecutor } from './mcpTools'

// @mention types
export interface MentionItem {
    type: 'file' | 'folder' | 'symbol' | 'terminal' | 'doc'
    name: string
    path?: string
    icon?: string
}

// Slash command types
export interface SlashCommand {
    name: string
    description: string
    handler: (args: string, context: vscode.ExtensionContext) => Promise<string>
}

// Parsed input
export interface ParsedInput {
    raw: string
    cleanText: string
    mentions: MentionItem[]
    slashCommand?: { name: string; args: string }
}

export class Orchestrator {
    private slashCommands: Map<string, SlashCommand> = new Map()
    private mentionCache: Map<string, MentionItem[]> = new Map()
    private toolExecutor: MCPToolExecutor

    constructor(private context: vscode.ExtensionContext) {
        this.toolExecutor = new MCPToolExecutor(context)
        this.registerSlashCommands()
    }

    /**
     * Parse input string extracting @mentions and /commands
     */
    async parseInput(input: string): Promise<ParsedInput> {
        const mentions: MentionItem[] = []
        let cleanText = input
        let slashCommand: { name: string; args: string } | undefined

        // Parse slash commands
        const slashMatch = input.match(/^\/([a-zA-Z]+)\s*(.*)?$/)
        if (slashMatch) {
            slashCommand = {
                name: slashMatch[1],
                args: slashMatch[2] || ''
            }
            cleanText = slashMatch[2] || ''
        }

        // Parse @mentions
        const mentionRegex = /@([a-zA-Z0-9_./-]+)/g
        let match
        while ((match = mentionRegex.exec(input)) !== null) {
            const mention = match[1]
            const item = await this.resolveMention(mention)
            if (item) {
                mentions.push(item)
                // Remove mention from clean text
                cleanText = cleanText.replace(match[0], '')
            }
        }

        cleanText = cleanText.trim()

        return { raw: input, cleanText, mentions, slashCommand }
    }

    /**
     * Resolve a mention to a context item
     */
    private async resolveMention(mention: string): Promise<MentionItem | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) return null

        // Check if it's a file
        const possiblePaths = [
            mention,
            `${mention}.ts`,
            `${mention}.tsx`,
            `${mention}.js`,
            `${mention}.jsx`,
            `src/${mention}`,
            `src/${mention}.ts`
        ]

        for (const p of possiblePaths) {
            const fullPath = path.join(workspaceFolder.uri.fsPath, p)
            try {
                const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fullPath))
                if (stat.type === vscode.FileType.File) {
                    return {
                        type: 'file',
                        name: path.basename(p),
                        path: fullPath,
                        icon: '📄'
                    }
                } else if (stat.type === vscode.FileType.Directory) {
                    return {
                        type: 'folder',
                        name: path.basename(p),
                        path: fullPath,
                        icon: '📁'
                    }
                }
            } catch {
                // Path doesn't exist, try next
            }
        }

        // Check for special mentions
        if (mention === 'terminal') {
            return { type: 'terminal', name: 'Terminal', icon: '💻' }
        }

        if (mention === 'docs' || mention === 'documentation') {
            return { type: 'doc', name: 'Documentation', icon: '📚' }
        }

        // Search for symbol
        const engine = getContextEngine(this.context)
        const results = await engine.search({
            text: mention,
            filters: { maxResults: 1 }
        })

        if (results.length > 0 && results[0].score > 0.7) {
            const chunk = results[0].chunk
            return {
                type: 'symbol',
                name: chunk.name,
                path: chunk.filePath,
                icon: chunk.type === 'function' ? '🔧' : chunk.type === 'class' ? '🏗️' : '📝'
            }
        }

        return null
    }

    /**
     * Get autocomplete suggestions for @mentions
     */
    async getMentionSuggestions(query: string): Promise<MentionItem[]> {
        if (query.length < 2) return []

        const cacheKey = query.toLowerCase()
        if (this.mentionCache.has(cacheKey)) {
            return this.mentionCache.get(cacheKey)!
        }

        const suggestions: MentionItem[] = []
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) return []

        // Search files
        const files = await vscode.workspace.findFiles(
            `**/${query}*`,
            '{**/node_modules/**,**/.git/**}',
            10
        )

        for (const file of files) {
            const relative = path.relative(workspaceFolder.uri.fsPath, file.fsPath)
            suggestions.push({
                type: 'file',
                name: path.basename(file.fsPath),
                path: relative,
                icon: '📄'
            })
        }

        // Search symbols via context engine
        const engine = getContextEngine(this.context)
        const results = await engine.search({
            text: query,
            filters: { maxResults: 5 }
        })

        for (const result of results) {
            const chunk = result.chunk
            if (chunk.type === 'function' || chunk.type === 'class') {
                suggestions.push({
                    type: 'symbol',
                    name: chunk.name,
                    path: path.relative(workspaceFolder.uri.fsPath, chunk.filePath),
                    icon: chunk.type === 'function' ? '🔧' : '🏗️'
                })
            }
        }

        // Add special mentions
        suggestions.push(
            { type: 'terminal', name: 'terminal', icon: '💻' },
            { type: 'doc', name: 'docs', icon: '📚' }
        )

        // Cache results
        this.mentionCache.set(cacheKey, suggestions)
        setTimeout(() => this.mentionCache.delete(cacheKey), 30000) // 30s TTL

        return suggestions
    }

    /**
     * Execute a slash command
     */
    async executeSlashCommand(name: string, args: string): Promise<string> {
        const command = this.slashCommands.get(name)
        if (!command) {
            return `Unknown command: /${name}. Type /help for available commands.`
        }

        return await command.handler(args, this.context)
    }

    /**
     * Process user input through the full pipeline
     */
    async processInput(input: string, options: {
        useChainOfThought?: boolean
        applyDiffs?: boolean
    } = {}): Promise<{
        response: string
        sessionId?: string
        diffs?: string[]
    }> {
        const parsed = await this.parseInput(input)

        // Handle slash commands
        if (parsed.slashCommand) {
            const result = await this.executeSlashCommand(
                parsed.slashCommand.name,
                parsed.slashCommand.args
            )
            return { response: result }
        }

        // Build context from mentions
        let contextPrompt = ''
        for (const mention of parsed.mentions) {
            contextPrompt += await this.buildMentionContext(mention)
        }

        // Add current file context
        const editor = vscode.window.activeTextEditor
        if (editor) {
            const selection = editor.document.getText(editor.selection)
            if (selection) {
                contextPrompt += `\nSelected code:\n\`\`\`\n${selection}\n\`\`\`\n`
            }
        }

        // Use chain of thought if requested
        if (options.useChainOfThought) {
            const chain = getChainOrchestrator(this.context)
            const session = await chain.startSession(parsed.cleanText)

            // Execute reasoning chain
            // This would typically be called multiple times as the LLM reasons
            return {
                response: chain.formatChainForPrompt(session.id),
                sessionId: session.id
            }
        }

        // Return processed input for LLM
        return {
            response: `${contextPrompt}\nUser query: ${parsed.cleanText}`
        }
    }

    /**
     * Build context string from a mention
     */
    private async buildMentionContext(mention: MentionItem): Promise<string> {
        switch (mention.type) {
            case 'file':
                if (!mention.path) return ''
                try {
                    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(mention.path))
                    const text = Buffer.from(content).toString('utf-8')
                    return `\nFile: ${mention.name}\n\`\`\`\n${text.substring(0, 2000)}\n\`\`\`\n`
                } catch {
                    return ''
                }

            case 'folder':
                if (!mention.path) return ''
                try {
                    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(mention.path))
                    const files = entries.map(([name]) => name).join(', ')
                    return `\nFolder: ${mention.name}\nFiles: ${files}\n`
                } catch {
                    return ''
                }

            case 'symbol':
                if (!mention.path) return ''
                const engine = getContextEngine(this.context)
                const results = await engine.search({
                    text: mention.name,
                    filters: { maxResults: 1 }
                })
                if (results.length > 0) {
                    return `\nSymbol: ${mention.name}\n\`\`\`\n${results[0].chunk.content}\n\`\`\`\n`
                }
                return ''

            case 'terminal':
                return '\nContext: Terminal output available\n'

            case 'doc':
                return '\nContext: Documentation available\n'

            default:
                return ''
        }
    }

    /**
     * Register all slash commands
     */
    private registerSlashCommands(): void {
        // Built-in commands
        this.slashCommands.set('help', {
            name: 'help',
            description: 'Show available commands',
            handler: async () => {
                const commands = Array.from(this.slashCommands.values())
                    .map(c => `/${c.name} - ${c.description}`)
                    .join('\n')
                return `Available commands:\n${commands}`
            }
        })

        this.slashCommands.set('edit', {
            name: 'edit',
            description: 'Edit mode - AI suggests code changes',
            handler: async (args, ctx) => {
                const diffEngine = getDiffEngine()
                return `Edit mode activated. Describe the changes you want to make. Use SEARCH/REPLACE format:\n\n${diffEngine.getStructuredOutputPrompt()}`
            }
        })

        this.slashCommands.set('explain', {
            name: 'explain',
            description: 'Explain selected code or file',
            handler: async (args, ctx) => {
                const editor = vscode.window.activeTextEditor
                if (!editor && !args) {
                    return 'Please select some code or provide a file path to explain.'
                }

                if (editor) {
                    const selection = editor.document.getText(editor.selection)
                    if (selection) {
                        return `Explain this code:\n\`\`\`\n${selection}\n\`\`\``
                    }
                }

                return `Explain: ${args}`
            }
        })

        this.slashCommands.set('tests', {
            name: 'tests',
            description: 'Generate tests for selected code',
            handler: async (args, ctx) => {
                const editor = vscode.window.activeTextEditor
                if (!editor) {
                    return 'Please select a function or class to generate tests for.'
                }

                const selection = editor.document.getText(editor.selection)
                const fileName = editor.document.fileName

                return `Generate unit tests for:\nFile: ${fileName}\n\`\`\`\n${selection || 'Current file'}\n\`\`\``
            }
        })

        this.slashCommands.set('context', {
            name: 'context',
            description: 'Show current context information',
            handler: async (args, ctx) => {
                const engine = getContextEngine(ctx)
                const editor = vscode.window.activeTextEditor
                const file = editor?.document.fileName

                let info = 'Current context:\n'
                if (file) {
                    info += `- Active file: ${path.basename(file)}\n`
                    const related = engine.getRelatedFiles(file, 1)
                    info += `- Related files: ${related.length > 0 ? related.map(f => path.basename(f)).join(', ') : 'None'}\n`
                }

                return info
            }
        })

        this.slashCommands.set('index', {
            name: 'index',
            description: 'Re-index the workspace',
            handler: async (args, ctx) => {
                const engine = getContextEngine(ctx)
                await engine.indexWorkspace()
                return 'Workspace re-indexed successfully.'
            }
        })

        this.slashCommands.set('clear', {
            name: 'clear',
            description: 'Clear the conversation',
            handler: async () => 'CLEAR_CHAT'
        })

        // Load custom commands from configuration
        this.loadCustomCommands()
    }

    /**
     * Load custom commands from configuration
     */
    private loadCustomCommands(): void {
        const config = vscode.workspace.getConfiguration('lexentia')
        const customCommands = config.get<any[]>('customCommands', [])

        for (const cmd of customCommands) {
            if (cmd.name && cmd.prompt) {
                this.slashCommands.set(cmd.name, {
                    name: cmd.name,
                    description: cmd.description || `Custom: ${cmd.name}`,
                    handler: async (args, ctx) => {
                        const editor = vscode.window.activeTextEditor
                        let context = ''

                        if (editor) {
                            const selection = editor.document.getText(editor.selection)
                            if (selection) {
                                context = `\nSelected code:\n\`\`\`\n${selection}\n\`\`\``
                            } else {
                                context = `\nFile: ${editor.document.fileName}\n`
                            }
                        }

                        return `${cmd.prompt}${context}\n\nAdditional context: ${args || 'none'}`
                    }
                })
            }
        }
    }

    /**
     * Get all slash command definitions
     */
    getSlashCommands(): SlashCommand[] {
        return Array.from(this.slashCommands.values())
    }
}

// Singleton
let orchestrator: Orchestrator | null = null

export function getOrchestrator(context: vscode.ExtensionContext): Orchestrator {
    if (!orchestrator) {
        orchestrator = new Orchestrator(context)
    }
    return orchestrator
}
