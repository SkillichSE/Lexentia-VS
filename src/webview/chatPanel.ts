import * as vscode from 'vscode'

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined
    public static readonly viewType = 'lexentia.chat'

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private _disposables: vscode.Disposable[] = []
    private _context: vscode.ExtensionContext

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column)
            return
        }

        const panel = vscode.window.createWebviewPanel(
            ChatPanel.viewType,
            'lexentia chat',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        )

        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, context)
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, context)
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._context = context

        this._update()

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

        this._panel.webview.onDidReceiveMessage(
            async (message: { type: string; text?: string; tool?: any; settings?: any }) => {
                switch (message.type) {
                    case 'sendMessage':
                        if (message.text) {
                            await this._handleSendMessage(message.text)
                        }
                        break
                    case 'executeTool':
                        await this._handleExecuteTool(message.tool)
                        break
                    case 'getSettings':
                        this._sendSettings()
                        break
                    case 'saveSettings':
                        await this._saveSettings(message.settings)
                        break
                }
            },
            null,
            this._disposables
        )
    }

    public postMessage(message: any) {
        this._panel.webview.postMessage(message)
    }

    private async _handleSendMessage(text: string) {
        const config = vscode.workspace.getConfiguration('lexentia.model')
        const provider = config.get<string>('provider', 'ollama')
        const baseUrl = config.get<string>('baseUrl', 'http://127.0.0.1:11434')
        const model = config.get<string>('name', 'llama3.1')
        const apiKey = config.get<string>('apiKey', '')

        this._panel.webview.postMessage({
            type: 'thinking',
            content: 'thinking...'
        })

        try {
            let result
            if (provider === 'ollama') {
                result = await this._callOllama(baseUrl, model, text)
            } else {
                result = await this._callOpenAI(baseUrl, model, apiKey, text)
            }

            this._panel.webview.postMessage({
                type: 'response',
                content: result
            })
        } catch (e: any) {
            this._panel.webview.postMessage({
                type: 'error',
                content: e?.message || 'unknown error'
            })
        }
    }

    private async _callOllama(baseUrl: string, model: string, text: string): Promise<string> {
        const res = await fetch(`${baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt: text,
                stream: false
            })
        })

        if (!res.ok) throw new Error(`ollama error: ${res.status}`)
        const data = await res.json()
        return data.response || ''
    }

    private async _callOpenAI(baseUrl: string, model: string, apiKey: string, text: string): Promise<string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: text }],
                stream: false
            })
        })

        if (!res.ok) throw new Error(`openai error: ${res.status}`)
        const data = await res.json()
        return data.choices?.[0]?.message?.content || ''
    }

    private async _handleExecuteTool(tool: any) {
        switch (tool.name) {
            case 'terminal_execute':
                const terminal = vscode.window.createTerminal('lexentia')
                terminal.sendText(tool.args.command)
                terminal.show()
                this._panel.webview.postMessage({
                    type: 'toolResult',
                    toolId: tool.id,
                    output: 'command sent to terminal'
                })
                break
            case 'file_read':
                try {
                    const uri = this._resolvePath(tool.args.path)
                    const content = await vscode.workspace.fs.readFile(uri)
                    const text = new TextDecoder().decode(content)
                    this._panel.webview.postMessage({
                        type: 'toolResult',
                        toolId: tool.id,
                        output: text
                    })
                } catch (e: any) {
                    this._panel.webview.postMessage({
                        type: 'toolResult',
                        toolId: tool.id,
                        error: e?.message || 'read failed'
                    })
                }
                break
            case 'file_write':
                try {
                    const uri = this._resolvePath(tool.args.path)
                    const content = new TextEncoder().encode(tool.args.content)
                    await vscode.workspace.fs.writeFile(uri, content)
                    this._panel.webview.postMessage({
                        type: 'toolResult',
                        toolId: tool.id,
                        output: 'file written'
                    })
                } catch (e: any) {
                    this._panel.webview.postMessage({
                        type: 'toolResult',
                        toolId: tool.id,
                        error: e?.message || 'write failed'
                    })
                }
                break
        }
    }

    private _resolvePath(relPath: string): vscode.Uri {
        const workspace = vscode.workspace.workspaceFolders?.[0]
        if (!workspace) throw new Error('no workspace open')
        return vscode.Uri.joinPath(workspace.uri, relPath)
    }

    private _sendSettings() {
        const config = vscode.workspace.getConfiguration('lexentia.model')
        this._panel.webview.postMessage({
            type: 'settings',
            settings: {
                provider: config.get('provider'),
                baseUrl: config.get('baseUrl'),
                model: config.get('name'),
                apiKey: config.get('apiKey')
            }
        })
    }

    private async _saveSettings(settings: any) {
        const config = vscode.workspace.getConfiguration('lexentia.model')
        await config.update('provider', settings.provider, true)
        await config.update('baseUrl', settings.baseUrl, true)
        await config.update('name', settings.model, true)
        await config.update('apiKey', settings.apiKey, true)
    }

    private _update() {
        const webview = this._panel.webview
        this._panel.title = 'lexentia chat'
        this._panel.webview.html = this._getHtmlForWebview(webview)
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css')
        )
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css')
        )
        const styleChatUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css')
        )
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js')
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
                <title>lexentia chat</title>
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

    public dispose() {
        ChatPanel.currentPanel = undefined
        this._panel.dispose()
        while (this._disposables.length) {
            const x = this._disposables.pop()
            if (x) x.dispose()
        }
    }
}
