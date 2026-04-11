import * as vscode from 'vscode'

export async function getDiagnostics(filePath?: string): Promise<vscode.Diagnostic[]> {
    if (filePath) {
        const uri = vscode.Uri.file(filePath)
        return vscode.languages.getDiagnostics(uri)
    }
    const all = vscode.languages.getDiagnostics()
    return all.flatMap(([_, diags]) => diags)
}

export async function goToDefinition(filePath: string, line: number, char: number): Promise<vscode.Location[]> {
    const uri = vscode.Uri.file(filePath)
    const position = new vscode.Position(line, char)
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        uri,
        position
    )
    return locations || []
}

export async function findReferences(filePath: string, line: number, char: number): Promise<vscode.Location[]> {
    const uri = vscode.Uri.file(filePath)
    const position = new vscode.Position(line, char)
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        position
    )
    return locations || []
}

export async function getCompletions(filePath: string, line: number, char: number): Promise<vscode.CompletionItem[]> {
    const uri = vscode.Uri.file(filePath)
    const position = new vscode.Position(line, char)
    const items = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        uri,
        position
    )
    return items?.items || []
}

export async function getHoverInfo(filePath: string, line: number, char: number): Promise<vscode.Hover[]> {
    const uri = vscode.Uri.file(filePath)
    const position = new vscode.Position(line, char)
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        position
    )
    return hovers || []
}

export function formatDiagnostics(diags: vscode.Diagnostic[]): string {
    return diags.map(d => {
        const severity = d.severity === vscode.DiagnosticSeverity.Error ? 'error' :
                        d.severity === vscode.DiagnosticSeverity.Warning ? 'warning' :
                        d.severity === vscode.DiagnosticSeverity.Information ? 'info' : 'hint'
        return `[${severity}] line ${d.range.start.line + 1}: ${d.message}`
    }).join('\n')
}
