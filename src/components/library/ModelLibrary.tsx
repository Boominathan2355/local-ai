import React, { useState, useEffect, useCallback } from 'react'
import { Zap, Bot, Library as LibraryIcon, CheckCircle2, AlertTriangle, XCircle, X, Download } from 'lucide-react'
import { getLocalAI } from '../../helpers/ipc.helper'
import { getCompatibility, getBestFitModelId, getRecommendation } from '../../helpers/recommendation.helper'
import type { SystemInfo, CompatibilityStatus, ModelInfo } from '../../helpers/recommendation.helper'

import type { AppSettings } from '../../types/settings.types'

// Interface definitions moved to recommendation.helper.ts and imported

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

const CATEGORY_ORDER = ['local', 'cloud', 'agent'] as const
type ModelCategory = typeof CATEGORY_ORDER[number]

const CATEGORY_LABELS: Record<ModelCategory, string> = {
    'local': 'Local Models',
    'cloud': 'Cloud Models',
    'agent': 'AI Agents'
}

const CATEGORY_ICONS: Record<ModelCategory, React.ReactNode> = {
    'local': <LibraryIcon size={16} />,
    'cloud': <Zap size={16} />,
    'agent': <Bot size={16} />
}

// Logic moved to recommendation.helper.ts

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
}

