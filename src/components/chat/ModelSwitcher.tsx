import React, { useState, useEffect, useRef } from 'react'
import { getLocalAI } from '../../helpers/ipc.helper'
import type { AppSettings } from '../../types/settings.types'

interface Model {
    id: string
    name: string
    tier: string
    downloaded?: boolean
    sizeGB?: number
    provider?: string
}

interface ModelSwitcherProps {
    activeModelId: string | null
    onSwitchModel: (modelId: string) => void
    onOpenLibrary: () => void
    modelStatus: string
    settings: AppSettings
}

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({
    activeModelId,
    onSwitchModel,
    onOpenLibrary,
    modelStatus,
    settings
}) => {
    const [allModels, setAllModels] = useState<Model[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const api = getLocalAI()
        if (!api) return
        api.download.getModels().then(setAllModels)
    }, [activeModelId])

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent): void => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    // Filter models based on API key availability for cloud models
    const filteredAllModels = allModels.filter(m => {
        if (m.tier === 'local') return true;
        if (!m.provider) return true; // Fallback for models without explicit provider

        const provider = m.provider.toLowerCase();
        if (provider.includes('openai')) return !!settings.apiKeys.openai;
        if (provider.includes('anthropic')) return !!settings.apiKeys.anthropic;
        if (provider.includes('google') || provider.includes('gemini')) return !!settings.apiKeys.google;

        return true; // Default to showing if provider is unknown
    });

    const readyModels = filteredAllModels.filter(m => {
        if (m.downloaded) return true
        if (m.tier === 'cloud' || m.tier === 'agent') {
            return settings.activatedCloudModels.includes(m.id)
        }
        return false
    })

    const availableModels = filteredAllModels.filter(m => !readyModels.find(rm => rm.id === m.id))

    // List Limiting Logic (Max 5 total)
    const MAX_ITEMS = 5;
    const displayedReady = readyModels.slice(0, MAX_ITEMS);
    const displayedAvailable = availableModels.slice(0, Math.max(0, MAX_ITEMS - displayedReady.length));

    const activeModel = readyModels.find((m) => m.id === activeModelId)
    const displayName = activeModel?.name ?? 'No Model Selected'

    const statusIcon = modelStatus === 'ready' ? '🟢'
        : modelStatus === 'loading' ? '🟡'
            : modelStatus === 'generating' ? '🔵'
                : '🔴'

    return (
        <div className="switcher" ref={dropdownRef} id="model-switcher">
            <button
                className="switcher__toggle"
                onClick={() => setIsOpen(!isOpen)}
                id="switcher-toggle"
            >
                <span className="switcher__status">{statusIcon}</span>
                <span className="switcher__name">{displayName}</span>
                <span className="switcher__arrow">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
                <div className="switcher__dropdown" id="switcher-dropdown">
                    {/* Ready Section */}
                    {displayedReady.length > 0 && (
                        <>
                            <div className="switcher__section-label">Ready to Use</div>
                            {displayedReady.map((model) => (
                                <div key={model.id} className={`switcher__item-wrap ${model.id === activeModelId ? 'switcher__item--active' : ''}`}>
                                    <div className="switcher__item-info">
                                        <span className="switcher__item-name">
                                            {model.name}
                                            {model.tier === 'cloud' && <span className="switcher__item-cloud-tag">Cloud</span>}
                                            {model.tier === 'agent' && <span className="switcher__item-agent-tag">Bot</span>}
                                        </span>
                                        <span className="switcher__item-size">
                                            {model.tier === 'cloud' || model.tier === 'agent' ? 'Remote' : `${model.sizeGB} GB`}
                                        </span>
                                    </div>
                                    <button
                                        className="switcher__item-action switcher__item-action--select"
                                        onClick={() => {
                                            if (model.id !== activeModelId) {
                                                onSwitchModel(model.id)
                                            }
                                            setIsOpen(false)
                                        }}
                                        id={`switch-${model.id}`}
                                    >
                                        {model.id === activeModelId ? '✓' : 'Select'}
                                    </button>
                                </div>
                            ))}
                        </>
                    )}

                    {/* Available Section */}
                    {displayedAvailable.length > 0 && (
                        <>
                            <div className="switcher__section-label">Available to Add</div>
                            {displayedAvailable.map((model) => (
                                <div key={model.id} className="switcher__item-wrap switcher__item-wrap--available">
                                    <div className="switcher__item-info">
                                        <span className="switcher__item-name">
                                            {model.name}
                                            {model.tier === 'cloud' && <span className="switcher__item-cloud-tag">Cloud</span>}
                                            {model.tier === 'agent' && <span className="switcher__item-agent-tag">Bot</span>}
                                        </span>
                                        <span className="switcher__item-size">
                                            {model.tier === 'cloud' || model.tier === 'agent' ? 'API Key' : `${model.sizeGB} GB`}
                                        </span>
                                    </div>
                                    <button
                                        className="switcher__item-action switcher__item-action--activate"
                                        onClick={() => {
                                            onOpenLibrary()
                                            setIsOpen(false)
                                        }}
                                        id={`activate-${model.id}`}
                                    >
                                        {model.tier === 'local' ? 'Get' : 'Add'}
                                    </button>
                                </div>
                            ))}
                        </>
                    )}

                    <div className="switcher__divider" />
                    <button
                        className="switcher__item switcher__item--library"
                        onClick={() => { onOpenLibrary(); setIsOpen(false) }}
                        id="switcher-open-library"
                    >
                        📚 Full Model Library
                    </button>
                </div>
            )}
        </div>
    )
}

