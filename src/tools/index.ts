import { toolRegistry } from './registry';
import { terminalTool } from './tools/terminal.tool';
import { filesystemTool } from './tools/filesystem.tool';
import { testTool } from './tools/test.tool';

// Register all tools
export function registerAllTools(): void {
    toolRegistry.registerTool(terminalTool);
    toolRegistry.registerTool(filesystemTool);
    toolRegistry.registerTool(testTool);
}

export { toolRegistry } from './registry';
export { toolExecutor } from './executor';
export type { Tool, ToolInput, ToolResult } from './types';
