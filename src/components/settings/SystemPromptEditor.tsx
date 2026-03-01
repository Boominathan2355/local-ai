import React from 'react'
import { MessageSquare, Code2, GraduationCap, Bug, Bot, PenLine } from 'lucide-react'

import type { AppSettings } from '../../types/settings.types'

interface SystemPromptEditorProps {
    systemPrompt: string
    onUpdate: (changes: Partial<AppSettings>) => void
}

const PROMPT_PRESETS = [
    { label: 'Default', value: 'You are a helpful, knowledgeable AI assistant running locally on the user\'s machine. You provide clear, accurate, and thoughtful responses.', icon: MessageSquare },
    { label: 'Coder', value: 'You are an expert software engineer. Provide concise, production-quality code with clear explanations. Use best practices and modern patterns.', icon: Code2 },
    { label: 'Tutor', value: 'You are a patient, thorough teacher. Explain concepts step by step, use analogies, and check understanding. Adapt to the student\'s level.', icon: GraduationCap },
    { label: 'Debug', value: 'You are a debugging specialist. Analyze errors systematically, identify root causes, and provide targeted fixes with explanations.', icon: Bug },
    { label: 'Agent', value: 'You are an autonomous AI agent. Break down complex tasks, plan steps logically, and execute them effectively while maintaining transparency.', icon: Bot }
]

export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
    systemPrompt,
    onUpdate
}) => {
    const matchedPreset = PROMPT_PRESETS.find(p => p.value === systemPrompt)
    const activeLabel = matchedPreset ? matchedPreset.label : 'Custom'

    return (
        <div className="settings-system-prompt">
            <div className="settings-presets">
                {PROMPT_PRESETS.map((preset) => {
                    const Icon = preset.icon
                    return (
                        <button
                            key={preset.label}
                            className={`settings-preset-btn ${activeLabel === preset.label ? 'settings-preset-btn--active' : ''}`}
                            onClick={() => onUpdate({ systemPrompt: preset.value })}
                            id={`preset-${preset.label.toLowerCase()}`}
                        >
                            <span className="preset-icon"><Icon size={14} /></span>
                            {preset.label}
                        </button>
                    )
                })}
                <button
                    className={`settings-preset-btn ${activeLabel === 'Custom' ? 'settings-preset-btn--active' : ''}`}
                    onClick={() => {
                        if (activeLabel !== 'Custom') {
                            onUpdate({ systemPrompt: '' })
                        }
                    }}
                    id="preset-custom"
                >
                    <span className="preset-icon"><PenLine size={14} /></span>
                    Custom
                </button>
            </div>

            <div className={`settings-field custom-prompt-box ${activeLabel === 'Custom' ? 'custom-active' : ''}`}>
                <div className="custom-prompt-header">
                    <span className="custom-prompt-title">Prompt Content</span>
                    {activeLabel !== 'Custom' && <span className="custom-prompt-badge">Preset active</span>}
                </div>
                <div className="custom-prompt-container">
                    <div className="custom-prompt-icon">
                        <Bot size={20} />
                    </div>
                    <textarea
                        className="settings-field__textarea"
                        value={systemPrompt}
                        onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
                        placeholder="Define the assistant's personality and behavior..."
                        id="system-prompt-editor"
                    />
                </div>
                <div className="settings-field__hint">
                    Defines how the AI assistant responds. Changes apply to new messages.
                </div>
            </div>
        </div>
    )
}
