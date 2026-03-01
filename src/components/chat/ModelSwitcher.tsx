import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Check, Circle } from 'lucide-react'
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
    activeModelName?: string | null
    onSwitchModel: (modelId: string, modelName?: string) => void
    modelStatus: string
    settings: AppSettings
}

const STATUS_COLORS: Record<string, string> = {
    ready: '#10b981',
    loading: '#f59e0b',
    generating: '#6366f1',
    stopped: '#ef4444'
}

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({
    activeModelId,
    activeModelName,
    onSwitchModel,
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

    const readyModels = allModels.filter((m: Model) => {
        if (m.provider && m.provider !== 'local') {
            return (settings.enabledCloudModels || []).includes(m.id)
        }
        return !!m.downloaded
    })

    const activeModel = readyModels.find((m) => m.id === activeModelId)
    const displayName = activeModel?.name ?? activeModelName ?? 'No Model Selected'
    const statusColor = STATUS_COLORS[modelStatus] ?? STATUS_COLORS.stopped

    return (
        <div className="switcher" ref={dropdownRef} id="model-switcher">
            <button
                className="switcher__toggle"
                onClick={() => setIsOpen(!isOpen)}
                id="switcher-toggle"
            >
                <Circle size={8} fill={statusColor} color={statusColor} className="switcher__status-dot" />
                <span className="switcher__name">{displayName}</span>
                {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {isOpen && (
                <div className="switcher__dropdown" id="switcher-dropdown">
                    {readyModels.length > 0 ? (
                        <>
                            <div className="switcher__section-label">Your Models</div>
                            {readyModels.map((model: Model) => {
                                const isActive = model.id === activeModelId
                                return (
                                    <button
                                        key={model.id}
                                        className={`switcher__item-wrap ${isActive ? 'switcher__item--active' : ''}`}
                                        onClick={() => {
                                            if (!isActive) {
                                                onSwitchModel(model.id, model.name)
                                            }
                                            setIsOpen(false)
                                        }}
                                        id={`switch-${model.id}`}
                                    >
                                        <div className="switcher__item-info">
                                            <span className="switcher__item-name">
                                                {model.name}
                                                {model.tier === 'cloud' && <span className="switcher__item-cloud-tag">Cloud</span>}
                                                {model.tier === 'agent' && <span className="switcher__item-agent-tag">Bot</span>}
                                            </span>
                                            <span className="switcher__item-size">
                                                {model.provider ? 'Remote' : `${model.sizeGB} GB`}
                                            </span>
                                        </div>
                                        {isActive && <Check size={16} className="switcher__check-icon" />}
                                    </button>
                                )
                            })}
                        </>
                    ) : (
                        <div className="switcher__empty">No models available. Add one from the library.</div>
                    )}
                </div>
            )}
        </div>
    )
}
