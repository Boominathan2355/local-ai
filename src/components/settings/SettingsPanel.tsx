import React from 'react'
import {
    Sun,
    Moon,
    Cpu,
    Search,
    Bell,
    HelpCircle,
    X,
    Settings2,
    Brain,
    Sparkles,
    Key
} from 'lucide-react'

import { SystemPromptEditor } from './SystemPromptEditor'

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
    const [activeTab, setActiveTab] = React.useState('general')

    if (!isOpen) return null

    const renderContent = () => {
        switch (activeTab) {
            case 'general':
                return (
                    <div className="settings-section">
                        <div className="settings-section__header">
                            <h3 className="settings-section__title">General Settings</h3>
                            <p className="settings-section__subtitle">Manage your local AI assistant preferences and localization.</p>
                        </div>

                        <div className="settings-divider" />

                        <div className="settings-group">
                            <div className="settings-group__label-block">
                                <label>Appearance</label>
                            </div>
                        </div>

                        <div className="settings-row">
                            <div className="settings-row__label">
                                <div className="settings-row__title">Theme Mode</div>
                                <div className="settings-row__desc">Choose between light and dark interface</div>
                            </div>
                            <div className="settings-toggle-group">
                                <button
                                    className={`settings-toggle-btn ${settings.theme === 'light' ? 'active' : ''}`}
                                    onClick={() => onUpdateSettings({ theme: 'light' })}
                                >
                                    <Sun size={14} style={{ marginRight: 6 }} /> Light
                                </button>
                                <button
                                    className={`settings-toggle-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                                    onClick={() => onUpdateSettings({ theme: 'dark' })}
                                >
                                    <Moon size={14} style={{ marginRight: 6 }} /> Dark
                                </button>
                            </div>
                        </div>

                        <div className="settings-row">
                            <div className="settings-row__label">
                                <div className="settings-row__title">System Language</div>
                                <div className="settings-row__desc">The language used across the dashboard</div>
                            </div>
                            <select
                                className="settings-select settings-select--compact"
                                value="en-US"
                                onChange={() => { }}
                            >
                                <option value="en-US">English (US)</option>
                            </select>
                        </div>
                    </div>
                )
            case 'ai':
                return (
                    <div className="settings-section">
                        <div className="settings-section__header">
                            <h3 className="settings-section__title">AI Configuration</h3>
                            <p className="settings-section__subtitle">Tune the inference engine for your specific needs.</p>
                        </div>

                        <div className="settings-divider" />

                        <div className="settings-group">
                            <div className="settings-group__label-block">
                                <div className="settings-row__title">System Prompt</div>
                                <div className="settings-row__desc">Configure the base personality and behavioral constraints of the AI.</div>
                            </div>
                            <SystemPromptEditor
                                systemPrompt={settings.systemPrompt}
                                onUpdate={onUpdateSettings}
                            />
                        </div>

                        <div className="settings-divider" />

                        <div className="settings-row settings-row--stack">
                            <div className="settings-row__col">
                                <div className="settings-label-row">
                                    <label>Temperature</label>
                                    <span className="settings-value">{settings.temperature}</span>
                                </div>
                                <input
                                    type="range"
                                    className="settings-slider"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={settings.temperature}
                                    onChange={(e) => onUpdateSettings({ temperature: parseFloat(e.target.value) })}
                                />
                                <div className="settings-slider-labels">
                                    <span>PRECISE</span>
                                    <span>CREATIVE</span>
                                </div>
                            </div>
                            <div className="settings-row__col">
                                <div className="settings-label-row">
                                    <label>Max Tokens</label>
                                    <span className="settings-input-tag">LIMIT</span>
                                </div>
                                <input
                                    type="number"
                                    className="settings-input"
                                    value={settings.maxTokens}
                                    onChange={(e) => onUpdateSettings({ maxTokens: parseInt(e.target.value, 10) })}
                                />
                            </div>
                        </div>
                    </div>
                )
            case 'api-keys':
                return (
                    <div className="settings-section">
                        <div className="settings-section__header">
                            <h3 className="settings-section__title">API Keys</h3>
                            <p className="settings-section__subtitle">Manage your external service credentials. These are stored locally on your device.</p>
                        </div>

                        <div className="settings-divider" />

                        <div className="settings-row">
                            <div className="settings-row__label">
                                <div className="settings-row__title">Tavily API Key (Primary)</div>
                                <div className="settings-row__desc">Recommended for better AI search results. Get one at <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">tavily.com</a></div>
                            </div>
                            <input
                                type="password"
                                className="settings-input settings-input--wide"
                                value={settings.tavilyApiKey || ''}
                                onChange={(e) => onUpdateSettings({ tavilyApiKey: e.target.value })}
                                placeholder="tvly-..."
                            />
                        </div>

                        <div className="settings-row">
                            <div className="settings-row__label">
                                <div className="settings-row__title">Serper.dev API Key (Secondary)</div>
                                <div className="settings-row__desc">Required for Web Search functionality. Get one at <a href="https://serper.dev" target="_blank" rel="noopener noreferrer">serper.dev</a></div>
                            </div>
                            <input
                                type="password"
                                className="settings-input settings-input--wide"
                                value={settings.serperApiKey || ''}
                                onChange={(e) => onUpdateSettings({ serperApiKey: e.target.value })}
                                placeholder="Enter your Serper API Key"
                            />
                        </div>

                        <div className="settings-divider" />

                        <div className="settings-section-header">Cloud Providers</div>
                        <p className="settings-section-desc">Manage keys for cloud-based AI models.</p>

                        <div className="settings-row">
                            <div className="settings-row__label">
                                <div className="settings-row__title">OpenAI API Key</div>
                                <div className="settings-row__desc">Used for GPT-4o and GPT-3.5 models. Get one at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">openai.com</a></div>
                            </div>
                            <input
                                type="password"
                                className="settings-input settings-input--wide"
                                value={settings.openaiApiKey || ''}
                                onChange={(e) => onUpdateSettings({ openaiApiKey: e.target.value })}
                                placeholder="sk-..."
                            />
                        </div>

                        <div className="settings-row">
                            <div className="settings-row__label">
                                <div className="settings-row__title">Anthropic API Key</div>
                                <div className="settings-row__desc">Used for Claude 3.5 Sonnet and Opus. Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">anthropic.com</a></div>
                            </div>
                            <input
                                type="password"
                                className="settings-input settings-input--wide"
                                value={settings.anthropicApiKey || ''}
                                onChange={(e) => onUpdateSettings({ anthropicApiKey: e.target.value })}
                                placeholder="sk-ant-..."
                            />
                        </div>

                        <div className="settings-row">
                            <div className="settings-row__label">
                                <div className="settings-row__title">Gemini API Key</div>
                                <div className="settings-row__desc">Used for Gemini 1.5 Pro and Flash. Get one at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com</a></div>
                            </div>
                            <input
                                type="password"
                                className="settings-input settings-input--wide"
                                value={settings.geminiApiKey || ''}
                                onChange={(e) => onUpdateSettings({ geminiApiKey: e.target.value })}
                                placeholder="Enter your Gemini API key"
                            />
                        </div>
                    </div>
                )
        }
    }

    return (
        <div className="settings-overlay" id="settings-panel">
            <div className="settings-full-container">
                {/* Enterprise Top Navigation Bar */}
                <header className="settings-top-nav">
                    <div className="settings-top-nav__left">
                        <div className="settings-top-nav__logo">
                            <Sparkles size={18} />
                        </div>
                        <span className="settings-top-nav__brand">Local AI</span>
                        <div className="settings-top-nav__search">
                            <span className="settings-top-nav__search-icon"><Search size={14} /></span>
                            <input
                                type="text"
                                placeholder="Search settings..."
                                className="settings-top-nav__search-input"
                            />
                        </div>
                    </div>
                    <div className="settings-top-nav__right">
                        <div className="settings-top-nav__icons">
                            <button className="settings-top-nav__icon-btn"><Bell size={18} /></button>
                            <button className="settings-top-nav__icon-btn"><HelpCircle size={18} /></button>
                            <button className="settings-top-nav__icon-btn settings-top-nav__close" onClick={onClose}><X size={18} /></button>
                        </div>
                    </div>
                </header>

                <div className="settings-body">
                    <aside className="settings-sidebar">
                        <div className="settings-sidebar__header">
                            <div className="settings-sidebar__title">SETTINGS</div>
                        </div>
                        <nav className="settings-sidebar__nav">
                            <button
                                className={`settings-nav-item ${activeTab === 'general' ? 'active' : ''}`}
                                onClick={() => setActiveTab('general')}
                            >
                                <span className="settings-nav-icon"><Settings2 size={16} /></span>
                                <span>General</span>
                            </button>
                            <button
                                className={`settings-nav-item ${activeTab === 'ai' ? 'active' : ''}`}
                                onClick={() => setActiveTab('ai')}
                            >
                                <span className="settings-nav-icon"><Brain size={16} /></span>
                                <span>AI Configuration</span>
                            </button>
                            <button
                                className={`settings-nav-item ${activeTab === 'api-keys' ? 'active' : ''}`}
                                onClick={() => setActiveTab('api-keys')}
                            >
                                <span className="settings-nav-icon"><Key size={16} /></span>
                                <span>API Keys</span>
                            </button>
                        </nav>

                        <div className="settings-sidebar__footer">
                            <div className="settings-usage-card">
                                <div className="settings-usage-info">
                                    <div className="settings-usage-title">Local Plan</div>
                                    <div className="settings-usage-subtitle">Privacy-first AI environment.</div>
                                </div>
                            </div>
                        </div>
                    </aside>

                    <main className="settings-main">
                        <div className="settings-main__content">
                            {renderContent()}
                        </div>
                    </main>
                </div>
            </div>
        </div >
    )
}