import React, { useRef, useEffect, useState } from 'react'
import {
    Cpu,
    Globe,
    Search,
    MoreVertical,
    AlertCircle,
    Terminal,
    Bot,
    RotateCcw,
    Rocket,
    ArrowDown
} from 'lucide-react'

import { MessageBubble } from './MessageBubble'
import { StreamingIndicator } from './StreamingIndicator'
import { MessageInput } from './MessageInput'
import { ModelSwitcher } from './ModelSwitcher'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ReasoningBlock } from './ReasoningBlock'


import type { ChatMessage } from '../../types/chat.types'
import type { AppSettings } from '../../types/settings.types'

const HINT_PROMPTS = [
    'Explain how async/await works in JavaScript',
    'Write a Python script to organize files by extension',
    'What are the SOLID principles?',
    'Help me debug a segmentation fault'
]

interface ChatWindowProps {
    messages: ChatMessage[]
    streamingContent: string
    isStreaming: boolean
    isThinking?: boolean
    error: string | null
    modelReady: boolean
    onSendMessage: (content: string, images?: string[], searchEnabled?: boolean, retryId?: string, quotedMessageId?: string, quotedMessageText?: string) => void
    onStopGeneration: () => void
    activeModelId: string | null
    modelStatus: string
    onSwitchModel: (modelId: string, modelName?: string) => void
    settings: AppSettings
    onUpdateSettings: (changes: Partial<AppSettings>) => void
    onRetryMessage: (id: string) => void
    onResendLast: () => void
    activeModelName?: string | null
    activeModelTier?: string | null
    allMessages?: ChatMessage[]
    onSwitchVersion?: (id: string) => void
    supportsVision?: boolean
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
    messages,
    streamingContent,
    isStreaming,
    isThinking = false,
    error,
    modelReady,
    onSendMessage,
    onStopGeneration,
    activeModelId,
    modelStatus,
    onSwitchModel,
    settings,
    onUpdateSettings,
    onRetryMessage,
    onResendLast,
    activeModelName,
    activeModelTier,
    allMessages,
    onSwitchVersion,
    supportsVision = false
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const [showScrollBtn, setShowScrollBtn] = useState(false)
    const [quotingMessageId, setQuotingMessageId] = useState<string | null>(null)
    const [quotingMessageText, setQuotingMessageText] = useState<string | null>(null)

    const isAgentMode = activeModelTier === 'agent'

    // Auto-scroll to bottom only if user is already at the bottom during streaming
    useEffect(() => {
        if (!showScrollBtn && streamingContent.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
        }
    }, [streamingContent.length])

