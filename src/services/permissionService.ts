import * as vscode from 'vscode'

export type PermissionMode = 'auto' | 'ask' | 'always_allow'

export interface PermissionRule {
    tool: string
    mode: PermissionMode
    directory?: string
}

const DEFAULT_RULES: PermissionRule[] = [
    { tool: 'file_read', mode: 'auto' },
    { tool: 'file_list', mode: 'auto' },
    { tool: 'directory_tree', mode: 'auto' },
    { tool: 'search_content', mode: 'auto' },
    { tool: 'search_files', mode: 'auto' },
    { tool: 'file_write', mode: 'ask' },
    { tool: 'file_edit', mode: 'ask' },
    { tool: 'file_delete', mode: 'ask' },
    { tool: 'terminal_execute', mode: 'ask' },
    { tool: 'shell_execute', mode: 'ask' },
    { tool: 'web_fetch', mode: 'auto' },
    { tool: 'web_search', mode: 'auto' }
]

const STORAGE_KEY = 'lexentia.permissions'

export async function checkPermission(toolName: string, args: any): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('lexentia')
    const mode = config.get<PermissionMode>('permissionMode', 'ask')
    const customRules = config.get<PermissionRule[]>(`${STORAGE_KEY}.rules`, [])

    if (mode === 'always_allow') {
        return true
    }

    const rules = customRules.length > 0 ? customRules : DEFAULT_RULES
    const rule = rules.find(r => r.tool === toolName)

    if (!rule || rule.mode === 'auto') {
        return true
    }

    if (rule.mode === 'ask') {
        const action = describeAction(toolName, args)
        const result = await vscode.window.showInformationMessage(
            `Allow ${action}?`,
            { modal: true },
            'Allow', 'Deny', 'Always Allow'
        )

        if (result === 'Always Allow') {
            await setToolPermission(toolName, 'always_allow')
            return true
        }

        return result === 'Allow'
    }

    return true
}

export async function setToolPermission(tool: string, mode: PermissionMode): Promise<void> {
    const config = vscode.workspace.getConfiguration('lexentia')
    const rules = config.get<PermissionRule[]>(`${STORAGE_KEY}.rules`, [])
    const existing = rules.findIndex(r => r.tool === tool)

    if (existing >= 0) {
        rules[existing].mode = mode
    } else {
        rules.push({ tool, mode })
    }

    await config.update(`${STORAGE_KEY}.rules`, rules, true)
}

export async function setGlobalPermissionMode(mode: PermissionMode): Promise<void> {
    const config = vscode.workspace.getConfiguration('lexentia')
    await config.update('permissionMode', mode, true)
}

function describeAction(toolName: string, args: any): string {
    switch (toolName) {
        case 'file_write':
            return `write to file "${args.path}"`
        case 'file_edit':
            return `edit file "${args.path}"`
        case 'file_delete':
            return `delete "${args.path}"`
        case 'terminal_execute':
            return `run command "${args.command}"`
        case 'shell_execute':
            return `execute shell command "${args.command}"`
        default:
            return `use ${toolName}`
    }
}
