import { Tool } from './types';

class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    registerTool(tool: Tool): void {
        this.tools.set(tool.id, tool);
    }

    getTool(id: string): Tool | undefined {
        return this.tools.get(id);
    }

    listTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    hasTool(id: string): boolean {
        return this.tools.has(id);
    }
}

export const toolRegistry = new ToolRegistry();
