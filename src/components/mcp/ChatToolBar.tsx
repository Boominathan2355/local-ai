import React from 'react'
import { ToolCategory } from '../../../src/types/mcp.types'
import { Search, FileText, Terminal, ShieldAlert, Check } from 'lucide-react'

interface ChatToolBarProps {
    enabledCategories: ToolCategory[]
    onCategoriesChange: (categories: ToolCategory[]) => void
}

export const ChatToolBar: React.FC<ChatToolBarProps> = ({ enabledCategories, onCategoriesChange }) => {

    const toggleCategory = (category: ToolCategory) => {
        if (enabledCategories.includes(category)) {
            onCategoriesChange(enabledCategories.filter(c => c !== category))
        } else {
            onCategoriesChange([...enabledCategories, category])
        }
    }

    const tools = [
        { id: 'file_control' as ToolCategory, label: 'Files', icon: FileText },
        { id: 'document_creator' as ToolCategory, label: 'Docs', icon: FileText },
        { id: 'terminal' as ToolCategory, label: 'Terminal', icon: Terminal, warning: true }
    ]

    return (
        <div className="chat-toolbar">
            <div className="chat-toolbar__items">
                {tools.map(tool => {
                    const isActive = enabledCategories.includes(tool.id)
                    const Icon = tool.icon
                    return (
                        <button
                            key={tool.id}
                            onClick={() => toggleCategory(tool.id)}
                            className={`tool-pill ${isActive ? 'tool-pill--active' : ''}`}
                            title={tool.warning ? 'Warning: Use terminal tools with caution.' : `Toggle ${tool.label} tool`}
                        >
                            <span className="tool-pill__icon">
                                {tool.warning && isActive ? (
                                    <ShieldAlert size={14} />
                                ) : (
                                    <Icon size={14} />
                                )}
                            </span>
                            <span className="tool-pill__name">{tool.label}</span>
                            {isActive && (
                                <span className="tool-pill__check">
                                    <Check size={12} strokeWidth={3} />
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
