import * as vscode from 'vscode';
import { Tool } from '../types';

export const filesystemTool: Tool = {
    id: 'filesystem',
    name: 'File System',
    description: 'Read and write files',
    requiredPermissions: ['filesystem'],
    async execute(input: { action: 'read' | 'write' | 'delete'; path: string; content?: string }): Promise<string | void> {
        const uri = vscode.Uri.file(input.path);

        switch (input.action) {
            case 'read': {
                const content = await vscode.workspace.fs.readFile(uri);
                return Buffer.from(content).toString('utf-8');
            }
            case 'write': {
                if (input.content === undefined) {
                    throw new Error('Content required for write action');
                }
                await vscode.workspace.fs.writeFile(uri, Buffer.from(input.content, 'utf-8'));
                return;
            }
            case 'delete': {
                await vscode.workspace.fs.delete(uri);
                return;
            }
            default:
                throw new Error(`Unknown action: ${input.action}`);
        }
    }
};
