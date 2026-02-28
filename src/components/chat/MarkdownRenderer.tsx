import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownRendererProps {
    content: string
}

/**
 * Renders markdown content with syntax highlighting, tables, and copy-to-clipboard for code blocks.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                code: CodeBlock,
                pre: ({ children }) => <>{children}</>,
                table: ({ children, ...props }) => (
                    <div className="md-table-wrap">
                        <table className="md-table" {...props}>{children}</table>
                    </div>
                ),
                a: ({ children, href, ...props }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="md-link" {...props}>
                        {children}
                    </a>
                )
            }}
        >
            {content}
        </ReactMarkdown>
    )
}

/**
 * Code block component with syntax highlighting and copy button.
 */
const CodeBlock: React.FC<React.HTMLAttributes<HTMLElement> & { className?: string; children?: React.ReactNode; inline?: boolean }> = ({
    className,
    children,
    ...props
}) => {
    const [copied, setCopied] = useState(false)
    const match = /language-(\w+)/.exec(className ?? '')
    const language = match ? match[1] : ''
    const codeString = String(children).replace(/\n$/, '')

    // Inline code
    const isInline = !className && !String(children).includes('\n')
    if (isInline) {
        return <code className="md-inline-code" {...props}>{children}</code>
    }

    const handleCopy = (): void => {
        navigator.clipboard.writeText(codeString)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="md-code-block">
            <div className="md-code-header">
                <span className="md-code-lang">{language || 'text'}</span>
                <button className="md-code-copy" onClick={handleCopy}>
                    {copied ? '✓ Copied' : '📋 Copy'}
                </button>
            </div>
            <SyntaxHighlighter
                style={oneDark}
                language={language || 'text'}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    borderRadius: '0 0 8px 8px',
                    fontSize: '0.82rem',
                    lineHeight: 1.5
                }}
            >
                {codeString}
            </SyntaxHighlighter>
        </div>
    )
}
