import * as vscode from 'vscode';
import { executeShell } from '../../services/shellService.js';
import { ParsedError } from '../taskManager.js';

export interface RunResult {
    success: boolean;
    exitCode: number;
    logs: string;
    errors?: ParsedError[];
}

export interface ProjectAdapter {
    detect(): Promise<boolean>;
    build(): Promise<RunResult>;
    run(): Promise<RunResult>;
    test(): Promise<RunResult>;
}

export class Runner {
    private adapters: ProjectAdapter[] = [];
    private currentProcess: any = null;
    private workspaceRoot: string;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    async run(): Promise<RunResult> {
        // Detect project type and use appropriate adapter
        const adapter = await this.detectAdapter();
        
        if (!adapter) {
            return {
                success: false,
                exitCode: -1,
                logs: 'Could not detect project type. No package.json, requirements.txt, or other project files found.',
                errors: []
            };
        }

        // Try build first
        const buildResult = await adapter.build();
        if (!buildResult.success) {
            return buildResult;
        }

        // Run the project
        return await adapter.run();
    }

    private async detectAdapter(): Promise<ProjectAdapter | null> {
        if (!this.workspaceRoot) {
            return null;
        }

        // Check for package.json (Node.js)
        try {
            const pkgUri = vscode.Uri.file(`${this.workspaceRoot}/package.json`);
            await vscode.workspace.fs.stat(pkgUri);
            const { NodeAdapter } = await import('./adapters/node.js');
            return new NodeAdapter(this.workspaceRoot);
        } catch {
            // Not a Node.js project
        }

        // Check for requirements.txt (Python)
        try {
            const reqUri = vscode.Uri.file(`${this.workspaceRoot}/requirements.txt`);
            await vscode.workspace.fs.stat(reqUri);
            const { PythonAdapter } = await import('./adapters/python.js');
            return new PythonAdapter(this.workspaceRoot);
        } catch {
            // Not a Python project
        }

        // Check for index.html with Vite config (React/Vite)
        try {
            const viteUri = vscode.Uri.file(`${this.workspaceRoot}/vite.config.ts`);
            await vscode.workspace.fs.stat(viteUri);
            const { ReactAdapter } = await import('./adapters/react.js');
            return new ReactAdapter(this.workspaceRoot);
        } catch {
            // Not a React/Vite project
        }

        return null;
    }

    stop(): void {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = null;
        }
    }
}
