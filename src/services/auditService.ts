/**
 * audit log service for transparency
 * logs all prompts, responses, tool calls, and metadata
 * all comments in english lowercase only
 */

import * as vscode from 'vscode'
import { AuditEntry, ExportOptions, AiActionSession } from './aiActionsTypes'

const auditLog: AuditEntry[] = []
const maxEntries = 1000
let isEnabled = true

export function setAuditEnabled(enabled: boolean): void {
    isEnabled = enabled
}

export function isAuditEnabled(): boolean {
    return isEnabled
}

export function logPrompt(
    sessionId: string,
    stepId: string | undefined,
    prompt: string,
    metadata: {
        tokens?: number
        model?: string
        provider?: string
        systemPrompt?: string
    } = {}
): void {
    if (!isEnabled) return

    const entry: AuditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: Date.now(),
        type: 'prompt',
        sessionId,
        stepId,
        content: prompt,
        metadata
    }

    addEntry(entry)
}

export function logResponse(
    sessionId: string,
    stepId: string | undefined,
    response: string,
    metadata: {
        tokens?: number
        latency?: number
        model?: string
        provider?: string
    } = {}
): void {
    if (!isEnabled) return

    const entry: AuditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: Date.now(),
        type: 'response',
        sessionId,
        stepId,
        content: response,
        metadata
    }

    addEntry(entry)
}

export function logToolCall(
    sessionId: string,
    stepId: string | undefined,
    toolName: string,
    args: any,
    metadata: Record<string, any> = {}
): void {
    if (!isEnabled) return

    const entry: AuditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: Date.now(),
        type: 'tool_call',
        sessionId,
        stepId,
        content: JSON.stringify({ tool: toolName, arguments: args }),
        metadata: { toolName, ...metadata }
    }

    addEntry(entry)
}

export function logToolResult(
    sessionId: string,
    stepId: string | undefined,
    toolName: string,
    output: string,
    error?: string,
    metadata: Record<string, any> = {}
): void {
    if (!isEnabled) return

    const entry: AuditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: Date.now(),
        type: 'tool_result',
        sessionId,
        stepId,
        content: error || output,
        metadata: { toolName, hasError: !!error, ...metadata }
    }

    addEntry(entry)
}

export function logError(
    sessionId: string,
    stepId: string | undefined,
    error: string,
    metadata: Record<string, any> = {}
): void {
    if (!isEnabled) return

    const entry: AuditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: Date.now(),
        type: 'error',
        sessionId,
        stepId,
        content: error,
        metadata
    }

    addEntry(entry)
}

function addEntry(entry: AuditEntry): void {
    auditLog.push(entry)

    // trim old entries
    if (auditLog.length > maxEntries) {
        auditLog.shift()
    }
}

export function getAuditLog(
    filter?: {
        sessionId?: string
        type?: string
        startTime?: number
        endTime?: number
    }
): AuditEntry[] {
    let entries = [...auditLog]

    if (filter?.sessionId) {
        entries = entries.filter(e => e.sessionId === filter.sessionId)
    }

    if (filter?.type) {
        entries = entries.filter(e => e.type === filter.type)
    }

    if (filter?.startTime) {
        entries = entries.filter(e => e.timestamp >= filter.startTime!)
    }

    if (filter?.endTime) {
        entries = entries.filter(e => e.timestamp <= filter.endTime!)
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp)
}

export function clearAuditLog(): void {
    auditLog.length = 0
}

export function exportAuditLog(options: ExportOptions): string {
    const entries = getAuditLog()

    if (options.format === 'json') {
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            entryCount: entries.length,
            entries: options.includeRawPrompts
                ? entries
                : entries.map(e => ({
                    ...e,
                    content: e.content.slice(0, 500) + (e.content.length > 500 ? '...' : '')
                }))
        }, null, 2)
    }

    if (options.format === 'markdown') {
        return exportAsMarkdown(entries, options.includeMetadata)
    }

    return ''
}

function exportAsMarkdown(entries: AuditEntry[], includeMetadata: boolean): string {
    const lines: string[] = []
    lines.push('# audit log')
    lines.push(`exported: ${new Date().toISOString()}`)
    lines.push(`entries: ${entries.length}`)
    lines.push('')

    for (const entry of entries) {
        const time = new Date(entry.timestamp).toISOString()
        lines.push(`## ${entry.type} - ${time}`)
        lines.push(`session: ${entry.sessionId}`)
        lines.push(`step: ${entry.stepId || 'none'}`)
        lines.push('')
        lines.push('```')
        lines.push(entry.content)
        lines.push('```')

        if (includeMetadata && Object.keys(entry.metadata).length > 0) {
            lines.push('')
            lines.push('**metadata:**')
            lines.push('```json')
            lines.push(JSON.stringify(entry.metadata, null, 2))
            lines.push('```')
        }

        lines.push('')
        lines.push('---')
        lines.push('')
    }

    return lines.join('\n')
}

export async function saveAuditLogToFile(options: ExportOptions): Promise<string | null> {
    const content = exportAuditLog(options)

    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) return null

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const ext = options.format === 'json' ? 'json' : 'md'
    const fileName = `lexentia-audit-${timestamp}.${ext}`
    const uri = vscode.Uri.joinPath(workspace.uri, '.lexentia', fileName)

    try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspace.uri, '.lexentia'))
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
        return fileName
    } catch {
        return null
    }
}

export function getEntriesForSession(sessionId: string): AuditEntry[] {
    return auditLog.filter(e => e.sessionId === sessionId)
}

export function combineSessionWithAudit(session: AiActionSession): any {
    const entries = getEntriesForSession(session.id)

    return {
        session: {
            id: session.id,
            userQuery: session.userQuery,
            startTime: session.startTime,
            endTime: session.endTime,
            duration: session.endTime ? session.endTime - session.startTime : undefined,
            steps: session.steps
        },
        auditEntries: entries.map(e => ({
            type: e.type,
            timestamp: e.timestamp,
            stepId: e.stepId,
            contentPreview: e.content.slice(0, 200),
            metadata: e.metadata
        }))
    }
}
