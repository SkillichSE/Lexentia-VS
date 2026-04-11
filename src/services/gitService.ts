import * as cp from 'child_process'
import { promisify } from 'util'
import * as vscode from 'vscode'

const execAsync = promisify(cp.exec)

export interface GitInfo {
    branch: string
    userName: string
    userEmail: string
    mainBranch: string
    recentCommits: string[]
    status: GitStatus
}

export interface GitStatus {
    modified: string[]
    staged: string[]
    untracked: string[]
}

export async function getGitInfo(): Promise<GitInfo | null> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) return null

    try {
        const cwd = workspace.uri.fsPath

        const { stdout: branch } = await execAsync('git branch --show-current', { cwd })
        const { stdout: userName } = await execAsync('git config user.name', { cwd }).catch(() => ({ stdout: '' }))
        const { stdout: userEmail } = await execAsync('git config user.email', { cwd }).catch(() => ({ stdout: '' }))
        const { stdout: mainBranch } = await execAsync('git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo main', { cwd }).catch(() => ({ stdout: 'main' }))
        const { stdout: log } = await execAsync('git log --oneline -5', { cwd }).catch(() => ({ stdout: '' }))

        const status = await getGitStatus()

        return {
            branch: branch.trim(),
            userName: userName.trim(),
            userEmail: userEmail.trim(),
            mainBranch: mainBranch.replace('origin/', '').trim() || 'main',
            recentCommits: log.split('\n').filter(Boolean),
            status
        }
    } catch {
        return null
    }
}

export async function getGitStatus(): Promise<GitStatus> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) return { modified: [], staged: [], untracked: [] }

    try {
        const cwd = workspace.uri.fsPath
        const { stdout: modified } = await execAsync('git diff --name-only', { cwd }).catch(() => ({ stdout: '' }))
        const { stdout: staged } = await execAsync('git diff --cached --name-only', { cwd }).catch(() => ({ stdout: '' }))
        const { stdout: untracked } = await execAsync('git ls-files --others --exclude-standard', { cwd }).catch(() => ({ stdout: '' }))

        return {
            modified: modified.split('\n').filter(Boolean),
            staged: staged.split('\n').filter(Boolean),
            untracked: untracked.split('\n').filter(Boolean)
        }
    } catch {
        return { modified: [], staged: [], untracked: [] }
    }
}

export async function createCommit(message: string): Promise<boolean> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) return false

    try {
        const cwd = workspace.uri.fsPath
        await execAsync(`git add -A && git commit -m "${message.replace(/"/g, '\"')}"`, { cwd })
        return true
    } catch {
        return false
    }
}

export async function getDiff(): Promise<string> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) return ''

    try {
        const cwd = workspace.uri.fsPath
        const { stdout } = await execAsync('git diff', { cwd })
        return stdout.slice(0, 10000)
    } catch {
        return ''
    }
}
