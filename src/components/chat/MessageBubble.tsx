import React, { useState } from 'react'
import {
    Copy,
    Check,
    Share2,
    RotateCcw,
    Edit3,
    User,
    Bot,
    AlertCircle,
    Reply
} from 'lucide-react'

import { MarkdownRenderer } from './MarkdownRenderer'
import type { ChatMessage } from '../../types/chat.types'
import { ReasoningBlock } from './ReasoningBlock'
import { parseMCPContent, MCPContentSegment } from '../../utils/ai-parser'
import { ToolCallCard } from '../mcp/ToolCallCard'
import { TerminalOutput } from '../mcp/TerminalOutput'
import { ToolChainView } from '../mcp/ToolChainView'

import { VersionPager } from './VersionPager'

interface MessageBubbleProps {
    message: ChatMessage
    onRetry?: (id: string) => void
    onEdit?: (id: string, content: string) => void
    onReply?: (id: string, selectedText?: string) => void
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
    onReply,
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

    const quotedMessage = message.quotedMessageId ? allMessages.find(m => m.id === message.quotedMessageId) : null

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

    const handleReply = () => {
        // Obsolete - removed from action bar
    }

    const hasImages = message.images && message.images.length > 0
    const isError = (message as any).isError // We might need to flag failed messages

    return (
        <div
            className={`message message--${message.role} ${isError ? 'message--error' : ''}`}
            id={`message-${message.id}`}
        >
            <div className="message__wrapper">
                {!isUser && message.role !== 'tool' && (
                    <div className="message__avatar message__avatar--assistant">
                        <Bot size={16} />
                    </div>
                )}
                <div className={isUser ? 'message__bubble' : 'message__flat'}>
                    {/* Quoted Message Preview */}
                    {quotedMessage && (
                        <div className="message__quoted" onClick={() => document.getElementById(`message-${quotedMessage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                            <div className="message__quoted-author">Replied to {quotedMessage.role === 'user' ? 'You' : 'Assistant'}</div>
                            <div className="message__quoted-text">{message.quotedMessageText || quotedMessage.content}</div>
                        </div>
                    )}

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
                    ) : (
                        <div className="message__content">
                            {message.reasoningContent && (
                                <ReasoningBlock
                                    reasoningContent={message.reasoningContent}
                                    isThinking={message.isThinking}
                                />
                            )}
                            {(() => {
                                const segments = parseMCPContent(message.content)

                                // Group consecutive tool calls into a chain
                                const grouped: (MCPContentSegment | { type: 'tool_chain'; steps: any[]; totalDuration: number })[] = []
                                let currentChain: any[] = []

                                segments.forEach((seg, i) => {
                                    if (seg.type === 'tool_call') {
                                        currentChain.push(seg)
                                    } else {
                                        if (currentChain.length > 1) {
                                            grouped.push({ type: 'tool_chain', steps: currentChain, totalDuration: 0 })
                                        } else if (currentChain.length === 1) {
                                            grouped.push(currentChain[0])
                                        }
                                        currentChain = []
                                        grouped.push(seg)
                                    }
                                })

                                if (currentChain.length > 1) {
                                    grouped.push({ type: 'tool_chain', steps: currentChain, totalDuration: 0 })
                                } else if (currentChain.length === 1) {
                                    grouped.push(currentChain[0])
                                }

                                return grouped.map((item, idx) => {
                                    if (item.type === 'text') {
                                        return <MarkdownRenderer key={idx} content={item.content} />
                                    }
                                    if (item.type === 'tool_call') {
                                        return <ToolCallCard
                                            key={idx}
                                            toolName={item.toolName}
                                            args={item.args}
                                            status="success"
                                        />
                                    }
                                    if (item.type === 'tool_chain') {
                                        return <ToolChainView
                                            key={idx}
                                            chain={{ steps: item.steps.map(s => ({ ...s, status: 'success', resultSummary: 'Executed' })), totalDurationMs: 0, conversationId: message.conversationId }}
                                        />
                                    }
                                    if (item.type === 'tool_result') {
                                        if (item.toolName === 'run_command' && item.success) {
                                            return <TerminalOutput key={idx} command="Result" output={item.content} />
                                        }
                                        return <ToolCallCard
                                            key={idx}
                                            toolName={item.toolName}
                                            args={{}}
                                            result={item.content}
                                            status={item.success ? 'success' : 'error'}
                                            error={item.success ? undefined : item.content}
                                        />
                                    }
                                    return null
                                })
                            })()}
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
