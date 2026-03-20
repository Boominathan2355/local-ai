import { MODEL_CONFIG } from '../constants/app.constants'

export interface AppSettings {
    systemPrompt: string
    threads: number
    contextSize: number
    temperature: number
    topP: number
    maxTokens: number
    theme: 'dark' | 'light'
    userName: string
    defaultModelId?: string
    fallbackModelId?: string
    serperApiKey?: string
    tavilyApiKey?: string
    openaiApiKey?: string
    anthropicApiKey?: string
    geminiApiKey?: string
    enabledCloudModels: string[]
    mcpAllowedPaths?: string[]
    mcpAutoApproveReads?: boolean
    mcpDocumentOutputPath?: string
    mcpEnabledTools?: string[]
    mcpMaxFileSizeMB?: number
    mcpTerminalTimeoutMs?: number
    mcpAlwaysAllowedTools?: string[]
}

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful, knowledgeable AI assistant running locally on the user's machine. You provide clear, accurate, and thoughtful responses. You are private, offline, and secure.`

export const DEFAULT_SETTINGS: AppSettings = {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    threads: 6,
    contextSize: 4096,
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 1024,
    theme: 'dark',
    userName: 'Local AI User',
    defaultModelId: MODEL_CONFIG.DEFAULT_MODEL_ID,
    fallbackModelId: MODEL_CONFIG.FALLBACK_MODEL_ID,
    serperApiKey: '',
    tavilyApiKey: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    enabledCloudModels: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'],
    mcpAllowedPaths: [],
    mcpAutoApproveReads: false,
    mcpDocumentOutputPath: '',
    mcpEnabledTools: [],
    mcpMaxFileSizeMB: 10,
    mcpTerminalTimeoutMs: 120000,
    mcpAlwaysAllowedTools: []
}
