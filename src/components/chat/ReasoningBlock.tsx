import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'

interface ReasoningBlockProps {
    reasoningContent: string
    isThinking?: boolean
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ reasoningContent, isThinking }) => {
    const [isOpen, setIsOpen] = useState(false)

    // Automatically open if currently thinking so the user can see streaming logs if they want,
    // otherwise collapse by default for cleaner UI.
    const displayOpen = isOpen || isThinking

    return (
        <div className={`reasoning-block ${displayOpen ? 'reasoning-block--open' : ''} ${isThinking ? 'reasoning-block--thinking' : ''}`}>
            <div
                className="reasoning-header"
                onClick={() => setIsOpen(!isOpen)}
                role="button"
                tabIndex={0}
            >
                <div className="reasoning-header__left">
                    <Brain size={14} className={isThinking ? 'thinking-icon' : 'brain-icon'} />
                    <span className="reasoning-header__title">
                        {isThinking ? 'Thinking...' : 'Thought Process'}
                    </span>
                </div>
                <div className="reasoning-header__right">
                    {displayOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
            </div>

            {displayOpen && reasoningContent && (
                <div className="reasoning-content">
                    <MarkdownRenderer content={reasoningContent} />
                </div>
            )}
        </div>
    )
}
