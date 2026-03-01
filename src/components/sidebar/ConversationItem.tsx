import React from 'react'
import { Trash2 } from 'lucide-react'

import type { Conversation } from '../../types/conversation.types'
import { formatRelativeTime } from '../../utils/format.utils'

interface ConversationItemProps {
    conversation: Conversation
    isActive: boolean
    onSelect: (id: string) => void
    onDelete: (id: string) => void
    onAbort: () => void
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
    conversation,
    isActive,
    onSelect,
    onDelete,
    onAbort
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
                <div className="conversation-item__title">
                    {conversation.isGenerating && (
                        <div className="conversation-item__loader">
                            <div className="loader-dot"></div>
                            <div className="loader-dot"></div>
                            <div className="loader-dot"></div>
                        </div>
                    )}
                    <span>{conversation.title}</span>
                </div>
                <div className="conversation-item__meta">
                    {formatRelativeTime(conversation.updatedAt)}
                    {conversation.messageCount > 0 && ` · ${conversation.messageCount} msgs`}
                </div>
            </div>
            {conversation.isGenerating ? (
                <button
                    className="conversation-item__abort"
                    onClick={(e) => { e.stopPropagation(); onAbort(); }}
                    title="Abort generation"
                >
                    <div className="abort-icon">×</div>
                </button>
            ) : (
                <button
                    className="conversation-item__delete"
                    onClick={handleDelete}
                    title="Delete conversation"
                >
                    <Trash2 size={14} />
                </button>
            )}
        </div>
    )
}
