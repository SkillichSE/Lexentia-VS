import * as vscode from 'vscode'
import * as cp from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(cp.exec)

export interface SearchResult {
    file: string
    line: number
    content: string
}

export async function searchInFiles(query: string, pattern?: string): Promise<SearchResult[]> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) throw new Error('no workspace open')

    const results: SearchResult[] = []
    const globPattern = pattern || '**/*'
    const files = await vscode.workspace.findFiles(globPattern, '**/node_modules/**', 1000)

    for (const file of files) {
        try {
            const content = await vscode.workspace.fs.readFile(file)
            const text = new TextDecoder().decode(content)
            const lines = text.split('\n')
            const relPath = vscode.workspace.asRelativePath(file)

            lines.forEach((line, index) => {
                if (line.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        file: relPath,
                        line: index + 1,
                        content: line.trim()
                    })
                }
            })
        } catch {
            // skip files that cannot be read
        }
    }

    return results.slice(0, 50)
}

export async function searchFilesByName(namePattern: string): Promise<string[]> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) throw new Error('no workspace open')

    const files = await vscode.workspace.findFiles(`**/${namePattern}`, '**/node_modules/**', 200)
    return files.map(f => vscode.workspace.asRelativePath(f))
}

export async function grepSearch(query: string, filePattern?: string): Promise<string> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) throw new Error('no workspace open')

    try {
        const pattern = filePattern || '*'
        const { stdout } = await execAsync(
            `rg -n -i --type-add 'custom:${pattern}' -tcustom "${query}" .`,
            { cwd: workspace.uri.fsPath, timeout: 30000 }
        )
        return stdout.slice(0, 5000)
    } catch {
        // fallback to nodejs search if ripgrep not available
        const results = await searchInFiles(query, filePattern)
        return results.map(r => `${r.file}:${r.line}: ${r.content}`).join('\n')
    }
}

export async function getDirectoryTree(path?: string, depth: number = 3): Promise<string> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) throw new Error('no workspace open')

    const targetPath = path || '.'
    const uri = vscode.Uri.joinPath(workspace.uri, targetPath)

    async function buildTree(uri: vscode.Uri, prefix: string, currentDepth: number): Promise<string> {
        if (currentDepth <= 0) return ''

        const entries = await vscode.workspace.fs.readDirectory(uri)
        let result = ''

        const sorted = entries.sort((a, b) => {
            if (a[1] === b[1]) return a[0].localeCompare(b[0])
            return a[1] === vscode.FileType.Directory ? -1 : 1
        })

        for (let i = 0; i < sorted.length; i++) {
            const [name, type] = sorted[i]
            if (name.startsWith('.') && name !== '.gitignore') continue
            if (name === 'node_modules') continue

            const isLast = i === sorted.length - 1
            const connector = isLast ? '└── ' : '├── '
            const newPrefix = prefix + (isLast ? '    ' : '│   ')

            result += prefix + connector + name + '\n'

            if (type === vscode.FileType.Directory && currentDepth > 1) {
                const childUri = vscode.Uri.joinPath(uri, name)
                result += await buildTree(childUri, newPrefix, currentDepth - 1)
            }
        }

        return result
    }

    return await buildTree(uri, '', depth)
}
