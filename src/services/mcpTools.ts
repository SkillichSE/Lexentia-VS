/**
 * MCP (Model Context Protocol) Tool Definitions
 * Implements Anthropic's MCP standard for tool use
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Tool result types
export interface ToolResult {
    success: boolean
    content: string
    error?: string
    metadata?: Record<string, any>
}

// Tool definition schema
export interface ToolDefinition {
    name: string
    description: string
    parameters: {
        type: 'object'
        properties: Record<string, {
            type: string
            description: string
            enum?: string[]
            default?: any
        }>
        required: string[]
    }
}

// Tool implementations
export const toolDefinitions: ToolDefinition[] = [
    {
        name: 'list_files',
        description: 'List files and directories in a given path. Shows file structure.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Directory path to list (relative or absolute)'
                },
                recursive: {
                    type: 'boolean',
                    description: 'List recursively',
                    default: false
                }
            },
            required: ['path']
        }
    },
    {
        name: 'read_file',
        description: 'Read the contents of a file. Returns file content as text.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File path to read (relative or absolute)'
                },
                offset: {
                    type: 'number',
                    description: 'Line number to start from',
                    default: 1
                },
                limit: {
                    type: 'number',
                    description: 'Number of lines to read',
                    default: 100
                }
            },
            required: ['path']
        }
    },
    {
        name: 'write_file',
        description: 'Write content to a file. Creates or overwrites file.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File path to write'
                },
                content: {
                    type: 'string',
                    description: 'Content to write'
                }
            },
            required: ['path', 'content']
        }
    },
    {
        name: 'grep_search',
        description: 'Search for text patterns in files using regex. Returns matching lines with file paths.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query (regex supported)'
                },
                path: {
                    type: 'string',
                    description: 'Directory to search in',
                    default: '.'
                },
                file_pattern: {
                    type: 'string',
                    description: 'File pattern glob (e.g., "*.ts")',
                    default: '*'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'execute_command',
        description: 'Execute a shell command in the integrated terminal. Use with caution.',
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Command to execute'
                },
                cwd: {
                    type: 'string',
                    description: 'Working directory for command',
                    default: '.'
                }
            },
            required: ['command']
        }
    },
    {
        name: 'get_diagnostics',
        description: 'Get TypeScript/JavaScript diagnostics (errors, warnings) for a file.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File path to check'
                }
            },
            required: ['path']
        }
    },
    {
        name: 'get_context',
        description: 'Get semantic context about code from the Context Engine. Finds relevant code chunks.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Natural language query about what you need'
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of results',
                    default: 5
                }
            },
            required: ['query']
        }
    }
]

// Tool executor class
export class MCPToolExecutor {
    constructor(private context: vscode.ExtensionContext) {}

    async executeTool(name: string, args: Record<string, any>): Promise<ToolResult> {
        try {
            switch (name) {
                case 'list_files':
                    return await this.listFiles(args.path, args.recursive)
                case 'read_file':
                    return await this.readFile(args.path, args.offset, args.limit)
                case 'write_file':
                    return await this.writeFile(args.path, args.content)
                case 'grep_search':
                    return await this.grepSearch(args.query, args.path, args.file_pattern)
                case 'execute_command':
                    return await this.executeCommand(args.command, args.cwd)
                case 'get_diagnostics':
                    return await this.getDiagnostics(args.path)
                case 'get_context':
                    return await this.getContext(args.query, args.max_results)
                default:
                    return { success: false, content: '', error: `Unknown tool: ${name}` }
            }
        } catch (err) {
            return {
                success: false,
                content: '',
                error: err instanceof Error ? err.message : String(err)
            }
        }
    }

    private async listFiles(dirPath: string, recursive = false): Promise<ToolResult> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            return { success: false, content: '', error: 'No workspace folder open' }
        }

        const fullPath = path.isAbsolute(dirPath)
            ? dirPath
            : path.join(workspaceFolder.uri.fsPath, dirPath)

        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(fullPath))
            const files = entries.map(([name, type]) => {
                const prefix = type === vscode.FileType.Directory ? '📁 ' : '📄 '
                return `${prefix}${name}${type === vscode.FileType.Directory ? '/' : ''}`
            })

            if (recursive) {
                const subdirs = entries.filter(([, type]) => type === vscode.FileType.Directory)
                for (const [subdir] of subdirs) {
                    const subResult = await this.listFiles(path.join(dirPath, subdir), true)
                    if (subResult.success) {
                        files.push('  ' + subResult.content.split('\n').join('\n  '))
                    }
                }
            }

            return {
                success: true,
                content: files.join('\n'),
                metadata: { path: fullPath, count: entries.length }
            }
        } catch (err) {
            return { success: false, content: '', error: `Cannot read directory: ${err}` }
        }
    }

    private async readFile(filePath: string, offset = 1, limit = 100): Promise<ToolResult> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            return { success: false, content: '', error: 'No workspace folder open' }
        }

        const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspaceFolder.uri.fsPath, filePath)

        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath))
            const text = Buffer.from(content).toString('utf-8')
            const lines = text.split('\n')

            const startLine = Math.max(0, offset - 1)
            const endLine = Math.min(lines.length, startLine + limit)
            const selectedLines = lines.slice(startLine, endLine)

            return {
                success: true,
                content: selectedLines.join('\n'),
                metadata: {
                    path: fullPath,
                    totalLines: lines.length,
                    showingLines: `${startLine + 1}-${endLine}`
                }
            }
        } catch (err) {
            return { success: false, content: '', error: `Cannot read file: ${err}` }
        }
    }

    private async writeFile(filePath: string, content: string): Promise<ToolResult> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            return { success: false, content: '', error: 'No workspace folder open' }
        }

        const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspaceFolder.uri.fsPath, filePath)

        try {
            const uri = vscode.Uri.file(fullPath)
            const buffer = Buffer.from(content, 'utf-8')
            await vscode.workspace.fs.writeFile(uri, buffer)

            return {
                success: true,
                content: `File written successfully: ${fullPath}`,
                metadata: { path: fullPath, bytesWritten: buffer.length }
            }
        } catch (err) {
            return { success: false, content: '', error: `Cannot write file: ${err}` }
        }
    }

    private async grepSearch(query: string, searchPath = '.', filePattern = '*'): Promise<ToolResult> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            return { success: false, content: '', error: 'No workspace folder open' }
        }

        const fullPath = path.isAbsolute(searchPath)
            ? searchPath
            : path.join(workspaceFolder.uri.fsPath, searchPath)

        try {
            // Use VS Code's search API
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(fullPath, filePattern),
                '{**/node_modules/**,**/.git/**}',
                100
            )

            const results: string[] = []
            const regex = new RegExp(query, 'gi')

            for (const file of files) {
                try {
                    const content = await vscode.workspace.fs.readFile(file)
                    const text = Buffer.from(content).toString('utf-8')
                    const lines = text.split('\n')

                    lines.forEach((line, idx) => {
                        if (regex.test(line)) {
                            results.push(`${file.fsPath}:${idx + 1}: ${line.trim()}`)
                        }
                    })
                } catch {
                    // Skip files that can't be read as text
                }
            }

            return {
                success: true,
                content: results.slice(0, 50).join('\n') || 'No matches found',
                metadata: { matches: results.length }
            }
        } catch (err) {
            return { success: false, content: '', error: `Search failed: ${err}` }
        }
    }

    private async executeCommand(command: string, cwd = '.'): Promise<ToolResult> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        const workingDir = path.isAbsolute(cwd)
            ? cwd
            : workspaceFolder
                ? path.join(workspaceFolder.uri.fsPath, cwd)
                : process.cwd()

        // Security check - only allow safe commands
        const dangerousCommands = ['rm -rf /', 'format', 'del /', 'rmdir /s']
        if (dangerousCommands.some(d => command.includes(d))) {
            return { success: false, content: '', error: 'Command blocked for security reasons' }
        }

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: workingDir,
                timeout: 30000,
                maxBuffer: 1024 * 1024 // 1MB
            })

            return {
                success: true,
                content: stdout || stderr || 'Command executed successfully',
                metadata: { command, cwd: workingDir }
            }
        } catch (err) {
            return {
                success: false,
                content: '',
                error: `Command failed: ${err}`
            }
        }
    }

    private async getDiagnostics(filePath: string): Promise<ToolResult> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            return { success: false, content: '', error: 'No workspace folder open' }
        }

        const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspaceFolder.uri.fsPath, filePath)

        const uri = vscode.Uri.file(fullPath)
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true })

        // Wait a moment for diagnostics to populate
        await new Promise(r => setTimeout(r, 500))

        const diagnostics = vscode.languages.getDiagnostics(uri)
        const formatted = diagnostics.map(d => {
            const severity = ['Error', 'Warning', 'Info', 'Hint'][d.severity] || 'Unknown'
            return `[${severity}] Line ${d.range.start.line + 1}: ${d.message}`
        })

        return {
            success: true,
            content: formatted.join('\n') || 'No diagnostics found',
            metadata: { errors: diagnostics.filter(d => d.severity === 0).length }
        }
    }

    private async getContext(query: string, maxResults = 5): Promise<ToolResult> {
        // Import context engine dynamically to avoid circular deps
        const { getContextEngine } = await import('./contextEngine.js')
        const engine = getContextEngine(this.context)

        const results = await engine.search({
            text: query,
            filters: { maxResults }
        })

        const formatted = results.map((r: { matchType: string; score: number; chunk: { type: string; name: string; filePath: string; content: string } }) =>
            `[${r.matchType} ${r.score.toFixed(2)}] ${r.chunk.type} ${r.chunk.name} in ${r.chunk.filePath}:\n${r.chunk.content.substring(0, 500)}`
        )

        return {
            success: true,
            content: formatted.join('\n\n---\n\n'),
            metadata: { results: results.length }
        }
    }

    /**
     * Get tool definitions formatted for LLM
     */
    getToolDefinitions(): string {
        return toolDefinitions.map(t => {
            const params = Object.entries(t.parameters.properties)
                .map(([name, prop]) => {
                    const req = t.parameters.required.includes(name) ? ' (required)' : ''
                    return `  - ${name} (${prop.type})${req}: ${prop.description}`
                })
                .join('\n')

            return `## ${t.name}\n${t.description}\n\nParameters:\n${params}`
        }).join('\n\n')
    }
}
