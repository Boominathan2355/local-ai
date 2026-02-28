/** Supported cloud API providers */
export type ApiProvider = 'openai' | 'anthropic' | 'google'

export interface ApiKeyConfig {
    openai: string
    anthropic: string
    google: string
}

export interface McpServer {
    id: string
    name: string
    type: 'sse' | 'stdio'
    urlOrPath: string
    env?: Record<string, string>
    enabled: boolean
    status: 'connected' | 'error' | 'disconnected'
}

export interface AppSettings {
    systemPrompt: string
    threads: number
    contextSize: number
    temperature: number
    topP: number
    maxTokens: number
    theme: 'dark' | 'light'
    /** API keys for cloud providers */
    apiKeys: ApiKeyConfig
    /** List of cloud model IDs that have been explicitly activated by the user */
    activatedCloudModels: string[]
    /** Registered MCP servers */
    mcpServers: McpServer[]
}

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful, knowledgeable AI assistant running locally on the user's machine. You provide clear, accurate, and thoughtful responses. You are private, offline, and secure.`

export const DEFAULT_API_KEYS: ApiKeyConfig = {
    openai: '',
    anthropic: '',
    google: ''
}

export const DEFAULT_SETTINGS: AppSettings = {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    threads: 6,
    contextSize: 2048,
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 1024,
    theme: 'dark',
    apiKeys: DEFAULT_API_KEYS,
    activatedCloudModels: [],
    mcpServers: []
}
