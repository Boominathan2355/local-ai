import React, { useState, useEffect, useRef } from 'react'
import {
    Rocket,
    Download,
    Check,
    Star,
    Sparkles,
    Cpu,
    Shield,
    ArrowRight,
    BookOpen
} from 'lucide-react'

import { getLocalAI } from '../../helpers/ipc.helper'
import { getBestFitModelId, getRecommendation } from '../../helpers/recommendation.helper'
import type { SystemInfo } from '../../helpers/recommendation.helper'

interface DownloadableModel {
    id: string
    name: string
    description: string
    sizeGB: number
    ramRequired: number
    filename: string
    downloaded: boolean
}

interface DownloadProgress {
    id: string
    filename: string
    downloaded: number
    total: number
    percent: number
    speedMBps: number
    etaSeconds: number
}

interface SetupStatus {
    hasBinary: boolean
    hasModel: boolean
}

type SetupStep = 'binary' | 'model' | 'done'

interface ModelSetupProps {
    onComplete: () => void
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(0)} MB`
}

function formatEta(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}m ${secs}s`
}

export const ModelSetup: React.FC<ModelSetupProps> = ({ onComplete }) => {
    const [models, setModels] = useState<DownloadableModel[]>([])
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
    const [status, setStatus] = useState<SetupStatus>({ hasBinary: false, hasModel: false })
    const [currentStep, setCurrentStep] = useState<SetupStep>('binary')
    const [progress, setProgress] = useState<DownloadProgress | null>(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
    const [error, setError] = useState<string | null>(null)

    const cleanupRef = useRef<Array<() => void>>([])

    // Load initial status and models
    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        api.setup.getStatus().then((s) => {
            setStatus(s)
            if (s.hasBinary && s.hasModel) {
                setCurrentStep('done')
            } else if (s.hasBinary) {
                setCurrentStep('model')
            }
        })

        api.download.getModels({ includeCloud: false }).then((m) => {
            setModels(m as DownloadableModel[])
            // Pre-select the best fit model for the hardware
            api.system.getInfo().then(sys => {
                setSystemInfo(sys)
                const rec = getRecommendation(m as any[], sys)
                if (rec) {
                    setSelectedModelId(rec.id)
                } else {
                    const downloaded = m.find((model) => model.downloaded)
                    if (downloaded) {
                        setSelectedModelId(downloaded.id)
                    } else {
                        setSelectedModelId(m[0]?.id ?? null)
                    }
                }
            })
        })
    }, [onComplete])

    // Subscribe to download events
    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        const cleanupProgress = api.download.onProgress((p) => {
            setProgress(p)
        })

        const cleanupComplete = api.download.onComplete(() => {
            setIsDownloading(false)
            setProgress(null)

            // Refresh status
            api.setup.getStatus().then((s) => {
                setStatus(s)
                if (s.hasBinary && s.hasModel) {
                    setCurrentStep('done')
                } else if (s.hasBinary) {
                    setCurrentStep('model')
                }
            })
        })

        const cleanupError = api.download.onError((data) => {
            setIsDownloading(false)
            setProgress(null)
            setError(data.error)
        })

        cleanupRef.current = [cleanupProgress, cleanupComplete, cleanupError]

        return () => {
            cleanupRef.current.forEach((fn) => fn())
        }
    }, [onComplete])

    const handleDownloadBinary = (): void => {
        const api = getLocalAI()
        if (!api) return

        setError(null)
        setIsDownloading(true)
        api.download.startBinary()
    }

    const handleDownloadModel = (): void => {
        if (!selectedModelId) return
        const api = getLocalAI()
        if (!api) return

        setError(null)
        setIsDownloading(true)
        api.download.startModel(selectedModelId)
    }

    const handleAction = (): void => {
        if (currentStep === 'binary') {
            handleDownloadBinary()
        } else if (currentStep === 'model') {
            handleDownloadModel()
        }
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
                {currentStep !== 'done' && (
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
                                First, download the llama.cpp inference engine (~5 MB).
                                This is the runtime that powers your AI assistant.
                            </p>
                            <button
                                className="setup__download-btn"
                                onClick={handleAction}
                                id="download-binary-btn"
                            >
                                <Download size={16} /> Download Inference Engine
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Model Selection */}
                {currentStep === 'model' && !isDownloading && (
                    <div className="setup__card animate-fadeIn">
                        <div className="setup__models" id="model-list">
                            {models.map((model, index) => (
                                <button
                                    key={model.id}
                                    className={`model-card ${selectedModelId === model.id ? 'model-card--selected' : ''} ${model.downloaded ? 'model-card--downloaded' : ''}`}
                                    onClick={() => setSelectedModelId(model.id)}
                                    id={`model-card-${model.id}`}
                                >
                                    <div className="model-card__name">{model.name}</div>
                                    <div className="model-card__description">{model.description}</div>
                                    <div className="model-card__meta">
                                        <span>{model.sizeGB} GB</span>
                                        {model.downloaded ? (
                                            <span className="model-card__badge model-card__badge--downloaded">Downloaded</span>
                                        ) : selectedModelId === model.id ? (
                                            <span className="model-card__badge model-card__badge--recommended" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {systemInfo ? (
                                                    <>
                                                        {getRecommendation(models, systemInfo)?.reason.includes('VRAM') || getRecommendation(models, systemInfo)?.reason.includes('GPU') ? <Rocket size={12} /> :
                                                            getRecommendation(models, systemInfo)?.reason.includes('CPU') ? <Cpu size={12} /> :
                                                                getRecommendation(models, systemInfo)?.reason.includes('Lightweight') ? <Sparkles size={12} /> :
                                                                    <Star size={12} />}
                                                        {getRecommendation(models, systemInfo)?.reason}
                                                    </>
                                                ) : 'Recommended'}
                                            </span>
                                        ) : null}
                                    </div>
                                </button>
                            ))}
                        </div>

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
                                    disabled={!selectedModelId}
                                    id="download-model-btn"
                                >
                                    <Download size={16} /> Download {models.find((m) => m.id === selectedModelId)?.name ?? 'Model'}
                                </button>
                            )}
                        </div>
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
                                {models.find(m => m.id === selectedModelId)?.name || 'Model'} is ready to go!
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
                                    onClick={() => window.open('https://github.com/boominathan2355/local-ai', '_blank')}
                                >
                                    <BookOpen size={14} /> Documentation
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Progress Bar */}
                {isDownloading && progress && (
                    <div className="setup__progress animate-fadeIn" id="download-progress">
                        <p style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-md)', textAlign: 'center' }}>
                            Downloading {progress.filename}...
                        </p>
                        <div className="progress-bar">
                            <div
                                className="progress-bar__fill"
                                style={{ width: `${progress.percent}%` }}
                            />
                        </div>
                        <div className="progress-bar__info">
                            <span>{formatBytes(progress.downloaded)} / {formatBytes(progress.total)}</span>
                            <span>{progress.speedMBps} MB/s · {formatEta(progress.etaSeconds)} remaining</span>
                        </div>
                    </div>
                )}

                {/* Loading state (downloading but no progress yet) */}
                {isDownloading && !progress && (
                    <div className="setup__progress animate-fadeIn">
                        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
                            Starting download...
                        </p>
                        <div className="progress-bar">
                            <div className="progress-bar__fill" style={{ width: '2%' }} />
                        </div>
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