    // Always scroll to bottom when a new complete message is added
    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages.length])

    // Scroll listener for the "Scroll to Bottom" button
    useEffect(() => {
        const container = messagesContainerRef.current
        if (!container) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 150
            setShowScrollBtn(!isNearBottom)
        }

        container.addEventListener('scroll', handleScroll)
        return () => container.removeEventListener('scroll', handleScroll)
    }, [])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const handleHintClick = (prompt: string): void => {
        onSendMessage(prompt)
    }

    const handleEdit = (id: string, newContent: string) => {
        onSendMessage(newContent, [], false, id)
    }

    const handleSendMessageWithQuote = (content: string, images?: string[], searchEnabled?: boolean, retryId?: string) => {
        onSendMessage(content, images, searchEnabled, retryId, quotingMessageId ?? undefined, quotingMessageText ?? undefined)
        setQuotingMessageId(null)
        setQuotingMessageText(null)
    }

    const handleReply = (id: string, selectedText?: string) => {
        setQuotingMessageId(id)
        setQuotingMessageText(selectedText || null)
    }

    const quotingMessage = quotingMessageId ? messages.find(m => m.id === quotingMessageId) || allMessages?.find(m => m.id === quotingMessageId) : null

    const hasMessages = messages.length > 0 || isStreaming

    return (
        <main className={`chat ${isAgentMode ? 'chat--agent' : ''}`} id="chat-window">
            <div className={`chat__header ${isAgentMode ? 'chat__header--agent' : ''}`}>
                <div className="chat__header-left">
                    <ModelSwitcher
                        activeModelId={activeModelId}
                        activeModelName={activeModelName}
                        onSwitchModel={onSwitchModel}
                        modelStatus={modelStatus}
                        settings={settings}
                    />
                    {isAgentMode ? (
                        <div className="chat__status-pill chat__status-pill--agent">
                            <span className="chat__status-dot chat__status-dot--pulsing"></span>
                            <span className="chat__status-text">AGENT MODE ACTIVE</span>
                        </div>
                    ) : (
                        <div className="chat__status-pill">
                            <span className="chat__status-dot"></span>
                            <span>Active</span>
                        </div>
                    )}
                </div>
                {isAgentMode && (
                    <div className="chat__header-right">
                        <div className="chat__agent-badge">
                            <Terminal size={14} />
                            <span>Intelligence Tier: Advanced</span>
                        </div>
                    </div>
                )}
            </div>

            {!hasMessages ? (
                <div className="chat__empty">
                    <div className="chat__empty-icon">
                        <Rocket size={36} color="#ffffff" strokeWidth={1.5} />
                    </div>
                    <h1 className="chat__empty-title">Local AI Assistant</h1>
                    <p className="chat__empty-subtitle">
                        Your private, offline AI assistant powered by llama.cpp.
                        Everything runs locally on your machine — no data leaves your device.
                    </p>
                    <div className="chat__empty-hints">
                        {HINT_PROMPTS.map((prompt, index) => (
                            <button
                                key={index}
                                className="chat__empty-hint"
                                onClick={() => handleHintClick(prompt)}
                                id={`hint-${index}`}
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="chat__messages" ref={messagesContainerRef} id="messages-area">
                    <div className={`chat__messages-inner ${isAgentMode ? 'chat__messages-inner--agent' : ''}`}>
                        {messages.map((message, index) => (
                            <MessageBubble
                                key={message.id}
                                message={message}
                                allMessages={allMessages}
                                onSwitchVersion={onSwitchVersion}
                                onRetry={onRetryMessage}
                                onEdit={handleEdit}
                                onReply={handleReply}
                                isLast={index === messages.length - 1}
                            />
                        ))}

                        {/* Streaming assistant message */}
                        {isStreaming && (streamingContent || isThinking) && (
                            <div className="message message--assistant message--streaming" id="streaming-message">
                                <div className="message__wrapper">
                                    <div className="message__avatar message__avatar--assistant">
                                        <Bot size={16} />
                                    </div>
                                    <div className="message__flat">
                                        <div className="message__content message__content--markdown">
                                            {isThinking ? (
                                                <ReasoningBlock reasoningContent={streamingContent.replace(/<think>|<\/think>/g, '')} isThinking={true} />
                                            ) : (
                                                <MarkdownRenderer content={streamingContent} />
                                            )}
                                        </div>
                                        <StreamingIndicator />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Streaming but no content yet */}
                        {isStreaming && !streamingContent && !isThinking && (
                            <div className="message message--assistant message--streaming" id="thinking-message">
                                <div className="message__wrapper">
                                    <div className="message__avatar message__avatar--assistant">
                                        <Bot size={16} />
                                    </div>
                                    <div className="message__flat">
                                        <StreamingIndicator />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Error display */}
                        {error && error !== 'aborted' && (
                            <div className="chat__error-container" id="error-message">
                                <div className="chat__error-message">
                                    <AlertCircle size={20} />
                                    <span>{error}</span>
                                </div>
                                <div className="chat__error-actions">
                                    <button className="chat__retry-btn" onClick={onResendLast}>
                                        <RotateCcw size={16} />
                                        Try Again
                                    </button>
                                </div>
                            </div>
                        )}


                        <div ref={messagesEndRef} />
                    </div>

                    <button
                        className={`chat__scroll-btn ${showScrollBtn ? '' : 'chat__scroll-btn--hidden'}`}
                        onClick={scrollToBottom}
                        title="Scroll to bottom"
                    >
                        <ArrowDown size={20} />
                    </button>
                </div>
            )}

            <MessageInput
                onSend={handleSendMessageWithQuote}
                onStop={onStopGeneration}
                isStreaming={isStreaming}
                disabled={!modelReady}
                isAgentMode={isAgentMode}
                supportsVision={supportsVision}
                quotedMessage={quotingMessage}
                quotedText={quotingMessageText}
                onCancelQuote={() => {
                    setQuotingMessageId(null)
                    setQuotingMessageText(null)
                }}
            />
        </main>
    )
}
