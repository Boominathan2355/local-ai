import React, { useState } from 'react'
import {
    Copy,
    Check,
    Share2,
    RotateCcw,
    Edit3,
    User,
    Bot,
    AlertCircle
} from 'lucide-react'

import { MarkdownRenderer } from './MarkdownRenderer'
import type { ChatMessage } from '../../types/chat.types'

import { VersionPager } from './VersionPager'

interface MessageBubbleProps {
    message: ChatMessage
    onRetry?: (id: string) => void
    onEdit?: (id: string, content: string) => void
    isLast?: boolean
    allMessages?: ChatMessage[]
    onSwitchVersion?: (messageId: string) => void
}

interface DataCardProps {
    title: string;
    value: string;
    type?: 'success' | 'error' | 'neutral';
}

const DataCard: React.FC<DataCardProps> = ({ title, value, type = 'neutral' }) => (
    <div className={`data-card data-card--${type}`}>
        <div className="data-card__title">{title}</div>
        <div className="data-card__value">{value}</div>
    </div>
)

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    onRetry,
    onEdit,
    isLast,
    allMessages = [],
    onSwitchVersion
}) => {
    const isUser = message.role === 'user'
    const [copied, setCopied] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(message.content)

    // Find versions (siblings)
    const siblings = message.replyToId
        ? allMessages
            .filter(m => m.replyToId === message.replyToId)
            .sort((a, b) => (a.version || 0) - (b.version || 0))
        : []

    const currentVersionIdx = siblings.findIndex(s => s.id === message.id)
    const totalVersions = siblings.length

    const handleNextVersion = () => {
        if (currentVersionIdx < totalVersions - 1 && onSwitchVersion) {
            onSwitchVersion(siblings[currentVersionIdx + 1].id)
        }
    }

    const handlePrevVersion = () => {
        if (currentVersionIdx > 0 && onSwitchVersion) {
            onSwitchVersion(siblings[currentVersionIdx - 1].id)
        }
    }

    const handleCopy = (): void => {
        navigator.clipboard.writeText(message.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleShare = (): void => {
        if (navigator.share) {
            navigator.share({ text: message.content })
        } else {
            handleCopy()
        }
    }

    const handleEditSave = () => {
        if (onEdit) {
            onEdit(message.id, editContent)
            setIsEditing(false)
        }
    }

    const hasImages = message.images && message.images.length > 0
    const isError = (message as any).isError // We might need to flag failed messages

    return (
        <div className={`message message--${message.role} ${isError ? 'message--error' : ''}`} id={`message-${message.id}`}>
            <div className="message__wrapper">
                {!isUser && message.role !== 'tool' && (
                    <div className="message__avatar message__avatar--assistant">
                        <Bot size={16} />
                    </div>
                )}
                <div className={isUser ? 'message__bubble' : 'message__flat'}>
                    {/* Image attachments */}
                    {hasImages && (
                        <div className="message__images">
                            {message.images!.map((img, i) => (
                                <img key={i} src={img} alt="Attached" className="message__image" />
                            ))}
                        </div>
                    )}

                    {isEditing ? (
                        <div className="message__edit-container">
                            <textarea
                                className="message__edit-input"
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                autoFocus
                            />
                            <div className="message__edit-actions">
                                <button onClick={() => setIsEditing(false)}>Cancel</button>
                                <button onClick={handleEditSave} className="message__edit-save">Save & Retry</button>
                            </div>
                        </div>
                    ) : message.role === 'tool' ? (
                        <div className="message__tool-container">
                            <div className="message__tool-header">Tool Feedback</div>
                            <pre className="message__tool-content">{message.content}</pre>
                        </div>
                    ) : !isUser && message.content.trim().startsWith('{') && message.content.includes('"tool_call"') ? (
                        <div className="message__content">
                            {(() => {
                                try {
                                    const parsed = JSON.parse(message.content.trim())
                                    if (parsed.tool_call) {
                                        return (
                                            <div className="message__tool-call">
                                                <div className="message__tool-call-header">
                                                    <RotateCcw size={14} className="message__tool-call-icon" />
                                                    <span>AI is using a tool</span>
                                                </div>
                                                <div className="message__tool-call-body">
                                                    <div className="message__tool-call-name">{parsed.tool_call.name}</div>
                                                    <div className="message__tool-call-args">
                                                        {JSON.stringify(parsed.tool_call.arguments, null, 2)}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }
                                } catch (e) {
                                    // Fallback to markdown if parsing fails
                                }
                                return <MarkdownRenderer content={message.content} />
                            })()}
                        </div>
                    ) : isUser ? (
                        <div className="message__content">{message.content}</div>
                    ) : (
                        <div className="message__content message__content--markdown">
                            <MarkdownRenderer content={message.content} />
                        </div>
                    )}

                    {!isUser && totalVersions > 1 && (
                        <VersionPager
                            current={currentVersionIdx + 1}
                            total={totalVersions}
                            onPrev={handlePrevVersion}
                            onNext={handleNextVersion}
                        />
                    )}
                </div>
                {isUser && (
                    <div className="message__avatar message__avatar--user">
                        <User size={16} />
                    </div>
                )}
            </div>

            <div className={`message__actions ${isUser ? 'message__actions--right' : 'message__actions--left'}`}>
                <button className="message__action-btn" onClick={handleCopy} title="Copy">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>

                {isUser && !isEditing && (
                    <button className="message__action-btn" onClick={() => setIsEditing(true)} title="Edit">
                        <Edit3 size={14} />
                    </button>
                )}

                {isUser && isLast && (
                    <button className="message__action-btn" onClick={() => onRetry?.(message.id)} title="Retry">
                        <RotateCcw size={14} />
                    </button>
                )}

                {!isUser && (
                    <>
                        <button className="message__action-btn" onClick={() => onRetry?.(message.id)} title="Try Again">
                            <RotateCcw size={14} />
                        </button>
                        <button className="message__action-btn" onClick={handleShare} title="Share">
                            <Share2 size={14} />
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
