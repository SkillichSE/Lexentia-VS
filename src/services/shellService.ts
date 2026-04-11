import * as cp from 'child_process'
import { promisify } from 'util'
import * as vscode from 'vscode'

const execAsync = promisify(cp.exec)

export interface ShellResult {
    stdout: string
    stderr: string
    exitCode: number
}

export async function executeShell(
    command: string,
    cwd?: string,
    timeout: number = 30000
): Promise<ShellResult> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    const workingDir = cwd || workspace?.uri.fsPath || process.cwd()

    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: workingDir,
            timeout,
            maxBuffer: 1024 * 1024 // 1mb
        })
        return {
            stdout: stdout.slice(0, 10000),
            stderr: stderr.slice(0, 5000),
            exitCode: 0
        }
    } catch (error: any) {
        return {
            stdout: error.stdout?.slice(0, 10000) || '',
            stderr: error.stderr?.slice(0, 5000) || '',
            exitCode: error.code || 1
        }
    }
}

export async function executePowershell(
    command: string,
    cwd?: string,
    timeout: number = 30000
): Promise<ShellResult> {
    const workspace = vscode.workspace.workspaceFolders?.[0]
    const workingDir = cwd || workspace?.uri.fsPath || process.cwd()

    try {
        const { stdout, stderr } = await execAsync(
            `powershell -Command "${command.replace(/"/g, '\"')}"`,
            {
                cwd: workingDir,
                timeout,
                maxBuffer: 1024 * 1024
            }
        )
        return {
            stdout: stdout.slice(0, 10000),
            stderr: stderr.slice(0, 5000),
            exitCode: 0
        }
    } catch (error: any) {
        return {
            stdout: error.stdout?.slice(0, 10000) || '',
            stderr: error.stderr?.slice(0, 5000) || '',
            exitCode: error.code || 1
        }
    }
}

export function getShellInfo(): string {
    const platform = process.platform
    if (platform === 'win32') {
        return 'powershell/cmd.exe'
    } else if (platform === 'darwin') {
        return 'zsh/bash'
    } else {
        return 'bash'
    }
}
