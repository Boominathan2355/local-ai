import React, { useRef, useEffect } from 'react'

import { MessageBubble } from './MessageBubble'
import { StreamingIndicator } from './StreamingIndicator'
import { MessageInput } from './MessageInput'
import { ModelSwitcher } from './ModelSwitcher'
import { MarkdownRenderer } from './MarkdownRenderer'

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
    error: string | null
    modelReady: boolean
    onSendMessage: (content: string) => void
    onStopGeneration: () => void
    activeModelId: string | null
    modelStatus: string
    onSwitchModel: (modelId: string) => void
    onOpenLibrary: () => void
    settings: AppSettings
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
    messages,
    streamingContent,
    isStreaming,
    error,
    modelReady,
    onSendMessage,
    onStopGeneration,
    activeModelId,
    modelStatus,
    onSwitchModel,
    onOpenLibrary,
    settings
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom on new messages or streaming
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, streamingContent])

    const handleHintClick = (prompt: string): void => {
        onSendMessage(prompt)
    }

    const hasMessages = messages.length > 0 || isStreaming

    return (
        <main className="chat" id="chat-window">
            <div className="chat__header">
                <ModelSwitcher
                    activeModelId={activeModelId}
                    onSwitchModel={onSwitchModel}
                    onOpenLibrary={onOpenLibrary}
                    modelStatus={modelStatus}
                    settings={settings}
                />
            </div>

            {!hasMessages ? (
                <div className="chat__empty">
                    <div className="chat__empty-icon">🤖</div>
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
                    <div className="chat__messages-inner">
                        {messages.map((message) => (
                            <MessageBubble key={message.id} message={message} />
                        ))}

                        {/* Streaming assistant message */}
                        {isStreaming && streamingContent && (
                            <div className="message message--assistant message--streaming" id="streaming-message">
                                <div className="message__wrapper">
                                    <div className="message__avatar message__avatar--assistant">AI</div>
                                    <div className="message__flat">
                                        <div className="message__content message__content--markdown">
                                            <MarkdownRenderer content={streamingContent} />
                                        </div>
                                        <StreamingIndicator />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Streaming but no content yet */}
                        {isStreaming && !streamingContent && (
                            <div className="message message--assistant message--streaming" id="thinking-message">
                                <div className="message__wrapper">
                                    <div className="message__avatar message__avatar--assistant">AI</div>
                                    <div className="message__flat">
                                        <StreamingIndicator />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Error display */}
                        {error && (
                            <div className="message message--assistant" id="error-message">
                                <div className="message__wrapper">
                                    <div className="message__avatar" style={{ background: 'var(--status-error)', color: '#fff' }}>!</div>
                                    <div className="message__flat" style={{ borderColor: 'var(--status-error)' }}>
                                        <div className="message__content" style={{ color: 'var(--status-error)' }}>{error}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>
            )}

            <MessageInput
                onSend={onSendMessage}
                onStop={onStopGeneration}
                isStreaming={isStreaming}
                disabled={!modelReady}
            />
        </main>
    )
}

