import React, { useState } from 'react'

import { MarkdownRenderer } from './MarkdownRenderer'
import type { ChatMessage } from '../../types/chat.types'

interface MessageBubbleProps {
    message: ChatMessage
}

/** Copy icon (Lucide-style) */
const CopyIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
)

/** Check icon for copied state */
const CheckIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
)

/** Share icon (Lucide-style) */
const ShareIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
)

/** Regenerate icon */
const RefreshIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
)

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
    const isUser = message.role === 'user'
    const [copied, setCopied] = useState(false)

    const handleCopy = (): void => {
        navigator.clipboard.writeText(message.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleShare = (): void => {
        if (navigator.share) {
            navigator.share({ text: message.content })
        } else {
            navigator.clipboard.writeText(message.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const hasImages = message.images && message.images.length > 0

    return (
        <div className={`message message--${message.role}`} id={`message-${message.id}`}>
            <div className="message__wrapper">
                {!isUser && (
                    <div className="message__avatar message__avatar--assistant">AI</div>
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
                    {isUser ? (
                        <div className="message__content">{message.content}</div>
                    ) : (
                        <div className="message__content message__content--markdown">
                            <MarkdownRenderer content={message.content} />
                        </div>
                    )}
                </div>
                {isUser && (
                    <div className="message__avatar message__avatar--user">U</div>
                )}
            </div>
            <div className={`message__actions ${isUser ? 'message__actions--right' : 'message__actions--left'}`}>
                <button className="message__action-btn" onClick={handleCopy} title="Copy">
                    {copied ? <CheckIcon /> : <CopyIcon />}
                </button>
                {!isUser && (
                    <button className="message__action-btn" onClick={handleShare} title="Share">
                        <ShareIcon />
                    </button>
                )}
            </div>
        </div>
    )
}
