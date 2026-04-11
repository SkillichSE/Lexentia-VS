import * as vscode from 'vscode'

export interface Memory {
    id: string
    content: string
    tags: string[]
    createdAt: number
}

const STORAGE_KEY = 'lexentia.memories'

export async function saveMemory(content: string, tags: string[] = []): Promise<Memory> {
    const memory: Memory = {
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        content,
        tags,
        createdAt: Date.now()
    }

    const config = vscode.workspace.getConfiguration('lexentia')
    const memories = config.get<Memory[]>(STORAGE_KEY, [])
    memories.push(memory)
    await config.update(STORAGE_KEY, memories, true)

    return memory
}

export async function getMemories(): Promise<Memory[]> {
    const config = vscode.workspace.getConfiguration('lexentia')
    return config.get<Memory[]>(STORAGE_KEY, [])
}

export async function searchMemories(query: string): Promise<Memory[]> {
    const memories = await getMemories()
    const q = query.toLowerCase()
    return memories.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
    )
}

export async function deleteMemory(id: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('lexentia')
    const memories = config.get<Memory[]>(STORAGE_KEY, [])
    const filtered = memories.filter(m => m.id !== id)
    await config.update(STORAGE_KEY, filtered, true)
}

export async function clearMemories(): Promise<void> {
    const config = vscode.workspace.getConfiguration('lexentia')
    await config.update(STORAGE_KEY, [], true)
}
