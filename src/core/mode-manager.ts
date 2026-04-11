export type AgentMode = 'plan' | 'code' | 'debug' | 'agent';

export interface ModeConfig {
    id: AgentMode;
    name: string;
    icon: string;
    description: string;
    systemPrompt: string;
    temperature: number;
    maxTokens?: number;
}

// PLAN = архитектор 🧠
const PLAN_PROMPT = `You are a software architect and planning AI.

Your role:
1. Analyze user requests carefully
2. Ask clarifying questions when needed
3. Design architecture and solution approach
4. Break down tasks into steps
5. DO NOT write final code - only planning and design

Response format:
1. Understanding: summarize what user wants
2. Questions: any clarifications needed (if none, say "No questions")
3. Architecture: high-level design
4. Plan: numbered steps to implement

Be thoughtful, methodical, and focus on quality planning.`;

// CODE = разработчик 👨‍💻
const CODE_PROMPT = `You are a code implementation AI.

Your role:
1. Write clean, working code
2. Follow best practices and patterns
3. Implement features efficiently
4. Add comments only when necessary
5. Focus on working code, not explanations

Rules:
- Write complete, runnable code
- Use proper error handling
- Follow language conventions
- Include necessary imports
- Make minimal changes to achieve goal

Output ONLY code, no lengthy explanations unless asked.`;

// DEBUG = тестировщик 🐞
const DEBUG_PROMPT = `You are a debugging and diagnostic AI.

Your role:
1. Analyze errors, stack traces, and logs
2. Find root causes of bugs
3. Explain what went wrong and why
4. Propose specific fixes
5. Suggest tests to verify fixes

Response format:
1. Error Analysis: what the error means
2. Root Cause: why it happened
3. Location: file/line where problem is
4. Fix: specific code changes needed
5. Verification: how to test the fix

Be precise and diagnostic.`;

// AGENT = автоматический режим (сам переключается)
const AGENT_PROMPT = `You are an autonomous AI agent with multiple capabilities.

You can operate in different modes and SWITCH between them as needed:

🧠 PLAN mode (when needed):
- User asks for complex feature
- Need to design architecture
- Breaking down large tasks

👨‍💻 CODE mode (when needed):
- Writing implementations
- Generating files
- Refactoring code

🐞 DEBUG mode (when needed):
- Fixing errors
- Analyzing logs
- Troubleshooting issues

Your current state will be tracked. When you detect the need to switch modes, indicate it clearly.

Current workflow state: {state}
Current mode: {mode}

Respond according to current mode, but suggest mode switch if task requires different approach.`;

export const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
    plan: {
        id: 'plan',
        name: 'Plan',
        icon: '🧠',
        description: 'Architecture & Planning',
        systemPrompt: PLAN_PROMPT,
        temperature: 0.7,
        maxTokens: 2000
    },
    code: {
        id: 'code',
        name: 'Code',
        icon: '👨‍💻',
        description: 'Implementation',
        systemPrompt: CODE_PROMPT,
        temperature: 0.3,
        maxTokens: 4000
    },
    debug: {
        id: 'debug',
        name: 'Debug',
        icon: '🐞',
        description: 'Diagnostics & Fixes',
        systemPrompt: DEBUG_PROMPT,
        temperature: 0.5,
        maxTokens: 3000
    },
    agent: {
        id: 'agent',
        name: 'Agent',
        icon: '🤖',
        description: 'Autonomous mode',
        systemPrompt: AGENT_PROMPT,
        temperature: 0.6,
        maxTokens: 4000
    }
};

class ModeManager {
    private currentMode: AgentMode = 'agent';
    private modeHistory: AgentMode[] = [];
    private autoSwitch: boolean = true;

    getCurrentMode(): AgentMode {
        return this.currentMode;
    }

    setMode(mode: AgentMode): void {
        this.modeHistory.push(this.currentMode);
        this.currentMode = mode;
    }

    getConfig(): ModeConfig {
        return MODE_CONFIGS[this.currentMode];
    }

    // Автоматический выбор режима на основе интента
    autoSelectMode(intent: string, context?: { hasErrors?: boolean }): AgentMode {
        const input = intent.toLowerCase();

        // Если есть ошибки - DEBUG
        if (context?.hasErrors) {
            return 'debug';
        }

        // Паттерны для CODE
        const codePatterns = [
            /(создай|напиши|добавь|implement|write|create|generate)\s+(функцию|код|файл|class|function)/i,
            /(refactor|rewrite|optimize|simplify)/i,
            /```[\s\S]*```/, // Если есть code blocks
        ];

        // Паттерны для DEBUG
        const debugPatterns = [
            /(ошибка|error|exception|crash|stack trace|fail|broken|не работает|не запускается)/i,
            /(fix|debug|resolve|troubleshoot|почини|пофиксь)/i,
            /(undefined|cannot|failed|error:|warning:)/i,
        ];

        // Паттерны для PLAN
        const planPatterns = [
            /(спланируй|спроектируй|архитектура|design|architecture|plan|structure)/i,
            /(как сделать|how to|approach|best way)/i,
            /(large|complex|feature|system|module)/i,
        ];

        for (const pattern of debugPatterns) {
            if (pattern.test(input)) return 'debug';
        }

        for (const pattern of codePatterns) {
            if (pattern.test(input)) return 'code';
        }

        for (const pattern of planPatterns) {
            if (pattern.test(input)) return 'plan';
        }

        // По умолчанию - agent (сам выбирает)
        return this.autoSwitch ? 'agent' : this.currentMode;
    }

    // Следующий шаг в цикле PLAN → CODE → DEBUG
    nextModeInCycle(): AgentMode {
        const cycle: AgentMode[] = ['plan', 'code', 'debug'];
        const currentIndex = cycle.indexOf(this.currentMode);
        
        if (currentIndex === -1 || currentIndex === cycle.length - 1) {
            return 'plan'; // С начала
        }
        
        return cycle[currentIndex + 1];
    }

    enableAutoSwitch(enabled: boolean): void {
        this.autoSwitch = enabled;
    }

    getHistory(): AgentMode[] {
        return [...this.modeHistory];
    }

    // Форматированный prompt для текущего режима
    formatPrompt(basePrompt: string, state?: string): string {
        const config = this.getConfig();
        let prompt = config.systemPrompt;
        
        if (state && this.currentMode === 'agent') {
            prompt = prompt.replace('{state}', state).replace('{mode}', this.currentMode);
        }
        
        return `${prompt}\n\n${basePrompt}`;
    }
}

export const modeManager = new ModeManager();
