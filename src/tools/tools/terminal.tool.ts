import { Tool } from '../types';
import { executeShell } from '../../services/shellService';

export const terminalTool: Tool = {
    id: 'terminal',
    name: 'Terminal',
    description: 'Execute shell commands',
    requiredPermissions: ['terminal'],
    async execute(input: { command: string; cwd?: string }): Promise<string> {
        const result = await executeShell(input.command, input.cwd);
        if (result.exitCode !== 0) {
            throw new Error(result.stderr || `Command failed with exit code ${result.exitCode}`);
        }
        return result.stdout;
    }
};