function formatEta(seconds: number): string {
    if (seconds > 33600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    if (seconds > 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${seconds}s`
}

export const ModelLibrary: React.FC<ModelLibraryProps> = ({ isOpen, onClose, activeModelId, onModelSwitch, settings, onUpdateSettings }) => {
    const [models, setModels] = useState<ModelInfo[]>([])
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
    const [showAll, setShowAll] = useState(true)
    const [isSwitching, setIsSwitching] = useState(false)
    const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadProgress>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [activeCategory, setActiveCategory] = useState<ModelCategory>('local')

    const loadData = useCallback(() => {
        const api = getLocalAI()
        if (!api) return

        api.download.getModels().then(setModels)
        api.system.getInfo().then(setSystemInfo)
    }, [])

    useEffect(() => {
        if (!isOpen) return
        loadData()

        // Poll system info while library is open
        const interval = setInterval(() => {
            const api = getLocalAI()
            if (api) {
                api.system.getInfo().then(setSystemInfo)
            }
        }, 5000)

        return () => clearInterval(interval)
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

        setIsSwitching(true)
        onModelSwitch(modelId, model.name)
    }

    const handleCancel = (modelId: string): void => {
        const api = getLocalAI()
        if (!api) return
        api.download.cancel(`model:${modelId}`)
    }

    const handleToggleCloudModel = (modelId: string): void => {
        const currentEnabled = settings.enabledCloudModels || []
        const isEnabled = currentEnabled.includes(modelId)
        const nextEnabled = isEnabled
            ? currentEnabled.filter(id => id !== modelId)
            : [...currentEnabled, modelId]

        onUpdateSettings({ enabledCloudModels: nextEnabled })
    }

    useEffect(() => {
        if (isSwitching) {
            const timer = setTimeout(() => setIsSwitching(false), 2000)
            return () => clearTimeout(timer)
        }
    }, [isSwitching])

    const renderModelCard = (model: ModelInfo) => {
        const progress = activeDownloads[`model:${model.id}`]
        const error = errors[`model:${model.id}`] ?? errors[model.id]
        const compat = model.ramRequired > 0
            ? getCompatibility(model.ramRequired, systemInfo)
            : null
        const rec = systemInfo ? getRecommendation(models, systemInfo) : null
        const isRecommended = rec?.id === model.id
        const isActive = model.id === activeModelId

        return (
            <div
                key={model.id}
                className={`library__card ${model.downloaded ? 'library__card--downloaded' : ''} ${isActive ? 'library__card--active' : ''}`}
                id={`model-${model.id}`}
            >
                <div className="library__card-header">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <h4 className="library__card-name">{model.name}</h4>
                        {(model.tier === 'agent' || (model.provider && model.provider !== 'local')) && (
                            <span className="library__card-badge library__card-badge--agent">
                                <Bot size={10} /> AGENT SUPPORT
                            </span>
                        )}
                        {model.provider && model.provider !== 'local' && (
                            <span className="library__card-badge library__card-badge--cloud">
                                <Zap size={10} /> {model.provider.toUpperCase()} MODEL
                            </span>
                        )}
                        {isRecommended && !model.downloaded && (
                            <span className="library__card-badge library__card-badge--recommended" style={{ background: 'var(--accent-primary)', color: 'white' }}>
                                {rec?.reason.toUpperCase()}
                            </span>
                        )}
                    </div>
                    {isActive && <span className="library__card-active">Active</span>}
                </div>
                <p className="library__card-desc">{model.description}</p>
                <div className="library__card-meta">
                    {model.provider && model.provider !== 'local' ? (
                        <span className="library__card-provider-badge">
                            {model.provider.toUpperCase()}
                        </span>
                    ) : model.tier === 'custom' ? (
                        <span>Manual GGUF Import</span>
                    ) : (
                        <>
                            <span>{model.sizeGB} GB</span>
                            <span>Needs {model.ramRequired} GB RAM</span>
                            {compat && (
                                <span className={`library__compat ${compat.className}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {compat.level === 'good' ? <CheckCircle2 size={12} /> : compat.level === 'warn' ? <AlertTriangle size={12} /> : <XCircle size={12} />}
                                    {compat.label}
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
                        {model.provider && model.provider !== 'local' ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        className={`library__toggle ${(settings.enabledCloudModels || []).includes(model.id) ? 'active' : ''}`}
                                        onClick={() => handleToggleCloudModel(model.id)}
                                        title={(settings.enabledCloudModels || []).includes(model.id) ? "Deactivate model" : "Activate model"}
                                    >
                                        <div className="library__toggle-handle" />
                                    </button>
                                    <span style={{ fontSize: '12px', opacity: 0.7 }}>
                                        {(settings.enabledCloudModels || []).includes(model.id) ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                {!isActive && (settings.enabledCloudModels || []).includes(model.id) && (
                                    <button
                                        className="library__btn library__btn--use"
                                        onClick={() => handleSwitch(model.id)}
                                        disabled={isSwitching}
                                    >
                                        {isSwitching ? 'Connecting...' : 'Use Model'}
                                    </button>
                                )}
                            </div>
                        ) : model.tier === 'custom' ? (
                            <button className="library__btn library__btn--download" disabled>
                                Coming Soon: Select File
                            </button>
                        ) : model.downloaded ? (
                            <>
                                {!isActive && (
                                    <button
                                        className={`library__btn library__btn--use ${model.tier === 'agent' ? 'library__btn--agent' : ''}`}
                                        onClick={() => handleSwitch(model.id)}
                                        disabled={isSwitching}
                                    >
                                        {isSwitching ? (model.tier === 'agent' ? 'Initializing...' : 'Switching...') : (model.tier === 'agent' ? 'Start Agent Session' : 'Use This Model')}
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
    }

    if (!isOpen) return null

    const totalRamGB = systemInfo ? (systemInfo.totalRamMB / 1024).toFixed(1) : '...'
    const freeRamGB = systemInfo ? (systemInfo.freeRamMB / 1024).toFixed(1) : '...'

    const getFilteredModels = () => {
        if (activeCategory === 'agent') {
            return models.filter(m => m.tier === 'agent')
        } else if (activeCategory === 'cloud') {
            return models.filter(m => m.provider && m.provider !== 'local' && m.tier !== 'agent')
        } else {
            return models.filter(m => (!m.provider || m.provider === 'local') && m.tier !== 'agent')
        }
    }

    const filteredModels = getFilteredModels()

    return (
        <div className="library-overlay" id="model-library">
            <div className="library">
                <header className="library__header">
                    <h2 className="library__title">
                        Model Library
                    </h2>
                    <button className="library__close" onClick={onClose} id="library-close"><X size={20} /></button>
                </header>

                {systemInfo && (
                    <div className="library__capacity">
                        {/* Group 1: RAM */}
                        <div className="capacity__group">
                            <div className="capacity__stats">
                                <span className="capacity__item">
                                    <strong>RAM:</strong> {freeRamGB} / {totalRamGB} GB free
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

                        {/* Group 2: CPU */}
                        <div className="capacity__group">
                            <div className="capacity__stats">
                                <span className="capacity__item">
                                    <strong>CPU:</strong> {systemInfo.cpuCores} cores · {systemInfo.cpuUsagePercent ?? 0}% usage
                                </span>
                            </div>
                            <div className="capacity__bar">
                                <div
                                    className="capacity__bar-fill capacity__bar-fill--cpu"
                                    style={{ width: `${systemInfo.cpuUsagePercent ?? 0}%` }}
                                />
                            </div>
                            <div className="capacity__bar-label">CPU Usage</div>
                        </div>

                        {/* Group 3: Disk */}
                        <div className="capacity__group">
                            <div className="capacity__stats">
                                <span className="capacity__item">
                                    <strong>Disk:</strong> {(systemInfo.diskFreeGB || 0).toFixed(0)} / {(systemInfo.diskTotalGB || 0).toFixed(0)} GB free
                                </span>
                            </div>
                            <div className="capacity__bar">
                                <div
                                    className="capacity__bar-fill capacity__bar-fill--disk"
                                    style={{ width: `${Math.min(100, (((systemInfo.diskTotalGB || 1) - (systemInfo.diskFreeGB || 0)) / (systemInfo.diskTotalGB || 1)) * 100)}%` }}
                                />
                            </div>
                            <div className="capacity__bar-label">Disk Usage</div>
                        </div>

                        {/* Group 4: GPU */}
                        {systemInfo.gpuName && (
                            <div className="capacity__group">
                                <div className="capacity__stats">
                                    <span className="capacity__item">
                                        <strong>GPU:</strong> {systemInfo.gpuName}
                                    </span>
                                </div>
                                <div className="capacity__bar">
                                    <div
                                        className="capacity__bar-fill capacity__bar-fill--gpu"
                                        style={{ width: `${Math.min(100, ((systemInfo.gpuMemoryTotalMB! - (systemInfo.gpuMemoryFreeMB || 0)) / systemInfo.gpuMemoryTotalMB!) * 100)}%` }}
                                    />
                                </div>
                                <div className="capacity__bar-label">GPU VRAM: {((systemInfo.gpuMemoryTotalMB! - (systemInfo.gpuMemoryFreeMB || 0)) / 1024).toFixed(1)} / {(systemInfo.gpuMemoryTotalMB! / 1024).toFixed(1)} GB</div>
                            </div>
                        )}
                    </div>
                )}

                <div className="library__tabs-container">
                    <div className="library__tabs">
                        {CATEGORY_ORDER.map((category) => (
                            <button
                                key={category}
                                className={`library__tab ${activeCategory === category ? 'active' : ''} library__tab--${category}`}
                                onClick={() => setActiveCategory(category)}
                            >
                                {CATEGORY_ICONS[category]}
                                <span>{CATEGORY_LABELS[category]}</span>
                                <span className="library__tab-count">
                                    {category === 'agent'
                                        ? models.filter(m => m.tier === 'agent').length
                                        : category === 'cloud'
                                            ? models.filter(m => m.provider && m.provider !== 'local' && m.tier !== 'agent').length
                                            : models.filter(m => (!m.provider || m.provider === 'local') && m.tier !== 'agent').length
                                    }
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="library__visibility-toggle">
                        <span className="toggle-label">Show Available Models</span>
                        <button
                            className={`library__toggle ${showAll ? 'active' : ''}`}
                            onClick={() => setShowAll(!showAll)}
                            title={showAll ? "Hide models not downloaded/active" : "Show all available models"}
                        >
                            <div className="library__toggle-handle" />
                        </button>
                    </div>
                </div>

                <div className="library__content">
                    <div className="library__sub-groups">
                        {activeCategory === 'cloud' ? (
                            <>
                                {filteredModels.some(m => (settings.enabledCloudModels || []).includes(m.id)) && (
                                    <div className="library__sub-group">
                                        <h5 className="library__sub-header">Active Cloud Models</h5>
                                        <div className="library__grid">
                                            {filteredModels
                                                .filter(m => (settings.enabledCloudModels || []).includes(m.id))
                                                .sort((a, b) => (a.id === activeModelId ? -1 : b.id === activeModelId ? 1 : 0))
                                                .map((model) => renderModelCard(model))}
                                        </div>
                                    </div>
                                )}
                                {showAll ? (
                                    <>
                                        {Array.from(new Set(filteredModels.filter(m => !(settings.enabledCloudModels || []).includes(m.id)).map(m => m.provider))).filter(Boolean).map(provider => (
                                            <div key={provider} className="library__sub-group">
                                                <h5 className="library__sub-header">Available {provider?.toUpperCase()} Models</h5>
                                                <div className="library__grid">
                                                    {filteredModels
                                                        .filter(m => !(settings.enabledCloudModels || []).includes(m.id) && m.provider === provider)
                                                        .map((model) => renderModelCard(model))}
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    !filteredModels.some(m => (settings.enabledCloudModels || []).includes(m.id)) && (
                                        <div className="library__empty">
                                            <p>No cloud models activated.</p>
                                            <button className="library__btn" onClick={() => setShowAll(true)}>Show Available Models</button>
                                        </div>
                                    )
                                )}
                            </>
                        ) : (
                            <>
                                {filteredModels.some(m => m.downloaded) && (
                                    <div className="library__sub-group">
                                        <h5 className="library__sub-header">Downloaded</h5>
                                        <div className="library__grid">
                                            {filteredModels.filter(m => m.downloaded).map((model) => renderModelCard(model))}
                                        </div>
                                    </div>
                                )}
                                {showAll ? (
                                    filteredModels.some(m => !m.downloaded) && (
                                        <div className="library__sub-group">
                                            <h5 className="library__sub-header">Available for Download</h5>
                                            <div className="library__grid">
                                                {filteredModels.filter(m => !m.downloaded).map((model) => renderModelCard(model))}
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    !filteredModels.some(m => m.downloaded) && (
                                        <div className="library__empty">
                                            <p>No models downloaded in this category.</p>
                                            <button className="library__btn" onClick={() => setShowAll(true)}>Show Available Models</button>
                                        </div>
                                    )
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
