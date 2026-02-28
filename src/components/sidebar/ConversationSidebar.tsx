import React from 'react'

import { ConversationItem } from './ConversationItem'
import type { Conversation } from '../../types/conversation.types'

interface ConversationSidebarProps {
    conversations: Conversation[]
    activeConversationId: string | null
    onSelectConversation: (id: string) => void
    onDeleteConversation: (id: string) => void
    onNewChat: () => void
    onOpenSettings: () => void
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
    conversations,
    activeConversationId,
    onSelectConversation,
    onDeleteConversation,
    onNewChat,
    onOpenSettings
}) => {
    return (
        <aside className="sidebar" id="sidebar">
            <div className="sidebar__header">
                <button
                    className="sidebar__new-chat-btn"
                    onClick={onNewChat}
                    id="new-chat-btn"
                >
                    <span>＋</span>
                    <span>New Chat</span>
                </button>
            </div>

            <div className="sidebar__conversations" id="conversation-list">
                {conversations.length === 0 ? (
                    <div className="sidebar__empty">
                        No conversations yet. Start a new chat!
                    </div>
                ) : (
                    conversations.map((conversation) => (
                        <ConversationItem
                            key={conversation.id}
                            conversation={conversation}
                            isActive={conversation.id === activeConversationId}
                            onSelect={onSelectConversation}
                            onDelete={onDeleteConversation}
                        />
                    ))
                )}
            </div>

            <div className="sidebar__footer">
                <button
                    className="sidebar__settings-btn"
                    onClick={onOpenSettings}
                    id="settings-btn"
                >
                    <span>⚙</span>
                    <span>Settings</span>
                </button>
            </div>
        </aside>
    )
}
