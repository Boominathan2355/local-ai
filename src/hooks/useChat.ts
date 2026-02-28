import { useState, useEffect, useCallback, useRef } from 'react'

import { getLocalAI } from '../helpers/ipc.helper'
import type { ChatMessage } from '../types/chat.types'
import { DEFAULT_SYSTEM_PROMPT } from '../types/settings.types'

interface UseChatReturn {
    messages: ChatMessage[]
    streamingContent: string
    isStreaming: boolean
    error: string | null
    sendMessage: (content: string) => void
    stopGeneration: () => void
    clearError: () => void
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

        cleanupRef.current = [cleanupToken, cleanupComplete, cleanupError]

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

    const stopGeneration = useCallback(() => {
        const api = getLocalAI()
        if (!api) return
        api.chat.stopGeneration()
    }, [])

    const clearError = useCallback(() => setError(null), [])

    return {
        messages,
        streamingContent,
        isStreaming,
        error,
        sendMessage,
        stopGeneration,
        clearError
    }
}
