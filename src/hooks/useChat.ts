import { useState, useEffect, useCallback, useRef } from 'react'

import { getLocalAI } from '../helpers/ipc.helper'
import type { ChatMessage } from '../types/chat.types'
import { DEFAULT_SYSTEM_PROMPT } from '../types/settings.types'

interface UseChatReturn {
    messages: ChatMessage[]
    allMessages: ChatMessage[]
    streamingContent: string
    isStreaming: boolean
    error: string | null
    sendMessage: (content: string, options?: { systemPrompt?: string; images?: string[]; searchEnabled?: boolean }, retryId?: string) => void
    stopGeneration: () => void
    clearError: () => void
    retryMessage: (messageId: string) => void
    resendLastMessage: () => void
    switchVersion: (messageId: string) => Promise<void>
}

/**
 * Manages chat messages, streaming, and IPC communication for a conversation.
 */
export function useChat(conversationId: string | null): UseChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [streamingContent, setStreamingContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const streamingRef = useRef(false)
    const cleanupRef = useRef<Array<() => void>>([])

    // Load messages when conversation changes
    useEffect(() => {
        // Reset streaming state when switching conversations
        setIsStreaming(false)
        setStreamingContent('')
        streamingRef.current = false
        setError(null)

        if (!conversationId) {
            setMessages([])
            return
        }

        const api = getLocalAI()
        if (!api) return

        api.conversations.getMessages(conversationId).then((msgs) => {
            setMessages(msgs)
        })
    }, [conversationId])

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
                setStreamingContent((prev) => prev + event.token)
            }
        })

        const cleanupComplete = api.chat.onStreamComplete((data) => {
            if (data.conversationId === conversationId) {
                streamingRef.current = false
                setIsStreaming(false)
                setStreamingContent('')

                // Reload messages to get the saved assistant message
                api.conversations.getMessages(conversationId!).then((msgs) => {
                    setMessages(msgs)
                })
            }
        })

        const cleanupError = api.chat.onStreamError((data) => {
            if (data.conversationId === conversationId) {
                streamingRef.current = false
                setIsStreaming(false)
                setStreamingContent('')
                setError(data.error)
            }
        })

        const cleanupMessagesUpdated = api.conversations.onMessagesUpdated((data: { conversationId: string; message?: ChatMessage }) => {
            if (data.conversationId === conversationId) {
                if (data.message) {
                    setMessages((prev) => {
                        if (prev.some(m => m.id === data.message!.id)) return prev
                        const optimisticIndex = prev.findIndex(m =>
                            (m.id === data.message!.id) ||
                            (m.id.startsWith('temp-') &&
                                m.role === data.message!.role &&
                                m.content.trim() === data.message!.content.trim())
                        )
                        if (optimisticIndex !== -1) {
                            const newMessages = [...prev]
                            newMessages[optimisticIndex] = data.message!
                            return newMessages
                        }
                        return [...prev, data.message!]
                    })
                } else {
                    api.conversations.getMessages(conversationId!).then((msgs) => {
                        setMessages(msgs)
                    })
                }
            }
        })

        cleanupRef.current = [cleanupToken, cleanupComplete, cleanupError, cleanupMessagesUpdated]

        return () => {
            cleanupRef.current.forEach((fn) => fn())
            cleanupRef.current = []
        }
    }, [conversationId])

    const sendMessage = useCallback(
        (content: string, options: { systemPrompt?: string; images?: string[]; searchEnabled?: boolean } = {}, retryId?: string) => {
            if (!conversationId || (streamingRef.current && !retryId) || (!content.trim() && !options?.images?.length)) return

            const api = getLocalAI()
            if (!api) return

            setError(null)
            streamingRef.current = true
            setIsStreaming(true)
            setStreamingContent('')

            const optimisticId = retryId || `temp-${Date.now()}`
            const optimisticMessage: ChatMessage = {
                id: optimisticId,
                conversationId,
                role: 'user',
                content: content.trim(),
                tokenCount: Math.ceil((content.trim().length + (options?.images?.length || 0) * 100) / 4),
                createdAt: Date.now(),
                images: options?.images
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

            api.chat.sendMessage(conversationId, content.trim(), options?.systemPrompt || DEFAULT_SYSTEM_PROMPT, options?.images, options?.searchEnabled, retryId)
                .then((result) => {
                    if (result.error) {
                        setError(result.error)
                        streamingRef.current = false
                        setIsStreaming(false)
                    }
                })
                .catch((err) => {
                    setError(err.message || 'Network error')
                    streamingRef.current = false
                    setIsStreaming(false)
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
        streamingRef.current = false
        setStreamingContent('')
    }, [])

    const switchVersion = useCallback(async (messageId: string) => {
        const api = getLocalAI()
        if (!api || !conversationId) return
        await api.chat.switchVersion(conversationId, messageId)
        // Reload messages to get updated isActive states
        const msgs = await api.conversations.getMessages(conversationId)
        setMessages(msgs)
    }, [conversationId])

    const clearError = useCallback(() => setError(null), [])

    return {
        messages: messages.filter(m => m.role !== 'assistant' || m.isActive !== false || m.isAborted), // For linear UI
        allMessages: messages, // Export all for version finding
        streamingContent,
        isStreaming,
        error,
        sendMessage,
        stopGeneration,
        clearError,
        retryMessage,
        resendLastMessage,
        switchVersion
    }
}
