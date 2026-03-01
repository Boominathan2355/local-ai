import React, { useRef, useEffect } from 'react'
import {
    Cpu,
    Globe,
    Search,
    MoreVertical,
    AlertCircle,
    Terminal,
    Bot,
    RotateCcw,
    Rocket
} from 'lucide-react'

import { MessageBubble } from './MessageBubble'
import { StreamingIndicator } from './StreamingIndicator'
import { MessageInput } from './MessageInput'
import { ModelSwitcher } from './ModelSwitcher'
import { MarkdownRenderer } from './MarkdownRenderer'

import { ApiKeyPrompt } from './ApiKeyPrompt'
import { ToolCallPermission } from './ToolCallPermission'

import type { ChatMessage } from '../../types/chat.types'
import type { AppSettings, ApiProvider } from '../../types/settings.types'

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
    onSwitchModel: (modelId: string, modelName?: string) => void
    settings: AppSettings
    onUpdateSettings: (changes: Partial<AppSettings>) => void
    onRetryMessage: (id: string) => void
    onResendLast: () => void
    pendingToolCall: { requestId: string; toolName: string; arguments: any } | null
    onRespondToToolCall: (allowed: boolean) => void
    activeModelName?: string | null
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
    settings,
    onUpdateSettings,
    onRetryMessage,
    onResendLast,
    pendingToolCall,
    onRespondToToolCall,
    activeModelName
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)

    // Determine if the current model needs an API key
    const activeModel = activeModelId?.toLowerCase() || ''
    const needsApiKey = (activeModel.includes('gpt') && !settings.apiKeys?.openai) ||
        ((activeModel.includes('claude') || activeModel.includes('sonnet') || activeModel.includes('haiku')) && !settings.apiKeys?.anthropic) ||
        ((activeModel.includes('gemini') || activeModel.includes('google')) && !settings.apiKeys?.google)

    const provider: ApiProvider = activeModel.includes('gpt') ? 'openai' :
        (activeModel.includes('claude') || activeModel.includes('sonnet') || activeModel.includes('haiku')) ? 'anthropic' : 'google'

    // Auto-scroll to bottom on new messages or streaming
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, streamingContent])

    const handleHintClick = (prompt: string): void => {
        onSendMessage(prompt)
    }

    const handleEdit = (id: string, newContent: string) => {
        // For now, retry with new content is just sending again
        // In a fuller implementation, we might want to update the message history
        onSendMessage(newContent)
    }

    const hasMessages = messages.length > 0 || isStreaming

    return (
        <main className="chat" id="chat-window">
            <div className="chat__header">
                <div className="chat__header-left">
                    <ModelSwitcher
                        activeModelId={activeModelId}
                        activeModelName={activeModelName}
                        onSwitchModel={onSwitchModel}
                        modelStatus={modelStatus}
                        settings={settings}
                    />
                    <div className="chat__status-pill">
                        <span className="chat__status-dot"></span>
                        <span>Active</span>
                    </div>
                </div>
            </div>

            {needsApiKey ? (
                <div className="chat__empty">
                    <ApiKeyPrompt
                        provider={provider}
                        onSave={(key) => onUpdateSettings({ apiKeys: { ...settings.apiKeys, [provider]: key } })}
                        onCancel={() => onSwitchModel('llama-3.1-8b', 'Llama 3.1 8B')} // Fallback to a local model
                    />
                </div>
            ) : !hasMessages ? (
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
                    <div className="chat__messages-inner">
                        {messages.map((message, index) => (
                            <MessageBubble
                                key={message.id}
                                message={message}
                                onRetry={onRetryMessage}
                                onEdit={handleEdit}
                                isLast={index === messages.length - 1}
                            />
                        ))}

                        {/* Streaming assistant message */}
                        {isStreaming && streamingContent && (
                            <div className="message message--assistant message--streaming" id="streaming-message">
                                <div className="message__wrapper">
                                    <div className="message__avatar message__avatar--assistant">
                                        <Bot size={16} />
                                    </div>
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
                        {error && (
                            <div className="chat__error-container" id="error-message">
                                <div className="chat__error-message">
                                    <AlertCircle size={20} />
                                    <span>{error}</span>
                                </div>
                                <button className="chat__retry-btn" onClick={onResendLast}>
                                    <RotateCcw size={16} />
                                    Try Again
                                </button>
                            </div>
                        )}

                        {pendingToolCall && (
                            <ToolCallPermission
                                toolName={pendingToolCall.toolName}
                                args={pendingToolCall.arguments}
                                onAllow={() => onRespondToToolCall(true)}
                                onDeny={() => onRespondToToolCall(false)}
                            />
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

