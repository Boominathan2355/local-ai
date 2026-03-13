import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Brain } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'

interface ReasoningBlockProps {
    reasoningContent: string
    isThinking?: boolean
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ reasoningContent, isThinking }) => {
    const [isOpen, setIsOpen] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)

    // Automatically open if currently thinking so the user can see streaming logs if they want,
    // otherwise collapse by default for cleaner UI.
    useEffect(() => {
        if (isThinking && !isOpen) {
            setIsOpen(true)
        }
    }, [isThinking])

    const displayOpen = isOpen || isThinking

    return (
        <div className={`reasoning-accordion ${displayOpen ? 'reasoning-accordion--open' : ''} ${isThinking ? 'reasoning-accordion--thinking' : ''}`}>
            <button
                className="reasoning-accordion__header"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={displayOpen}
            >
                <div className="reasoning-accordion__left">
                    <div className={`reasoning-accordion__toggle-icon ${displayOpen ? 'reasoning-accordion__toggle-icon--rotated' : ''}`}>
                        <ChevronDown size={14} />
                    </div>
                    <Brain size={14} className={isThinking ? 'thinking-icon' : 'brain-icon'} />
                    <span className="reasoning-accordion__title">
                        {isThinking ? 'Thinking...' : 'Thought Process'}
                    </span>
                </div>
            </button>

            <div
                className="reasoning-accordion__content-wrapper"
                style={{
                    height: displayOpen ? (contentRef.current?.scrollHeight ? `${contentRef.current.scrollHeight}px` : 'auto') : '0px',
                    opacity: displayOpen ? 1 : 0
                }}
            >
                <div className="reasoning-accordion__content" ref={contentRef}>
                    <MarkdownRenderer content={reasoningContent} />
                </div>
            </div>
        </div>
    )
}

