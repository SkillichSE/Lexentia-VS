/**
 * intent classification service for smart chat
 * determines what context is needed based on user query
 * all comments in english lowercase only
 */

import { IntentClassification, IntentType } from './aiActionsTypes'

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
    general_chat: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'thanks', 'thank you', 'bye', 'how are you'],
    code_explain: ['explain', 'what does', 'how does', 'what is', 'describe', 'tell me about', 'clarify'],
    code_edit: ['edit', 'change', 'update', 'modify', 'fix', 'rename', 'move', 'refactor'],
    code_generate: ['create', 'generate', 'write', 'implement', 'build', 'make', 'add', 'new'],
    code_review: ['review', 'check', 'analyze', 'inspect', 'evaluate', 'assess'],
    debug_help: ['debug', 'error', 'bug', 'issue', 'problem', 'fail', 'crash', 'broken', 'not working'],
    refactor: ['refactor', 'restructure', 'organize', 'clean up', 'simplify', 'optimize', 'improve'],
    test_generate: ['test', 'testing', 'unit test', 'spec', 'jest', 'vitest', 'coverage']
}

export function classifyIntent(query: string): IntentClassification {
    const lowerQuery = query.toLowerCase().trim()
    const words = lowerQuery.split(/\s+/)

    const scores: Record<IntentType, number> = {
        general_chat: 0,
        code_explain: 0,
        code_edit: 0,
        code_generate: 0,
        code_review: 0,
        debug_help: 0,
        refactor: 0,
        test_generate: 0
    }

    // keyword matching with weight
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
        for (const keyword of keywords) {
            if (lowerQuery.includes(keyword)) {
                scores[intent as IntentType] += 1
                // bonus for exact phrase match at start
                if (lowerQuery.startsWith(keyword)) {
                    scores[intent as IntentType] += 0.5
                }
            }
        }
    }

    // check for code patterns (function names, file extensions)
    const hasCodePattern = /[a-z_][a-z0-9_]*\s*\(|\.[a-z]+\(|=>|function|class|const|let|var/.test(query)
    if (hasCodePattern) {
        scores.code_explain += 0.3
        scores.code_edit += 0.3
        scores.debug_help += 0.2
    }

    // check for file references
    const hasFileRef = /[a-z0-9_\-]+\.(ts|js|py|json|md|css|html)/i.test(query)
    if (hasFileRef) {
        scores.code_explain += 0.4
        scores.code_edit += 0.4
        scores.code_review += 0.3
    }

    // find best match
    let bestIntent: IntentType = 'general_chat'
    let bestScore = scores.general_chat

    for (const [intent, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score
            bestIntent = intent as IntentType
        }
    }

    // calculate confidence
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0)
    const confidence = totalScore > 0 ? bestScore / totalScore : 0.5

    // determine context scope based on intent
    const contextScope = getContextScope(bestIntent, hasCodePattern, hasFileRef)

    // determine if context is required
    const requiresContext = bestIntent !== 'general_chat' && contextScope !== 'none'

    return {
        intent: bestIntent,
        confidence: Math.min(confidence, 1),
        requiresContext,
        contextScope,
        reasoning: buildReasoning(bestIntent, bestScore, hasCodePattern, hasFileRef)
    }
}

function getContextScope(
    intent: IntentType,
    hasCodePattern: boolean,
    hasFileRef: boolean
): 'none' | 'current_file' | 'related_files' | 'full_project' {
    if (intent === 'general_chat') {
        return 'none'
    }

    if (hasFileRef) {
        return 'current_file'
    }

    if (intent === 'debug_help' || intent === 'refactor') {
        return 'related_files'
    }

    if (intent === 'code_review' && !hasCodePattern) {
        return 'full_project'
    }

    if (hasCodePattern) {
        return 'current_file'
    }

    return 'current_file'
}

function buildReasoning(
    intent: IntentType,
    score: number,
    hasCodePattern: boolean,
    hasFileRef: boolean
): string {
    const parts: string[] = []
    parts.push(`detected intent: ${intent.replace('_', ' ')}`)

    if (score > 0) {
        parts.push(`keyword match score: ${score.toFixed(2)}`)
    }

    if (hasCodePattern) {
        parts.push('detected code patterns in query')
    }

    if (hasFileRef) {
        parts.push('detected file references')
    }

    return parts.join('; ')
}

export function shouldGatherContext(classification: IntentClassification): boolean {
    return classification.requiresContext && classification.confidence > 0.3
}
