import { ParsedError } from '../taskManager.js';

export class ErrorParser {
    parse(logs: string): ParsedError[] {
        const errors: ParsedError[] = [];
        const lines = logs.split('\n');

        // Node.js / TypeScript errors
        const nodeErrorPattern = /^(?:.+\\|\/)?([^:\\]+):(\d+):(\d+)?\s*[-\]]?\s*(Error|Warning|TypeError|ReferenceError|SyntaxError)[\s:]*(.*)$/i;
        
        // Python errors
        const pythonErrorPattern = /File\s+"([^"]+)",\s+line\s+(\d+)/i;
        const pythonErrorTypePattern = /^(\w+Error):\s*(.*)$/;

        // General stack trace
        const stackPattern = /at\s+.*?\s*\((?:.+\\|\/)?([^:)]+):(\d+):(\d+)\)/;

        let currentError: Partial<ParsedError> | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Try Node.js/TypeScript pattern
            const nodeMatch = line.match(nodeErrorPattern);
            if (nodeMatch) {
                if (currentError && currentError.message) {
                    errors.push(currentError as ParsedError);
                }
                currentError = {
                    file: nodeMatch[1],
                    line: parseInt(nodeMatch[2], 10),
                    column: nodeMatch[3] ? parseInt(nodeMatch[3], 10) : undefined,
                    severity: nodeMatch[4].toLowerCase() === 'warning' ? 'warning' : 'error',
                    message: nodeMatch[5] || line,
                    stack: line
                };
                continue;
            }

            // Try Python pattern
            const pythonMatch = line.match(pythonErrorPattern);
            if (pythonMatch) {
                if (currentError && currentError.message) {
                    errors.push(currentError as ParsedError);
                }
                currentError = {
                    file: pythonMatch[1],
                    line: parseInt(pythonMatch[2], 10),
                    severity: 'error',
                    message: line,
                    stack: line
                };
                continue;
            }

            // Try Python error type
            const pythonTypeMatch = line.match(pythonErrorTypePattern);
            if (pythonTypeMatch && currentError) {
                currentError.message = `${pythonTypeMatch[1]}: ${pythonTypeMatch[2]}`;
                continue;
            }

            // Try stack trace pattern
            const stackMatch = line.match(stackPattern);
            if (stackMatch && currentError) {
                if (!currentError.stack) {
                    currentError.stack = '';
                }
                currentError.stack += '\n' + line;
                continue;
            }

            // Accumulate message if we're in an error context
            if (currentError && line.trim() && !line.startsWith(' ')) {
                errors.push(currentError as ParsedError);
                currentError = null;
            }
        }

        // Don't forget the last error
        if (currentError && currentError.message) {
            errors.push(currentError as ParsedError);
        }

        return errors;
    }
}
