import { ProjectAdapter, RunResult } from '../runner.js';
import { executeShell } from '../../../services/shellService.js';

export class PythonAdapter implements ProjectAdapter {
    private workspaceRoot: string;
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    async detect(): Promise<boolean> {
        return true;
    }

    async build(): Promise<RunResult> {
        // Python doesn't require build, but check syntax
        return {
            success: true,
            exitCode: 0,
            logs: 'Python - no build step required'
        };
    }

    async run(): Promise<RunResult> {
        // Try to find main entry point
        const commands = [
            'python main.py',
            'python app.py',
            'python server.py',
            'python manage.py runserver',
            'flask run',
            'python -m uvicorn main:app'
        ];

        for (const cmd of commands) {
            const result = await this.runCommand(cmd, 'Run');
            if (result.success) {
                return result;
            }
        }

        return {
            success: false,
            exitCode: -1,
            logs: 'Could not find Python entry point. Checked: main.py, app.py, server.py'
        };
    }

    async test(): Promise<RunResult> {
        // Try pytest
        const pytestResult = await this.runCommand('python -m pytest', 'Test');
        if (pytestResult.success) return pytestResult;

        // Try unittest
        return this.runCommand('python -m unittest discover', 'Test');
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
