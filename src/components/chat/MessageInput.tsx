import React, { useState, useRef, useEffect } from 'react'

interface MessageInputProps {
    onSend: (content: string, images?: string[]) => void
    onStop: () => void
    isStreaming: boolean
    disabled: boolean
}

export const MessageInput: React.FC<MessageInputProps> = ({
    onSend,
    onStop,
    isStreaming,
    disabled
}) => {
    const [value, setValue] = useState('')
    const [images, setImages] = useState<string[]>([])
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isStreaming && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [isStreaming])

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

        onSend(trimmed, images.length > 0 ? images : undefined)
        setValue('')
        setImages([])

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
        setValue(e.target.value)

        // Auto-resize
        const textarea = e.target
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }

    return (
        <div className="chat__input-area">
            <div className="chat__input-container">
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

                <div className="chat__input-wrapper">
                    <button
                        className="chat__attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach images"
                    >
                        📎
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        multiple
                        onChange={handleFileChange}
                    />
                    <textarea
                        ref={textareaRef}
                        className="chat__textarea"
                        value={value}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder={disabled ? 'Waiting for model...' : 'Type a message... (Enter to send, Shift+Enter for new line)'}
                        disabled={disabled && !isStreaming}
                        rows={1}
                        id="message-input"
                    />
                    <button
                        className={`chat__send-btn ${isStreaming ? 'chat__send-btn--stop' : ''}`}
                        onClick={handleSubmit}
                        disabled={!isStreaming && (!value.trim() && images.length === 0 || disabled)}
                        title={isStreaming ? 'Stop generation' : 'Send message'}
                        id="send-btn"
                    >
                        {isStreaming ? '■' : '↑'}
                    </button>
                </div>
                <div className="chat__input-hint">
                    Local AI · Private · Multimodal · Google Gemini / Claude / GPT Support
                </div>
            </div>
        </div>
    )
}

