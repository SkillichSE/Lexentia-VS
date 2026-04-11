export interface SafetyLimits {
    maxIterations: number;
    maxFiles: number;
    timeout: number; // seconds
    allowedCommands: string[];
}

const defaultLimits: SafetyLimits = {
    maxIterations: 3,
    maxFiles: 5,
    timeout: 10,
    allowedCommands: [
        'npm install',
        'npm ci',
        'npm run build',
        'npm test',
        'npm start',
        'npm run dev'
    ]
};

class SafetyManager {
    private limits: SafetyLimits = { ...defaultLimits };

    getLimits(): SafetyLimits {
        return { ...this.limits };
    }

    setLimits(limits: Partial<SafetyLimits>): void {
        this.limits = { ...this.limits, ...limits };
    }

    checkCommand(command: string): boolean {
        const baseCommand = command.trim().split(' ')[0];
        return this.limits.allowedCommands.some(cmd =>
            command.startsWith(cmd) || cmd.startsWith(baseCommand)
        );
    }

    validateIteration(current: number): boolean {
        return current < this.limits.maxIterations;
    }

    validateFileCount(count: number): boolean {
        return count <= this.limits.maxFiles;
    }

    withTimeout<T>(promise: Promise<T>): Promise<T> {
        const timeoutPromise = new Promise<T>((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Operation timed out after ${this.limits.timeout}s`));
            }, this.limits.timeout * 1000);
        });
        return Promise.race([promise, timeoutPromise]);
    }
}

export const safetyManager = new SafetyManager();
