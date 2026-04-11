import { OllamaAdapter } from '../../models/OllamaAdapter.js';
import { OpenAICompatibleAdapter } from '../../models/OpenAICompatibleAdapter.js';
import * as vscode from 'vscode';
import { ParsedError, Task, ExecutionLog } from '../taskManager.js';

export interface Fix {
    file: string;
    originalCode: string;
    fixedCode: string;
    explanation: string;
}

export class Fixer {
    private onLog: (log: ExecutionLog) => void;

    constructor(onLog: (log: ExecutionLog) => void) {
        this.onLog = onLog;
    }

    async generateFix(error: ParsedError, task: Task): Promise<Fix> {
        const config = vscode.workspace.getConfiguration('lexentia');
        const provider = config.get<string>('provider', 'ollama');
        const baseUrl = config.get<string>('baseUrl', 'http://127.0.0.1:11434');
        const model = config.get<string>('model', 'llama3.1');
        const apiKey = config.get<string>('apiKey', '');
        
        const prompt = this.buildFixPrompt(error, task);
        const messages = [
            { role: 'system' as const, content: 'You are a debugging AI. Analyze the error and provide a fix. Output strictly valid JSON.' },
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
            const fix = this.parseFixResponse(response);
            return fix;
        } catch (parseError) {
            // Fallback fix
            return {
                file: error.file || task.filesChanged[task.filesChanged.length - 1] || 'main.js',
                originalCode: '',
                fixedCode: response,
                explanation: 'Raw fix response'
            };
        }
    }

    async applyFix(fix: Fix): Promise<void> {
        const vscode = await import('vscode');
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) {
            throw new Error('No workspace open');
        }

        const uri = vscode.Uri.joinPath(workspaceRoot, fix.file);
        
        // Read current file
        let currentContent = '';
        try {
            const data = await vscode.workspace.fs.readFile(uri);
            currentContent = new TextDecoder().decode(data);
        } catch {
            throw new Error(`Cannot read file: ${fix.file}`);
        }

        // Apply fix
        let newContent: string;
        if (fix.originalCode) {
            newContent = currentContent.replace(fix.originalCode, fix.fixedCode);
            if (newContent === currentContent) {
                throw new Error('Could not find code to replace');
            }
        } else {
            newContent = fix.fixedCode;
        }

        // Write back
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(newContent));

        this.onLog({
            type: 'fix',
            message: `Applied fix to ${fix.file}: ${fix.explanation}`,
            timestamp: Date.now(),
            metadata: { fix }
        });
    }

    private buildFixPrompt(error: ParsedError, task: Task): string {
        return `
Error:
- File: ${error.file || 'unknown'}
- Line: ${error.line || 'unknown'}
- Message: ${error.message}
- Stack: ${error.stack || 'none'}

Task context:
- Description: ${task.description}
- Files changed: ${task.filesChanged.join(', ')}

Provide a fix for this error. Output JSON:
{
    "file": "path/to/file",
    "originalCode": "code to replace (can be empty for additions)",
    "fixedCode": "replacement code",
    "explanation": "brief explanation"
}`;
    }

    private parseFixResponse(response: string): Fix {
        const clean = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        
        return JSON.parse(clean);
    }
}
