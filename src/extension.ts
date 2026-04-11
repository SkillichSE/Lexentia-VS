import * as vscode from 'vscode'
import { SidebarProvider } from './webview/sidebarProvider'
import { ChatPanel } from './webview/chatPanel'
import { exportAuditLog, getAuditLog, isAuditEnabled, setAuditEnabled } from './services/auditService'
import { getAllSessions, formatStepsAsTimeline, combineSessionWithAudit } from './services/aiActionsService'
import { ExportOptions } from './services/aiActionsTypes'
import { getStatusBarService } from './services/statusBarService'
import { getInlineEditService } from './services/inlineEdit'

export function activate(context: vscode.ExtensionContext) {
    const sidebarProvider = new SidebarProvider(context.extensionUri, context)
    const statusBarService = getStatusBarService(context)
    const inlineEditService = getInlineEditService(context)

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('lexentia.sidebar', sidebarProvider)
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.openChat', () => {
            ChatPanel.createOrShow(context.extensionUri, context)
        })
    )

    // export audit log command
    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.exportAuditLog', async () => {
            const format = await vscode.window.showQuickPick(
                ['json', 'markdown'],
                { placeHolder: 'select export format' }
            )
            if (!format) return

            const includeRaw = await vscode.window.showQuickPick(
                ['yes', 'no'],
                { placeHolder: 'include raw prompts?' }
            )

            const options: ExportOptions = {
                format: format as 'json' | 'markdown',
                includeRawPrompts: includeRaw === 'yes',
                includeMetadata: true
            }

            const content = exportAuditLog(options)

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`lexentia-audit-${new Date().toISOString().split('T')[0]}.${format}`),
                filters: format === 'json'
                    ? { 'json files': ['json'] }
                    : { 'markdown files': ['md'] }
            })

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
                void vscode.window.showInformationMessage(`audit log exported to ${uri.fsPath}`)
            }
        })
    )

    // export ai actions timeline command
    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.exportAiActions', async () => {
            const sessions = getAllSessions()
            if (sessions.length === 0) {
                void vscode.window.showInformationMessage('no ai action sessions to export')
                return
            }

            const sessionItems = sessions.map(s => ({
                label: s.userQuery.slice(0, 50) + (s.userQuery.length > 50 ? '...' : ''),
                description: new Date(s.startTime).toLocaleString(),
                session: s
            }))

            const selected = await vscode.window.showQuickPick(sessionItems, {
                placeHolder: 'select session to export'
            })
            if (!selected) return

            const format = await vscode.window.showQuickPick(
                ['timeline text', 'full json'],
                { placeHolder: 'select export format' }
            )
            if (!format) return

            let content: string
            if (format === 'timeline text') {
                content = formatStepsAsTimeline(selected.session)
            } else {
                const combined = combineSessionWithAudit(selected.session)
                content = JSON.stringify(combined, null, 2)
            }

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`lexentia-session-${selected.session.id.slice(-8)}.${format === 'timeline text' ? 'md' : 'json'}`),
                filters: format === 'timeline text'
                    ? { 'markdown files': ['md'] }
                    : { 'json files': ['json'] }
            })

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
                void vscode.window.showInformationMessage(`ai actions exported to ${uri.fsPath}`)
            }
        })
    )

    // toggle audit logging command
    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.toggleAuditLog', async () => {
            const current = isAuditEnabled()
            const newValue = !current
            setAuditEnabled(newValue)
            void vscode.window.showInformationMessage(`audit logging ${newValue ? 'enabled' : 'disabled'}`)
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

    context.subscriptions.push(
        vscode.commands.registerCommand('lexentia.inlineEdit', async () => {
            await inlineEditService.triggerInlineEdit()
        })
    )

    // Show status bar items
    statusBarService.show()

    if (vscode.window.registerWebviewPanelSerializer) {
        vscode.window.registerWebviewPanelSerializer('lexentia.chat', {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
                ChatPanel.revive(webviewPanel, context.extensionUri, context)
            }
        })
    }
}

export function deactivate() {}
