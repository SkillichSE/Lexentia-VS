import { ProjectAdapter, RunResult } from '../runner.js';
import { executeShell } from '../../../services/shellService.js';

export class ReactAdapter implements ProjectAdapter {
    private workspaceRoot: string;
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    async detect(): Promise<boolean> {
        return true;
    }

    async build(): Promise<RunResult> {
        // Vite or CRA build
        const viteResult = await this.runCommand('npm run build', 'Build');
        if (viteResult.success) return viteResult;

        return this.runCommand('npx vite build', 'Build');
    }

    async run(): Promise<RunResult> {
        // Try vite dev server first
        const viteResult = await this.runCommand('npm run dev', 'Dev Server');
        if (viteResult.success) return viteResult;

        // Try CRA
        const craResult = await this.runCommand('npm start', 'Start');
        if (craResult.success) return craResult;

        // Fallback to vite directly
        return this.runCommand('npx vite', 'Vite Dev');
    }

    async test(): Promise<RunResult> {
        return this.runCommand('npm test', 'Test');
    }

    private async runCommand(command: string, label: string): Promise<RunResult> {
        try {
            const result = await executeShell(command, this.workspaceRoot);
            
            return {
                success: result.exitCode === 0,
                exitCode: result.exitCode,
                logs: result.stdout + (result.stderr ? '\n' + result.stderr : '')
            };
        } catch (error) {
            return {
                success: false,
                exitCode: -1,
                logs: String(error)
            };
        }
    }
}
