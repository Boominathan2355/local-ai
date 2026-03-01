import { useState, useEffect, useCallback, useRef } from 'react'

import { getLocalAI } from '../helpers/ipc.helper'
import type { ChatMessage } from '../types/chat.types'
import { DEFAULT_SYSTEM_PROMPT } from '../types/settings.types'

interface UseChatReturn {
    messages: ChatMessage[]
    streamingContent: string
    isStreaming: boolean
    error: string | null
    sendMessage: (content: string, images?: string[]) => void
    stopGeneration: () => void
    clearError: () => void
    retryMessage: (messageId: string) => void
    resendLastMessage: () => void
    pendingToolCall: { requestId: string; toolName: string; arguments: any } | null
    respondToToolCall: (allowed: boolean, always?: boolean) => void
}

/**
 * Manages chat messages, streaming, and IPC communication for a conversation.
 */
export function useChat(conversationId: string | null): UseChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [streamingContent, setStreamingContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pendingToolCall, setPendingToolCall] = useState<{ requestId: string; toolName: string; arguments: any } | null>(null)

    const streamingRef = useRef(false)
    const cleanupRef = useRef<Array<() => void>>([])

    // Load messages when conversation changes
    useEffect(() => {
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
                if (!data.toolCall) {
                    streamingRef.current = false
                    setIsStreaming(false)
                }
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
                        // 1. If we find an exact ID match, do nothing (already handled or identical)
                        if (prev.some(m => m.id === data.message!.id)) return prev

                        // 2. If this is a real message from backend that matches an optimistic message, replace it
                        const optimisticIndex = prev.findIndex(m =>
                            m.id.startsWith('temp-') &&
                            m.role === data.message!.role &&
                            m.content === data.message!.content
                        )

                        if (optimisticIndex !== -1) {
                            const newMessages = [...prev]
                            newMessages[optimisticIndex] = data.message!
                            return newMessages
                        }

                        // 3. Otherwise, append new message
                        return [...prev, data.message!]
                    })
                } else {
                    api.conversations.getMessages(conversationId!).then((msgs) => {
                        setMessages(msgs)
                    })
                }
            }
        })

        const cleanupToolCallPermission = api.chat.onToolCallPermissionRequested((data) => {
            setPendingToolCall(data)
        })

        cleanupRef.current = [cleanupToken, cleanupComplete, cleanupError, cleanupMessagesUpdated, cleanupToolCallPermission]

        return () => {
            cleanupRef.current.forEach((fn) => fn())
            cleanupRef.current = []
        }
    }, [conversationId])

    const sendMessage = useCallback(
        (content: string, images?: string[]) => {
            if (!conversationId || streamingRef.current || (!content.trim() && !images?.length)) return

            const api = getLocalAI()
            if (!api) return

            setError(null)
            streamingRef.current = true
            setIsStreaming(true)
            setStreamingContent('')

            // Optimistically add user message to UI
            const optimisticId = `temp-${Date.now()}`
            const optimisticMessage: ChatMessage = {
                id: optimisticId,
                conversationId,
                role: 'user',
                content: content.trim(),
                tokenCount: Math.ceil((content.trim().length + (images?.length || 0) * 100) / 4),
                createdAt: Date.now(),
                images
            }
            setMessages((prev) => [...prev, optimisticMessage])

            api.chat.sendMessage(conversationId, content.trim(), DEFAULT_SYSTEM_PROMPT, images).then((result) => {
                if (result.error) {
                    setError(result.error)
                    streamingRef.current = false
                    setIsStreaming(false)
                    // Remove the optimistic message on error? Or just leave it and show error.
                    // For now, let's leave it so user can copy it back.
                }
            })
        },
        [conversationId]
    )

    const retryMessage = useCallback(
        (messageId: string) => {
            const message = messages.find((m) => m.id === messageId)
            if (!message || message.role !== 'user') return

            // If it's a failed message at the end, we might want to "replace" it or just re-send
            // For simplicity, we'll re-send the content
            sendMessage(message.content, message.images)
        },
        [messages, sendMessage]
    )

    const resendLastMessage = useCallback(() => {
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
        if (lastUserMessage) {
            sendMessage(lastUserMessage.content, lastUserMessage.images)
        }
    }, [messages, sendMessage])

    const stopGeneration = useCallback(() => {
        const api = getLocalAI()
        if (!api) return
        api.chat.stopGeneration()
    }, [])

    const clearError = useCallback(() => setError(null), [])

    const respondToToolCall = useCallback((allowed: boolean, always?: boolean) => {
        if (!pendingToolCall) return
        const api = getLocalAI()
        if (api) {
            api.chat.respondToToolCallPermission(pendingToolCall.requestId, { allowed, always })
            setPendingToolCall(null)
        }
    }, [pendingToolCall])

    return {
        messages,
        streamingContent,
        isStreaming,
        error,
        sendMessage,
        stopGeneration,
        clearError,
        retryMessage,
        resendLastMessage,
        pendingToolCall,
        respondToToolCall
    }
}
