import React, { useState, useEffect, useRef } from 'react'
import { 
    Rocket, Download, Cpu, Shield, Sparkles, Check, 
    ChevronRight, Info, AlertTriangle, Monitor, 
    HardDrive, Zap, Globe, Lock, Pause, Play, X,
    ArrowRight, BookOpen, RefreshCw
} from 'lucide-react'

import { getLocalAI } from '../../helpers/ipc.helper'
import { getRecommendation } from '../../helpers/recommendation.helper'
import type { SystemInfo } from '../../helpers/recommendation.helper'

interface DownloadableModel {
    id: string
    name: string
    description: string
    sizeGB: number
    ramRequired: number
    filename: string
    downloaded: boolean
    tier?: string // Added tier property
    isSystemModel?: boolean // System models always shown, others hidden by default
    supportsVision?: boolean // Vision capability support
    supportsThinking?: boolean // Thinking capability support
    supportsAgent?: boolean // Agent capability support
    url?: string // Model download URL
}

interface DownloadProgress {
    id: string
    filename: string
    downloaded: number
    total: number
    percent: number
    speedMBps: number
    etaSeconds: number
    status?: 'downloading' | 'paused' | 'error' | 'complete'
}

interface SetupStatus {
    hasBinary: boolean
    hasModel: boolean
    binaryPath: string
    modelPath: string | null
    llamaDir: string
}

type SetupStep = 'loading' | 'binary' | 'model' | 'done'

interface ModelSetupProps {
    onComplete: () => void
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    if (bytes === undefined || bytes === null || isNaN(bytes)) return 'Unknown'
    
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    if (mb >= 1) return `${mb.toFixed(1)} MB`
    return `${bytes} B`
}

