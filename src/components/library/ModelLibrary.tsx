import React, { useState, useEffect, useCallback } from 'react'
import { Feather, Lightbulb, Zap, Database, Cloud, Wrench, Bot, Library as LibraryIcon, CheckCircle2, AlertTriangle, XCircle, X, Download } from 'lucide-react'
import { getLocalAI } from '../../helpers/ipc.helper'

import type { AppSettings } from '../../types/settings.types'

interface ModelInfo {
    id: string
    name: string
    description: string
    sizeGB: number
    ramRequired: number
    tier: string
    filename: string
    downloaded: boolean
    provider?: string
    supportsImages?: boolean
}

interface SystemInfo {
    totalRamMB: number
    freeRamMB: number
    cpuCores: number
    diskFreeGB: number
}

interface DownloadProgress {
    id: string
    percent: number
    speedMBps: number
    etaSeconds: number
    downloaded: number
    total: number
}

interface ModelLibraryProps {
    isOpen: boolean
    onClose: () => void
    activeModelId: string | null
    onModelSwitch: (modelId: string, modelName?: string) => void
    settings: AppSettings
    onUpdateSettings: (changes: Partial<AppSettings>) => void
}

const TIER_ICONS: Record<string, React.ReactNode> = {
    'ultra-light': <Feather size={16} />,
    'light': <Lightbulb size={16} />,
    'medium': <Zap size={16} />,
    'heavy': <Database size={16} />,
    'cloud': <Cloud size={16} />,
    'custom': <Wrench size={16} />,
    'agent': <Bot size={16} />
}

const TIER_LABELS: Record<string, string> = {
    'ultra-light': 'Ultra Light',
    'light': 'Light',
    'medium': 'Medium',
    'heavy': 'Heavy',
    'cloud': 'Cloud API',
    'custom': 'Custom Model',
    'agent': 'AI Agent'
}

const TIER_ORDER = ['ultra-light', 'light', 'medium', 'heavy', 'cloud', 'custom', 'agent']

function getCompatibility(ramRequired: number, totalRamMB: number): { label: string; icon: React.ReactNode; className: string } {
    const totalRamGB = totalRamMB / 1024
    if (totalRamGB >= ramRequired * 1.3) return { label: 'Will run great', icon: <CheckCircle2 size={12} />, className: 'compat--good' }
    if (totalRamGB >= ramRequired) return { label: 'Tight fit', icon: <AlertTriangle size={12} />, className: 'compat--warn' }
    return { label: 'Needs more RAM', icon: <XCircle size={12} />, className: 'compat--bad' }
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
}

