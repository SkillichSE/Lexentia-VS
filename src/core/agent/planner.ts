import { OllamaAdapter } from '../../models/OllamaAdapter.js';
import { OpenAICompatibleAdapter } from '../../models/OpenAICompatibleAdapter.js';
import * as vscode from 'vscode';

export interface PlanStep {
    file: string;
    action: 'create' | 'modify' | 'delete' | 'install';
    reason: string;
    code?: string;
}

export interface Plan {
    steps: PlanStep[];
    explanation: string;
}

export interface TaskContext {
    files: string[];
    currentFile?: string;
    imports: string[];
    errors: any[];
    task: string;
}

export class Planner {
    async generatePlan(task: string, context: TaskContext): Promise<Plan> {
        const config = vscode.workspace.getConfiguration('lexentia');
        const provider = config.get<string>('provider', 'ollama');
        const baseUrl = config.get<string>('baseUrl', 'http://127.0.0.1:11434');
        const model = config.get<string>('model', 'llama3.1');
        const apiKey = config.get<string>('apiKey', '');
        
        const prompt = this.buildPrompt(task, context);
        const messages = [
            { role: 'system' as const, content: 'You are a code planning AI. Output strictly valid JSON with no markdown formatting. Plan efficient steps to complete the task.' },
            { role: 'user' as const, content: prompt }
        ];
        
        let response = '';
        if (provider === 'ollama') {
            const adapter = new OllamaAdapter(model, baseUrl);
            response = await adapter.chat(messages);
        } else {
            const adapter = new OpenAICompatibleAdapter(model, baseUrl, apiKey);
            response = await adapter.chat(messages);
        }

        try {
            const plan = this.parseResponse(response);
            return plan;
        } catch (error) {
            console.error('Failed to parse plan:', response);
            // Fallback: simple single-step plan
            return {
                steps: [{
                    file: context.currentFile || 'main.js',
                    action: 'modify',
                    reason: task
                }],
                explanation: 'Fallback plan'
            };
        }
    }

    private buildPrompt(task: string, context: TaskContext): string {
        return `
Task: ${task}

Context:
- Current file: ${context.currentFile || 'none'}
- Related files: ${context.files.join(', ')}
- Imports: ${context.imports.join(', ')}
${context.errors.length > 0 ? `- Errors: ${JSON.stringify(context.errors)}` : ''}

Create a step-by-step execution plan. Output strictly JSON:
{
    "steps": [
        {
            "file": "path/to/file",
            "action": "modify" | "create" | "delete" | "install",
            "reason": "why this step is needed"
        }
    ],
    "explanation": "brief explanation of the approach"
}`;
    }

    private parseResponse(response: string): Plan {
        // Clean up response - remove markdown code blocks if present
        const clean = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        
        return JSON.parse(clean);
    }
}