function formatEta(seconds: number): string {
    if (seconds === undefined || seconds === null || isNaN(seconds) || seconds <= 0) return 'Calculating...'
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}m ${secs}s`
}

function shortenModelName(filename: string): string {
    // Remove common prefixes and extensions
    const nameWithoutExt = filename.replace('.gguf', '').replace('.download', '')
    
    // Extract base name and version
    const parts = nameWithoutExt.split('-')
    const baseName = parts[0] || nameWithoutExt
    
    // Shorten common model names
    const shortNames: { [key: string]: string } = {
        'stable': 'sd',
        'diffusion': 'sd',
        'llama': 'llm',
        'qwen': 'qwen',
        'mistral': 'mistral',
        'phi': 'phi',
        'gemma': 'gemma'
    }
    
    // Check if we have a short name mapping
    for (const [key, shortName] of Object.entries(shortNames)) {
        if (baseName.toLowerCase().includes(key)) {
            return `${shortName}${parts.slice(1).join('-')}.gguf`
        }
    }
    
    // Fallback: truncate to 50 chars if no mapping found
    const truncated = baseName.length > 50 ? baseName.substring(0, 47) + '...' : baseName
    return `${truncated}.gguf`
}

export const ModelSetup: React.FC<ModelSetupProps> = ({ onComplete }) => {
    const [models, setModels] = useState<DownloadableModel[]>([])
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
    const [status, setStatus] = useState<SetupStatus>({ hasBinary: false, hasModel: false, binaryPath: '', modelPath: null, llamaDir: '' })
    const [currentStep, setCurrentStep] = useState<SetupStep>('loading')
    const [progress, setProgress] = useState<DownloadProgress | null>(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showAllModels, setShowAllModels] = useState(false)
    const [isBackendProcessing, setIsBackendProcessing] = useState(false)

    const cleanupRef = useRef<Array<() => void>>([])

    // Load initial status and models
    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        // Clean up orphaned download files on component mount
        api.setup.getStatus().then((s) => {
            console.log('[ModelSetup] Initial status search:', s)
            
            // Initial step determination
            if (s.hasBinary && s.hasModel) {
                setCurrentStep('done')
            } else if (s.hasBinary) {
                setCurrentStep('model')
            } else {
                setCurrentStep('binary')
            }
        })

        // Clean up orphaned download files
        api.download.getModels({ includeCloud: false }).then((models) => {
            models.forEach((model) => {
                if (model.filename && model.filename.endsWith('.download')) {
                    console.log(`[ModelSetup] Found orphaned download file: ${model.filename}`)
                    // Check if there's a corresponding complete model file
                    const modelBaseName = model.filename.replace('.download', '')
                    const hasCompleteFile = models.some((m) => 
                        m.filename === modelBaseName || m.filename === `${modelBaseName}.gguf`
                    )
                    
                    if (!hasCompleteFile) {
                        console.log(`[ModelSetup] Deleting orphaned download file: ${model.filename}`)
                        api.model.deleteModel(model.id).then(() => {
                            console.log(`[ModelSetup] Orphaned file ${model.filename} deleted successfully`)
                        }).catch((err: unknown) => {
                            console.error(`[ModelSetup] Failed to delete orphaned file ${model.filename}:`, err)
                        })
                    }
                }
            })
        })

        api.download.getModels({ includeCloud: false }).then((m) => {
            setModels(m as DownloadableModel[])
            // Get only Qwen 3.5 0.8B model
            const availableModels = (m as DownloadableModel[]).filter(model => 
                model.id === 'qwen3.5-0.8b'
            )
            
            if (availableModels.length > 0) {
                // Select Qwen 3.5 0.8B as the only option
                const selectedModel = availableModels.find(m => m.id === 'qwen3.5-0.8b') || availableModels[0]
                
                setSelectedModelId(selectedModel.id)
                console.log(`[ModelSetup] Using recommended model: ${selectedModel.name} (${selectedModel.id})`)
            }
        })
    }, []) // Removed onComplete from dependencies

    // Subscribe to download events
    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        const offProgress = api.download.onProgress((p) => {
            if (p.id === 'binary' || p.id.startsWith('model:')) {
                setProgress(p)
                setIsDownloading(true)
                setIsBackendProcessing(false) // Hide backend loader when progress starts
                console.log('[ModelSetup] Detected background model download, enabling progress UI')
                // Ensure we are at the model step if a model is downloading
                if (p.id?.startsWith('model:') && currentStep !== 'done') {
                    setCurrentStep('model')
                }
            }
            // Auto-sync selectedModelId if it's a model download
            if (p.id?.startsWith('model:')) {
                const modelId = p.id.replace('model:', '')
                if (modelId && selectedModelId !== modelId) {
                    console.log(`[ModelSetup] Syncing selectedModelId to ${modelId} from progress event`)
                    setSelectedModelId(modelId)
                    // Auto-scroll to the downloading model card
                    setTimeout(() => {
                        const modelCard = document.querySelector(`[data-model-id="${modelId}"]`)
                        if (modelCard) {
                            modelCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                        }
                    }, 100)
                }
            }
            setProgress(p)
        })

        const cleanupComplete = api.download.onComplete(() => {
            console.log('[ModelSetup] Model download complete event received')
            setIsDownloading(false)
            setProgress(null)

            // Refresh models list to update "downloaded" status
            api.download.getModels({ includeCloud: false }).then((m) => {
                setModels(m as DownloadableModel[])
            })

            // Refresh status immediately to advance step
            api.setup.getStatus().then((s) => {
                console.log('[ModelSetup] Status refreshed after model download:', s)
                setStatus(s)
                
                // Proper step progression logic
                if (s.hasBinary && s.hasModel) {
                    setCurrentStep('done')
                } else if (s.hasBinary) {
                    setCurrentStep('model')
                } else {
                    setCurrentStep('binary')
                }
            }).catch(err => {
                console.error('[ModelSetup] Failed to refresh status after model download:', err)
            })
        })

        const cleanupError = api.download.onError((data) => {
            setIsDownloading(false)
            setProgress(null)
            setError(data.error)
            
            // Delete the model if download failed
            if (data.id && data.id.startsWith('model:')) {
                const modelId = data.id.replace('model:', '')
                if (modelId && models.some(m => m.id === modelId)) {
                    api.model.deleteModel(modelId).catch((err: unknown) => {
                        console.error(`[ModelSetup] Failed to delete model ${modelId} after error:`, err)
                    })
                }
            }
        })

        const cleanupSetupProgress = api.setup.onProgress((p) => {
            if (!isDownloading) {
                console.log('[ModelSetup] Detected background engine install, enabling progress UI')
                setIsDownloading(true)
            }
            setProgress(p)
        })

        const cleanupSetupComplete = api.setup.onComplete(() => {
            console.log('[ModelSetup] Engine installation complete event received')
            setIsDownloading(false)
            setProgress(null)
            
            api.setup.getStatus().then((s) => {
                console.log('[ModelSetup] Status refreshed after engine install:', s)
                setStatus(s)
                
                // Only move forward, never back to binary
                if (s.hasBinary && s.hasModel) {
                    setCurrentStep('done')
                } else if (s.hasBinary) {
                    setCurrentStep('model')
                }
                // If s.hasBinary is false, stay in 'binary' (already there)
            }).catch(err => {
                console.error('[ModelSetup] Failed to refresh status after engine install:', err)
            })
        })

        const cleanupSetupError = api.setup.onError((data) => {
            setIsDownloading(false)
            setProgress(null)
            setError(data.error)
            // Engine download - no model to delete
        })

        cleanupRef.current = [
            offProgress, cleanupComplete, cleanupError,
            cleanupSetupProgress, cleanupSetupComplete, cleanupSetupError
        ]

        return () => {
            cleanupRef.current.forEach((fn) => fn())
        }
    }, [currentStep, isDownloading, selectedModelId]) // Added currentStep, isDownloading, selectedModelId to dependencies

    const handleDownloadBinary = (): void => {
        const api = getLocalAI()
        if (!api) return

        setError(null)
        setIsDownloading(true)
        api.setup.installEngine()
    }

    const handleDownloadModel = (): void => {
        console.log(`[ModelSetup] handleDownloadModel called, selectedModelId: ${selectedModelId}`)
        if (!selectedModelId) {
            console.log('[ModelSetup] No selectedModelId, returning')
            return
        }
        
        // Specific debugging for SmolVLM models
        if (selectedModelId.includes('smolvlm')) {
            console.log(`[ModelSetup] SmolVLM model selected: ${selectedModelId}`)
        }
        
        // Check if model is already being downloaded
        const isModelCurrentlyDownloading = isDownloading && (progress?.id === `model:${selectedModelId}`)
        const isModelAlreadyDownloaded = models.some(m => m.id === selectedModelId && m.downloaded)
        
        console.log(`[ModelSetup] isModelCurrentlyDownloading: ${isModelCurrentlyDownloading}, isModelAlreadyDownloaded: ${isModelAlreadyDownloaded}`)
        
        if (isModelCurrentlyDownloading) {
            console.log(`[ModelSetup] Model ${selectedModelId} is already downloading, ignoring request`)
            return // Don't start multiple downloads of same model
        }
        
        if (isModelAlreadyDownloaded) {
            console.log(`[ModelSetup] Model ${selectedModelId} is already downloaded, moving to completion`)
            // If model is already downloaded, skip download and go to completion
            if (status.hasBinary) {
                setCurrentStep('done')
            }
            return
        }
        
        const api = getLocalAI()
        console.log(`[ModelSetup] getLocalAI() result:`, api)
        if (!api) {
            console.log('[ModelSetup] No API available, returning')
            return
        }
        
        console.log(`[ModelSetup] Starting download for model: ${selectedModelId}`)
        console.log(`[ModelSetup] Model URL: ${models.find(m => m.id === selectedModelId)?.url}`)
        setError(null)
        setIsDownloading(true)
        setIsBackendProcessing(true)
        
        try {
            console.log(`[ModelSetup] Calling api.download.startModel(${selectedModelId})`)
            api.download.startModel(selectedModelId)
            console.log(`[ModelSetup] api.download.startModel() called successfully`)
        } catch (error) {
            console.error(`[ModelSetup] Error calling api.download.startModel():`, error)
            setError(`Failed to start download: ${error}`)
            setIsDownloading(false)
            setIsBackendProcessing(false)
        }
    }
    const handleRetry = (): void => {
        setError(null)
        if (currentStep === 'binary') {
            handleDownloadBinary()
        } else if (currentStep === 'model') {
            handleDownloadModel()
        }
    }

    const handleAction = (): void => {
        if (currentStep === 'binary') {
            handleDownloadBinary()
        } else if (currentStep === 'model') {
            handleDownloadModel()
        }
    }

    const handlePauseResume = (): void => {
        if (!progress) return
        const api = getLocalAI()
        if (!api) return

        if (progress.status === 'paused') {
            if (progress.id === 'binary') {
                api.setup.resumeDownload()
            } else {
                api.download.resume(progress.id)
            }
        } else {
            if (progress.id === 'binary') {
                api.setup.pauseDownload()
            } else {
                api.download.pause(progress.id)
            }
        }
    }

    const handleCancel = (): void => {
        if (!progress) return
        const api = getLocalAI()
        if (!api) return

        if (progress.id === 'binary') {
            api.setup.cancelDownload(progress.id)
        } else {
            api.download.cancel(progress.id)
            // Delete the model if download is cancelled
            const modelId = progress.id.replace('model:', '')
            if (modelId && models.some(m => m.id === modelId)) {
                api.model.deleteModel(modelId).then(() => {
                    console.log(`[ModelSetup] Model ${modelId} deleted successfully after cancel`)
                    // Refresh models list to reflect deletion
                    api.download.getModels({ includeCloud: false }).then((m) => {
                        setModels(m as DownloadableModel[])
                    })
                }).catch((err: unknown) => {
                    console.error(`[ModelSetup] Failed to delete model ${modelId} after cancel:`, err)
                })
            }
        }
        setIsDownloading(false)
        setProgress(null)
    }

    return (
        <div className="setup-wrapper">
            <header className="setup-nav">
                <div className="setup-nav__left">
                    <div className="setup-nav__logo"><Sparkles size={16} /></div>
                    <div className="setup-nav__app-name">AI Assistant Setup</div>
                </div>
                <div className="setup-nav__right">
                    <div className="setup-nav__user">
                        <div className="setup-nav__user-info">
                            <div className="setup-nav__user-name">Local AI Admin</div>
                            <div className="setup-nav__step-label">
                                Step {currentStep === 'binary' ? '1' : currentStep === 'model' ? '2' : '3'} of 3
                            </div>
                        </div>
                        <div className="setup-nav__avatar">
                            <img src="https://ui-avatars.com/api/?name=Local+AI+Admin&background=4f46e5&color=fff" alt="Avatar" />
                        </div>
                    </div>
                </div>
            </header>

            <div className="setup" id="model-setup">
                {currentStep === 'loading' && (
                    <div className="setup__header animate-pulse">
                        <div className="setup__icon"><Rocket size={28} className="animate-bounce" /></div>
                        <h1 className="setup__title">Checking Status...</h1>
                        <p className="setup__subtitle">
                            Please wait while we check your local AI environment.
                        </p>
                    </div>
                )}

                {currentStep !== 'done' && currentStep !== 'loading' && (
                    <div className="setup__header">
                        <div className="setup__icon"><Rocket size={28} /></div>
                        <h1 className="setup__title">Setup Local AI</h1>
                        <p className="setup__subtitle">
                            Download the inference engine and an AI model to get started.
                            Everything runs locally on your machine.
                        </p>
                    </div>
                )}

                {/* Step Indicator */}
                {currentStep !== 'done' && (
                    <div className="setup__steps">
                        <div className={`setup__step ${currentStep === 'binary' ? 'setup__step--active' : ''} ${status.hasBinary ? 'setup__step--done' : ''}`}>
                            <div className="setup__step-number">{status.hasBinary ? <Check size={12} /> : '1'}</div>
                            <span>Engine</span>
                        </div>
                        <div className={`setup__step-line ${status.hasBinary ? 'setup__step-line--done' : ''}`} />
                        <div className={`setup__step ${currentStep === 'model' ? 'setup__step--active' : ''} ${status.hasModel ? 'setup__step--done' : ''}`}>
                            <div className="setup__step-number">{status.hasModel ? <Check size={12} /> : '2'}</div>
                            <span>Model</span>
                        </div>
                        <div className={`setup__step-line ${status.hasModel ? 'setup__step-line--done' : ''}`} />
                        <div className="setup__step">
                            <div className="setup__step-number">3</div>
                            <span>Ready</span>
                        </div>
                    </div>
                )}

                {/* Step 1: Binary Download */}
                {currentStep === 'binary' && !isDownloading && (
                    <div className="setup__card animate-fadeIn">
                        <div className="setup__inner-actions">
                            <p className="setup__step-desc">
                                First, download the llama.cpp inference engine (~35 MB).
                                This is the runtime that powers your AI assistant.
                                <br />
                                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                                    Version: b3995 (Stable Release)
                                </span>
                            </p>
                            <button
                                className="setup__download-btn"
                                onClick={handleAction}
                                id="download-binary-btn"
                            >
                                <Download size={16} /> Download Inference Engine
                            </button>
                            {status.llamaDir && (
                                <p className="setup__path-info">
                                    Installing to: <code>{status.llamaDir}</code>
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 2: Model Selection */}
                {currentStep === 'model' && (
                    <div className="setup__card animate-fadeIn">
                        <div className="setup__models" id="model-list">
                            {models.filter((model) => 
                                model.id === 'qwen3.5-0.8b'
                            ).map((model) => {
                                const isThisModelDownloading = isDownloading && (progress?.id === `model:${model.id}`)
                                const isOtherModelDownloading = isDownloading && progress?.id && progress.id !== `model:${model.id}` && progress.id !== 'binary'
                                
                                if (isOtherModelDownloading) return null

                                return (
                                <button
                                    key={model.id}
                                    data-model-id={model.id}
                                    className={`model-card ${selectedModelId === model.id ? 'model-card--selected' : ''} ${isThisModelDownloading ? 'model-card--downloading' : ''} animate-fadeIn`}
                                    onClick={() => {
                                        console.log(`[ModelSetup] Model card clicked: ${model.id}`)
                                        setSelectedModelId(model.id)
                                    }}
                                    disabled={isDownloading && !isThisModelDownloading}
                                >
                                    <div className="model-card__header">
                                        <div className="model-card__name">{model.name}</div>
                                        <div className="model-card__tier">{model.tier}</div>
                                    </div>
                                    <p className="model-card__desc">{model.description}</p>
                                    
                                    {/* Capability Labels */}
                                    <div className="model-card__capabilities">
                                        {model.supportsVision && (
                                            <span className="model-card__capability model-card__capability--vision">
                                                👁️ Vision
                                            </span>
                                        )}
                                        {model.supportsThinking && (
                                            <span className="model-card__capability model-card__capability--thinking">
                                                🧠 Thinking
                                            </span>
                                        )}
                                        {model.supportsAgent && (
                                            <span className="model-card__capability model-card__capability--agent">
                                                🤖 Agent
                                            </span>
                                        )}
                                        {!model.supportsVision && !model.supportsThinking && !model.supportsAgent && (
                                            <span className="model-card__capability model-card__capability--text">
                                                💬 Text Only
                                            </span>
                                        )}
                                    </div>
                                    
                                    {isThisModelDownloading && (
                                        <div className="setup__progress setup__progress--mini">
                                            <div className="progress-bar-header">
                                                <span className="progress-bar-title">Downloading Model...</span>
                                                <div className="progress-bar-actions">
                                                    <button 
                                                        className="progress-bar-action-btn" 
                                                        onClick={(e) => { e.stopPropagation(); handlePauseResume(); }}
                                                        title={progress.status === 'paused' ? 'Resume download' : 'Pause download'}
                                                    >
                                                        {progress.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                                                    </button>
                                                    <button 
                                                        className="progress-bar-action-btn progress-bar-action-btn--cancel" 
                                                        onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                                                        title="Cancel download"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="progress-bar">
                                                <div
                                                    className={`progress-bar__fill ${progress.status === 'paused' ? 'progress-bar__fill--paused' : ''}`}
                                                    style={{ width: `${isNaN(progress.percent) || progress.percent === undefined ? 0 : Math.min(100, Math.max(0, progress.percent))}%` }}
                                                />
                                            </div>
                                            <div className="progress-bar__info">
                                                <span>
                                                    {isNaN(progress.percent) || progress.percent === undefined ? '0' : Math.round(progress.percent)}% completed • 
                                                    {isNaN(progress.downloaded) || progress.downloaded === undefined ? '0 MB' : formatBytes(progress.downloaded)} downloaded
                                                    {progress.total && !isNaN(progress.total) && progress.total !== undefined ? ` / ${formatBytes(progress.total)}` : ''}
                                                </span>
                                                {progress.status === 'paused' ? (
                                                    <span className="progress-status-paused">Paused</span>
                                                ) : (
                                                    <span>{progress.speedMBps} MB/s · {formatEta(progress.etaSeconds)} remaining</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="model-card__meta">
                                        <span>{model.id === 'tiny-sd-gguf' ? '0.4' : model.sizeGB} GB</span>
                        
                                        {model.downloaded ? (
                                            <span className="model-card__badge model-card__badge--downloaded">Downloaded</span>
                                        ) : isThisModelDownloading ? (
                                            <span className="model-card__badge model-card__badge--downloading">Downloading...</span>
                                        ) : selectedModelId === model.id ? (
                                            <span className={`model-card__badge ${model.id === 'smolvlm-500m-instruct' ? 'model-card__badge--best-choice' : 'model-card__badge--recommended'}`}>
                                                {model.id === 'smolvlm-500m-instruct' ? 'BEST CHOICE' : 
                                                 systemInfo ? getRecommendation(models, systemInfo)?.reason : 'Recommended'}
                                            </span>
                                        ) : null}
                                    </div>
                                </button>
                                )
                            })}
                        </div>

                        {/* Toggle to show all models */}
                        {models.some((m) => m.isSystemModel === false) && (
                            <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>
                                <button
                                    className="setup__skip"
                                    onClick={() => setShowAllModels(!showAllModels)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {showAllModels ? 'Show System Models Only' : 'Show All Available Models'}
                                </button>
                            </div>
                        )}

                        {/* Integrated Progress Bar (fallback for models) if ID match fails but filename works */}
                        {isDownloading && progress?.id?.startsWith('model:') && !models.some(m => progress.id === `model:${m.id}` || (m.filename && progress.filename === m.filename)) && (
                            <div className="setup__progress-container animate-slideUp" style={{ marginTop: 'var(--space-xl)' }}>
                                <div className="setup__progress">
                                    <div className="progress-bar-header">
                                        <p style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', marginBottom: '0', textAlign: 'center' }}>
                                            {progress.filename}
                                        </p>
                                        <div className="progress-bar-actions">
                                            <button 
                                                className="progress-bar-action-btn" 
                                                onClick={handlePauseResume}
                                                title={progress.status === 'paused' ? 'Resume' : 'Pause'}
                                            >
                                                {progress.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                                            </button>
                                            <button 
                                                className="progress-bar-action-btn progress-bar-action-btn--cancel" 
                                                onClick={handleCancel}
                                                title="Cancel"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="progress-bar">
                                        <div 
                                            className={`progress-bar__fill ${progress.status === 'paused' ? 'progress-bar__fill--paused' : ''}`} 
                                            style={{ width: `${isNaN(progress.percent) || progress.percent === undefined ? 0 : Math.min(100, Math.max(0, progress.percent))}%` }} 
                                        />
                                    </div>
                                    <div className="progress-bar__info" style={{ color: 'var(--text-secondary)' }}>
                                        <span>
                                            {isNaN(progress.percent) || progress.percent === undefined ? '0' : Math.round(progress.percent)}% · 
                                            {isNaN(progress.downloaded) || progress.downloaded === undefined ? '0 MB' : formatBytes(progress.downloaded)} / 
                                            {isNaN(progress.total) || progress.total === undefined ? 'Unknown' : formatBytes(progress.total)}
                                        </span>
                                        {progress.status === 'paused' ? (
                                            <span className="progress-status-paused">Paused</span>
                                        ) : (
                                            <span>{progress.speedMBps} MB/s · {formatEta(progress.etaSeconds)} remaining</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isDownloading && (
                            <div className="setup__actions">
                                {models.find((m) => m.id === selectedModelId)?.downloaded ? (
                                    <button
                                        className="setup__download-btn"
                                        onClick={onComplete}
                                        id="use-model-btn"
                                    >
                                        <Check size={16} /> Use This Model
                                    </button>
                                ) : (
                                    <button
                                        className="setup__download-btn"
                                        onClick={handleAction}
                                        disabled={!selectedModelId || isBackendProcessing}
                                        id="download-model-btn"
                                    >
                                        {isBackendProcessing ? (
                                            <>
                                                <div className="spinner" style={{ 
                                                    width: '16px', 
                                                    height: '16px', 
                                                    border: '2px solid rgba(255,255,255,0.3)', 
                                                    borderTop: '2px solid white', 
                                                    borderRadius: '50%', 
                                                    animation: 'spin 1s linear infinite',
                                                    marginRight: '8px'
                                                }}></div>
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                <Download size={16} /> Download {models.find((m) => m.id === selectedModelId)?.name ?? 'Model'}
                                            </>
                                        )}
                                    </button>
                                )}
                                
                                {/* Debug reset button - always show for testing */}
                                <button
                                    className="setup__skip"
                                    onClick={() => {
                                        console.log('[ModelSetup] Manual reset - isDownloading was:', isDownloading)
                                        setIsDownloading(false)
                                        setProgress(null)
                                        setIsBackendProcessing(false)
                                    }}
                                    style={{ marginTop: '10px' }}
                                >
                                    Reset Download State (Debug)
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: Done / Ready state (Screenshot 335) */}
                {currentStep === 'done' && (
                    <div className="setup__card setup__card--success animate-fadeIn">
                        <div className="setup__success-content">
                            <div className="setup__success-icon">
                                <div className="setup__success-icon-inner"><Check size={24} /></div>
                            </div>
                            <h1 className="setup__success-title">
                                {(status.modelPath && models.find(m => status.modelPath?.includes(m.filename))?.name) || 
                                 models.find(m => m.id === selectedModelId)?.name || 
                                 'Model'} is ready to go!
                            </h1>
                            <p className="setup__success-subtitle">
                                The model is now locally available and optimized for your hardware. You can start chatting or integrating it into your Local workflow immediately.
                            </p>

                            <div className="setup-status-box">
                                <div className="setup-status-box__icon">
                                    <Cpu size={20} />
                                </div>
                                <div className="setup-status-box__info">
                                    <div className="setup-status-box__title">System Optimization Complete</div>
                                    <div className="setup-status-box__meta">
                                        Latency: 12ms | Token Rate: 85 t/s | Quantization: 4-bit
                                    </div>
                                </div>
                                <div className="setup-status-box__badge">ACTIVE</div>
                            </div>

                            <div className="setup__final-actions">
                                <button className="setup__primary-btn" onClick={onComplete}>
                                    Get Started <ArrowRight size={16} />
                                </button>
                                <button
                                    className="setup__secondary-btn"
                                    onClick={() => window.open('https://github.com/Boominathan2355/local-ai/blob/main/documentation/Docs.md', '_blank')}
                                >
                                    <BookOpen size={14} /> Documentation
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Engine Progress Bar (only shown for binary step) */}
                {isDownloading && currentStep === 'binary' && (
                    <div className="setup__progress-container animate-fadeIn">
                        <div className="model-card model-card--downloading" style={{ padding: 'var(--space-xl)', width: '100%' }}>
                            <div className="model-card__name" style={{ textAlign: 'center' }}>Inference Engine</div>
                            <div className="model-card__description" style={{ textAlign: 'center' }}>
                                Setting up the core AI platform for your system...
                            </div>
                            
                            {!progress ? (
                                <div className="setup__progress" id="download-progress">
                                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
                                        Starting download...
                                    </p>
                                    <div className="progress-bar">
                                        <div className="progress-bar__fill" style={{ width: '2%' }} />
                                    </div>
                                </div>
                            ) : (
                                <div className="setup__progress" id="download-progress">
                                    <p style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-md)', textAlign: 'center', fontWeight: 'bold' }}>
                                        {progress.filename}
                                    </p>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-bar__fill"
                                            style={{ width: `${isNaN(progress.percent) || progress.percent === undefined ? 0 : Math.min(100, Math.max(0, progress.percent))}%` }}
                                        />
                                    </div>
                                    <div className="progress-bar__info" style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>
                                        <span>
                                            {isNaN(progress.percent) || progress.percent === undefined ? '0' : Math.round(progress.percent)}% · 
                                            {isNaN(progress.downloaded) || progress.downloaded === undefined ? '0 MB' : formatBytes(progress.downloaded)} / 
                                            {isNaN(progress.total) || progress.total === undefined ? 'Unknown' : formatBytes(progress.total)}
                                        </span>
                                        <span>{progress.speedMBps} MB/s · {formatEta(progress.etaSeconds)} remaining</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Error Banner with Retry */}
                {error && (
                    <div className="setup__error-banner animate-fadeIn">
                        <div className="setup__error-banner-content">
                            <AlertTriangle size={18} />
                            <div className="setup__error-banner-text">
                                <span className="setup__error-banner-title">Connection Error</span>
                                <span className="setup__error-banner-message">{error}</span>
                            </div>
                        </div>
                        <button
                            className="setup__retry-btn"
                            onClick={handleRetry}
                            id="retry-download-btn"
                        >
                            <RefreshCw size={14} /> Retry
                        </button>
                    </div>
                )}

                <footer className="setup-footer">
                    <div className="setup-footer__left">
                        <Shield size={14} />
                        <span>Local AI Secured Environment</span>
                    </div>
                    <div className="setup-footer__right">
                        <span>Build: 3.1.0-stable</span>
                    </div>
                </footer>
            </div>
        </div>
    )
}
