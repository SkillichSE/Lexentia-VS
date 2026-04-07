import * as vscode from 'vscode'
import { SidebarProvider } from './webview/sidebarProvider'
import { ChatPanel } from './webview/chatPanel'

export function activate(context: vscode.ExtensionContext) {
    const sidebarProvider = new SidebarProvider(context.extensionUri, context)

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('lexentia.sidebar', sidebarProvider)
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.openChat', () => {
            ChatPanel.createOrShow(context.extensionUri, context)
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.explainLine', async () => {
            const editor = vscode.window.activeTextEditor
            if (!editor) return

            const position = editor.selection.active
            const line = position.line + 1
            const document = editor.document
            const relPath = vscode.workspace.asRelativePath(document.uri)

            ChatPanel.createOrShow(context.extensionUri, context)
            ChatPanel.currentPanel?.postMessage({
                type: 'lineChat',
                kind: 'explain',
                line,
                relPath
            })
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.fixLine', async () => {
            const editor = vscode.window.activeTextEditor
            if (!editor) return

            const position = editor.selection.active
            const line = position.line + 1
            const document = editor.document
            const relPath = vscode.workspace.asRelativePath(document.uri)

            ChatPanel.createOrShow(context.extensionUri, context)
            ChatPanel.currentPanel?.postMessage({
                type: 'lineChat',
                kind: 'fix',
                line,
                relPath
            })
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.newTerminal', () => {
            const terminal = vscode.window.createTerminal('lexentia')
            terminal.show()
        })
    )

    if (vscode.window.registerWebviewPanelSerializer) {
        vscode.window.registerWebviewPanelSerializer('lexentia.chat', {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
                ChatPanel.revive(webviewPanel, context.extensionUri, context)
            }
        })
    }
}

export function deactivate() {}
