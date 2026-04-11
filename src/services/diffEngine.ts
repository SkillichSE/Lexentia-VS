/**
 * Diff Engine - SEARCH/REPLACE structured output parser
 * Handles virtual document diffs and syntax validation
 */

import * as vscode from 'vscode'
import * as path from 'path'

// Diff block types
export interface SearchReplaceBlock {
    filePath: string
    search: string
    replace: string
    lineRange?: { start: number; end: number }
}

export interface DiffHunk {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: string[]
}

export interface VirtualDiff {
    filePath: string
    originalContent: string
    modifiedContent: string
    hunks: DiffHunk[]
    isValid: boolean
    syntaxErrors?: string[]
}

// Diff Engine class
export class DiffEngine {
    private virtualDocs: Map<string, VirtualDiff> = new Map()

    /**
     * Parse SEARCH/REPLACE blocks from LLM output
     * Format:
     * <<<<<<< SEARCH
     * content to find
     * =======
     * content to replace
     * >>>>>>> REPLACE
     */
    parseSearchReplaceBlocks(content: string): SearchReplaceBlock[] {
        const blocks: SearchReplaceBlock[] = []
        const regex = /<<<<<<<\s*SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>>\s*REPLACE/g

        let match
        while ((match = regex.exec(content)) !== null) {
            const search = match[1].trimEnd()
            const replace = match[2].trimEnd()

            blocks.push({
                filePath: '', // Will be set from context
                search,
                replace
            })
        }

        return blocks
    }

