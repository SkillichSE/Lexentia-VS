import * as vscode from 'vscode';
import * as path from 'path';

export interface CollectedContext {
    files: string[];
    currentFile?: string;
    imports: string[];
    errors: any[];
    task: string;
    selectedCode?: string;
}

export class ContextCollector {
    async collect(task: string): Promise<CollectedContext> {
        const context: CollectedContext = {
            files: [],
            imports: [],
            errors: [],
            task
        };

        // Get current file
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            context.currentFile = activeEditor.document.fileName;
            context.selectedCode = activeEditor.selection.isEmpty 
                ? undefined 
                : activeEditor.document.getText(activeEditor.selection);
        }

        // Get related files from workspace
        context.files = await this.findRelatedFiles(context.currentFile);

        // Get imports from current file
        if (context.currentFile) {
            context.imports = await this.extractImports(context.currentFile);
        }

        // Get errors from current file
        context.errors = await this.getCurrentErrors();

        return context;
    }

    private async findRelatedFiles(currentFile?: string): Promise<string[]> {
        const files: string[] = [];
        
        if (!vscode.workspace.workspaceFolders) {
            return files;
        }

        // Add current file and its directory
        if (currentFile) {
            files.push(currentFile);
            const dir = path.dirname(currentFile);
            
            // Find files in the same directory
            const pattern = new vscode.RelativePattern(dir, '*.{ts,js,tsx,jsx,py}');
            const nearbyFiles = await vscode.workspace.findFiles(pattern, null, 10);
            files.push(...nearbyFiles.map(f => f.fsPath));
        }

        // Find package.json if exists
        const pkgFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 1);
        if (pkgFiles.length > 0) {
            files.push(pkgFiles[0].fsPath);
        }

        // Find tsconfig.json or jsconfig.json
        const configFiles = await vscode.workspace.findFiles('**/tsconfig.json', null, 1);
        if (configFiles.length > 0) {
            files.push(configFiles[0].fsPath);
        }

        // Remove duplicates
        return [...new Set(files)];
    }

    private async extractImports(filePath: string): Promise<string[]> {
        try {
            const uri = vscode.Uri.file(filePath);
            const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
            
            const imports: string[] = [];
            
            // ES6 imports
            const es6Pattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
            let match;
            while ((match = es6Pattern.exec(content)) !== null) {
                imports.push(match[1]);
            }

            // CommonJS requires
            const cjsPattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            while ((match = cjsPattern.exec(content)) !== null) {
                imports.push(match[1]);
            }

            // Python imports
            const pyPattern = /^(?:from|import)\s+([\w.]+)/gm;
            while ((match = pyPattern.exec(content)) !== null) {
                imports.push(match[1]);
            }

            return imports;
        } catch {
            return [];
        }
    }

    private async getCurrentErrors(): Promise<any[]> {
        const diagnostics = vscode.languages.getDiagnostics();
        const errors: any[] = [];

        for (const [uri, fileDiagnostics] of diagnostics) {
            for (const diagnostic of fileDiagnostics) {
                if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
                    errors.push({
                        file: uri.fsPath,
                        line: diagnostic.range.start.line,
                        message: diagnostic.message,
                        code: diagnostic.code
                    });
                }
            }
        }

        return errors;
    }
}
