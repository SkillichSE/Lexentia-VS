export interface Tool {
    id: string;
    name: string;
    description: string;
    requiredPermissions: string[];
    execute(input: any): Promise<any>;
}

export interface ToolInput {
    [key: string]: any;
}

export interface ToolResult {
    success: boolean;
    output?: string;
    error?: string;
    data?: any;
}
