/**
 * context gathering service with chip-based visualization
 * collects relevant code context based on intent classification
 * all comments in english lowercase only
 */

import * as vscode from 'vscode'
import { ContextChip, IntentClassification } from './aiActionsTypes'
import { searchCodebase } from './ragService'

export interface GatherContextOptions {
    query: string
    intent: IntentClassification
    includeOpenTabs: boolean
    maxChips: number
}

export async function gatherContext(
    options: GatherContextOptions
): Promise<ContextChip[]> {
    const chips: ContextChip[] = []
    const { query, intent, includeOpenTabs, maxChips } = options

    // always add current file if editing code
    const currentFileChip = await getCurrentFileChip()
    if (currentFileChip && intent.contextScope !== 'none') {
        chips.push(currentFileChip)
    }

    // add selection if any
    const selectionChip = getSelectionChip()
    if (selectionChip) {
        chips.push(selectionChip)
    }

    // add terminal error if any
    const errorChip = await getTerminalErrorChip()
    if (errorChip && intent.intent === 'debug_help') {
        chips.push(errorChip)
    }

    // add open tabs for context window management
    if (includeOpenTabs && intent.contextScope === 'related_files') {
        const tabChips = await getOpenTabsChips(3)
        chips.push(...tabChips)
    }

    // add rag search results for complex queries
    if (intent.contextScope === 'full_project' || intent.intent === 'code_review') {
        const ragChips = await getRagChips(query, 3)
        chips.push(...ragChips)
    }

    // add symbols from current file
    if (intent.intent === 'code_explain' || intent.intent === 'debug_help') {
        const symbolChips = await getRelevantSymbols(query, 2)
        chips.push(...symbolChips)
    }

    // sort by relevance and limit
    return chips
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, maxChips)
}

async function getCurrentFileChip(): Promise<ContextChip | null> {
    const editor = vscode.window.activeTextEditor
    if (!editor) return null

    const document = editor.document
    const relPath = vscode.workspace.asRelativePath(document.uri)
    const content = document.getText()

    return {
        id: `file-${relPath}`,
        type: 'file',
        label: `file: ${relPath}`,
        value: relPath,
        relevance: 1.0,
        content: content.slice(0, 2000)
    }
}

function getSelectionChip(): ContextChip | null {
    const editor = vscode.window.activeTextEditor
    if (!editor) return null

    const selection = editor.selection
    if (selection.isEmpty) return null

    const text = editor.document.getText(selection)
    const relPath = vscode.workspace.asRelativePath(editor.document.uri)
    const startLine = selection.start.line + 1
    const endLine = selection.end.line + 1

    return {
        id: `selection-${relPath}-${startLine}`,
        type: 'selection',
        label: `selection: ${relPath}:${startLine}-${endLine}`,
        value: `${relPath}:${startLine}-${endLine}`,
        relevance: 0.95,
        content: text
    }
}

async function getTerminalErrorChip(): Promise<ContextChip | null> {
    // check if there are any open terminals with recent errors
    const terminals = vscode.window.terminals
    if (terminals.length === 0) return null

    // try to detect errors in terminal output (simplified)
    // in a real implementation this would parse terminal buffer
    const activeTerminal = vscode.window.activeTerminal
    if (!activeTerminal) return null

    // return a placeholder for terminal error context
    // actual implementation would need terminal integration
    return null
}

async function getOpenTabsChips(maxTabs: number): Promise<ContextChip[]> {
    const chips: ContextChip[] = []
    const tabs = vscode.window.tabGroups.all
        .flatMap(g => g.tabs)
        .filter(t => t.input instanceof vscode.TabInputText)
        .slice(0, maxTabs)

    for (const tab of tabs) {
        const input = tab.input as vscode.TabInputText
        const relPath = vscode.workspace.asRelativePath(input.uri)

        try {
            const doc = await vscode.workspace.openTextDocument(input.uri)
            const content = doc.getText()

            chips.push({
                id: `tab-${relPath}`,
                type: 'file',
                label: `tab: ${relPath}`,
                value: relPath,
                relevance: 0.7,
                content: content.slice(0, 1000)
            })
        } catch {
            // skip files that cannot be read
        }
    }

    return chips
}

async function getRagChips(query: string, maxResults: number): Promise<ContextChip[]> {
    const results = searchCodebase(query, maxResults)
    const chips: ContextChip[] = []

    for (const result of results) {
        chips.push({
            id: `rag-${result.chunk.id}`,
            type: 'rag_result',
            label: `search: ${result.chunk.file}:${result.chunk.lineStart}`,
            value: `${result.chunk.file}:${result.chunk.lineStart}`,
            relevance: result.score * 0.8,
            content: result.chunk.content
        })
    }

    return chips
}

async function getRelevantSymbols(query: string, maxSymbols: number): Promise<ContextChip[]> {
    const editor = vscode.window.activeTextEditor
    if (!editor) return []

    const document = editor.document
    const text = document.getText()
    const relPath = vscode.workspace.asRelativePath(document.uri)

    // simple regex-based symbol extraction
    // in production this would use lsp or ast parsing
    const functionMatches = text.matchAll(/(?:function|const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(=:]/g)
    const classMatches = text.matchAll(/class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g)

    const queryWords = query.toLowerCase().split(/\s+/)
    const chips: ContextChip[] = []

    for (const match of functionMatches) {
        const name = match[1]
        const score = queryWords.filter(w => name.toLowerCase().includes(w)).length
        if (score > 0) {
            chips.push({
                id: `symbol-${name}`,
                type: 'symbol',
                label: `symbol: ${name}()`,
                value: name,
                relevance: 0.6 + (score * 0.1),
                content: match[0]
            })
        }
    }

    for (const match of classMatches) {
        const name = match[1]
        const score = queryWords.filter(w => name.toLowerCase().includes(w)).length
        if (score > 0) {
            chips.push({
                id: `class-${name}`,
                type: 'symbol',
                label: `class: ${name}`,
                value: name,
                relevance: 0.65 + (score * 0.1),
                content: match[0]
            })
        }
    }

    return chips.slice(0, maxSymbols)
}

export function formatContextForPrompt(chips: ContextChip[]): string {
    if (chips.length === 0) {
        return ''
    }

    const parts: string[] = []
    parts.push('## context')

    for (const chip of chips) {
        if (chip.content) {
            parts.push(`\n### ${chip.label}`)
            parts.push('```')
            parts.push(chip.content)
            parts.push('```')
        }
    }

    return parts.join('\n')
}
