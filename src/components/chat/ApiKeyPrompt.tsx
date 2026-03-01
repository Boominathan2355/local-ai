import React, { useState } from 'react'
import type { ApiProvider } from '../../types/settings.types'

interface ApiKeyPromptProps {
    provider: ApiProvider
    onSave: (key: string) => void
    onCancel: () => void
}

export const ApiKeyPrompt: React.FC<ApiKeyPromptProps> = ({
    provider,
    onSave,
    onCancel
}) => {
    const [key, setKey] = useState('')

    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1)
    const placeholder = provider === 'openai' ? 'sk-...'
        : provider === 'anthropic' ? 'sk-ant-...'
            : 'AIza...'

    return (
        <div className="api-prompt">
            <div className="api-prompt__header">
                <div className="api-prompt__icon">🔑</div>
                <div className="api-prompt__title-block">
                    <div className="api-prompt__title">{providerName} API Key Required</div>
                    <div className="api-prompt__subtitle">To use this cloud model, please provide your API key. It will be stored securely on your machine.</div>
                </div>
            </div>
            <div className="api-prompt__body">
                <input
                    type="password"
                    className="settings-input"
                    placeholder={placeholder}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoFocus
                />
                <div className="api-prompt__actions">
                    <button className="settings-toggle-btn" onClick={onCancel}>Cancel</button>
                    <button
                        className="settings-toggle-btn active"
                        onClick={() => onSave(key)}
                        disabled={!key.trim()}
                    >
                        Save & Continue
                    </button>
                </div>
            </div>
        </div>
    )
}
