export type UserIntent =
    | 'chat'           // обычный разговор
    | 'task'           // запрос на действие (сделай/добавь/исправь)
    | 'debug'          // ошибка / stack trace
    | 'fix'            // явный запрос починить
    | 'explain'        // объясни код
    | 'run'            // запустить проект
    | 'test';          // тесты

export interface SuggestedAction {
    type: 'action' | 'suggestion' | 'warning';
    label: string;
    icon?: string;
    trigger: string;
    priority: number;  // 1-10, высокие показываем первыми
    condition?: string;
}

export interface IntentAnalysis {
    intent: UserIntent;
    confidence: number;
    actions: SuggestedAction[];
    context?: {
        hasError?: boolean;
        isProjectRelated?: boolean;
        mentionsTests?: boolean;
        mentionsBuild?: boolean;
    };
}

// Ключевые паттерны для детекта намерений
const intentPatterns: Record<UserIntent, RegExp[]> = {
    chat: [
        /^привет/i, /^hello/i, /^hey/i, /^что ты умеешь/i, /^help/i, /^помощь/i
    ],
    task: [
        /(сделай|добавь|создай|напиши|реализуй|пофиксь|исправь|обнови|удали|перемести|рефактор)/i,
        /(add|create|write|implement|fix|update|delete|move|refactor)\s+/i,
        /(make|build|generate|setup|configure)/i,
        /не\s+(работает|запускается|компилируется)/i,
        /(broken|not working|doesn't work|failed)/i
    ],
    debug: [
        /(ошибка|error|exception|crash|stack trace|traceback|fail|failed)/i,
        /(Cannot find|Module not found|ENOENT|undefined|is not defined)/i,
        /(\d+:\d+\s*(error|warning)|Error:|TypeError:|ReferenceError:)/i
    ],
    fix: [
        /(почини|пофиксь|исправь|fix\s+this|fix\s+it|repair)/i,
        /(bug|баг|issue|проблема)/i
    ],
    explain: [
        /(объясни|explain|what does|how does|что делает|как работает)/i,
        /(describe|tell me about|документируй)/i
    ],
    run: [
        /(запусти|run|start|execute|npm start|npm run)/i,
        /(build|compile|deploy|serve)/i
    ],
    test: [
        /(тест|test|npm test|pytest|jest|mocha)/i,
        /(проверь|check|verify|validate)/i
    ]
};

export function analyzeIntent(
    userInput: string,
    context?: { hasErrors?: boolean; recentErrors?: string[] }
): IntentAnalysis {
    const input = userInput.toLowerCase().trim();

    // Детектим основное намерение
    let detectedIntent: UserIntent = 'chat';
    let maxConfidence = 0;

    for (const [intent, patterns] of Object.entries(intentPatterns)) {
        for (const pattern of patterns) {
            if (pattern.test(input)) {
                const confidence = calculateConfidence(input, pattern, intent as UserIntent);
                if (confidence > maxConfidence) {
                    maxConfidence = confidence;
                    detectedIntent = intent as UserIntent;
                }
            }
        }
    }

    // Если есть ошибки в контексте - усиливаем debug/fix intent
    if (context?.hasErrors && detectedIntent === 'chat') {
        detectedIntent = 'debug';
        maxConfidence = 0.7;
    }

    // Генерируем actions на основе intent
    const actions = generateActions(detectedIntent, context);

    return {
        intent: detectedIntent,
        confidence: maxConfidence,
        actions,
        context: {
            hasError: context?.hasErrors,
            isProjectRelated: isProjectRelated(input),
            mentionsTests: /test|тест/i.test(input),
            mentionsBuild: /build|компил|сборка/i.test(input)
        }
    };
}

function calculateConfidence(input: string, pattern: RegExp, intent: UserIntent): number {
    let confidence = 0.5;

    // Чем длиннее совпадение, тем выше confidence
    const match = input.match(pattern);
    if (match && match[0].length > 5) {
        confidence += 0.2;
    }

    // Task intentы имеют приоритет над chat
    if (intent === 'task' || intent === 'fix') {
        confidence += 0.15;
    }

    // Debug с stack trace = высокий confidence
    if (intent === 'debug' && /at\s+.*:\d+:|\d+:\d+.*error/i.test(input)) {
        confidence += 0.3;
    }

    return Math.min(confidence, 0.95);
}

function isProjectRelated(input: string): boolean {
    const projectKeywords = /(файл|код|проект|функция|класс|модуль|component|file|code|project|function|class|module)/i;
    return projectKeywords.test(input);
}

function generateActions(intent: UserIntent, context?: { hasErrors?: boolean; recentErrors?: string[] }): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    switch (intent) {
        case 'task':
            actions.push({
                type: 'action',
                label: '▶ Run & Fix',
                icon: '▶',
                trigger: 'runTask',
                priority: 10,
                condition: 'autoExecute'
            });
            actions.push({
                type: 'suggestion',
                label: '🧠 Plan first',
                icon: '🧠',
                trigger: 'showPlan',
                priority: 7
            });
            break;

        case 'debug':
        case 'fix':
            actions.push({
                type: 'action',
                label: '🔧 Fix automatically',
                icon: '🔧',
                trigger: 'fixLoop',
                priority: 10,
                condition: 'hasError'
            });
            actions.push({
                type: 'suggestion',
                label: '🔍 Explain error',
                icon: '🔍',
                trigger: 'explainError',
                priority: 6
            });
            break;

        case 'run':
            actions.push({
                type: 'action',
                label: '▶ Run project',
                icon: '▶',
                trigger: 'runProject',
                priority: 9
            });
            actions.push({
                type: 'suggestion',
                label: '🧪 Run tests',
                icon: '🧪',
                trigger: 'runTests',
                priority: 5
            });
            break;

        case 'test':
            actions.push({
                type: 'action',
                label: '🧪 Run tests',
                icon: '🧪',
                trigger: 'runTests',
                priority: 9
            });
            break;

        case 'explain':
            actions.push({
                type: 'action',
                label: '💡 Explain code',
                icon: '💡',
                trigger: 'explainCode',
                priority: 8
            });
            break;

        case 'chat':
        default:
            // Для chat нет actions, просто отвечаем
            break;
    }

    // Если есть ошибки - добавляем fix к любому intent
    if (context?.hasErrors && !actions.find(a => a.trigger === 'fixLoop')) {
        actions.unshift({
            type: 'warning',
            label: '⚠️ Fix errors first',
            icon: '⚠️',
            trigger: 'fixLoop',
            priority: 11
        });
    }

    return actions.sort((a, b) => b.priority - a.priority);
}

// Утилита для быстрой проверки - нужно ли показывать Run & Fix
export function shouldShowRunFix(userInput: string, hasErrors: boolean = false): boolean {
    const analysis = analyzeIntent(userInput, { hasErrors });
    return analysis.intent === 'task' || analysis.intent === 'debug' || analysis.intent === 'fix' || hasErrors;
}
