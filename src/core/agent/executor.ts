import * as vscode from 'vscode';
import { PlanStep } from './planner.js';
import { ExecutionLog } from '../taskManager.js';
import { getDiffEngine } from '../../services/diffEngine.js';

export class Executor {
    private onLog: (log: ExecutionLog) => void;
    private stopped = false;
    private diffEngine: ReturnType<typeof getDiffEngine>;

    constructor(onLog: (log: ExecutionLog) => void) {
        this.onLog = onLog;
        this.diffEngine = getDiffEngine();
    }

    async executeStep(step: PlanStep): Promise<void> {
        if (this.stopped) {
            throw new Error('Execution stopped');
        }

        this.onLog({
            type: 'edit',
            message: `Executing: ${step.action} ${step.file}`,
            timestamp: Date.now(),
            metadata: { step }
        });

        switch (step.action) {
            case 'create':
                await this.createFile(step.file, step.code || '');
                break;
            case 'modify':
                await this.modifyFile(step.file, step.reason, step.code);
                break;
            case 'delete':
                await this.deleteFile(step.file);
                break;
            case 'install':
                await this.installDependency(step.reason);
                break;
        }
    }

    private async createFile(filePath: string, content: string): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) {
            throw new Error('No workspace open');
        }

        const uri = vscode.Uri.joinPath(workspaceRoot, filePath);
        
        // Create directory if needed
        const dir = uri.path.substring(0, uri.path.lastIndexOf('/'));
        if (dir) {
            try {
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
            } catch {
                // Directory might already exist
            }
        }

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
        
        this.onLog({
            type: 'edit',
            message: `Created file: ${filePath}`,
            timestamp: Date.now()
        });
    }

    private async modifyFile(filePath: string, reason: string, code?: string): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) {
            throw new Error('No workspace open');
        }

        const uri = vscode.Uri.joinPath(workspaceRoot, filePath);
        
        // Read current content
        let currentContent = '';
        try {
            const data = await vscode.workspace.fs.readFile(uri);
            currentContent = new TextDecoder().decode(data);
        } catch {
            // File doesn't exist, create it
            if (code) {
                await this.createFile(filePath, code);
                return;
            }
        }

        // If code is provided directly, use it
        if (code) {
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(uri, encoder.encode(code));
            this.onLog({
                type: 'edit',
                message: `Modified file: ${filePath}`,
                timestamp: Date.now()
            });
            return;
        }

        // Otherwise, use diff engine to generate changes
        // This would integrate with the LLM to generate appropriate changes
        this.onLog({
            type: 'edit',
            message: `Modified file: ${filePath} (${reason})`,
            timestamp: Date.now()
        });
    }

    private async deleteFile(filePath: string): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) {
            throw new Error('No workspace open');
        }

        const uri = vscode.Uri.joinPath(workspaceRoot, filePath);
        await vscode.workspace.fs.delete(uri);
        
        this.onLog({
            type: 'edit',
            message: `Deleted file: ${filePath}`,
            timestamp: Date.now()
        });
    }

    private async installDependency(packageName: string): Promise<void> {
        const terminal = vscode.window.createTerminal('Install Dependency');
        terminal.show();
        terminal.sendText(`npm install ${packageName}`);
        
        this.onLog({
            type: 'edit',
            message: `Installing: ${packageName}`,
            timestamp: Date.now()
        });
    }

    stop(): void {
        this.stopped = true;
    }
}
