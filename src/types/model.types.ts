export type ModelStatusType = 'loading' | 'ready' | 'generating' | 'error' | 'disconnected'

export interface ModelStatus {
    status: ModelStatusType
    modelName: string | null
    modelTier: string | null
    error: string | null
    tokensPerSecond: number | null
}

export interface ServerConfig {
    modelPath: string
    threads: number
    contextSize: number
    gpuLayers: number
    port: number
    host: string
}
