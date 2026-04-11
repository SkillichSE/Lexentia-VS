import * as vscode from 'vscode'

export interface MCPServer {
    id: string
    name: string
    url: string
    connected: boolean
}

const mcpServers: Map<string, MCPServer> = new Map()

export async function connectMCPServer(id: string, url: string): Promise<boolean> {
    try {
        const response = await fetch(`${url}/health`, { method: 'GET' })
        const connected = response.ok
        mcpServers.set(id, { id, name: id, url, connected })
        return connected
    } catch {
        mcpServers.set(id, { id, name: id, url, connected: false })
        return false
    }
}

export function disconnectMCPServer(id: string): void {
    mcpServers.delete(id)
}

export function getMCPServers(): MCPServer[] {
    return Array.from(mcpServers.values())
}

export async function callMCPTool(serverId: string, toolName: string, args: any): Promise<string> {
    const server = mcpServers.get(serverId)
    if (!server || !server.connected) {
        throw new Error('mcp server not connected')
    }

    try {
        const response = await fetch(`${server.url}/tools/${toolName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args)
        })

        if (!response.ok) {
            throw new Error(`mcp tool call failed: ${response.status}`)
        }

        const result = await response.json()
        return JSON.stringify(result)
    } catch (e: any) {
        throw new Error(`mcp tool error: ${e?.message}`)
    }
}

export async function getMCPResources(serverId: string): Promise<any[]> {
    const server = mcpServers.get(serverId)
    if (!server || !server.connected) {
        return []
    }

    try {
        const response = await fetch(`${server.url}/resources`)
        if (!response.ok) return []
        return await response.json()
    } catch {
        return []
    }
}
