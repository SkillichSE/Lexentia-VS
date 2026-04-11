import { Tool, ToolInput, ToolResult } from './types';
import { toolRegistry } from './registry';
import { permissionsManager } from '../permissions/manager';

export class ToolExecutor {
    async executeTool(toolId: string, input: ToolInput): Promise<ToolResult> {
        const tool = toolRegistry.getTool(toolId);
        if (!tool) {
            return {
                success: false,
                error: `Tool not found: ${toolId}`
            };
        }

        // Check permissions
        for (const permission of tool.requiredPermissions) {
            if (!permissionsManager.allow(permission)) {
                return {
                    success: false,
                    error: `Permission denied: ${permission}`
                };
            }
        }

        try {
            const result = await tool.execute(input);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            return {
                success: false,
                error: String(error)
            };
        }
    }
}

export const toolExecutor = new ToolExecutor();
