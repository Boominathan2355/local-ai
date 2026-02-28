import React from 'react'

import { SystemPromptEditor } from './SystemPromptEditor'
import { ModelStatusIndicator } from '../status/ModelStatusIndicator'

import type { AppSettings } from '../../types/settings.types'
import type { ModelStatusType } from '../../types/model.types'

interface SettingsPanelProps {
    isOpen: boolean
    onClose: () => void
    settings: AppSettings
    onUpdateSettings: (changes: Partial<AppSettings>) => void
    modelStatus: ModelStatusType
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    isOpen,
    onClose,
    settings,
    onUpdateSettings,
    modelStatus
}) => {
    if (!isOpen) return null

    return (
        <div className="settings-overlay" id="settings-panel">
            <div className="settings-container">
                <header className="settings__header">
                    <h2 className="settings__title">⚙️ Settings</h2>
                    <button
                        className="settings__close"
                        onClick={onClose}
                        id="close-settings-btn"
                    >
                        ✕
                    </button>
                </header>

                <div className="settings__content">
                    {/* Model Status */}
                    <div className="settings-section">
                        <div className="settings-section__title">Model Status</div>
                        <ModelStatusIndicator status={modelStatus} />
                    </div>

                    {/* System Prompt */}
                    <SystemPromptEditor
                        systemPrompt={settings.systemPrompt}
                        onUpdate={onUpdateSettings}
                    />

                    {/* Cloud API Keys */}
                    <div className="settings-section">
                        <div className="settings-section__title">Cloud API Keys</div>
                        <div className="settings-field">
                            <label className="settings-field__label">OpenAI API Key</label>
                            <input
                                type="password"
                                className="settings-field__input"
                                placeholder="sk-..."
                                value={settings.apiKeys?.openai || ''}
                                onChange={(e) => onUpdateSettings({ apiKeys: { ...settings.apiKeys, openai: e.target.value } })}
                                id="openai-key-input"
                            />
                        </div>
                        <div className="settings-field">
                            <label className="settings-field__label">Anthropic API Key</label>
                            <input
                                type="password"
                                className="settings-field__input"
                                placeholder="sk-ant-..."
                                value={settings.apiKeys?.anthropic || ''}
                                onChange={(e) => onUpdateSettings({ apiKeys: { ...settings.apiKeys, anthropic: e.target.value } })}
                                id="anthropic-key-input"
                            />
                        </div>
                        <div className="settings-field">
                            <label className="settings-field__label">Google Gemini API Key</label>
                            <input
                                type="password"
                                className="settings-field__input"
                                placeholder="AIza..."
                                value={settings.apiKeys?.google || ''}
                                onChange={(e) => onUpdateSettings({ apiKeys: { ...settings.apiKeys, google: e.target.value } })}
                                id="google-key-input"
                            />
                        </div>
                        <div className="settings-field__hint">
                            Keys are stored locally and only sent to respective provider APIs.
                        </div>
                    </div>

                    {/* Inference Parameters */}
                    <div className="settings-section">
                        <div className="settings-section__title">Inference</div>

                        <div className="settings-field">
                            <label className="settings-field__label">Temperature</label>
                            <input
                                type="range"
                                className="settings-field__input slider"
                                min="0"
                                max="2"
                                step="0.1"
                                value={settings.temperature}
                                onChange={(e) => onUpdateSettings({ temperature: parseFloat(e.target.value) })}
                                id="temperature-slider"
                            />
                            <div className="settings-field__hint">
                                {settings.temperature} — Lower = focused, Higher = creative
                            </div>
                        </div>

                        <div className="settings-field-row">
                            <div className="settings-field">
                                <label className="settings-field__label">Max Tokens</label>
                                <input
                                    type="number"
                                    className="settings-field__input"
                                    min="64"
                                    max="2048"
                                    step="64"
                                    value={settings.maxTokens}
                                    onChange={(e) => onUpdateSettings({ maxTokens: parseInt(e.target.value, 10) })}
                                    id="max-tokens-input"
                                />
                            </div>

                            <div className="settings-field">
                                <label className="settings-field__label">Context Size</label>
                                <input
                                    type="number"
                                    className="settings-field__input"
                                    min="512"
                                    max="4096"
                                    step="256"
                                    value={settings.contextSize}
                                    onChange={(e) => onUpdateSettings({ contextSize: parseInt(e.target.value, 10) })}
                                    id="context-size-input"
                                />
                            </div>

                            <div className="settings-field">
                                <label className="settings-field__label">Threads</label>
                                <input
                                    type="number"
                                    className="settings-field__input"
                                    min="1"
                                    max="16"
                                    step="1"
                                    value={settings.threads}
                                    onChange={(e) => onUpdateSettings({ threads: parseInt(e.target.value, 10) })}
                                    id="threads-input"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
