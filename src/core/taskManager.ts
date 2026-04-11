import * as vscode from 'vscode';
import { Planner, PlanStep } from './agent/planner.js';
import { Executor } from './agent/executor.js';
import { Fixer } from './agent/fixer.js';
import { FixLoop } from './agent/loop.js';
import { ContextCollector } from '../context/collector.js';
import { DependencyGraph } from '../context/dependencyGraph.js';
import { safetyManager } from './safety.js';

export type TaskStatus = 
    | 'idle'
    | 'collecting'
    | 'planning'
    | 'executing'
    | 'running'
    | 'parsing_error'
    | 'fixing'
    | 'success'
    | 'error'
    | 'max_iterations';

export interface Task {
    id: string;
    description: string;
    status: TaskStatus;
    steps: PlanStep[];
    currentStep: number;
    iterations: number;
    logs: ExecutionLog[];
    errors: ParsedError[];
    filesChanged: string[];
    startTime: number;
    endTime?: number;
}

export interface ExecutionLog {
    type: 'plan' | 'edit' | 'run' | 'error' | 'fix' | 'success' | 'info';
    message: string;
    timestamp: number;
    metadata?: any;
}

export interface ParsedError {
    file?: string;
    line?: number;
    column?: number;
    message: string;
    stack?: string;
    severity: 'error' | 'warning';
}

export class TaskManager {
    private currentTask: Task | null = null;
    private planner: Planner;
    private executor: Executor;
    private fixer: Fixer;
    private fixLoop: FixLoop;
    private contextCollector: ContextCollector;
    private dependencyGraph: DependencyGraph;
    private onStatusChange: (task: Task) => void;
    private onLog: (log: ExecutionLog) => void;

    constructor(
        context: vscode.ExtensionContext,
        onStatusChange: (task: Task) => void,
        onLog: (log: ExecutionLog) => void
    ) {
        this.onStatusChange = onStatusChange;
        this.onLog = onLog;
        this.planner = new Planner();
        this.executor = new Executor(onLog);
        this.fixer = new Fixer(onLog);
        this.fixLoop = new FixLoop(onLog);
        this.contextCollector = new ContextCollector();
        this.dependencyGraph = new DependencyGraph();
    }

    async runTask(description: string): Promise<Task> {
        this.currentTask = {
            id: Date.now().toString(),
            description,
            status: 'collecting',
            steps: [],
            currentStep: 0,
            iterations: 0,
            logs: [],
            errors: [],
            filesChanged: [],
            startTime: Date.now()
        };

        this.emitLog('info', `Starting task: ${description}`);
        this.updateStatus('collecting');

        try {
            // 1. Collect context
            const context = await this.contextCollector.collect(description);
            this.emitLog('info', `Context collected: ${context.files.length} files`);

            // Build dependency graph
            await this.dependencyGraph.build(context.files);

            // 2. Planning
            this.updateStatus('planning');
            this.emitLog('plan', 'Generating execution plan...');
            
            const plan = await this.planner.generatePlan(description, context);
            this.currentTask.steps = plan.steps;
            this.emitLog('plan', `Plan created: ${plan.steps.length} steps`);

            // 3. Execute
            this.updateStatus('executing');
            await this.executeSteps();

            // 4. Run & Fix Loop
            await this.runAndFix();

            this.currentTask.endTime = Date.now();
            return this.currentTask;

        } catch (error) {
            this.currentTask.status = 'error';
            this.emitLog('error', `Task failed: ${error}`);
            throw error;
        }
    }

    private async executeSteps(): Promise<void> {
        if (!this.currentTask) return;

        for (let i = 0; i < this.currentTask.steps.length; i++) {
            this.currentTask.currentStep = i;
            const step = this.currentTask.steps[i];
            
            this.emitLog('edit', `Editing ${step.file}...`, { step });
            
            await this.executor.executeStep(step);
            this.currentTask.filesChanged.push(step.file);
            
            this.updateStatus('executing');
        }
    }

    private async runAndFix(): Promise<void> {
        if (!this.currentTask) return;

        const limits = safetyManager.getLimits();
        const maxIterations = limits.maxIterations;
        
        for (let i = 0; i < maxIterations; i++) {
            this.currentTask.iterations = i + 1;
            
            this.updateStatus('running');
            this.emitLog('run', `Running project (iteration ${i + 1})...`);

            const result = await this.fixLoop.runProject();

            if (result.success) {
                this.currentTask.status = 'success';
                this.emitLog('success', 'Task completed successfully!');
                return;
            }

            if (i === maxIterations - 1) {
                this.currentTask.status = 'max_iterations';
                this.emitLog('error', 'Max iterations reached. Manual review needed.');
                return;
            }

            // Parse error and fix
            this.updateStatus('parsing_error');
            const errors = result.errors || [];
            this.currentTask.errors.push(...errors);

            this.updateStatus('fixing');
            this.emitLog('fix', `Fixing ${errors.length} errors...`);

            for (const error of errors) {
                const fix = await this.fixer.generateFix(error, this.currentTask);
                await this.fixer.applyFix(fix);
                this.emitLog('fix', `Fixed: ${error.message}`, { error, fix });
            }
        }
    }

    private updateStatus(status: TaskStatus): void {
        if (this.currentTask) {
            this.currentTask.status = status;
            this.onStatusChange(this.currentTask);
        }
    }

    private emitLog(type: ExecutionLog['type'], message: string, metadata?: any): void {
        const log: ExecutionLog = {
            type,
            message,
            timestamp: Date.now(),
            metadata
        };
        if (this.currentTask) {
            this.currentTask.logs.push(log);
        }
        this.onLog(log);
    }

    getCurrentTask(): Task | null {
        return this.currentTask;
    }

    stop(): void {
        this.fixLoop.stop();
        this.executor.stop();
        if (this.currentTask) {
            this.currentTask.status = 'error';
            this.emitLog('error', 'Task stopped by user');
        }
    }
}
