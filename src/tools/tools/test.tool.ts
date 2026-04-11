import { Tool } from '../types';
import { executeShell } from '../../services/shellService';

interface TestResult {
    success: boolean;
    output: string;
    passed?: number;
    failed?: number;
}

export const testTool: Tool = {
    id: 'test',
    name: 'Test Runner',
    description: 'Run npm test and parse results',
    requiredPermissions: ['tests', 'terminal'],
    async execute(input: { cwd?: string }): Promise<TestResult> {
        const result = await executeShell('npm test', input.cwd);

        // Parse test results
        const output = result.stdout + '\n' + result.stderr;
        const passedMatch = output.match(/(\d+) passing/);
        const failedMatch = output.match(/(\d+) failing/);

        return {
            success: result.exitCode === 0,
            output: output,
            passed: passedMatch ? parseInt(passedMatch[1], 10) : undefined,
            failed: failedMatch ? parseInt(failedMatch[1], 10) : undefined
        };
    }
};
