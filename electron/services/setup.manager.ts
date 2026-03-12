import { EventEmitter } from 'events'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, renameSync, chmodSync } from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import { execSync } from 'child_process'

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

    constructor(llamaBasePath: string, downloadService: DownloadService) {
        super()
        this.llamaDir = llamaBasePath
        this.downloadService = downloadService
        mkdirSync(this.llamaDir, { recursive: true })
    }

    getBinaryPath(): string {
        return path.join(this.llamaDir, BINARY_FILENAME)
    }

    isBinaryDownloaded(): boolean {
        return existsSync(this.getBinaryPath())
    }

    async getStatus(): Promise<SetupStatus> {
        const hasBinary = this.isBinaryDownloaded()
        const modelPath = this.downloadService.getFirstAvailableModelPath()

        return {
            hasBinary,
            hasModel: modelPath !== null,
            binaryPath: this.getBinaryPath(),
            modelPath: modelPath,
            llamaDir: this.llamaDir,
            updateAvailable: false // In a real scenario, this could be cached or checked periodically
        }
    }

    async checkForUpdates(): Promise<UpdateInfo> {
        try {
            // For now, simply resolving the latest URL is our "check"
            // If we had a way to check local version vs remote version, we'd do it here.
            // Since we don't store local version easily, we can assume update available if this resolves successfully for demonstration,
            // or just rely on manual updates. A better way would be to check the binary version output, but for now we just return true.
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

    async installEngine(): Promise<string> {
        return this.downloadAndExtractBinary()
    }

    async updateEngine(): Promise<string> {
        return this.downloadAndExtractBinary()
    }

    cancelDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download) {
            download.abort()
            this.activeDownloads.delete(downloadId)
        }
    }

    private async downloadAndExtractBinary(): Promise<string> {
        const archiveUrl = await this.resolveLatestBinaryUrl()
        const archiveExt = IS_WINDOWS ? '.zip' : '.tar.gz'
        const archivePath = path.join(this.llamaDir, `llama-bin${archiveExt}`)

        await this.downloadFile(archiveUrl, archivePath, 'binary')

        const destPath = path.join(this.llamaDir, BINARY_FILENAME)
        try {
            const extractDir = path.join(this.llamaDir, '_extract_tmp')
            mkdirSync(extractDir, { recursive: true })

            if (IS_WINDOWS) {
                execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractDir}' -Force"`, { timeout: 60000 })
                const findResult = execSync(
                    `powershell -Command "Get-ChildItem -Path '${extractDir}' -Recurse -Filter 'llama-server.exe' | Select-Object -First 1 -ExpandProperty FullName"`,
                    { encoding: 'utf-8', timeout: 10000 }
                ).trim()

                if (!findResult) {
                    throw new Error('llama-server.exe not found in archive')
                }

                const binDir = path.dirname(findResult)
                execSync(`powershell -Command "Copy-Item -Path '${binDir}\\*' -Destination '${this.llamaDir}' -Force"`, { timeout: 10000 })
            } else {
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
            }

            try {
                unlinkSync(archivePath)
                if (IS_WINDOWS) {
                    execSync(`powershell -Command "Remove-Item -Path '${extractDir}' -Recurse -Force"`, { timeout: 5000 })
                } else {
                    execSync(`rm -rf "${extractDir}"`, { timeout: 5000 })
                }
            } catch { /* ignored */ }
        } catch (err) {
            try { if (existsSync(archivePath)) unlinkSync(archivePath) } catch { /* ignore */ }
            throw err
        }

        return destPath
    }

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

                        let asset: { name: string; browser_download_url: string } | undefined

                        if (IS_WINDOWS) {
                            asset = assets.find((a) =>
                                a.name.includes('win-amd64') &&
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
                            const platformLabel = IS_WINDOWS ? 'win-amd64' : 'ubuntu-x64'
                            reject(new Error(`No ${platformLabel} binary found in latest release`))
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
