import * as vscode from 'vscode'
import { searchInFiles, searchFilesByName, getDirectoryTree } from './searchService'
import { executeShell, getShellInfo } from './shellService'
import { fetchUrl, webSearch } from './webService'
import { getDiagnostics, goToDefinition, findReferences, formatDiagnostics } from './lspService'
import { callMCPTool, getMCPServers } from './mcpService'

export interface ToolCall {
    id: string
    name: string
    arguments: Record<string, any>
}

export interface ToolResult {
    toolId: string
    output: string
    error?: string
}

export async function executeTool(tool: ToolCall): Promise<ToolResult> {
    switch (tool.name) {
        case 'terminal_execute':
            try {
                const terminal = vscode.window.createTerminal('lexentia')
                terminal.sendText(tool.arguments.command)
                terminal.show()
                return {
                    toolId: tool.id,
                    output: `Command sent to terminal: ${tool.arguments.command}`
                }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Terminal error' }
            }
        case 'shell_execute':
            try {
                const result = await executeShell(
                    tool.arguments.command,
                    tool.arguments.cwd,
                    tool.arguments.timeout || 30000
                )
                const output = result.exitCode === 0
                    ? result.stdout
                    : `exit code ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
                return { toolId: tool.id, output }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Shell error' }
            }
        case 'file_read':
            try {
                const workspace = vscode.workspace.workspaceFolders?.[0]
                if (!workspace) throw new Error('No workspace open')
                const safePath = normalizeRelativePath(tool.arguments.path)
                const uri = vscode.Uri.joinPath(workspace.uri, safePath)
                const content = await vscode.workspace.fs.readFile(uri)
                const text = new TextDecoder().decode(content)
                return { toolId: tool.id, output: text }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Read failed' }
            }
        case 'file_write':
            try {
                const workspace = vscode.workspace.workspaceFolders?.[0]
                if (!workspace) throw new Error('No workspace open')
                const safePath = normalizeRelativePath(tool.arguments.path)
                const uri = vscode.Uri.joinPath(workspace.uri, safePath)
                const content = new TextEncoder().encode(tool.arguments.content)
                await vscode.workspace.fs.writeFile(uri, content)
                return { toolId: tool.id, output: `File written: ${safePath}` }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Write failed' }
            }
        case 'file_list':
            try {
                const workspace = vscode.workspace.workspaceFolders?.[0]
                if (!workspace) throw new Error('No workspace open')
                const dirPath = tool.arguments.path ? normalizeRelativePath(tool.arguments.path) : '.'
                const uri = vscode.Uri.joinPath(workspace.uri, dirPath)
                const entries = await vscode.workspace.fs.readDirectory(uri)
                const files = entries.map(([name, type]: [string, vscode.FileType]) => {
                    const typeStr = type === vscode.FileType.Directory ? '/' : ''
                    return `${name}${typeStr}`
                }).join('\n')
                return { toolId: tool.id, output: files || '(empty directory)' }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'List failed' }
            }
        case 'file_exists':
            try {
                const workspace = vscode.workspace.workspaceFolders?.[0]
                if (!workspace) throw new Error('No workspace open')
                const safePath = normalizeRelativePath(tool.arguments.path)
                const uri = vscode.Uri.joinPath(workspace.uri, safePath)
                await vscode.workspace.fs.stat(uri)
                return { toolId: tool.id, output: `exists: ${safePath}` }
            } catch {
                return { toolId: tool.id, output: `not found: ${tool.arguments.path}` }
            }
        case 'file_delete':
            try {
                const workspace = vscode.workspace.workspaceFolders?.[0]
                if (!workspace) throw new Error('No workspace open')
                const safePath = normalizeRelativePath(tool.arguments.path)
                const uri = vscode.Uri.joinPath(workspace.uri, safePath)
                await vscode.workspace.fs.delete(uri, { recursive: tool.arguments.recursive || false })
                return { toolId: tool.id, output: `deleted: ${safePath}` }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Delete failed' }
            }
        case 'file_edit':
            try {
                const workspace = vscode.workspace.workspaceFolders?.[0]
                if (!workspace) throw new Error('No workspace open')
                const safePath = normalizeRelativePath(tool.arguments.path)
                const uri = vscode.Uri.joinPath(workspace.uri, safePath)
                const content = await vscode.workspace.fs.readFile(uri)
                let text = new TextDecoder().decode(content)
                const oldString = tool.arguments.old_string
                const newString = tool.arguments.new_string
                if (!text.includes(oldString)) {
                    return { toolId: tool.id, output: '', error: 'Old string not found in file' }
                }
                text = text.replace(oldString, newString)
                await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text))
                return { toolId: tool.id, output: `edited: ${safePath}` }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Edit failed' }
            }
        case 'search_content':
            try {
                const results = await searchInFiles(tool.arguments.query, tool.arguments.pattern)
                const output = results.length > 0
                    ? results.map(r => `${r.file}:${r.line}: ${r.content}`).join('\n')
                    : 'no matches found'
                return { toolId: tool.id, output }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Search failed' }
            }
        case 'search_files':
            try {
                const results = await searchFilesByName(tool.arguments.pattern)
                const output = results.length > 0 ? results.join('\n') : 'no files found'
                return { toolId: tool.id, output }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Search failed' }
            }
        case 'directory_tree':
            try {
                const tree = await getDirectoryTree(tool.arguments.path, tool.arguments.depth || 3)
                return { toolId: tool.id, output: tree || '(empty directory)' }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Tree failed' }
            }
        case 'web_fetch':
            try {
                const content = await fetchUrl(tool.arguments.url)
                return { toolId: tool.id, output: content.slice(0, 10000) }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Fetch failed' }
            }
        case 'web_search':
            try {
                const results = await webSearch(tool.arguments.query)
                return { toolId: tool.id, output: results }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Search failed' }
            }
        case 'get_diagnostics':
            try {
                const diags = await getDiagnostics(tool.arguments.file)
                const formatted = formatDiagnostics(diags).slice(0, 5000)
                return { toolId: tool.id, output: formatted || 'no diagnostics' }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Failed' }
            }
        case 'find_references':
            try {
                const refs = await findReferences(tool.arguments.file, tool.arguments.line, tool.arguments.char)
                const output = refs.map(r => `${vscode.workspace.asRelativePath(r.uri)}:${r.range.start.line + 1}`).join('\n')
                return { toolId: tool.id, output: output || 'no references found' }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Failed' }
            }
        case 'go_to_definition':
            try {
                const defs = await goToDefinition(tool.arguments.file, tool.arguments.line, tool.arguments.char)
                const output = defs.map(d => `${vscode.workspace.asRelativePath(d.uri)}:${d.range.start.line + 1}`).join('\n')
                return { toolId: tool.id, output: output || 'no definition found' }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'Failed' }
            }
        case 'mcp_tool':
            try {
                const servers = getMCPServers()
                if (servers.length === 0) {
                    return { toolId: tool.id, output: '', error: 'no mcp servers connected' }
                }
                const result = await callMCPTool(servers[0].id, tool.arguments.tool, tool.arguments.args)
                return { toolId: tool.id, output: result }
            } catch (e: any) {
                return { toolId: tool.id, output: '', error: e?.message || 'MCP failed' }
            }
        default:
            return { toolId: tool.id, output: '', error: `Unknown tool: ${tool.name}` }
    }
}

export function shouldExecuteTool(tool: ToolCall, userText: string): { allowed: boolean; reason?: string } {
    const text = (userText || '').trim().toLowerCase()
    const isGreetingOnly = /^(hi|hello|hey|привет|здравствуй|здравствуйте|добрый день|добрый вечер)[!.,\s]*$/i.test(text)
    if (isGreetingOnly) {
        return { allowed: false, reason: 'Tool calls are disabled for simple greetings.' }
    }

    if (tool.name === 'terminal_execute') {
        const terminalIntent = /(run|execute|terminal|command|bash|powershell|cmd|запусти|выполни|терминал|команд)/i
        if (!terminalIntent.test(userText || '')) {
            return { allowed: false, reason: 'Terminal tool call skipped: no explicit run-command intent.' }
        }
    }

    if (tool.name.startsWith('file_')) {
        const fileIntent = /(file|files|read|write|open|list|folder|directory|path|файл|файлы|прочитай|запиши|открой|папк|каталог|путь)/i
        if (!fileIntent.test(userText || '')) {
            return { allowed: false, reason: 'File tool call skipped: no explicit file intent.' }
        }
    }

    return { allowed: true }
}

export const MODEL_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'terminal_execute',
            description: 'execute a command in the integrated terminal (visual only, no output capture)',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'the command to execute'
                    }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'shell_execute',
            description: 'execute a shell command and capture output (use this when you need the result)',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'the command to execute'
                    },
                    cwd: {
                        type: 'string',
                        description: 'working directory (defaults to workspace)'
                    },
                    timeout: {
                        type: 'number',
                        description: 'timeout in milliseconds',
                        default: 30000
                    }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'file_read',
            description: 'read the contents of a file',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'relative path to the file'
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'file_write',
            description: 'write content to a file (creates or overwrites)',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'relative path to the file'
                    },
                    content: {
                        type: 'string',
                        description: 'content to write'
                    }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'file_list',
            description: 'list files in a directory',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'relative path to directory',
                        default: '.'
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'file_exists',
            description: 'check if a file or directory exists',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'relative path to check'
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'file_delete',
            description: 'delete a file or directory',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'relative path to delete'
                    },
                    recursive: {
                        type: 'boolean',
                        description: 'delete directories recursively',
                        default: false
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'file_edit',
            description: 'edit a file by replacing a string with another',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'relative path to the file'
                    },
                    old_string: {
                        type: 'string',
                        description: 'the exact string to replace'
                    },
                    new_string: {
                        type: 'string',
                        description: 'the replacement string'
                    }
                },
                required: ['path', 'old_string', 'new_string']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_content',
            description: 'search for text content within files',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'text to search for'
                    },
                    pattern: {
                        type: 'string',
                        description: 'file pattern to search in (glob)',
                        default: '**/*'
                    }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_files',
            description: 'search for files by name pattern',
            parameters: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'filename pattern (glob)'
                    }
                },
                required: ['pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'directory_tree',
            description: 'get a tree view of directory structure',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'relative path to directory',
                        default: '.'
                    },
                    depth: {
                        type: 'number',
                        description: 'maximum depth to traverse',
                        default: 3
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'web_fetch',
            description: 'fetch content from a url',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'url to fetch'
                    }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'search the web for information',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'search query'
                    }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_diagnostics',
            description: 'get code diagnostics (errors and warnings) for a file or all files',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: 'relative path to file (optional, returns all diagnostics if omitted)'
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'find_references',
            description: 'find all references to a symbol in the codebase',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: 'relative path to file containing the symbol'
                    },
                    line: {
                        type: 'number',
                        description: 'line number (0-indexed)'
                    },
                    char: {
                        type: 'number',
                        description: 'character position (0-indexed)'
                    }
                },
                required: ['file', 'line', 'char']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'go_to_definition',
            description: 'find the definition location of a symbol',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: 'relative path to file containing the symbol'
                    },
                    line: {
                        type: 'number',
                        description: 'line number (0-indexed)'
                    },
                    char: {
                        type: 'number',
                        description: 'character position (0-indexed)'
                    }
                },
                required: ['file', 'line', 'char']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'mcp_tool',
            description: 'call a tool from a connected MCP server',
            parameters: {
                type: 'object',
                properties: {
                    tool: {
                        type: 'string',
                        description: 'name of the MCP tool to call'
                    },
                    args: {
                        type: 'object',
                        description: 'arguments for the tool'
                    }
                },
                required: ['tool']
            }
        }
    }
]

export function formatToolsForAPI(): any[] {
    return MODEL_TOOLS
}

export function buildToolsSystemPrompt(basePrompt: string): string {
    return `${basePrompt}

you have access to the following tools:
${MODEL_TOOLS.map((t) => `- ${t.function.name}: ${t.function.description}`).join('\n')}

when you need to use a tool, respond with a tool call in this format:
<tool>${JSON.stringify({ name: 'tool_name', arguments: {} })}</tool>

important:
- do not use tools for greetings, small talk, explanations, or questions that can be answered directly.
- use file_* tools only when the user explicitly asks to read/write/list files.
- use terminal_execute only when the user explicitly asks to run a command.

you can make multiple tool calls in sequence if needed.
after tool execution, you will receive the results and can continue the conversation.`
}

function normalizeRelativePath(pathValue: unknown): string {
    const raw = String(pathValue ?? '').trim()
    if (!raw) throw new Error('Path is required')
    const normalized = raw.replace(/\\/g, '/')
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
        throw new Error('Path must be workspace-relative, absolute paths are not allowed')
    }
    if (normalized.includes('..')) {
        throw new Error('Path traversal is not allowed')
    }
    return normalized
}

export function parseToolCalls(content: string): ToolCall[] {
    const calls: ToolCall[] = []
    const regex = /<tool>([\s\S]*?)<\/tool>/g
    let match

    while ((match = regex.exec(content)) !== null) {
        try {
            const parsed = JSON.parse(match[1])
            calls.push({
                id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                name: parsed.name,
                arguments: parsed.arguments || {}
            })
        } catch {
            // skip invalid tool calls
        }
    }

    return calls
}
