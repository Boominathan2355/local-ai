import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Paperclip, Globe, Send, Square, X } from 'lucide-react'
import type { ChatMessage } from '../../types/chat.types'

interface MessageInputProps {
    onSend: (content: string, images?: string[], searchEnabled?: boolean) => void
    onStop: () => void
    isStreaming: boolean
    disabled: boolean
    isAgentMode?: boolean
    supportsVision?: boolean
    quotedMessage?: ChatMessage | null
    quotedText?: string | null
    onCancelQuote?: () => void
}

export const MessageInput: React.FC<MessageInputProps> = ({
    onSend,
    onStop,
    isStreaming,
    disabled,
    isAgentMode,
    supportsVision = false,
    quotedMessage,
    quotedText,
    onCancelQuote
}) => {
    const [value, setValue] = useState('')
    const [images, setImages] = useState<string[]>([])
    const [isSearchEnabled, setIsSearchEnabled] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isStreaming && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [isStreaming])

    // Layout effect to trigger resize BEFORE browser paint to prevent jumping/flickering
    useLayoutEffect(() => {
        if (textareaRef.current) {
            adjustHeight();
        }
    }, [value])

    const adjustHeight = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        // Use 'auto' to get natural height including multiple lines correctly
        textarea.style.height = 'auto';
        // Cap at 160px (approx 6-7 lines) for better balance
        const newHeight = Math.min(textarea.scrollHeight, 160);
        textarea.style.height = `${newHeight}px`;

        // Toggle overflow based on whether we've hit the cap
        textarea.style.overflowY = textarea.scrollHeight > 160 ? 'auto' : 'hidden';
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const files = e.target.files
        if (!files || files.length === 0) return

        const newImages: string[] = []
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            if (!file.type.startsWith('image/')) continue

            const reader = new FileReader()
            const base64 = await new Promise<string>((resolve) => {
                reader.onload = () => resolve(reader.result as string)
                reader.readAsDataURL(file)
            })
            newImages.push(base64)
        }

        setImages((prev) => [...prev, ...newImages])
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const removeImage = (index: number): void => {
        setImages((prev) => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = (): void => {
        if (isStreaming) {
            onStop()
            return
        }

        const trimmed = value.trim()
        if ((!trimmed && images.length === 0) || disabled) return

        if (images.length > 0 && !supportsVision) return

        onSend(trimmed, images.length > 0 ? images : undefined, isSearchEnabled)
        setValue('')
        setImages([])
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
        setValue(e.target.value)
    }

    return (
        <div className="chat__input-area">
            <div className={`chat__input-container ${isAgentMode ? 'chat__input-container--agent' : ''}`}>
                {/* Image Previews */}
                {images.length > 0 && (
                    <div className="chat__input-previews">
                        {images.map((img, i) => (
                            <div key={i} className="chat__input-preview">
                                <img src={img} alt="Preview" />
                                <button className="chat__input-preview-remove" onClick={() => removeImage(i)}>✕</button>
                            </div>
                        ))}
                    </div>
                )}

                {quotedMessage && (
                    <div className="chat__input-quote">
                        <div className="chat__input-quote-content">
                            <span className="chat__input-quote-author">Replying to {quotedMessage.role === 'user' ? 'You' : 'Assistant'}</span>
                            <span className="chat__input-quote-text">{quotedText || quotedMessage.content}</span>
                        </div>
                        <button className="chat__input-quote-cancel" onClick={onCancelQuote}>
                            <X size={14} />
                        </button>
                    </div>
                )}

                <div className="chat__input-wrapper">
                    <textarea
                        ref={textareaRef}
                        className="chat__textarea"
                        value={value}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder={disabled ? 'Waiting for model...' : 'Ask follow up questions or request detailed reports...'}
                        disabled={disabled && !isStreaming}
                        rows={1}
                        id="message-input"
                    />
                </div>

                <div className="chat__input-tools">
                    <div className="chat__input-tools-left">
                        <button
                            className={`chat__tool-icon ${!supportsVision ? 'chat__tool-icon--disabled' : ''}`}
                            onClick={() => supportsVision ? fileInputRef.current?.click() : null}
                            title={supportsVision ? "Attach files" : "This model does not support images"}
                            disabled={!supportsVision}
                        >
                            <Paperclip size={18} />
                        </button>
                        <div className="chat__tool-divider"></div>
                        <button
                            className={`chat__web-search ${isSearchEnabled ? 'chat__web-search--active' : ''}`}
                            onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                        >
                            <Globe size={14} className="chat__web-search-icon" />
                            <span>Web Search</span>
                        </button>
                    </div>

                    <div className="chat__input-tools-right">
                        <button
                            className={`chat__send-circle ${isStreaming ? 'chat__send-circle--stop' : ''}`}
                            onClick={handleSubmit}
                            disabled={!isStreaming && (!value.trim() && images.length === 0 || disabled)}
                            id="send-btn"
                            title={isStreaming ? 'Stop generation' : 'Send message'}
                        >
                            {isStreaming ? <Square size={16} fill="currentColor" /> : <Send size={18} />}
                        </button>
                    </div>
                </div>

                {!supportsVision && images.length > 0 && (
                    <div className="chat__input-warning">
                        This model does not support images. Please remove them to continue.
                    </div>
                )}

                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                />
            </div>
            <div className="chat__footer-disclaimer">
                AI can make mistakes. Verify Important Information.
            </div>
        </div>
    )
}

