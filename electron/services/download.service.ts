import { createWriteStream, existsSync, mkdirSync, unlinkSync, chmodSync, renameSync, statSync, readdirSync } from 'fs'
import https from 'https'
import http from 'http'
import path from 'path'
import { EventEmitter } from 'events'
import { execSync } from 'child_process'

export interface DownloadableModel {
    id: string
    name: string
    description: string
    sizeGB: number
    ramRequired: number
    url: string
    filename: string
    tier: 'ultra-light' | 'light' | 'medium' | 'heavy' | 'custom' | 'agent'
}

export interface DownloadProgress {
    id: string
    filename: string
    downloaded: number
    total: number
    percent: number
    speedMBps: number
    etaSeconds: number
}

export interface DownloadedModelInfo {
    id: string
    name: string
    filename: string
    sizeBytes: number
    path: string
}

/**
 * Expanded model catalog — Q4_K_M quantized GGUF models from Hugging Face.
 * Organized by tier based on RAM requirements.
 */
export const AVAILABLE_MODELS: DownloadableModel[] = [
    // Ultra Light Tier (4 GB RAM)
    {
        id: 'tinyllama-1.1b',
        name: 'TinyLlama 1.1B',
        description: 'Ultra-compact model. Fastest responses, runs on almost any hardware.',
        sizeGB: 0.7,
        ramRequired: 4,
        url: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        filename: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        tier: 'ultra-light'
    },
    {
        id: 'llama3.2-1b',
        name: 'Llama 3.2 1B',
        description: 'Meta\'s smallest Llama. Great for simple tasks with minimal resources.',
        sizeGB: 0.8,
        ramRequired: 4,
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        tier: 'ultra-light'
    },

    // Light Tier (6 GB RAM)
    {
        id: 'gemma2-2b',
        name: 'Gemma 2 2B',
        description: 'Google\'s efficient model. Strong reasoning for its compact size.',
        sizeGB: 1.6,
        ramRequired: 6,
        url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
        filename: 'gemma-2-2b-it-Q4_K_M.gguf',
        tier: 'light'
    },
    {
        id: 'llama3.2-3b',
        name: 'Llama 3.2 3B',
        description: 'Lightweight and fast. Ideal for 8 GB RAM or quick tasks.',
        sizeGB: 2.0,
        ramRequired: 6,
        url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        tier: 'light'
    },
    {
        id: 'phi-3.5-mini',
        name: 'Phi 3.5 Mini (3.8B)',
        description: 'Microsoft\'s compact model. Strong reasoning for its size.',
        sizeGB: 2.4,
        ramRequired: 6,
        url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
        filename: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
        tier: 'light'
    },

    // Medium Tier (10–12 GB RAM)
    {
        id: 'mistral-7b',
        name: 'Mistral 7B v0.3',
        description: 'Fast and capable general-purpose model. Great for conversation.',
        sizeGB: 4.4,
        ramRequired: 10,
        url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        filename: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        tier: 'medium'
    },
    {
        id: 'qwen2.5-7b',
        name: 'Qwen 2.5 7B',
        description: 'Excellent multilingual model. Strong at coding, math, and reasoning.',
        sizeGB: 4.7,
        ramRequired: 10,
        url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        tier: 'medium'
    },
    {
        id: 'qwen2.5-coder-7b',
        name: 'Qwen 2.5 Coder 7B',
        description: 'Specialized for code generation, debugging, and technical tasks.',
        sizeGB: 4.7,
        ramRequired: 10,
        url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
        tier: 'medium'
    },
    {
        id: 'llama3.1-8b',
        name: 'Llama 3.1 8B',
        description: 'Meta\'s flagship small model. Excellent all-round performance.',
        sizeGB: 4.9,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        filename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        tier: 'medium'
    },

    // Heavy Tier (16 GB RAM)
    {
        id: 'codellama-13b',
        name: 'CodeLlama 13B',
        description: 'Large code-focused model. Best quality for programming tasks.',
        sizeGB: 7.9,
        ramRequired: 16,
        url: 'https://huggingface.co/TheBloke/CodeLlama-13B-Instruct-GGUF/resolve/main/codellama-13b-instruct.Q4_K_M.gguf',
        filename: 'codellama-13b-instruct.Q4_K_M.gguf',
        tier: 'heavy'
    },
    // Custom & Agent Tiers
    {
        id: 'custom-model',
        name: 'Custom GGUF Model',
        description: 'Use your own local GGUF model file. Supports any GGUF-compatible model.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'custom',
        tier: 'custom'
    },
    {
        id: 'codestral-agent',
        name: 'Codestral Agent',
        description: 'Mistral\'s specialized model for coding tasks. Optimized for high-quality tool execution.',
        sizeGB: 11.2,
        ramRequired: 24,
        url: 'https://huggingface.co/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf',
        filename: 'Codestral-22B-v0.1-Q4_K_M.gguf',
        tier: 'agent'
    },
    {
        id: 'qwen2.5-7b-agent',
        name: 'Qwen2.5 7B Agent',
        description: 'Stable and reliable agent for precise filesystem operations and MCP tool control.',
        sizeGB: 4.7,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        tier: 'agent'
    },
    {
        id: 'deepseek-v2-lite-agent',
        name: 'DeepSeek-V2 Lite Agent',
        description: 'Multi-tool reasoning expert. Efficient MoE architecture for stable agentic flows.',
        sizeGB: 9.5,
        ramRequired: 16,
        url: 'https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf',
        filename: 'DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf',
        tier: 'agent'
    },
    {
        id: 'yi-1.5-9b-agent',
        name: 'Yi-1.5 9B Agent',
        description: 'Enhanced reasoning capabilities for multi-step logical tasks and planning.',
        sizeGB: 5.4,
        ramRequired: 16,
        url: 'https://huggingface.co/bartowski/Yi-1.5-9B-Chat-GGUF/resolve/main/Yi-1.5-9B-Chat-Q4_K_M.gguf',
        filename: 'Yi-1.5-9B-Chat-Q4_K_M.gguf',
        tier: 'agent'
    },
    {
        id: 'llama-3.1-8b-agent',
        name: 'Llama 3.1 8B Agent',
        description: 'Most versatile open-source agent model. High context awareness and logic.',
        sizeGB: 4.9,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        filename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        tier: 'agent'
    },
    {
        id: 'deepseek-coder-6.7b-agent',
        name: 'DeepSeek-Coder 6.7B Agent',
        description: 'Coding-heavy automation specialist. Optimized for deep repo analysis and refactoring.',
        sizeGB: 4.1,
        ramRequired: 12,
        url: 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
        filename: 'deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
        tier: 'agent'
    },
    {
        id: 'phi-3-mini-agent',
        name: 'Phi-3 Mini Agent',
        description: 'Lightweight and ultra-fast Microsoft model. Powerful reasoning for its size.',
        sizeGB: 2.3,
        ramRequired: 8,
        url: 'https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf',
        filename: 'Phi-3-mini-4k-instruct-Q4_K_M.gguf',
        tier: 'agent'
    }
]

