import React from 'react'
import { Plus, Settings2, User, Library, Bot } from 'lucide-react'

import { ConversationItem } from './ConversationItem'
import type { Conversation } from '../../types/conversation.types'
import type { AppSettings } from '../../types/settings.types'

interface ConversationSidebarProps {
    conversations: Conversation[]
    activeConversationId: string | null
    onSelectConversation: (id: string) => void
    onDeleteConversation: (id: string) => void
    onAbortConversation: () => void
    onNewChat: () => void
    onOpenSettings: () => void
    onOpenLibrary: () => void
    onOpenUser: () => void
    settings: AppSettings
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
    conversations,
    activeConversationId,
    onSelectConversation,
    onDeleteConversation,
    onAbortConversation,
    onNewChat,
    onOpenSettings,
    onOpenLibrary,
    onOpenUser,
    settings
}) => {
    return (
        <aside className="sidebar" id="sidebar">
            <div className="sidebar__brand">
                <div className="sidebar__brand-logo">
                    <div className="sidebar__logo-box">
                        <Bot size={20} color="#fff" />
                    </div>
                    <div className="sidebar__brand-info">
                        <div className="sidebar__brand-name">Local AI</div>
                        <div className="sidebar__brand-workspace">Workspace</div>
                    </div>
                </div>
            </div>

            <div className="sidebar__header">
                <button
                    className="sidebar__new-btn"
                    onClick={onNewChat}
                    id="new-chat-btn"
                >
                    <Plus size={16} />
                    <span>New Chat</span>
                </button>
            </div>

            <div className="sidebar__section-label">RECENT</div>

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
                            onAbort={onAbortConversation}
                        />
                    ))
                )}
            </div>


            <div className="sidebar__footer">
                <button
                    className="sidebar__footer-btn"
                    onClick={onOpenLibrary}
                    id="library-btn"
                >
                    <Library size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <span>Model Library</span>
                </button>
                <button
                    className="sidebar__footer-btn"
                    onClick={onOpenSettings}
                    id="settings-btn"
                >
                    <Settings2 size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <span>Settings</span>
                </button>
            </div>

            <div className="sidebar__user" onClick={onOpenUser} id="user-profile-btn" style={{ cursor: 'pointer' }}>
                <div className="sidebar__user-avatar">
                    <User size={24} color="var(--text-tertiary)" />
                </div>
                <div className="sidebar__user-info">
                    <div className="sidebar__user-name">{settings.userName || 'Local AI User'}</div>
                    <div className="sidebar__user-role">Explorer</div>
                </div>
            </div>
        </aside>
    )
}
