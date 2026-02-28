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

    const availableModels = allModels.filter(m => {
        if (m.downloaded) return true
        if (m.tier === 'cloud' || m.tier === 'agent') {
            return settings.activatedCloudModels.includes(m.id)
        }
        return false
    })
    const activeModel = availableModels.find((m) => m.id === activeModelId)
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
                    <div className="switcher__section-label">Active Models</div>
                    {availableModels.length === 0 && (
                        <div className="switcher__empty">No models ready</div>
                    )}
                    {availableModels.map((model) => (
                        <button
                            key={model.id}
                            className={`switcher__item ${model.id === activeModelId ? 'switcher__item--active' : ''}`}
                            onClick={() => {
                                if (model.id !== activeModelId) {
                                    onSwitchModel(model.id)
                                }
                                setIsOpen(false)
                            }}
                            id={`switch-${model.id}`}
                        >
                            <span className="switcher__item-name">
                                {model.name}
                                {model.tier === 'cloud' && <span className="switcher__item-cloud-tag">Cloud</span>}
                                {model.tier === 'agent' && <span className="switcher__item-agent-tag">Bot</span>}
                            </span>
                            <span className="switcher__item-size">
                                {model.tier === 'cloud' || model.tier === 'agent' ? 'Remote' : `${model.sizeGB} GB`}
                            </span>
                            {model.id === activeModelId && (
                                <span className="switcher__item-check">✓</span>
                            )}
                        </button>
                    ))}
                    <div className="switcher__divider" />
                    <button
                        className="switcher__item switcher__item--library"
                        onClick={() => { onOpenLibrary(); setIsOpen(false) }}
                        id="switcher-open-library"
                    >
                        📚 Browse Model Library
                    </button>
                </div>
            )}
        </div>
    )
}

