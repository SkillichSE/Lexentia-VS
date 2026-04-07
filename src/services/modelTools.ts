import * as vscode from 'vscode'

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
            description: 'execute a command in the integrated terminal',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'the command to execute'
                    },
                    waitForExit: {
                        type: 'boolean',
                        description: 'whether to wait for command to complete',
                        default: false
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