function formatEta(seconds: number): string {
    if (seconds > 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    if (seconds > 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${seconds}s`
}

export const ModelLibrary: React.FC<ModelLibraryProps> = ({ isOpen, onClose, activeModelId, onModelSwitch,
    settings,
    onUpdateSettings
}) => {
    const [models, setModels] = useState<ModelInfo[]>([])
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
    const [isSwitching, setIsSwitching] = useState(false)
    const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadProgress>>({})

    // API Key Prompt State
    const [promptModel, setPromptModel] = useState<ModelInfo | null>(null)
    const [apiKeyInput, setApiKeyInput] = useState('')
    const [promptError, setPromptError] = useState<string | null>(null)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const loadData = useCallback(() => {
        const api = getLocalAI()
        if (!api) return

        api.download.getModels().then(setModels)
        api.system.getInfo().then(setSystemInfo)
    }, [])

    useEffect(() => {
        if (!isOpen) return
        loadData()
    }, [isOpen, loadData])

    // Download event listeners
    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        const offProgress = api.download.onProgress((progress) => {
            setActiveDownloads((prev) => ({ ...prev, [progress.id]: progress }))
        })

        const offComplete = api.download.onComplete((data) => {
            setActiveDownloads((prev) => {
                const next = { ...prev }
                delete next[data.id]
                return next
            })
            loadData()
        })

        const offError = api.download.onError((data) => {
            setActiveDownloads((prev) => {
                const next = { ...prev }
                delete next[data.id]
                return next
            })
            setErrors((prev) => ({ ...prev, [data.id]: data.error }))
        })

        return () => { offProgress(); offComplete(); offError() }
    }, [loadData])

    const handleDownload = (modelId: string): void => {
        const api = getLocalAI()
        if (!api) return
        setErrors((prev) => { const n = { ...prev }; delete n[`model:${modelId}`]; return n })
        api.download.startModel(modelId)
    }

    const handleDelete = (modelId: string): void => {
        const api = getLocalAI()
        if (!api) return
        api.model.deleteModel(modelId).then((result) => {
            if (result.error) {
                setErrors((prev) => ({ ...prev, [modelId]: result.error ?? 'Delete failed' }))
            } else {
                loadData()
            }
        })
    }

    const handleSwitch = (modelId: string) => {
        const model = models.find(m => m.id === modelId)
        if (!model) return

        // Check if cloud model needs API key
        if (model.provider) {
            const currentKey = settings.apiKeys[model.provider as keyof typeof settings.apiKeys]
            if (!currentKey) {
                setPromptModel(model)
                setApiKeyInput('')
                setPromptError(null)
                return
            }
        }

        setIsSwitching(true)

        // Add to activated list if not already there
        if (model.provider && !settings.activatedCloudModels.includes(modelId)) {
            onUpdateSettings({
                activatedCloudModels: [...settings.activatedCloudModels, modelId]
            })
        }

        onModelSwitch(modelId, model.name)
    }

    const handleSaveKeyAndActivate = () => {
        if (!promptModel || !promptModel.provider) return

        if (!apiKeyInput.trim()) {
            setPromptError('API Key is required')
            return
        }

        // Basic validation
        if (apiKeyInput.length < 10) { // Simple validation, can be more robust
            setPromptError('Invalid API Key format')
            return
        }

        const mid = promptModel.id
        setIsSwitching(true)

        // Ensure it's in the activated list
        const activatedList = settings.activatedCloudModels.includes(mid)
            ? settings.activatedCloudModels
            : [...settings.activatedCloudModels, mid]

        onUpdateSettings({
            apiKeys: {
                ...settings.apiKeys,
                [promptModel.provider]: apiKeyInput.trim()
            },
            activatedCloudModels: activatedList
        })

        setPromptModel(null)
        onModelSwitch(mid, promptModel.name)
    }

    const handleCancel = (modelId: string): void => {
        const api = getLocalAI()
        if (!api) return
        api.download.cancel(`model:${modelId}`)
    }

    useEffect(() => {
        if (isSwitching) {
            const timer = setTimeout(() => setIsSwitching(false), 2000) // Reset switching state after a delay
            return () => clearTimeout(timer)
        }
    }, [isSwitching])

    if (!isOpen) return null

    const totalRamGB = systemInfo ? (systemInfo.totalRamMB / 1024).toFixed(1) : '...'
    const freeRamGB = systemInfo ? (systemInfo.freeRamMB / 1024).toFixed(1) : '...'
    const groupedModels = TIER_ORDER.map((tier) => ({
        tier,
        label: TIER_LABELS[tier] ?? tier,
        models: models.filter((m) => m.tier === tier)
    })).filter((g) => g.models.length > 0)

    return (
        <>
            <div className="library-overlay" id="model-library">
                <div className="library">
                    <header className="library__header">
                        <h2 className="library__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <LibraryIcon size={24} /> Model Library
                        </h2>
                        <button className="library__close" onClick={onClose} id="library-close"><X size={20} /></button>
                    </header>

                    {systemInfo && (
                        <div className="library__capacity">
                            <div className="capacity__stats">
                                <span className="capacity__item">
                                    <strong>RAM:</strong> {totalRamGB} GB total · {freeRamGB} GB free
                                </span>
                                <span className="capacity__item">
                                    <strong>CPU:</strong> {systemInfo.cpuCores} cores
                                </span>
                                <span className="capacity__item">
                                    <strong>Disk:</strong> {systemInfo.diskFreeGB.toFixed(0)} GB free
                                </span>
                            </div>
                            <div className="capacity__bar">
                                <div
                                    className="capacity__bar-fill"
                                    style={{ width: `${Math.min(100, ((systemInfo.totalRamMB - systemInfo.freeRamMB) / systemInfo.totalRamMB) * 100)}%` }}
                                />
                            </div>
                            <div className="capacity__bar-label">RAM Usage</div>
                        </div>
                    )}

                    <div className="library__content">
                        {groupedModels.map(({ tier, label, models: tierModels }) => (
                            <div key={tier} className={`library__tier library__tier--${tier}`}>
                                <h3 className="library__tier-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {TIER_ICONS[tier]}
                                    {label}
                                    {tier !== 'cloud' && tier !== 'custom' && tier !== 'agent' && (
                                        <span className="library__tier-ram">
                                            {tierModels[0]?.ramRequired ?? 0}+ GB RAM
                                        </span>
                                    )}
                                </h3>
                                <div className="library__grid">
                                    {tierModels.map((model) => {
                                        const progress = activeDownloads[`model:${model.id}`]
                                        const error = errors[`model:${model.id}`] ?? errors[model.id]
                                        const compat = systemInfo
                                            ? getCompatibility(model.ramRequired, systemInfo.totalRamMB)
                                            : null
                                        const isActive = model.id === activeModelId
                                        const isModelSwitching = isSwitching && isActive // Only show switching for the active model

                                        return (
                                            <div
                                                key={model.id}
                                                className={`library__card ${model.downloaded ? 'library__card--downloaded' : ''} ${isActive ? 'library__card--active' : ''}`}
                                                id={`model-${model.id}`}
                                            >
                                                <div className="library__card-header">
                                                    <h4 className="library__card-name">{model.name}</h4>
                                                    {isActive && <span className="library__card-active">Active</span>}
                                                </div>
                                                <p className="library__card-desc">{model.description}</p>
                                                <div className="library__card-meta">
                                                    {model.provider ? (
                                                        <span>API Provider: {model.provider.toUpperCase()}</span>
                                                    ) : tier === 'custom' ? (
                                                        <span>Manual GGUF Import</span>
                                                    ) : (
                                                        <>
                                                            <span>{model.sizeGB} GB</span>
                                                            <span>Needs {model.ramRequired} GB RAM</span>
                                                            {compat && (
                                                                <span className={`library__compat ${compat.className}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    {compat.icon} {compat.label}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>

                                                {progress && (
                                                    <div className="library__progress">
                                                        <div className="library__progress-bar">
                                                            <div
                                                                className="library__progress-fill"
                                                                style={{ width: `${progress.percent}%` }}
                                                            />
                                                        </div>
                                                        <div className="library__progress-info">
                                                            <span>{progress.percent}% · {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}</span>
                                                            <span>{progress.speedMBps} MB/s · {formatEta(progress.etaSeconds)}</span>
                                                        </div>
                                                        <button
                                                            className="library__btn library__btn--cancel"
                                                            onClick={() => handleCancel(model.id)}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}

                                                {error && (
                                                    <div className="library__error">{error}</div>
                                                )}

                                                {!progress && (
                                                    <div className="library__card-actions">
                                                        {model.provider ? (
                                                            !isActive && (
                                                                <button
                                                                    className={`library__btn library__btn--use ${tier === 'agent' ? 'library__btn--agent' : ''}`}
                                                                    onClick={() => handleSwitch(model.id)}
                                                                    disabled={isSwitching}
                                                                >
                                                                    {isSwitching ? 'Activating...' : tier === 'agent' ? 'Start Agent Session' : 'Activate Model'}
                                                                </button>
                                                            )
                                                        ) : tier === 'custom' ? (
                                                            <button className="library__btn library__btn--download" disabled>
                                                                Coming Soon: Select File
                                                            </button>
                                                        ) : model.downloaded ? (
                                                            <>
                                                                {!isActive && (
                                                                    <button
                                                                        className="library__btn library__btn--use"
                                                                        onClick={() => handleSwitch(model.id)}
                                                                        disabled={isSwitching}
                                                                    >
                                                                        {isSwitching ? 'Switching...' : 'Use This Model'}
                                                                    </button>
                                                                )}
                                                                {!isActive && (
                                                                    <button
                                                                        className="library__btn library__btn--delete"
                                                                        onClick={() => handleDelete(model.id)}
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <button
                                                                className="library__btn library__btn--download"
                                                                onClick={() => handleDownload(model.id)}
                                                                disabled={compat?.className === 'compat--bad'}
                                                                title={compat?.className === 'compat--bad' ? `Requires ${model.ramRequired}GB RAM` : ''}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                                            >
                                                                {compat?.className === 'compat--bad' ? (
                                                                    <><XCircle size={16} /> Incompatible</>
                                                                ) : (
                                                                    <><Download size={16} /> Download ({model.sizeGB} GB)</>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* API Key Prompt Modal */}
                {promptModel && (
                    <div className="library__modal-overlay">
                        <div className="library__modal">
                            <h3>Activate {promptModel.name}</h3>
                            <p>This model requires an API key from <strong>{promptModel.provider?.toUpperCase()}</strong>.</p>

                            <div className="library__modal-field">
                                <label>Enter API Key</label>
                                <input
                                    type="password"
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder={promptModel.provider === 'openai' ? 'sk-...' : promptModel.provider === 'google' ? 'AIza...' : 'sk-ant-...'}
                                    autoFocus
                                />
                                {promptError && <span className="library__modal-error">{promptError}</span>}
                            </div>

                            <div className="library__modal-actions">
                                <button className="library__btn" onClick={() => setPromptModel(null)}>Cancel</button>
                                <button className="library__btn library__btn--use" onClick={handleSaveKeyAndActivate}>
                                    Save & Activate
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
