import { useState, useEffect, useCallback, useRef } from 'react'

import { getLocalAI } from '../helpers/ipc.helper'
import type { Conversation } from '../types/conversation.types'

interface UseConversationsReturn {
    conversations: Conversation[]
    activeConversationId: string | null
    isLoading: boolean
    createConversation: () => void
    deleteConversation: (id: string) => void
    selectConversation: (id: string) => void
}

/**
 * Manages the conversation list and active selection.
 */
export function useConversations(): UseConversationsReturn {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const initializedRef = useRef(false)

    useEffect(() => {
        if (initializedRef.current) return
        initializedRef.current = true

        const api = getLocalAI()
        if (!api) {
            setIsLoading(false)
            return
        }

        api.conversations.list().then((list) => {
            setConversations(list)
            if (list.length > 0) {
                setActiveConversationId(list[0].id)
            }
            setIsLoading(false)
        })
    }, [])

    const refreshList = useCallback(() => {
        const api = getLocalAI()
        if (!api) return

        api.conversations.list().then((list) => {
            setConversations(list)
        })
    }, [])

    const createConversation = useCallback(() => {
        const api = getLocalAI()
        if (!api) return

        api.conversations.create().then((conversation) => {
            setActiveConversationId(conversation.id)
            refreshList()
        })
    }, [refreshList])

    const deleteConversation = useCallback(
        (id: string) => {
            const api = getLocalAI()
            if (!api) return

            api.conversations.delete(id).then(() => {
                if (activeConversationId === id) {
                    setActiveConversationId(null)
                }
                refreshList()
            })
        },
        [activeConversationId, refreshList]
    )

    const selectConversation = useCallback((id: string) => {
        setActiveConversationId(id)
    }, [])

    return {
        conversations,
        activeConversationId,
        isLoading,
        createConversation,
        deleteConversation,
        selectConversation
    }
}
