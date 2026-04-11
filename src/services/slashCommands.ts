import * as vscode from 'vscode'
import { createCommit, getDiff, getGitInfo } from './gitService'
import { saveMemory, getMemories, searchMemories, deleteMemory, clearMemories } from './memoryService'
import { indexCodebase, searchCodebase, getIndexedFiles } from './ragService'

type SlashHandler = (args: string) => Promise<string>

interface SlashCommand {
    name: string
    description: string
    handler: SlashHandler
}

const commands: Map<string, SlashCommand> = new Map()

export function registerSlashCommands() {
    commands.set('commit', {
        name: 'commit',
        description: 'create a git commit with message',
        handler: async (args) => {
            const msg = args.trim() || 'update files'
            const ok = await createCommit(msg)
            return ok ? `committed: ${msg}` : 'commit failed'
        }
    })

    commands.set('diff', {
        name: 'diff',
        description: 'show git diff of current changes',
        handler: async () => {
            const diff = await getDiff()
            return diff || 'no changes'
        }
    })

    commands.set('git', {
        name: 'git',
        description: 'show git status information',
        handler: async () => {
            const info = await getGitInfo()
            if (!info) return 'no git repository found'
            return `branch: ${info.branch}
user: ${info.userName} <${info.userEmail}>
modified: ${info.status.modified.length}
staged: ${info.status.staged.length}
untracked: ${info.status.untracked.length}
recent commits:\n${info.recentCommits.join('\n')}`
        }
    })

    commands.set('review', {
        name: 'review',
        description: 'review current changes',
        handler: async () => {
            const diff = await getDiff()
            if (!diff) return 'no changes to review'
            return `please review these changes:\n\n${diff.slice(0, 3000)}`
        }
    })

    commands.set('clear', {
        name: 'clear',
        description: 'clear conversation history',
        handler: async () => {
            return '___clear_history___'
        }
    })

    commands.set('help', {
        name: 'help',
        description: 'show available slash commands',
        handler: async () => {
            const list = Array.from(commands.values())
                .map(c => `/${c.name} - ${c.description}`)
                .join('\n')
            return `available commands:\n${list}`
        }
    })

    commands.set('remember', {
        name: 'remember',
        description: 'save a memory with optional tags (/remember text #tag1 #tag2)',
        handler: async (args) => {
            const text = args.trim()
            if (!text) return 'usage: /remember text #tag1 #tag2'

            const tags: string[] = []
            const content = text.replace(/#(\w+)/g, (_, tag) => {
                tags.push(tag)
                return ''
            }).trim()

            await saveMemory(content, tags)
            return `saved memory with ${tags.length} tags`
        }
    })

    commands.set('recall', {
        name: 'recall',
        description: 'search saved memories (/recall query)',
        handler: async (args) => {
            const query = args.trim()
            if (!query) {
                const all = await getMemories()
                return all.map(m => `[${m.tags.join(', ')}] ${m.content.slice(0, 100)}`).join('\n') || 'no memories'
            }
            const results = await searchMemories(query)
            return results.map(m => `[${m.tags.join(', ')}] ${m.content.slice(0, 100)}`).join('\n') || 'no matches'
        }
    })

    commands.set('index', {
        name: 'index',
        description: 'index codebase for semantic search',
        handler: async () => {
            const count = await indexCodebase()
            return `indexed ${count} code chunks from ${getIndexedFiles().length} files`
        }
    })

    commands.set('search', {
        name: 'search',
        description: 'semantic code search (/search query)',
        handler: async (args) => {
            const query = args.trim()
            if (!query) return 'usage: /search query'
            const results = searchCodebase(query, 5)
            return results.map(r => `${r.chunk.file}:${r.chunk.lineStart}-${r.chunk.lineEnd} (score: ${r.score.toFixed(2)})\n${r.chunk.content.slice(0, 200)}`).join('\n\n---\n\n') || 'no results'
        }
    })

    commands.set('forget', {
        name: 'forget',
        description: 'clear all memories',
        handler: async () => {
            await clearMemories()
            return 'all memories cleared'
        }
    })
}

export function handleSlashCommand(input: string): { isCommand: boolean; result: string } {
    const match = input.match(/^\/([a-z]+)(?:\s+(.*))?$/)
    if (!match) return { isCommand: false, result: '' }

    const [_, name, args = ''] = match
    const cmd = commands.get(name)

    if (!cmd) {
        return { isCommand: true, result: `unknown command: /${name}` }
    }

    return { isCommand: true, result: '___async___' }
}

export async function executeSlashCommand(input: string): Promise<string> {
    const match = input.match(/^\/([a-z]+)(?:\s+(.*))?$/)
    if (!match) return ''

    const [_, name, args = ''] = match
    const cmd = commands.get(name)

    if (!cmd) return `unknown command: /${name}`

    try {
        return await cmd.handler(args)
    } catch (e: any) {
        return `error: ${e?.message || 'command failed'}`
    }
}

export function getSlashCommands(): string[] {
    return Array.from(commands.keys())
}

registerSlashCommands()
