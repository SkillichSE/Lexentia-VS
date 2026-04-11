import { ProjectAdapter, RunResult } from '../runner.js';
import { executeShell } from '../../../services/shellService.js';

export class NodeAdapter implements ProjectAdapter {
    private workspaceRoot: string;
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    async detect(): Promise<boolean> {
        // Already detected by file existence check
        return true;
    }

    async build(): Promise<RunResult> {
        return this.runCommand('npm run build', 'Build');
    }

    async run(): Promise<RunResult> {
        // Try different run commands
        const commands = [
            'npm start',
            'npm run dev',
            'node index.js',
            'node server.js',
            'node app.js'
        ];

        for (const cmd of commands) {
            const result = await this.runCommand(cmd, 'Run');
            if (result.success || result.logs.includes('listening') || result.logs.includes('started')) {
                return result;
            }
        }

        return {
            success: false,
            exitCode: -1,
            logs: 'Could not start Node.js project. No valid start command found.'
        };
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
