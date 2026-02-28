export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
    id: string
    conversationId: string
    role: MessageRole
    content: string
    tokenCount: number
    createdAt: number
    /** Base64 data URLs for attached images (multimodal only) */
    images?: string[]
}

export interface StreamingState {
    isStreaming: boolean
    currentContent: string
    abortController: AbortController | null
}

export interface ChatState {
    messages: ChatMessage[]
    streaming: StreamingState
    error: string | null
}

export type SendMessagePayload = {
    conversationId: string
    content: string
    systemPrompt: string
    images?: string[]
}

export type StreamTokenEvent = {
    conversationId: string
    token: string
    done: boolean
}
