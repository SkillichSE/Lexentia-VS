/**
 * Inline Edit Service
 * Provides in-place code editing with diff preview and streaming
 */

import * as vscode from 'vscode'
import { getDiffEngine } from './diffEngine'
import { streamOllamaResponse, streamOpenAIResponse } from './streamingService'
import { SecretStorageService } from './secretStorage'

export interface InlineEditRequest {
    selectedCode: string
    filePath: string
    instruction: string
    language: string
}

export interface InlineEditResult {
    originalCode: string
    modifiedCode: string
    isStreaming: boolean
}

export class InlineEditService {
    private diffEngine = getDiffEngine()
    private secretStorage: SecretStorageService
    private currentInlineEdit: {
        document: vscode.TextDocument
        originalContent: string
        editRange: vscode.Range
        filePath: string
    } | null = null

    constructor(private context: vscode.ExtensionContext) {
        this.secretStorage = SecretStorageService.getInstance(context)
    }

    /**
     * Trigger inline edit with Ctrl+I
     */
    async triggerInlineEdit(instruction?: string): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            vscode.window.showWarningMessage('No active editor')
            return
        }

        const selection = editor.selection
        const selectedCode = editor.document.getText(selection)

        // If no selection, select the current line
        const codeToEdit = selectedCode || editor.document.lineAt(selection.active.line).text
        const editRange = selectedCode ? selection : editor.document.lineAt(selection.active.line).range

        // Get instruction from user if not provided
        const userInstruction = instruction || await vscode.window.showInputBox({
            prompt: 'Describe the change you want to make',
            placeHolder: 'e.g., "Add error handling" or "Refactor to use async/await"'
        })

        if (!userInstruction) {
            return
        }

        // Store current edit state
        this.currentInlineEdit = {
            document: editor.document,
            originalContent: codeToEdit,
            editRange,
            filePath: editor.document.fileName
        }

        // Generate the edit
        await this.generateInlineEdit({
            selectedCode: codeToEdit,
            filePath: editor.document.fileName,
            instruction: userInstruction,
            language: editor.document.languageId
        })
    }

    /**
     * Generate inline edit with streaming
     */
    private async generateInlineEdit(request: InlineEditRequest): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!editor) return

        // Build prompt
        const systemPrompt = `You are a code editing assistant. Return ONLY the modified code without any explanations, comments, or markdown formatting. Keep the same structure and style.`
        const userPrompt = `Original code:\n\`\`\`${request.language}\n${request.selectedCode}\n\`\`\`\n\nInstruction: ${request.instruction}\n\nModified code:`

        // Get model configuration
        const config = vscode.workspace.getConfiguration('lexentia')
        const models = config.get<any[]>('models', [])
        const roleIndex = config.get<string>('roles.chat', '0')
        const modelConfig = models[parseInt(roleIndex)] || models[0]

        if (!modelConfig) {
            vscode.window.showErrorMessage('No model configured')
            return
        }

        // Get API key from secret storage
        let apiKey = modelConfig.apiKey
        if (apiKey && modelConfig.provider === 'openai-compatible') {
            const storedKey = await this.secretStorage.getApiKey(modelConfig.provider, modelConfig.model)
            if (storedKey) apiKey = storedKey
        }

        // Create a diff decoration for streaming preview
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 165, 0, 0.2)',
            border: '2px solid orange'
        })

        // Stream the response
        let generatedCode = ''
        const startLine = this.currentInlineEdit?.editRange.start.line || 0
        const startChar = this.currentInlineEdit?.editRange.start.character || 0

        const streamHandler: any = {
            onChunk: (chunk: string) => {
                generatedCode += chunk

                // Update inline preview
                if (this.currentInlineEdit && editor) {
                    const previewRange = new vscode.Range(
                        startLine,
                        startChar,
                        startLine,
                        startChar + generatedCode.length
                    )
                    
                    // Show the generated code as a ghost text or decoration
                    // Note: VS Code doesn't have native ghost text, so we use a decoration
                    editor.setDecorations(decorationType, [previewRange])
                }
            },
            onComplete: () => {
                // Apply the edit
                this.applyInlineEdit(generatedCode, decorationType)
            },
            onError: (error: Error) => {
                vscode.window.showErrorMessage(`Inline edit failed: ${error.message}`)
                editor.setDecorations(decorationType, [])
            }
        }

        if (modelConfig.provider === 'ollama') {
            await streamOllamaResponse(
                modelConfig.apiBaseUrl || 'http://127.0.0.1:11434',
                modelConfig.model,
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                streamHandler
            )
        } else if (modelConfig.provider === 'openai-compatible') {
            await streamOpenAIResponse(
                modelConfig.apiBaseUrl || 'https://api.openai.com/v1',
                modelConfig.model,
                apiKey || '',
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                streamHandler
            )
        }
    }

    /**
     * Apply the inline edit
     */
    private async applyInlineEdit(modifiedCode: string, decorationType: vscode.TextEditorDecorationType): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!editor || !this.currentInlineEdit) return

        // Clean up the generated code (remove markdown code blocks if present)
        const cleanedCode = this.cleanGeneratedCode(modifiedCode)

        // Show diff preview
        const diff = await this.diffEngine.createVirtualDiff(
            this.currentInlineEdit.filePath,
            [{
                filePath: this.currentInlineEdit.filePath,
                search: this.currentInlineEdit.originalContent,
                replace: cleanedCode
            }]
        )

        // Show the diff to user
        const diffDisplay = this.diffEngine.formatDiffForDisplay(diff)

        // Ask user to confirm
        const result = await vscode.window.showInformationMessage(
            'Review the changes and confirm to apply.',
            'Apply',
            'Discard'
        )

        if (result === 'Apply') {
            // Apply the edit
            const edit = new vscode.TextEdit(this.currentInlineEdit.editRange, cleanedCode)
            const workspaceEdit = new vscode.WorkspaceEdit()
            workspaceEdit.set(editor.document.uri, [edit])

            const success = await vscode.workspace.applyEdit(workspaceEdit)
            if (success) {
                vscode.window.showInformationMessage('Edit applied successfully')
            } else {
                vscode.window.showErrorMessage('Failed to apply edit')
            }
        }

        // Clean up
        editor.setDecorations(decorationType, [])
        this.currentInlineEdit = null
    }

    /**
     * Clean generated code (remove markdown code blocks)
     */
    private cleanGeneratedCode(code: string): string {
        // Remove markdown code blocks if present
        const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/g
        const match = codeBlockRegex.exec(code)
        if (match) {
            return match[1].trim()
        }

        // Remove any trailing explanation text (common pattern)
        const lines = code.split('\n')
        const cleanLines: string[] = []
        let inCode = true

        for (const line of lines) {
            // Stop if we hit explanatory text
            if (line.match(/^(Here is|The code|This is)/i)) {
                inCode = false
            }
            if (inCode) {
                cleanLines.push(line)
            }
        }

        return cleanLines.join('\n').trim()
    }

    /**
     * Cancel current inline edit
     */
    cancelInlineEdit(): void {
        this.currentInlineEdit = null
    }

    /**
     * Check if there's an active inline edit
     */
    hasActiveInlineEdit(): boolean {
        return this.currentInlineEdit !== null
    }
}

// Singleton
let inlineEditService: InlineEditService | null = null

export function getInlineEditService(context: vscode.ExtensionContext): InlineEditService {
    if (!inlineEditService) {
        inlineEditService = new InlineEditService(context)
    }
    return inlineEditService
}