const BINARY_FILENAME = 'llama-server'

/**
 * GitHub API URL for the latest llama.cpp release.
 */
const GITHUB_API_LATEST = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest'

/**
 * Manages downloading of models and the llama-server binary.
 * Emits progress events for UI updates.
 */
export class DownloadService extends EventEmitter {
    private activeDownloads = new Map<string, { abort: () => void }>()
    private readonly modelsDir: string
    private readonly llamaDir: string

    constructor(llamaBasePath: string) {
        super()
        this.llamaDir = llamaBasePath
        this.modelsDir = path.join(llamaBasePath, 'models')
        mkdirSync(this.modelsDir, { recursive: true })
    }

    getAvailableModels(): DownloadableModel[] {
        return AVAILABLE_MODELS.map((m) => ({ ...m }))
    }

    isModelDownloaded(modelId: string): boolean {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) return false
        return existsSync(path.join(this.modelsDir, model.filename))
    }

    isBinaryDownloaded(): boolean {
        return existsSync(path.join(this.llamaDir, BINARY_FILENAME))
    }

    getModelPath(modelId: string): string | null {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) return null
        const filePath = path.join(this.modelsDir, model.filename)
        return existsSync(filePath) ? filePath : null
    }

    /**
     * Returns the path of the first available model, or null.
     */
    getFirstAvailableModelPath(): string | null {
        for (const model of AVAILABLE_MODELS) {
            const filePath = path.join(this.modelsDir, model.filename)
            if (existsSync(filePath)) return filePath
        }

        try {
            const files = readdirSync(this.modelsDir)
            const gguf = files.find((f: string) => f.endsWith('.gguf'))
            if (gguf) return path.join(this.modelsDir, gguf)
        } catch {
            // ignore
        }

        return null
    }

    /**
     * Returns info about all downloaded models (id, name, filename, size, path).
     */
    getDownloadedModels(): DownloadedModelInfo[] {
        const result: DownloadedModelInfo[] = []

        for (const model of AVAILABLE_MODELS) {
            const filePath = path.join(this.modelsDir, model.filename)
            if (existsSync(filePath)) {
                try {
                    const stats = statSync(filePath)
                    result.push({
                        id: model.id,
                        name: model.name,
                        filename: model.filename,
                        sizeBytes: stats.size,
                        path: filePath
                    })
                } catch {
                    // ignore stat errors
                }
            }
        }

        return result
    }

    /**
     * Deletes a downloaded model file.
     */
    deleteModel(modelId: string): { success: boolean; error?: string } {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) return { success: false, error: 'Unknown model' }

        const filePath = path.join(this.modelsDir, model.filename)
        if (!existsSync(filePath)) return { success: false, error: 'Model not downloaded' }

        try {
            unlinkSync(filePath)
            return { success: true }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete'
            return { success: false, error: message }
        }
    }

    getBinaryPath(): string {
        return path.join(this.llamaDir, BINARY_FILENAME)
    }

    /**
     * Downloads a model by ID with progress events.
     */
    async downloadModel(modelId: string): Promise<string> {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) throw new Error(`Unknown model: ${modelId}`)

        const destPath = path.join(this.modelsDir, model.filename)
        await this.downloadFile(model.url, destPath, `model:${modelId}`)
        return destPath
    }

    /**
     * Downloads the llama-server binary from the latest GitHub release.
     * 1. Fetches latest release info from GitHub API
     * 2. Finds the ubuntu-x64 tar.gz asset
     * 3. Downloads and extracts all binaries from the archive
     */
    async downloadBinary(): Promise<string> {
        const archiveUrl = await this.resolveLatestBinaryUrl()
        const archivePath = path.join(this.llamaDir, 'llama-bin.tar.gz')
        await this.downloadFile(archiveUrl, archivePath, 'binary')

        const destPath = path.join(this.llamaDir, BINARY_FILENAME)
        try {
            const extractDir = path.join(this.llamaDir, '_extract_tmp')
            mkdirSync(extractDir, { recursive: true })

            execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { timeout: 30000 })

            const findResult = execSync(
                `find "${extractDir}" -name "llama-server" -type f | head -1`,
                { encoding: 'utf-8', timeout: 5000 }
            ).trim()

            if (!findResult) {
                throw new Error('llama-server binary not found in archive')
            }

            const binDir = path.dirname(findResult)
            execSync(`cp -f "${binDir}"/* "${this.llamaDir}/"`, { timeout: 10000 })
            chmodSync(destPath, 0o755)

            try {
                unlinkSync(archivePath)
                execSync(`rm -rf "${extractDir}"`, { timeout: 5000 })
            } catch { /* non-critical cleanup */ }
        } catch (err) {
            try { if (existsSync(archivePath)) unlinkSync(archivePath) } catch { /* ignore */ }
            throw err
        }

        return destPath
    }

    /**
     * Resolves the download URL for the ubuntu-x64 CPU binary from the latest GitHub release.
     */
    private resolveLatestBinaryUrl(): Promise<string> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: '/repos/ggml-org/llama.cpp/releases/latest',
                headers: { 'User-Agent': 'LocalAI-Desktop-App' }
            }

            https.get(options, (res) => {
                let body = ''
                res.on('data', (chunk: Buffer) => { body += chunk.toString() })
                res.on('end', () => {
                    try {
                        const release = JSON.parse(body)
                        const assets = release.assets as Array<{ name: string; browser_download_url: string }>
                        if (!assets || !Array.isArray(assets)) {
                            reject(new Error('Failed to parse GitHub release info'))
                            return
                        }

                        const asset = assets.find((a) =>
                            a.name.includes('ubuntu-x64') &&
                            a.name.endsWith('.tar.gz') &&
                            !a.name.includes('vulkan') &&
                            !a.name.includes('rocm')
                        )

                        if (!asset) {
                            reject(new Error('No ubuntu-x64 binary found in latest release'))
                            return
                        }

                        resolve(asset.browser_download_url)
                    } catch {
                        reject(new Error('Failed to parse GitHub API response'))
                    }
                })
                res.on('error', reject)
            }).on('error', reject)
        })
    }

    /**
     * Cancels an active download.
     */
    cancelDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download) {
            download.abort()
            this.activeDownloads.delete(downloadId)
        }
    }

    /**
     * Core download function with redirect following, progress tracking, and abort support.
     */
    private downloadFile(url: string, destPath: string, downloadId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const tempPath = `${destPath}.download`
            let aborted = false

            const cleanup = (): void => {
                try {
                    if (existsSync(tempPath)) unlinkSync(tempPath)
                } catch { /* ignore */ }
            }

            const abort = (): void => {
                aborted = true
                cleanup()
                reject(new Error('Download cancelled'))
            }

            this.activeDownloads.set(downloadId, { abort })

            const startDownload = (downloadUrl: string, redirectCount = 0): void => {
                if (redirectCount > 5) {
                    cleanup()
                    reject(new Error('Too many redirects'))
                    return
                }

                const client = downloadUrl.startsWith('https') ? https : http
                const req = client.get(downloadUrl, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        startDownload(res.headers.location, redirectCount + 1)
                        return
                    }

                    if (res.statusCode !== 200) {
                        cleanup()
                        reject(new Error(`Download failed: HTTP ${res.statusCode}`))
                        return
                    }

                    const total = parseInt(res.headers['content-length'] ?? '0', 10)
                    let downloaded = 0
                    const startTime = Date.now()

                    const file = createWriteStream(tempPath)

                    res.on('data', (chunk: Buffer) => {
                        if (aborted) return

                        downloaded += chunk.length
                        const elapsed = (Date.now() - startTime) / 1000
                        const speedMBps = elapsed > 0 ? (downloaded / (1024 * 1024)) / elapsed : 0
                        const remaining = total > 0 ? ((total - downloaded) / (1024 * 1024)) / (speedMBps || 1) : 0

                        const progress: DownloadProgress = {
                            id: downloadId,
                            filename: path.basename(destPath),
                            downloaded,
                            total,
                            percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
                            speedMBps: Math.round(speedMBps * 100) / 100,
                            etaSeconds: Math.round(remaining)
                        }

                        this.emit('progress', progress)
                    })

                    res.pipe(file)

                    file.on('finish', () => {
                        file.close(() => {
                            if (aborted) {
                                cleanup()
                                return
                            }

                            try {
                                renameSync(tempPath, destPath)
                            } catch (err) {
                                reject(err)
                                return
                            }

                            this.activeDownloads.delete(downloadId)
                            this.emit('complete', { id: downloadId, path: destPath })
                            resolve()
                        })
                    })

                    file.on('error', (err) => {
                        cleanup()
                        reject(err)
                    })
                })

                req.on('error', (err) => {
                    cleanup()
                    reject(err)
                })
            }

            startDownload(url)
        })
    }
}
