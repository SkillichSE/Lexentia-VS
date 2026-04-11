import * as vscode from 'vscode';
import * as path from 'path';

export interface FileNode {
    path: string;
    imports: string[];
    dependents: string[];
}

export class DependencyGraph {
    private graph: Map<string, FileNode> = new Map();

    async build(files: string[]): Promise<void> {
        this.graph.clear();

        // Create nodes for all files
        for (const file of files) {
            const node: FileNode = {
                path: file,
                imports: await this.extractImports(file),
                dependents: []
            };
            this.graph.set(file, node);
        }

        // Build dependency links
        for (const [filePath, node] of this.graph) {
            for (const imp of node.imports) {
                const resolved = this.resolveImport(filePath, imp);
                if (resolved && this.graph.has(resolved)) {
                    const dependency = this.graph.get(resolved)!;
                    dependency.dependents.push(filePath);
                }
            }
        }
    }

    getAffectedFiles(changedFile: string): string[] {
        const affected: Set<string> = new Set();
        const visited: Set<string> = new Set();

        const visit = (file: string) => {
            if (visited.has(file)) return;
            visited.add(file);

            const node = this.graph.get(file);
            if (!node) return;

            for (const dependent of node.dependents) {
                affected.add(dependent);
                visit(dependent);
            }
        };

        visit(changedFile);
        return [...affected];
    }

    getDependencies(file: string): string[] {
        const node = this.graph.get(file);
        return node?.imports || [];
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
                imports.push(this.normalizePath(match[1]));
            }

            // CommonJS requires
            const cjsPattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            while ((match = cjsPattern.exec(content)) !== null) {
                imports.push(this.normalizePath(match[1]));
            }

            return imports;
        } catch {
            return [];
        }
    }

    private resolveImport(fromFile: string, importPath: string): string | null {
        const dir = path.dirname(fromFile);
        
        // Try relative path resolution
        if (importPath.startsWith('.')) {
            const resolved = path.resolve(dir, importPath);
            
            // Try with extensions
            const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', ''];
            for (const ext of extensions) {
                const fullPath = resolved + ext;
                if (this.graph.has(fullPath)) {
                    return fullPath;
                }
                // Try index files
                const indexPath = path.join(resolved, `index${ext}`);
                if (this.graph.has(indexPath)) {
                    return indexPath;
                }
            }
        }

        // For non-relative imports, try to match by filename
        const importName = path.basename(importPath);
        for (const [filePath] of this.graph) {
            if (path.basename(filePath, path.extname(filePath)) === importName) {
                return filePath;
            }
        }

        return null;
    }

    private normalizePath(p: string): string {
        return p.replace(/\\/g, '/');
    }
}
