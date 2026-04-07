import * as vscode from 'vscode'
import { ModelService, ChatMessage } from '../services/modelService'
import { executeTool, ToolCall, ToolResult } from '../services/modelTools'
import { shouldExecuteTool } from '../services/modelTools'
import { getModelPreset, MODEL_PRESETS } from '../services/modelPresets'

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lexentia.sidebar'
    private _view?: vscode.WebviewView
    private _messages: ChatMessage[] = []
    private _modelService: ModelService

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._modelService = new ModelService()
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

        webviewView.webview.onDidReceiveMessage(async (data: { type: string; text?: string; settings?: any; level?: 'info' | 'error' }) => {
            switch (data.type) {
                case 'sendMessage':
                    if (data.text) {
                        await this._handleSendMessage(data.text)
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
            }
        })
    }

    private async _handleSendMessage(text: string) {
        const config = vscode.workspace.getConfiguration('lexentia.model')
        const provider = config.get<string>('provider', 'ollama')
        const baseUrl = config.get<string>('baseUrl', 'http://127.0.0.1:11434')
        const model = config.get<string>('name', 'llama3.1')
        const apiKey = config.get<string>('apiKey', '')
        const customSystemPrompt = config.get<string>('customSystemPrompt', '')

        this._messages.push({ role: 'user', content: text })

        this._view?.webview.postMessage({
            type: 'thinking',
            content: 'Thinking...'
        })

        try {
            const result = await this._modelService.next(
                this._messages,
                {
                    id: 'default',
                    name: 'Default',
                    provider: provider as 'ollama' | 'openai-compatible',
                    model,
                    baseUrl,
                    apiKey,
                    customSystemPrompt
                }
            )

            if (result.type === 'final') {
                this._messages.push({ role: 'assistant', content: result.content })

                this._view?.webview.postMessage({
                    type: 'response',
                    content: result.content
                })

                // Execute tool calls if any
                if (result.toolCalls && result.toolCalls.length > 0) {
                    for (const toolCall of result.toolCalls) {
                        const gate = shouldExecuteTool(toolCall, text)
                        if (!gate.allowed) {
                            continue
                        }
                        const toolResult = await executeTool(toolCall)
                        this._view?.webview.postMessage({
                            type: 'toolResult',
                            toolId: toolCall.id,
                            output: toolResult.output,
                            error: toolResult.error
                        })
                    }
                }
            }
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: 'error',
                content: e?.message || 'Unknown error'
            })
        }
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
