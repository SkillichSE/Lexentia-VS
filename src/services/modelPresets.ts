export type ModelPreset = {
    id: string
    label: string
    provider: 'ollama' | 'openai-compatible'
    model: string
    baseUrl: string
    promptHint: string
}

export const MODEL_PRESETS: ModelPreset[] = [
    {
        id: 'custom',
        label: 'Custom',
        provider: 'ollama',
        model: 'llama3.1',
        baseUrl: 'http://127.0.0.1:11434',
        promptHint: 'default'
    },
    {
        id: 'llama-3.1-8b',
        label: 'Llama 3.1 8B (Ollama)',
        provider: 'ollama',
        model: 'llama-3.1-8b-instruct',
        baseUrl: 'http://127.0.0.1:11434',
        promptHint: 'small'
    },
    {
        id: 'qwen2.5-coder-32b',
        label: 'Qwen2.5 Coder 32B (Ollama)',
        provider: 'ollama',
        model: 'qwen2.5-coder:32b',
        baseUrl: 'http://127.0.0.1:11434',
        promptHint: 'medium'
    },
    {
        id: 'gpt-oss-120b',
        label: 'GPT-OSS 120B (OpenAI-compatible)',
        provider: 'openai-compatible',
        model: 'gpt-oss-120b',
        baseUrl: 'http://127.0.0.1:11434',
        promptHint: 'large'
    }
]

export function getModelPreset(id: string | undefined): ModelPreset | undefined {
    if (!id || id === 'custom') return undefined
    return MODEL_PRESETS.find((p) => p.id === id)
}
