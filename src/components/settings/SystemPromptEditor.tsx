import React from 'react'

import type { AppSettings } from '../../types/settings.types'

interface SystemPromptEditorProps {
    systemPrompt: string
    onUpdate: (changes: Partial<AppSettings>) => void
}

const PROMPT_PRESETS = [
    { label: 'Default', value: 'You are a helpful, knowledgeable AI assistant running locally on the user\'s machine. You provide clear, accurate, and thoughtful responses.' },
    { label: 'Coder', value: 'You are an expert software engineer. Provide concise, production-quality code with clear explanations. Use best practices and modern patterns.' },
    { label: 'Tutor', value: 'You are a patient, thorough teacher. Explain concepts step by step, use analogies, and check understanding. Adapt to the student\'s level.' },
    { label: 'Debug', value: 'You are a debugging specialist. Analyze errors systematically, identify root causes, and provide targeted fixes with explanations.' }
]

export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
    systemPrompt,
    onUpdate
}) => {
    return (
        <div className="settings-section">
            <div className="settings-section__title">System Prompt</div>
            <div className="settings-field">
                <textarea
                    className="settings-field__textarea"
                    value={systemPrompt}
                    onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
                    placeholder="Define the assistant's personality and behavior..."
                    id="system-prompt-editor"
                />
                <div className="settings-field__hint">
                    Defines how the AI assistant responds. Changes apply to new messages.
                </div>
            </div>
            <div className="settings-presets">
                {PROMPT_PRESETS.map((preset) => (
                    <button
                        key={preset.label}
                        className={`settings-preset-btn ${systemPrompt === preset.value ? 'settings-preset-btn--active' : ''}`}
                        onClick={() => onUpdate({ systemPrompt: preset.value })}
                        id={`preset-${preset.label.toLowerCase()}`}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
        </div>
    )
}
