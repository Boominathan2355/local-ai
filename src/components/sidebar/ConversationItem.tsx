import React from 'react'

import type { Conversation } from '../../types/conversation.types'
import { formatRelativeTime } from '../../utils/format.utils'

interface ConversationItemProps {
    conversation: Conversation
    isActive: boolean
    onSelect: (id: string) => void
    onDelete: (id: string) => void
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
    conversation,
    isActive,
    onSelect,
    onDelete
}) => {
    const handleDelete = (e: React.MouseEvent): void => {
        e.stopPropagation()
        onDelete(conversation.id)
    }

    return (
        <div
            className={`conversation-item ${isActive ? 'conversation-item--active' : ''}`}
            onClick={() => onSelect(conversation.id)}
            role="button"
            tabIndex={0}
            id={`conversation-${conversation.id}`}
        >
            <div className="conversation-item__content">
                <div className="conversation-item__title">{conversation.title}</div>
                <div className="conversation-item__meta">
                    {formatRelativeTime(conversation.updatedAt)}
                    {conversation.messageCount > 0 && ` · ${conversation.messageCount} msgs`}
                </div>
            </div>
            <button
                className="conversation-item__delete"
                onClick={handleDelete}
                title="Delete conversation"
                id={`delete-conversation-${conversation.id}`}
            >
                ✕
            </button>
        </div>
    )
}
