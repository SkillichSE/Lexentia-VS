import * as vscode from 'vscode'
import { ModelService, ChatMessage } from '../services/modelService'
import { executeTool, ToolCall, ToolResult, shouldExecuteTool } from '../services/modelTools'
import { getModelPreset, MODEL_PRESETS } from '../services/modelPresets'
import { executeSlashCommand } from '../services/slashCommands'
import { compressContext } from '../services/contextCompression'
import { checkPermission } from '../services/permissionService'
import { indexCodebase, searchCodebase } from '../services/ragService'
import { streamOllamaResponse, streamOpenAIResponse, StreamHandler } from '../services/streamingService'
import { classifyIntent, shouldGatherContext } from '../services/intentService'
import { gatherContext, formatContextForPrompt } from '../services/contextGatheringService'
import {
    createSession,
    completeSession,
    createIntentStep,
    createContextGatheringStep,
    createGenerationStep,
    addStep,
    completeStep,
    errorStep,
    updateStepMetadata,
    subscribeToUpdates,
    getSession,
    formatStepsAsTimeline
} from '../services/aiActionsService'
import {
    logPrompt,
    logResponse,
    logToolCall,
    logToolResult,
    logError,
    saveAuditLogToFile,
    combineSessionWithAudit
} from '../services/auditService'
import { ContextChip } from '../services/aiActionsTypes'
import { getOrchestrator } from '../services/orchestrator'
import { getContextEngine } from '../services/contextEngine'
import { getDiffEngine } from '../services/diffEngine'
import { MCPToolExecutor } from '../services/mcpTools'
import { TaskManager, Task, ExecutionLog } from '../core/taskManager'
import { permissionsManager } from '../permissions/manager'
import { safetyManager } from '../core/safety'
import { analyzeIntent, shouldShowRunFix } from '../ui/context-suggester'
import { modeManager, AgentMode, MODE_CONFIGS } from '../core/mode-manager'

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lexentia.sidebar'
    private _view?: vscode.WebviewView
    private _messages: ChatMessage[] = []
    private _modelService: ModelService
    private _currentSessionId?: string
    private _unsubscribeFromAiActions?: () => void
    private _contextChips: ContextChip[] = []
    private _orchestrator!: ReturnType<typeof getOrchestrator>
    private _toolExecutor!: MCPToolExecutor
    private _contextEngine!: ReturnType<typeof getContextEngine>
    private _diffEngine = getDiffEngine()
    private _taskManager?: TaskManager

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._modelService = new ModelService()
        this._orchestrator = getOrchestrator(_context)
        this._toolExecutor = new MCPToolExecutor(_context)
        this._contextEngine = getContextEngine(_context)
        this._setupAiActionsSubscription()
        this._setupTaskManager()
        void this._initializeServices()
    }

    private _setupTaskManager(): void {
        // Register all tools
        const { registerAllTools } = require('../tools/index.js')
        registerAllTools()

        this._taskManager = new TaskManager(
            this._context,
            (task: Task) => {
                // Status updates
                const statusText = this._getStatusText(task.status)
                this._view?.webview.postMessage({
                    type: 'taskStatus',
                    status: task.status,
                    text: statusText
                })
            },
            (log: ExecutionLog) => {
                // Execution log
                this._view?.webview.postMessage({
                    type: 'executionLog',
                    logType: log.type,
                    title: log.message,
                    details: log.metadata ? JSON.stringify(log.metadata, null, 2) : ''
                })
            }
        )
    }

    private _getStatusText(status: string): string {
        const statusMap: Record<string, string> = {
            idle: 'Ready',
            collecting: 'Collecting context...',
            planning: 'Planning...',
            executing: 'Executing plan...',
            running: 'Running project...',
            parsing_error: 'Parsing errors...',
            fixing: 'Fixing errors...',
            success: 'Done!',
            error: 'Failed',
            max_iterations: 'Max iterations reached'
        }
        return statusMap[status] || status
    }

    private async _initializeServices(): Promise<void> {
        // Initialize context engine with background indexing
        await this._contextEngine.initialize()
    }

    private _setupAiActionsSubscription(): void {
        this._unsubscribeFromAiActions = subscribeToUpdates((session) => {
            // send ai actions update to webview
            this._view?.webview.postMessage({
                type: 'aiActionsUpdate',
                session: {
                    id: session.id,
                    steps: session.steps,
                    currentStepId: session.currentStepId,
                    userQuery: session.userQuery
                }
            })
        })
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        }

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

        webviewView.webview.onDidReceiveMessage(async (data: { type: string; text?: string; task?: string; mode?: string; settings?: any; level?: 'info' | 'error'; tool?: string; args?: Record<string, any>; filePath?: string; blocks?: any[] }) => {
            switch (data.type) {
                case 'sendMessage':
                    if (data.text) {
                        await this._handleSendMessage(data.text)
                    }
                    break
                case 'runTask':
                    if (data.task && this._taskManager) {
                        try {
                            await this._taskManager.runTask(data.task)
                        } catch (error) {
                            this._view?.webview.postMessage({
                                type: 'taskStatus',
                                status: 'error',
                                text: 'Task failed'
                            })
                            this._view?.webview.postMessage({
                                type: 'executionLog',
                                logType: 'error',
                                title: 'Task execution failed',
                                details: String(error)
                            })
                        }
                    }
                    break
                case 'analyzeIntent':
                    // Progressive UI: analyze user intent and suggest actions
                    if (data.text) {
                        const analysis = analyzeIntent(data.text)
                        this._view?.webview.postMessage({
                            type: 'intentAnalysis',
                            input: data.text,
                            intent: analysis.intent,
                            confidence: analysis.confidence,
                            actions: analysis.actions,
                            context: analysis.context
                        })
                    }
                    break
                case 'stopTask':
                    this._taskManager?.stop()
                    break
                case 'setMode':
                    if (data.mode) {
                        modeManager.setMode(data.mode as AgentMode)
                        const config = modeManager.getConfig()
                        void vscode.window.showInformationMessage(`Mode: ${config.icon} ${config.name} - ${config.description}`)
                    }
                    break
                case 'getSettings':
                    this._sendSettings()
                    break
                case 'saveSettings':
                    await this._saveSettings(data.settings)
                    break
                case 'attachFile':
                    await this._attachFileToPrompt()
                    break
                case 'notify':
                    if (data.text) {
                        const level = data.level || 'info'
                        if (level === 'error') {
                            void vscode.window.showErrorMessage(data.text)
                        } else {
                            void vscode.window.showInformationMessage(data.text)
                        }
                    }
                    break
                case 'acceptAll':
                    void vscode.window.showInformationMessage('Accept all is not implemented yet.')
                    break
                case 'rejectAll':
                    void vscode.window.showInformationMessage('Reject all is not implemented yet.')
                    break
                case 'getMentionSuggestions':
                    if (data.text) {
                        const suggestions = await this._orchestrator.getMentionSuggestions(data.text)
                        this._view?.webview.postMessage({
                            type: 'mentionSuggestions',
                            suggestions
                        })
                    }
                    break
                case 'executeTool':
                    if (data.tool && data.args) {
                        const result = await this._toolExecutor.executeTool(data.tool, data.args)
                        this._view?.webview.postMessage({
                            type: 'toolResult',
                            result
                        })
                    }
                    break
                case 'createVirtualDiff':
                    if (data.filePath && data.blocks) {
                        const diff = await this._diffEngine.createVirtualDiff(data.filePath, data.blocks)
                        this._view?.webview.postMessage({
                            type: 'virtualDiff',
                            diff: this._diffEngine.formatDiffForDisplay(diff)
                        })
                    }
                    break
                case 'applyDiff':
                    if (data.filePath) {
                        const success = await this._diffEngine.applyDiff(data.filePath)
                        this._view?.webview.postMessage({
                            type: 'diffApplied',
                            success
                        })
                    }
                    break
                case 'getContext':
                    if (data.text) {
                        const context = await this._contextEngine.getContext(data.text, {
                            currentFile: vscode.window.activeTextEditor?.document.fileName
                        })
                        this._view?.webview.postMessage({
                            type: 'contextResult',
                            context
                        })
                    }
                    break
            }
        })
    }

    private async _handleSendMessage(text: string, useStreaming: boolean = false) {
        // create new ai action session
        this._currentSessionId = createSession(text)
        const sessionId = this._currentSessionId

        // handle slash commands
        if (text.startsWith('/')) {
            const result = await executeSlashCommand(text)
            if (result === '___clear_history___') {
                this._messages = []
                this._view?.webview.postMessage({ type: 'clearHistory' })
                return
            }
            if (result && result !== '___async___') {
                this._view?.webview.postMessage({
                    type: 'response',
                    content: result
                })
                completeSession(sessionId, result)
                return
            }
        }

        const config = vscode.workspace.getConfiguration('lexentia.model')
        const provider = config.get<string>('provider', 'ollama')
        const baseUrl = config.get<string>('baseUrl', 'http://127.0.0.1:11434')
        const model = config.get<string>('name', 'llama3.1')
        const apiKey = config.get<string>('apiKey', '')
        const customSystemPrompt = config.get<string>('customSystemPrompt', '')
        const streaming = config.get<boolean>('streaming', false)

        // step 1: classify intent
        const intentStartTime = Date.now()
        const classification = classifyIntent(text)
        const intentStepId = createIntentStep(sessionId, classification)
        completeStep(sessionId, intentStepId, { latency: Date.now() - intentStartTime })

        // step 2: gather context if needed
        this._contextChips = []
        if (shouldGatherContext(classification)) {
            const contextStepId = addStep(sessionId, 'context_gathering', 'gathering context', {})
            this._contextChips = await gatherContext({
                query: text,
                intent: classification,
                includeOpenTabs: true,
                maxChips: 5
            })

            // send context chips to webview
            this._view?.webview.postMessage({
                type: 'contextChips',
                chips: this._contextChips.map(c => ({
                    id: c.id,
                    type: c.type,
                    label: c.label
                }))
            })

            updateStepMetadata(sessionId, contextStepId, {
                chipCount: this._contextChips.length,
                chips: this._contextChips.map(c => c.label)
            })
            completeStep(sessionId, contextStepId)
        }

        // build full prompt with context
        const contextText = formatContextForPrompt(this._contextChips)
        const fullPrompt = contextText
            ? `${text}\n\n${contextText}`
            : text

        this._messages.push({ role: 'user', content: fullPrompt })

        // compress context if needed
        this._messages = compressContext(this._messages)

        this._view?.webview.postMessage({
            type: 'thinking',
            content: 'thinking...',
            showAiActions: true
        })

        // log the prompt to audit
        logPrompt(sessionId, undefined, fullPrompt, {
            model,
            provider,
            systemPrompt: customSystemPrompt
        })

        // step 3: generate response
        let genStepId: string | undefined

        try {
            genStepId = createGenerationStep(sessionId, model)

            // use streaming if enabled
            if (streaming || useStreaming) {
                await this._handleStreamingResponseWithAudit(
                    sessionId,
                    genStepId,
                    provider as 'ollama' | 'openai-compatible',
                    baseUrl,
                    model,
                    apiKey,
                    customSystemPrompt,
                    text
                )
                return
            }

            const result = await this._modelService.next(
                this._messages,
                {
                    id: 'default',
                    name: 'default',
                    provider: provider as 'ollama' | 'openai-compatible',
                    model,
                    baseUrl,
                    apiKey,
                    customSystemPrompt
                }
            )

            if (result.type === 'final') {
                this._messages.push({ role: 'assistant', content: result.content })

                // complete generation step
                updateStepMetadata(sessionId, genStepId, {
                    tokensOut: result.content.length / 4 // rough estimate
                })
                completeStep(sessionId, genStepId)

                // log response
                logResponse(sessionId, genStepId, result.content, {
                    model,
                    provider
                })

                this._view?.webview.postMessage({
                    type: 'response',
                    content: result.content,
                    aiActionsComplete: true
                })

                completeSession(sessionId, result.content)

                // execute tool calls if any
                if (result.toolCalls && result.toolCalls.length > 0) {
                    for (const toolCall of result.toolCalls) {
                        await this._executeToolWithAudit(sessionId, toolCall, text)
                    }
                }
            }
        } catch (e: any) {
            const errorMsg = e?.message || 'unknown error'
            errorStep(sessionId, genStepId || '', errorMsg)
            logError(sessionId, genStepId, errorMsg)
            this._view?.webview.postMessage({
                type: 'error',
                content: errorMsg
            })
        }
    }

    private async _executeToolWithAudit(
        sessionId: string,
        toolCall: ToolCall,
        originalText: string
    ): Promise<void> {
        const gate = shouldExecuteTool(toolCall, originalText)
        if (!gate.allowed) {
            return
        }

        // check permissions before executing
        const permitted = await checkPermission(toolCall.name, toolCall.arguments)
        if (!permitted) {
            this._view?.webview.postMessage({
                type: 'toolResult',
                toolId: toolCall.id,
                output: '',
                error: 'permission denied by user'
            })
            return
        }

        // log tool call
        logToolCall(sessionId, undefined, toolCall.name, toolCall.arguments)

        const toolStepId = addStep(sessionId, 'tool_usage', `executing ${toolCall.name}`, {
            toolName: toolCall.name,
            arguments: toolCall.arguments
        })

        const toolResult = await executeTool(toolCall)

        // log tool result
        logToolResult(
            sessionId,
            undefined,
            toolCall.name,
            toolResult.output,
            toolResult.error
        )

        updateStepMetadata(sessionId, toolStepId, {
            success: !toolResult.error,
            outputLength: toolResult.output?.length || 0
        })
        completeStep(sessionId, toolStepId)

        this._view?.webview.postMessage({
            type: 'toolResult',
            toolId: toolCall.id,
            output: toolResult.output,
            error: toolResult.error
        })
    }

    private async _handleStreamingResponse(
        provider: 'ollama' | 'openai-compatible',
        baseUrl: string,
        model: string,
        apiKey: string,
        customSystemPrompt: string,
        originalText: string
    ): Promise<void> {
        let fullContent = ''
        const onChunk: StreamHandler = (chunk) => {
            if (chunk.type === 'content' && chunk.content) {
                fullContent += chunk.content
                this._view?.webview.postMessage({
                    type: 'streamChunk',
                    content: chunk.content
                })
            } else if (chunk.type === 'done') {
                this._messages.push({ role: 'assistant', content: fullContent })
                this._view?.webview.postMessage({ type: 'streamDone' })
            } else if (chunk.type === 'error') {
                this._view?.webview.postMessage({
                    type: 'error',
                    content: chunk.content || 'Stream error'
                })
            }
        }

        const apiMessages = this._buildApiMessages(customSystemPrompt)

        if (provider === 'ollama') {
            await streamOllamaResponse(baseUrl, model, apiMessages, onChunk)
        } else {
            await streamOpenAIResponse(baseUrl, model, apiKey, apiMessages, onChunk)
        }
    }

    private async _handleStreamingResponseWithAudit(
        sessionId: string,
        genStepId: string,
        provider: 'ollama' | 'openai-compatible',
        baseUrl: string,
        model: string,
        apiKey: string,
        customSystemPrompt: string,
        originalText: string
    ): Promise<void> {
        let fullContent = ''
        const streamStartTime = Date.now()

        const onChunk: StreamHandler = (chunk) => {
            if (chunk.type === 'content' && chunk.content) {
                fullContent += chunk.content
                this._view?.webview.postMessage({
                    type: 'streamChunk',
                    content: chunk.content
                })
            } else if (chunk.type === 'done') {
                this._messages.push({ role: 'assistant', content: fullContent })
                this._view?.webview.postMessage({
                    type: 'streamDone',
                    aiActionsComplete: true
                })

                // complete generation step
                updateStepMetadata(sessionId, genStepId, {
                    tokensOut: fullContent.length / 4,
                    latency: Date.now() - streamStartTime
                })
                completeStep(sessionId, genStepId)

                // log response
                logResponse(sessionId, genStepId, fullContent, {
                    model,
                    provider,
                    latency: Date.now() - streamStartTime
                })

                completeSession(sessionId, fullContent)
            } else if (chunk.type === 'error') {
                errorStep(sessionId, genStepId, chunk.content || 'stream error')
                logError(sessionId, genStepId, chunk.content || 'stream error')
                this._view?.webview.postMessage({
                    type: 'error',
                    content: chunk.content || 'stream error'
                })
            }
        }

        const apiMessages = this._buildApiMessages(customSystemPrompt)

        try {
            if (provider === 'ollama') {
                await streamOllamaResponse(baseUrl, model, apiMessages, onChunk)
            } else {
                await streamOpenAIResponse(baseUrl, model, apiKey, apiMessages, onChunk)
            }
        } catch (e: any) {
            errorStep(sessionId, genStepId, e?.message || 'stream failed')
            logError(sessionId, genStepId, e?.message || 'stream failed')
            throw e
        }
    }

    private _buildApiMessages(systemPrompt: string): any[] {
        const messages: any[] = []
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt })
        }
        for (const msg of this._messages) {
            messages.push({ role: msg.role, content: msg.content })
        }
        return messages
    }

    private _sendSettings() {
        const config = vscode.workspace.getConfiguration('lexentia.model')
        this._view?.webview.postMessage({
            type: 'settings',
            settings: {
                provider: config.get('provider'),
                baseUrl: config.get('baseUrl'),
                model: config.get('name'),
                apiKey: config.get('apiKey'),
                modelPreset: config.get('modelPreset', 'custom'),
                customSystemPrompt: config.get('customSystemPrompt', ''),
                streaming: config.get('streaming', false),
                modelPresets: MODEL_PRESETS
            }
        })
    }

    private async _saveSettings(settings: any) {
        const config = vscode.workspace.getConfiguration('lexentia.model')
        const selectedPreset = getModelPreset(settings.modelPreset)
        const provider = selectedPreset?.provider || settings.provider
        const baseUrl = selectedPreset?.baseUrl || settings.baseUrl
        const model = selectedPreset?.model || settings.model

        await config.update('modelPreset', settings.modelPreset || 'custom', true)
        await config.update('provider', provider, true)
        await config.update('baseUrl', baseUrl, true)
        await config.update('name', model, true)
        await config.update('apiKey', settings.apiKey, true)
        await config.update('customSystemPrompt', settings.customSystemPrompt || '', true)
        await config.update('streaming', settings.streaming || false, true)

        // Apply Tools permissions
        if (settings.tools) {
            permissionsManager.setPermission('terminal', settings.tools.terminal)
            permissionsManager.setPermission('filesystem', settings.tools.filesystem)
            permissionsManager.setPermission('tests', settings.tools.tests)
        }

        // Apply Safety settings
        if (settings.safety) {
            safetyManager.setLimits({
                maxIterations: settings.safety.maxIterations || 3
            })
            if (settings.safety.profile) {
                permissionsManager.setProfile(settings.safety.profile)
            }
        }
    }

    private async _attachFileToPrompt() {
        const selection = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFolders: false,
            canSelectFiles: true,
            openLabel: 'Attach to chat'
        })
        const file = selection?.[0]
        if (!file) return

        try {
            const bytes = await vscode.workspace.fs.readFile(file)
            const content = Buffer.from(bytes).toString('utf8')
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
            const relPath = workspaceFolder
                ? vscode.workspace.asRelativePath(file, false)
                : file.fsPath

            this._view?.webview.postMessage({
                type: 'insertText',
                text: `Attached file: ${relPath}\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\``
            })
        } catch (e: any) {
            void vscode.window.showErrorMessage(`Failed to attach file: ${e?.message || 'Unknown error'}`)
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css')
        )
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css')
        )
        const styleChatUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar-chat.css')
        )
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar-chat.js')
        )

        const nonce = this._getNonce()

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleChatUri}" rel="stylesheet">
                <title>Lexentia</title>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`
    }

    private _getNonce() {
        let text = ''
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length))
        }
        return text
    }
}
