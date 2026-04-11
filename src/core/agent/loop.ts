import { Runner, RunResult } from '../debug/runner.js';
import { ErrorParser } from '../debug/errorParser.js';
import { ExecutionLog } from '../taskManager.js';

export class FixLoop {
    private runner: Runner;
    private errorParser: ErrorParser;
    private onLog: (log: ExecutionLog) => void;
    private stopped = false;

    constructor(onLog: (log: ExecutionLog) => void) {
        this.onLog = onLog;
        this.runner = new Runner();
        this.errorParser = new ErrorParser();
    }

    async runProject(): Promise<RunResult> {
        if (this.stopped) {
            return {
                success: false,
                exitCode: -1,
                logs: 'Execution stopped by user',
                errors: []
            };
        }

        this.onLog({
            type: 'run',
            message: 'Building and running project...',
            timestamp: Date.now()
        });

        const result = await this.runner.run();
        
        if (result.success) {
            this.onLog({
                type: 'success',
                message: 'Build successful!',
                timestamp: Date.now()
            });
        } else {
            this.onLog({
                type: 'error',
                message: `Build failed with exit code ${result.exitCode}`,
                timestamp: Date.now(),
                metadata: { logs: result.logs }
            });

            // Parse errors
            const errors = this.errorParser.parse(result.logs);
            result.errors = errors;

            this.onLog({
                type: 'error',
                message: `Found ${errors.length} errors`,
                timestamp: Date.now(),
                metadata: { errors }
            });
        }

        return result;
    }

    stop(): void {
        this.stopped = true;
        this.runner.stop();
    }
}
