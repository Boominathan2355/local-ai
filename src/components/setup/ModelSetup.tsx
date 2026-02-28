import React, { useState, useEffect, useRef } from 'react'
import { getLocalAI } from '../../helpers/ipc.helper'

interface DownloadableModel {
    id: string
    name: string
    description: string
    sizeGB: number
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
    const [error, setError] = useState<string | null>(null)

    const cleanupRef = useRef<Array<() => void>>([])

    // Load initial status and models
    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        api.setup.getStatus().then((s) => {
            setStatus(s)
            if (s.hasBinary && s.hasModel) {
                onComplete()
            } else if (s.hasBinary) {
                setCurrentStep('model')
            }
        })

        api.download.getModels().then((m) => {
            setModels(m)
            // Pre-select the first downloaded or recommended model
            const downloaded = m.find((model) => model.downloaded)
            if (downloaded) {
                setSelectedModelId(downloaded.id)
            } else {
                setSelectedModelId(m[0]?.id ?? null)
            }
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
                    setTimeout(onComplete, 500)
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
        <div className="setup" id="model-setup">
            <div className="setup__header">
                <div className="setup__icon">🚀</div>
                <h1 className="setup__title">Setup Local AI</h1>
                <p className="setup__subtitle">
                    Download the inference engine and an AI model to get started.
                    Everything runs locally on your machine.
                </p>
            </div>

            {/* Step Indicator */}
            <div className="setup__steps">
                <div className={`setup__step ${currentStep === 'binary' ? 'setup__step--active' : ''} ${status.hasBinary ? 'setup__step--done' : ''}`}>
                    <div className="setup__step-number">{status.hasBinary ? '✓' : '1'}</div>
                    <span>Engine</span>
                </div>
                <div className={`setup__step-line ${status.hasBinary ? 'setup__step-line--done' : ''}`} />
                <div className={`setup__step ${currentStep === 'model' ? 'setup__step--active' : ''} ${status.hasModel ? 'setup__step--done' : ''}`}>
                    <div className="setup__step-number">{status.hasModel ? '✓' : '2'}</div>
                    <span>Model</span>
                </div>
                <div className={`setup__step-line ${status.hasModel ? 'setup__step-line--done' : ''}`} />
                <div className={`setup__step ${currentStep === 'done' ? 'setup__step--done' : ''}`}>
                    <div className="setup__step-number">{currentStep === 'done' ? '✓' : '3'}</div>
                    <span>Ready</span>
                </div>
            </div>

            {/* Step 1: Binary Download */}
            {currentStep === 'binary' && !isDownloading && (
                <div className="setup__actions animate-fadeIn">
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
                        First, download the llama.cpp inference engine (~5 MB).
                        This is the runtime that powers your AI assistant.
                    </p>
                    <button
                        className="setup__download-btn"
                        onClick={handleAction}
                        id="download-binary-btn"
                    >
                        ⬇ Download Inference Engine
                    </button>
                </div>
            )}

            {/* Step 2: Model Selection */}
            {currentStep === 'model' && !isDownloading && (
                <>
                    <div className="setup__models animate-fadeIn" id="model-list">
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
                                    ) : index === 0 ? (
                                        <span className="model-card__badge model-card__badge--recommended">Recommended</span>
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
                                ✓ Use This Model
                            </button>
                        ) : (
                            <button
                                className="setup__download-btn"
                                onClick={handleAction}
                                disabled={!selectedModelId}
                                id="download-model-btn"
                            >
                                ⬇ Download {models.find((m) => m.id === selectedModelId)?.name ?? 'Model'}
                            </button>
                        )}
                    </div>
                </>
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

            {/* Error */}
            {error && (
                <div className="setup__error animate-slideUp" id="download-error">
                    {error}
                </div>
            )}
        </div>
    )
}
