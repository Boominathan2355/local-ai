import { useState, useEffect, useCallback, useRef } from 'react'

import { getLocalAI } from '../helpers/ipc.helper'
import type { ChatMessage } from '../types/chat.types'
import { DEFAULT_SYSTEM_PROMPT } from '../types/settings.types'
import { parseThinkingProcess } from '../utils/ai-parser'

const parseMessages = (msgs: ChatMessage[], supportsThinking: boolean): ChatMessage[] => {
    return msgs.map(m => {
        if (m.role === 'assistant' && (supportsThinking || m.content?.includes('<think>') || m.content?.toUpperCase().includes('[THOUGHT]'))) {
            return { ...m, ...parseThinkingProcess(m.content) }
        }
        return m
    })
}

interface UseChatReturn {
    messages: ChatMessage[]
    allMessages: ChatMessage[]
    streamingContent: string
    isStreaming: boolean
    isThinking: boolean
    error: string | null
    searchStatus: string | null
    sendMessage: (content: string, options?: { systemPrompt?: string; images?: string[]; searchEnabled?: boolean; quotedMessageId?: string; quotedMessageText?: string }, retryId?: string) => void
    stopGeneration: () => void
    clearError: () => void
    retryMessage: (messageId: string) => void
    resendLastMessage: () => void
    switchVersion: (messageId: string) => Promise<void>
    approveTool: (requestId: string) => void
    denyTool: (requestId: string) => void
    pendingToolRequest: { requestId: string; toolName: string; args: any } | null
}

/**
 * Manages chat messages, streaming, and IPC communication for a conversation.
 */
