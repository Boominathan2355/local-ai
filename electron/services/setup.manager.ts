import { EventEmitter } from 'events'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, renameSync, chmodSync } from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import { exec, execSync } from 'child_process'

import { DownloadService } from './download.service'

const IS_WINDOWS = process.platform === 'win32'
const BINARY_FILENAME = IS_WINDOWS ? 'llama-server.exe' : 'llama-server'

export interface SetupStatus {
    hasBinary: boolean
    hasModel: boolean
    binaryPath: string
    modelPath: string | null
    llamaDir: string
    updateAvailable?: boolean
}

export interface UpdateInfo {
    updateAvailable: boolean
    latestVersion?: string
    downloadUrl?: string
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

export class SetupManager extends EventEmitter {
    private activeDownloads = new Map<string, { abort: () => void }>()
    private readonly llamaDir: string
    private downloadService: DownloadService
    private isInstalling = false
    private isResolving = false

    constructor(llamaBasePath: string, downloadService: DownloadService) {
        super()
        this.llamaDir = llamaBasePath
        this.downloadService = downloadService
        
        if (!existsSync(this.llamaDir)) {
            mkdirSync(this.llamaDir, { recursive: true })
        }
    }

    getBinaryPath(): string {
        return path.join(this.llamaDir, BINARY_FILENAME)
    }

    isBinaryDownloaded(): boolean {
        return existsSync(this.getBinaryPath())
    }

    async getStatus(): Promise<SetupStatus> {
        const binDir = path.join(this.llamaDir, 'bin')
        const binPath = path.join(binDir, BINARY_FILENAME)
        const modelsDir = path.join(this.llamaDir, 'models')
        
        let hasModel = false
        let modelPath: string | null = null
        
        if (existsSync(modelsDir)) {
            const models = this.downloadService.getDownloadedModels()
            if (models.length > 0) {
                hasModel = true
                modelPath = models[0].path
            }
        }

        return {
            hasBinary: existsSync(binPath),
            hasModel,
            binaryPath: binPath,
            modelPath,
            llamaDir: this.llamaDir
        }
    }

    async checkForUpdate(): Promise<UpdateInfo> {
        try {
            const url = await this.resolveLatestBinaryUrl()
            return {
                updateAvailable: true,
                downloadUrl: url
            }
        } catch (err) {
            console.error('[SetupManager] Failed to check for updates:', err)
            return { updateAvailable: false }
        }
    }

    public async installEngine(): Promise<void> {
        if (this.isInstalling) return
        this.isInstalling = true

        try {
            console.log('[SetupManager] Starting engine installation...')
            this.emit('status', {
                status: 'installing',
                step: 'downloading',
                message: 'Resolving latest binary...'
            })

            const downloadUrl = await this.resolveLatestBinaryUrl()
            const archiveExt = IS_WINDOWS ? '.zip' : '.tar.gz'
            const archivePath = path.join(this.llamaDir, `llama-bin${archiveExt}`)

            this.emit('status', {
                status: 'installing',
                step: 'downloading',
                message: 'Downloading engine...'
            })

            await this.downloadAndExtractBinary(downloadUrl, archivePath)
            
            this.emit('status', {
                status: 'complete',
                step: 'done',
                message: 'Installation complete'
            })
        } catch (err) {
            console.error('[SetupManager] Installation failed:', err)
            this.emit('status', {
                status: 'error',
                step: 'error',
                message: err instanceof Error ? err.message : 'Unknown error'
            })
            throw err
        } finally {
            this.isInstalling = false
        }
    }

    async updateEngine(): Promise<void> {
        const url = await this.resolveLatestBinaryUrl()
        const archiveExt = IS_WINDOWS ? '.zip' : '.tar.gz'
        const archivePath = path.join(this.llamaDir, `llama-bin${archiveExt}`)
        await this.downloadAndExtractBinary(url, archivePath)
    }

    cancelDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download) {
            download.abort()
            this.activeDownloads.delete(downloadId)
        }
    }

    private async downloadAndExtractBinary(url: string, archivePath: string): Promise<string> {
        try {
            const binaryDir = path.join(this.llamaDir, 'bin')
            if (!existsSync(binaryDir)) {
                mkdirSync(binaryDir, { recursive: true })
            }

            console.log('[SetupManager] Downloading binary from:', url)
            await this.downloadFile(url, archivePath, 'binary')

            console.log('[SetupManager] Extracting binary...')
            this.emit('status', {
                status: 'installing',
                step: 'extracting',
                message: 'Extracting engine...'
            })

            const extractCmd = IS_WINDOWS 
                ? `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${binaryDir}' -Force"`
                : `tar -xzf "${archivePath}" -C "${binaryDir}"`

            console.log(`[SetupManager] Running extraction: ${extractCmd}`)

            await new Promise<void>((resolve, reject) => {
                exec(extractCmd, { timeout: 60000 }, (error) => {
                    if (error) {
                        console.error('[SetupManager] Extraction failed:', error)
                        reject(error)
                        return
                    }
                    console.log('[SetupManager] Extraction complete')
                    resolve()
                })
            })

            try {
                if (existsSync(archivePath)) unlinkSync(archivePath)
            } catch { /* ignore */ }

            return binaryDir
        } catch (err) {
            console.error('[SetupManager] downloadAndExtractBinary failed:', err)
            try { if (existsSync(archivePath)) unlinkSync(archivePath) } catch { /* ignore */ }
            throw err
        }
    }

    private resolveLatestBinaryUrl(): Promise<string> {
        if (this.isResolving) return Promise.reject(new Error('Resolution already in progress'))
        this.isResolving = true

        return new Promise<string>((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: '/repos/ggml-org/llama.cpp/releases/latest',
                headers: { 'User-Agent': 'LocalAI-Desktop-App' }
            }

            https.get(options, (res) => {
                let body = ''
                console.log(`[SetupManager] resolveLatestBinaryUrl: HTTP ${res.statusCode}`)
                res.on('data', (chunk: Buffer) => { body += chunk.toString() })
                res.on('end', () => {
                    console.log(`[SetupManager] resolveLatestBinaryUrl: Body length ${body.length}`)
                    try {
                        const release = JSON.parse(body)
                        const assets = release.assets as Array<{ name: string; browser_download_url: string }>
                        if (!assets || !Array.isArray(assets)) {
                            reject(new Error('Failed to parse GitHub release info'))
                            return
                        }

                        let asset: { name: string; browser_download_url: string } | undefined

                        if (IS_WINDOWS) {
                            asset = assets.find((a) =>
                                (a.name.includes('win-amd64') || a.name.includes('win-cpu-x64') || a.name.includes('win-x64')) &&
                                a.name.endsWith('.zip') &&
                                !a.name.includes('vulkan') &&
                                !a.name.includes('rocm')
                            )
                        } else {
                            asset = assets.find((a) =>
                                a.name.includes('ubuntu-x64') &&
                                a.name.endsWith('.tar.gz') &&
                                !a.name.includes('vulkan') &&
                                !a.name.includes('rocm')
                            )
                        }

                        if (!asset) {
                            const platformLabel = IS_WINDOWS ? 'Windows (x64)' : 'Ubuntu (x64)'
                            console.error(`[SetupManager] No compatible binary found for ${platformLabel}. Available assets:`, assets.map(a => a.name))
                            reject(new Error(`No ${platformLabel} binary found in latest release`))
                            return
                        }

                        console.log(`[SetupManager] Resolved latest binary URL: ${asset.browser_download_url} (${asset.name})`)
                        resolve(asset.browser_download_url)
                    } catch (err) {
                        console.error('[SetupManager] Failed to resolve latest binary URL:', err)
                        reject(new Error('Failed to parse GitHub API response'))
                    }
                })
                res.on('error', (err) => {
                    console.error('[SetupManager] GitHub API request error:', err)
                    reject(err)
                })
            }).on('error', (err) => {
                console.error('[SetupManager] GitHub API request error:', err)
                this.isResolving = false
                reject(err)
            })
        }).finally(() => {
            this.isResolving = false
        })
    }

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
                console.log(`[Setup] Download cancelled: ${downloadId}`)
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

                console.log('[Setup] Starting download from:', downloadUrl)
                console.log('[Setup] Platform:', process.platform, 'Arch:', process.arch)

                const client = downloadUrl.startsWith('https') ? https : http
                const req = client.get(downloadUrl, { timeout: 30000 }, (res) => {
                    console.log(`[SetupManager] downloadFile: HTTP ${res.statusCode} for ${downloadUrl}`)
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        console.log(`[Setup] Redirecting to: ${res.headers.location}`)
                        startDownload(res.headers.location, redirectCount + 1)
                        return
                    }

                    if (res.statusCode !== 200) {
                        cleanup()
                        reject(new Error(`Download failed: HTTP ${res.statusCode}`))
                        return
                    }

                    console.log('[Setup] First chunk received, download is flowing')

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
                        const percent = total > 0 ? (downloaded / total) * 100 : 0

                        const progress: DownloadProgress = {
                            id: downloadId,
                            filename: path.basename(destPath),
                            downloaded,
                            total,
                            percent: Math.round(percent),
                            speedMBps: Math.round(speedMBps * 100) / 100,
                            etaSeconds: Math.round(remaining)
                        }

                        // user requested log:
                        // console.log('[Setup] Progress:', Math.round(percent), '% -', bytesDownloaded, '/', totalBytes)
                        if (downloaded % (1024 * 1024 * 5) < chunk.length) { // Log every ~5MB to avoid spamming
                             console.log('[Setup] Progress:', Math.round(percent), '% -', downloaded, '/', total)
                        }

                        this.emit('progress', progress)
                    })

                    res.pipe(file)

                    file.on('finish', () => {
                        req.destroy() // Explicitly destroy to clear timeouts
                        file.close(() => {
                            if (aborted) {
                                cleanup()
                                return
                            }

                            try {
                                renameSync(tempPath, destPath)
                                console.log('[Setup] Download complete')
                            } catch (err) {
                                console.error('[Setup] Failed to rename temp file:', err)
                                reject(err)
                                return
                            }

                            this.activeDownloads.delete(downloadId)
                            this.emit('complete', { id: downloadId, path: destPath })
                            resolve()
                        })
                    })
                })

                req.on('timeout', () => {
                    console.error('[Setup] Download timed out after 30 seconds')
                    req.destroy()
                    cleanup()
                    reject(new Error('Download timed out after 30 seconds'))
                })

                req.on('error', (err) => {
                    console.error('[Setup] Download error:', err)
                    cleanup()
                    reject(err)
                })
            }

            startDownload(url)
        })
    }
}