    /**
     * Create a virtual diff from SEARCH/REPLACE blocks
     */
    async createVirtualDiff(
        filePath: string,
        blocks: SearchReplaceBlock[]
    ): Promise<VirtualDiff> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            throw new Error('No workspace folder open')
        }

        const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspaceFolder.uri.fsPath, filePath)

        // Read original content
        let originalContent: string
        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath))
            originalContent = Buffer.from(content).toString('utf-8')
        } catch {
            // File doesn't exist, treat as empty
            originalContent = ''
        }

        // Apply blocks sequentially
        let modifiedContent = originalContent
        const hunks: DiffHunk[] = []

        for (const block of blocks) {
            const result = this.applySearchReplace(modifiedContent, block)
            if (!result.success) {
                throw new Error(`Failed to apply diff: ${result.error}`)
            }

            // Calculate hunk info
            const oldLines = originalContent.split('\n')
            const newLines = result.content.split('\n')
            const hunk = this.calculateHunk(oldLines, newLines, block)
            hunks.push(hunk)

            modifiedContent = result.content
        }

        // Validate syntax
        const syntaxErrors = await this.validateSyntax(fullPath, modifiedContent)

        const diff: VirtualDiff = {
            filePath,
            originalContent,
            modifiedContent,
            hunks,
            isValid: syntaxErrors.length === 0,
            syntaxErrors: syntaxErrors.length > 0 ? syntaxErrors : undefined
        }

        this.virtualDocs.set(filePath, diff)
        return diff
    }

    /**
     * Apply a single SEARCH/REPLACE block
     */
    private applySearchReplace(
        content: string,
        block: SearchReplaceBlock
    ): { success: boolean; content: string; error?: string } {
        // Try exact match first
        if (content.includes(block.search)) {
            return {
                success: true,
                content: content.replace(block.search, block.replace)
            }
        }

        // Try with normalized whitespace
        const normalizedContent = this.normalizeWhitespace(content)
        const normalizedSearch = this.normalizeWhitespace(block.search)

        if (normalizedContent.includes(normalizedSearch)) {
            // Find the position in original content
            const index = this.findFuzzyMatch(content, block.search)
            if (index !== -1) {
                return {
                    success: true,
                    content: content.substring(0, index) +
                             block.replace +
                             content.substring(index + block.search.length)
                }
            }
        }

        return {
            success: false,
            content,
            error: 'Search content not found in file'
        }
    }

    /**
     * Calculate diff hunk information
     */
    private calculateHunk(
        oldLines: string[],
        newLines: string[],
        block: SearchReplaceBlock
    ): DiffHunk {
        const searchLines = block.search.split('\n')
        const replaceLines = block.replace.split('\n')

        // Find where the search block starts in old content
        let oldStart = 1
        for (let i = 0; i < oldLines.length; i++) {
            if (this.linesMatch(oldLines.slice(i, i + searchLines.length), searchLines)) {
                oldStart = i + 1
                break
            }
        }

        const oldEnd = oldStart + searchLines.length - 1
        const newStart = oldStart
        const newEnd = newStart + replaceLines.length - 1

        // Build diff lines
        const lines: string[] = []

        // Context lines (3 before)
        const contextStart = Math.max(0, oldStart - 4)
        for (let i = contextStart; i < oldStart - 1; i++) {
            lines.push(' ' + oldLines[i])
        }

        // Removed lines
        for (let i = oldStart - 1; i < oldEnd; i++) {
            lines.push('-' + oldLines[i])
        }

        // Added lines
        for (const line of replaceLines) {
            lines.push('+' + line)
        }

        // Context lines (3 after)
        const contextEnd = Math.min(oldLines.length, oldEnd + 3)
        for (let i = oldEnd; i < contextEnd; i++) {
            lines.push(' ' + oldLines[i])
        }

        return {
            oldStart,
            oldLines: searchLines.length,
            newStart,
            newLines: replaceLines.length,
            lines
        }
    }

    /**
     * Validate syntax of modified content
     */
    async validateSyntax(filePath: string, content: string): Promise<string[]> {
        const errors: string[] = []
        const ext = path.extname(filePath)

        // Basic validation rules
        if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
            // Check for basic syntax errors
            const openBraces = (content.match(/{/g) || []).length
            const closeBraces = (content.match(/}/g) || []).length
            if (openBraces !== closeBraces) {
                errors.push(`Brace mismatch: ${openBraces} opening, ${closeBraces} closing`)
            }

            const openParens = (content.match(/\(/g) || []).length
            const closeParens = (content.match(/\)/g) || []).length
            if (openParens !== closeParens) {
                errors.push(`Parenthesis mismatch: ${openParens} opening, ${closeParens} closing`)
            }

            // Check for unterminated strings
            const singleQuotes = (content.match(/'/g) || []).length
            const doubleQuotes = (content.match(/"/g) || []).length
            const backticks = (content.match(/`/g) || []).length

            if (singleQuotes % 2 !== 0) {
                errors.push('Unterminated single-quoted string')
            }
            if (doubleQuotes % 2 !== 0) {
                errors.push('Unterminated double-quoted string')
            }
            if (backticks % 2 !== 0) {
                errors.push('Unterminated template literal')
            }
        }

        // Try to create a temporary document and get diagnostics
        try {
            const uri = vscode.Uri.parse(`untitled:${filePath}.tmp`)
            const doc = await vscode.workspace.openTextDocument({
                language: ext.slice(1),
                content
            })

            // Wait for diagnostics
            await new Promise(r => setTimeout(r, 500))

            const diagnostics = vscode.languages.getDiagnostics(doc.uri)
            for (const diag of diagnostics.filter(d => d.severity === 0)) {
                errors.push(`Line ${diag.range.start.line + 1}: ${diag.message}`)
            }
        } catch {
            // Ignore errors from temp document
        }

        return errors
    }

    /**
     * Apply virtual diff to actual file
     */
    async applyDiff(filePath: string, diff?: VirtualDiff): Promise<boolean> {
        const d = diff || this.virtualDocs.get(filePath)
        if (!d) {
            throw new Error('No virtual diff found')
        }

        if (!d.isValid && d.syntaxErrors && d.syntaxErrors.length > 0) {
            const result = await vscode.window.showWarningMessage(
                `Syntax errors detected: ${d.syntaxErrors.join(', ')}`,
                'Apply Anyway',
                'Cancel'
            )
            if (result !== 'Apply Anyway') {
                return false
            }
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            throw new Error('No workspace folder open')
        }

        const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspaceFolder.uri.fsPath, filePath)

        const uri = vscode.Uri.file(fullPath)
        const buffer = Buffer.from(d.modifiedContent, 'utf-8')
        await vscode.workspace.fs.writeFile(uri, buffer)

        // Open the file to show the changes
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc)

        // Remove from virtual docs
        this.virtualDocs.delete(filePath)

        return true
    }

    /**
     * Get virtual diff for preview
     */
    getVirtualDiff(filePath: string): VirtualDiff | undefined {
        return this.virtualDocs.get(filePath)
    }

    /**
     * Format diff for display
     */
    formatDiffForDisplay(diff: VirtualDiff): string {
        const lines: string[] = [
            `File: ${diff.filePath}`,
            `Status: ${diff.isValid ? '✅ Valid' : '⚠️ Has syntax errors'}`,
            ''
        ]

        if (diff.syntaxErrors && diff.syntaxErrors.length > 0) {
            lines.push('Syntax Errors:')
            for (const error of diff.syntaxErrors) {
                lines.push(`  - ${error}`)
            }
            lines.push('')
        }

        lines.push('Changes:')
        for (const hunk of diff.hunks) {
            lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
            for (const line of hunk.lines) {
                lines.push(line)
            }
            lines.push('')
        }

        return lines.join('\n')
    }

    // Helper methods
    private normalizeWhitespace(content: string): string {
        return content
            .replace(/\r\n/g, '\n')
            .replace(/\t/g, '  ')
            .replace(/ +\n/g, '\n')
            .trim()
    }

    private findFuzzyMatch(content: string, search: string): number {
        // Try exact match first
        let index = content.indexOf(search)
        if (index !== -1) return index

        // Try with trimmed lines
        const searchLines = search.split('\n').map(l => l.trim())
        const contentLines = content.split('\n')

        for (let i = 0; i < contentLines.length - searchLines.length + 1; i++) {
            const slice = contentLines.slice(i, i + searchLines.length).map(l => l.trim())
            if (this.linesMatch(slice, searchLines)) {
                // Calculate byte position
                return contentLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
            }
        }

        return -1
    }

    private linesMatch(a: string[], b: string[]): boolean {
        if (a.length !== b.length) return false
        return a.every((line, i) => line.trim() === b[i].trim())
    }

    /**
     * Get system prompt for structured output
     */
    getStructuredOutputPrompt(): string {
        return `When suggesting code changes, use the following SEARCH/REPLACE format:

<<<<<<< SEARCH
exact code to find (must match exactly, including whitespace)
=======
new code to replace with
>>>>>>> REPLACE

Rules:
1. SEARCH block must match the current file content EXACTLY
2. Include enough context lines to make the match unique
3. One SEARCH/REPLACE block per logical change
4. For new files, use empty SEARCH block
5. For file deletion, use empty REPLACE block

Example:
<<<<<<< SEARCH
function greet(name: string) {
    console.log("Hello, " + name);
}
=======
function greet(name: string) {
    console.log(\`Hello, \${name}!\`);
}
>>>>>>> REPLACE`
    }
}

// Singleton
let diffEngine: DiffEngine | null = null

export function getDiffEngine(): DiffEngine {
    if (!diffEngine) {
        diffEngine = new DiffEngine()
    }
    return diffEngine
}
