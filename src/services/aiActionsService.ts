/**
 * ai actions visualization service
 * tracks and manages ai thinking steps in real-time
 * all comments in english lowercase only
 */

import {
    AiActionSession,
    AiActionStep,
    AiActionStepType,
    ContextChip,
    IntentClassification
} from './aiActionsTypes'

const sessions: Map<string, AiActionSession> = new Map()
const listeners: Set<(session: AiActionSession) => void> = new Set()

export function createSession(userQuery: string): string {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const session: AiActionSession = {
        id,
        userQuery,
        startTime: Date.now(),
        steps: []
    }
    sessions.set(id, session)
    notifyListeners(session)
    return id
}

export function addStep(
    sessionId: string,
    type: AiActionStepType,
    label: string,
    metadata: Record<string, any> = {}
): string {
    const session = sessions.get(sessionId)
    if (!session) return ''

    const stepId = `${sessionId}-${type}-${session.steps.length}`
    const step: AiActionStep = {
        id: stepId,
        type,
        label,
        status: 'running',
        startTime: Date.now(),
        metadata
    }

    session.steps.push(step)
    session.currentStepId = stepId
    notifyListeners(session)
    return stepId
}

export function completeStep(
    sessionId: string,
    stepId: string,
    additionalMetadata: Record<string, any> = {}
): void {
    const session = sessions.get(sessionId)
    if (!session) return

    const step = session.steps.find(s => s.id === stepId)
    if (!step) return

    step.status = 'complete'
    step.endTime = Date.now()
    step.duration = step.endTime - step.startTime
    step.metadata = { ...step.metadata, ...additionalMetadata }

    notifyListeners(session)
}

export function errorStep(
    sessionId: string,
    stepId: string,
    error: string
): void {
    const session = sessions.get(sessionId)
    if (!session) return

    const step = session.steps.find(s => s.id === stepId)
    if (!step) return

    step.status = 'error'
    step.endTime = Date.now()
    step.duration = step.endTime - step.startTime
    step.metadata.error = error

    notifyListeners(session)
}

export function updateStepMetadata(
    sessionId: string,
    stepId: string,
    metadata: Record<string, any>
): void {
    const session = sessions.get(sessionId)
    if (!session) return

    const step = session.steps.find(s => s.id === stepId)
    if (!step) return

    step.metadata = { ...step.metadata, ...metadata }
    notifyListeners(session)
}

export function completeSession(sessionId: string, finalResponse: string): void {
    const session = sessions.get(sessionId)
    if (!session) return

    session.endTime = Date.now()
    session.finalResponse = finalResponse

    // complete any running steps
    for (const step of session.steps) {
        if (step.status === 'running') {
            step.status = 'complete'
            step.endTime = Date.now()
            step.duration = step.endTime - step.startTime
        }
    }

    notifyListeners(session)
}

export function getSession(sessionId: string): AiActionSession | undefined {
    return sessions.get(sessionId)
}

export function getAllSessions(): AiActionSession[] {
    return Array.from(sessions.values())
    .sort((a, b) => b.startTime - a.startTime)
}

export function combineSessionWithAudit(session: AiActionSession): any {
    // import from audit service to avoid circular dependency
    const { getEntriesForSession } = require('./auditService')
    const entries = getEntriesForSession(session.id)

    return {
        session: {
            id: session.id,
            userQuery: session.userQuery,
            startTime: session.startTime,
            endTime: session.endTime,
            duration: session.endTime ? session.endTime - session.startTime : undefined,
            steps: session.steps
        },
        auditEntries: entries.map((e: any) => ({
            type: e.type,
            timestamp: e.timestamp,
            stepId: e.stepId,
            contentPreview: e.content.slice(0, 200),
            metadata: e.metadata
        }))
    }
}

export function deleteSession(sessionId: string): void {
    sessions.delete(sessionId)
}

export function subscribeToUpdates(callback: (session: AiActionSession) => void): () => void {
    listeners.add(callback)
    return () => listeners.delete(callback)
}

function notifyListeners(session: AiActionSession): void {
    for (const listener of listeners) {
        listener(session)
    }
}

export function createContextGatheringStep(
    sessionId: string,
    chips: ContextChip[]
): string {
    const stepId = addStep(sessionId, 'context_gathering', 'gathering context', {
        chips: chips.map(c => ({
            type: c.type,
            label: c.label,
            relevance: c.relevance
        })),
        chipCount: chips.length
    })
    return stepId
}

export function createIntentStep(
    sessionId: string,
    classification: IntentClassification
): string {
    const stepId = addStep(sessionId, 'intent_classification', 'classifying intent', {
        intent: classification.intent,
        confidence: classification.confidence,
        requiresContext: classification.requiresContext,
        contextScope: classification.contextScope,
        reasoning: classification.reasoning
    })
    return stepId
}

export function createRagStep(sessionId: string, query: string): string {
    return addStep(sessionId, 'rag_search', 'searching codebase', {
        query,
        startTime: Date.now()
    })
}

export function createGenerationStep(sessionId: string, model: string): string {
    return addStep(sessionId, 'code_generation', 'generating response', {
        model,
        startTime: Date.now()
    })
}

export function formatStepsAsTimeline(session: AiActionSession): string {
    const lines: string[] = []
    lines.push(`# ai action timeline: ${session.userQuery.slice(0, 50)}`)
    lines.push(`started: ${new Date(session.startTime).toISOString()}`)
    lines.push("")

    for (const step of session.steps) {
        const icon = step.status === 'complete' ? '✓' :
                     step.status === 'error' ? '✗' :
                     step.status === 'running' ? '○' : '•'
        const duration = step.duration ? `(${step.duration}ms)` : ''
        lines.push(`  ${icon} [${step.type}] ${step.label} ${duration}`)

        if (step.metadata.toolsUsed?.length) {
            lines.push(`    tools: ${step.metadata.toolsUsed.join(', ')}`)
        }
        if (step.metadata.contextFiles?.length) {
            lines.push(`    files: ${step.metadata.contextFiles.join(', ')}`)
        }
    }

    if (session.endTime) {
        const totalDuration = session.endTime - session.startTime
        lines.push("")
        lines.push(`completed in ${totalDuration}ms`)
    }

    return lines.join('\n')
}