export function useChat(conversationId: string | null, supportsThinking: boolean = false): UseChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [streamingContent, setStreamingContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [isThinking, setIsThinking] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchStatus, setSearchStatus] = useState<string | null>(null)
    const [pendingToolRequest, setPendingToolRequest] = useState<{ requestId: string; toolName: string; args: any } | null>(null)

    const streamingRef = useRef(false)
    const cleanupRef = useRef<Array<() => void>>([])

    // Load messages when conversation changes
    useEffect(() => {
        // Reset streaming state when switching conversations
        setIsStreaming(false)
        setIsThinking(false)
        setStreamingContent('')
        streamingRef.current = false
        setError(null)
        setSearchStatus(null)

        if (!conversationId) {
            setMessages([])
            return
        }

        const api = getLocalAI()
        if (!api) return

        api.conversations.getMessages(conversationId).then((msgs) => {
            setMessages(parseMessages(msgs, supportsThinking))
        })
    }, [conversationId, supportsThinking])

    // Set up stream listeners
    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        const cleanupToken = api.chat.onStreamToken((event) => {
            if (event.conversationId === conversationId) {
                if (!streamingRef.current) {
                    streamingRef.current = true
                    setIsStreaming(true)
                }
                setStreamingContent((prev) => {
                    const newRawContent = prev + event.token

                    // As content streams, we parse it to determine if we're currently thinking
                    if (supportsThinking || newRawContent.includes('<think>') || newRawContent.toUpperCase().includes('[THOUGHT]')) {
                        const { isThinking } = parseThinkingProcess(newRawContent)
                        setIsThinking(isThinking)
                    }

                    return newRawContent
                })
            }
        })

        const cleanupComplete = api.chat.onStreamComplete((data) => {
            if (data.conversationId === conversationId) {
                streamingRef.current = false
                setIsStreaming(false)
                setIsThinking(false)
                setStreamingContent('')

                // Reload messages to get the saved assistant message
                api.conversations.getMessages(conversationId!).then((msgs) => {
                    setMessages(parseMessages(msgs, supportsThinking))
                })
            }
        })

        const cleanupError = api.chat.onStreamError((data) => {
            if (data.conversationId === conversationId) {
                streamingRef.current = false
                setIsStreaming(false)
                setIsThinking(false)
                setStreamingContent('')
                setError(data.error)
            }
        })

        const cleanupSearchStatus = api.chat.onSearchStatus ? api.chat.onSearchStatus((data) => {
            if (data.conversationId === conversationId) {
                setSearchStatus(data.status)
            }
        }) : () => { }

        const cleanupToolRequest = api.chat.onToolPermissionRequest ? api.chat.onToolPermissionRequest((data) => {
            if (data.conversationId === conversationId) {
                setPendingToolRequest({ requestId: data.requestId, toolName: data.toolName, args: data.args })
            }
        }) : () => { }

        const cleanupMessagesUpdated = api.conversations.onMessagesUpdated((data: { conversationId: string; message?: ChatMessage }) => {
            if (data.conversationId === conversationId) {
                if (data.message) {
                    const msg = data.message
                    setMessages((prev) => {
                        if (prev.some(m => m.id === msg.id)) return prev
                        const optimisticIndex = prev.findIndex(m =>
                            (m.id === msg.id) ||
                            (m.id.startsWith('temp-') &&
                                m.role === msg.role &&
                                m.content.trim() === msg.content.trim())
                        )
                        const parsed = (msg.role === 'assistant' && (supportsThinking || msg.content?.includes('<think>') || msg.content?.toUpperCase().includes('[THOUGHT]')))
                            ? parseThinkingProcess(msg.content)
                            : { content: msg.content, isThinking: false }

                        if (optimisticIndex !== -1) {
                            const newMessages = [...prev]
                            newMessages[optimisticIndex] = {
                                ...msg,
                                ...parsed
                            }
                            return newMessages
                        }

                        return [...prev, {
                            ...msg,
                            ...parsed
                        }]
                    })
                } else {
                    api.conversations.getMessages(conversationId!).then((msgs) => {
                        setMessages(parseMessages(msgs, supportsThinking))
                    })
                }
            }
        })

        cleanupRef.current = [cleanupToken, cleanupComplete, cleanupError, cleanupMessagesUpdated, cleanupSearchStatus, cleanupToolRequest]

        return () => {
            cleanupRef.current.forEach((fn) => fn())
            cleanupRef.current = []
        }
    }, [conversationId, supportsThinking])

    const sendMessage = useCallback(
        (content: string, options: { systemPrompt?: string; images?: string[]; searchEnabled?: boolean; quotedMessageId?: string; quotedMessageText?: string } = {}, retryId?: string) => {
            if (!conversationId || (streamingRef.current && !retryId) || (!content.trim() && !options?.images?.length)) return

            const api = getLocalAI()
            if (!api) return

            setError(null)
            streamingRef.current = true
            setIsStreaming(true)
            setIsThinking(false)
            setStreamingContent('')
            setSearchStatus(null)

            const optimisticId = retryId || `temp-${Date.now()}`
            const optimisticMessage: ChatMessage = {
                id: optimisticId,
                conversationId,
                role: 'user',
                content: content.trim(),
                tokenCount: Math.ceil((content.trim().length + (options?.images?.length || 0) * 100) / 4),
                createdAt: Date.now(),
                images: options?.images,
                quotedMessageId: options?.quotedMessageId,
                quotedMessageText: options?.quotedMessageText
            }

            setMessages((prev) => {
                if (retryId) {
                    const index = prev.findIndex(m => m.id === retryId)
                    if (index !== -1) {
                        const newMessages = [...prev]
                        newMessages[index] = optimisticMessage
                        return newMessages
                    }
                }
                return [...prev, optimisticMessage]
            })

            api.chat.sendMessage(conversationId, content.trim(), options?.systemPrompt || DEFAULT_SYSTEM_PROMPT, options?.images, options?.searchEnabled, retryId, options?.quotedMessageId, options?.quotedMessageText)
                .then((result) => {
                    if (result.error) {
                        setError(result.error)
                        streamingRef.current = false
                        setIsStreaming(false)
                        setIsThinking(false)
                    }
                })
                .catch((err) => {
                    setError(err.message || 'Network error')
                    streamingRef.current = false
                    setIsStreaming(false)
                    setIsThinking(false)
                })
        },
        [conversationId]
    )

    const retryMessage = useCallback(
        (messageId: string) => {
            const index = messages.findIndex((m) => m.id === messageId)
            if (index === -1) return

            const message = messages[index]

            if (message.role === 'user') {
                sendMessage(message.content, { images: message.images }, messageId)
            } else if (message.role === 'assistant') {
                // Find the last user message before this assistant message
                const lastUserMessage = [...messages.slice(0, index)].reverse().find(m => m.role === 'user')
                if (lastUserMessage) {
                    sendMessage(lastUserMessage.content, { images: lastUserMessage.images }, lastUserMessage.id)
                }
            }
        },
        [messages, sendMessage]
    )

    const resendLastMessage = useCallback(() => {
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
        if (lastUserMessage) {
            sendMessage(lastUserMessage.content, { images: lastUserMessage.images }, lastUserMessage.id)
        }
    }, [messages, sendMessage])

    const stopGeneration = useCallback(() => {
        const api = getLocalAI()
        if (!api) return
        api.chat.stopGeneration()

        // Immediately update local state to reflect that streaming has stopped
        setIsStreaming(false)
        setIsThinking(false)
        streamingRef.current = false
        setStreamingContent('')
    }, [])

    const switchVersion = useCallback(async (messageId: string) => {
        const api = getLocalAI()
        if (!api || !conversationId) return
        await api.chat.switchVersion(conversationId, messageId)
        // Reload messages to get updated isActive states
        const msgs = await api.conversations.getMessages(conversationId)
        setMessages(parseMessages(msgs, supportsThinking))
    }, [conversationId, supportsThinking])

    const clearError = useCallback(() => setError(null), [])

    const approveTool = useCallback((requestId: string) => {
        const api = getLocalAI()
        if (!api) return
        api.chat.sendToolPermissionResponse(requestId, true)
        setPendingToolRequest(null)
    }, [])

    const denyTool = useCallback((requestId: string) => {
        const api = getLocalAI()
        if (!api) return
        api.chat.sendToolPermissionResponse(requestId, false)
        setPendingToolRequest(null)
    }, [])

    return {
        messages: messages.filter(m => m.role !== 'assistant' || m.isActive !== false || m.isAborted), // For linear UI
        allMessages: messages, // Export all for version finding
        streamingContent,
        isStreaming,
        isThinking,
        error,
        searchStatus,
        sendMessage,
        stopGeneration,
        clearError,
        retryMessage,
        resendLastMessage,
        switchVersion,
        approveTool,
        denyTool,
        pendingToolRequest
    }
}
