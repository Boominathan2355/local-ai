import { EventEmitter } from 'events'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, renameSync, chmodSync, readdirSync, statSync } from 'fs'
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
    private activeDownloads = new Map<string, { 
        abort: () => void, 
        pause: () => void,
        resume: () => void,
        url: string,
        destPath: string,
        status: 'downloading' | 'paused'
    }>()
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
        // First check standard bin location
        const standardPath = path.join(this.llamaDir, 'bin', BINARY_FILENAME)
        if (existsSync(standardPath)) return standardPath

        // Then check legacy root location
        const legacyPath = path.join(this.llamaDir, BINARY_FILENAME)
        if (existsSync(legacyPath)) return legacyPath

        // Finally check if it's anywhere in the llamaDir (recursive search as last resort)
        const findInDir = (dir: string): string | null => {
            if (!existsSync(dir)) return null
            const files = readdirSync(dir)
            for (const file of files) {
                const fullPath = path.join(dir, file)
                const stat = statSync(fullPath)
                if (stat.isDirectory() && file !== 'models') {
                    const found = findInDir(fullPath)
                    if (found) return found
                } else if (file === BINARY_FILENAME) {
                    return fullPath
                }
            }
            return null
        }
        
        return findInDir(this.llamaDir) || standardPath
    }

    isBinaryDownloaded(): boolean {
        return existsSync(this.getBinaryPath())
    }

    async getStatus(): Promise<SetupStatus> {
        let binPath = this.getBinaryPath()
        const standardPath = path.join(this.llamaDir, 'bin', BINARY_FILENAME)
        console.log(`[SetupManager] getStatus: llamaDir=${this.llamaDir}, binPath=${binPath}, standardPath=${standardPath}`)
        
        // Migration: If found in legacy/recursive but not standard, move it and its dependencies
        if (existsSync(binPath) && binPath !== standardPath) {
            console.log(`[SetupManager] Migrating binary from ${binPath} to ${standardPath}`)
            const binDir = path.dirname(standardPath)
            if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })
            
            const srcDir = path.dirname(binPath)
            try {
                // Move DLLs/dependencies if they are in the same folder
                const moveRecursively = (src: string, dest: string) => {
                    if (!existsSync(src)) return
                    if (statSync(src).isDirectory()) {
                        if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
                        const files = readdirSync(src)
                        for (const file of files) {
                            moveRecursively(path.join(src, file), path.join(dest, file))
                        }
                    } else {
                        const ext = path.extname(src).toLowerCase()
                        // Move critical engine files
                        if (ext === '.dll' || ext === '.so' || path.basename(src) === BINARY_FILENAME) {
                            if (existsSync(dest)) unlinkSync(dest)
                            renameSync(src, dest)
                        }
                    }
                }
                
                const files = readdirSync(srcDir)
                for (const file of files) {
                    moveRecursively(path.join(srcDir, file), path.join(binDir, file))
                }
                binPath = standardPath
            } catch (err) {
                console.error('[SetupManager] Migration failed:', err)
            }
        }

        const hasBinary = existsSync(binPath)
        console.log(`[SetupManager] getStatus: hasBinary=${hasBinary}, binPath=${binPath}`)
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
            hasBinary,
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

    /**
     * Pausing an active download.
     */
    pauseDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download && download.status === 'downloading') {
            download.pause()
            download.status = 'paused'
            this.emit('progress', { id: downloadId, status: 'paused' })
        }
    }

    /**
     * Resumes a paused download.
     */
    resumeDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download && download.status === 'paused') {
            download.status = 'downloading'
            download.resume()
        }
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
            if (existsSync(binaryDir)) {
                console.log('[SetupManager] Cleaning up existing binary directory...')
                const files = readdirSync(binaryDir)
                for (const file of files) {
                    try {
                        const fullPath = path.join(binaryDir, file)
                        if (statSync(fullPath).isDirectory()) {
                            // Recursive delete not needed for simple bin/ folder, but safe
                            continue 
                        }
                        unlinkSync(fullPath)
                    } catch (e) { console.warn(`[SetupManager] Failed to delete ${file}:`, e) }
                }
            } else {
                mkdirSync(binaryDir, { recursive: true })
            }

            if (IS_WINDOWS && existsSync(this.llamaDir)) {
                console.log('[SetupManager] Cleaning up potential platform pollution in root...')
                const rootFiles = readdirSync(this.llamaDir)
                for (const file of rootFiles) {
                    const fullPath = path.join(this.llamaDir, file)
                    if (statSync(fullPath).isDirectory()) continue
                    
                    // Delete Linux leftovers (.so files and extensionless binaries)
                    if (file.endsWith('.so') || (!file.includes('.') && !['LICENSE', 'COMMIT'].includes(file))) {
                        try { unlinkSync(fullPath) } catch (e) { /* ignore */ }
                    }
                }
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
                exec(extractCmd, { timeout: 300000 }, (error, _stdout, stderr) => {
                    if (error) {
                        console.error('[SetupManager] Extraction failed:', error)
                        console.error('[SetupManager] Extraction stderr:', stderr)
                        reject(error)
                        return
                    }
                    console.log('[SetupManager] Extraction complete')
                    resolve()
                })
            })

            // Fix nested folders - search for the binary recursively within binaryDir
            console.log('[SetupManager] Verifying binary location...')
            const findBinary = (dir: string): string | null => {
                if (!existsSync(dir)) return null
                const files = readdirSync(dir)
                for (const file of files) {
                    const fullPath = path.join(dir, file)
                    const stat = statSync(fullPath)
                    if (stat.isDirectory()) {
                        const found = findBinary(fullPath)
                        if (found) return found
                    } else if (file === BINARY_FILENAME) {
                        return fullPath
                    }
                }
                return null
            }

            const foundBinPath = findBinary(binaryDir)
            if (foundBinPath) {
                const expectedBinPath = path.join(binaryDir, BINARY_FILENAME)
                if (foundBinPath !== expectedBinPath) {
                    console.log(`[SetupManager] Binary found in nested folder: ${foundBinPath}. Relocating...`)
                    const nestedDir = path.dirname(foundBinPath)
                    
                    const moveAllRecursively = (src: string, dest: string) => {
                        if (!existsSync(src)) return
                        if (statSync(src).isDirectory()) {
                            if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
                            const files = readdirSync(src)
                            for (const file of files) {
                                moveAllRecursively(path.join(src, file), path.join(dest, file))
                            }
                        } else {
                            if (existsSync(dest)) {
                                try {
                                    if (statSync(dest).isDirectory()) {
                                        // Skip or handle directory collision if necessary
                                    } else {
                                        unlinkSync(dest)
                                    }
                                } catch (e) { /* ignore */ }
                            }
                            if (!existsSync(dest)) {
                                try {
                                    renameSync(src, dest)
                                } catch (e) {
                                    console.error(`[SetupManager] Failed to move ${src} to ${dest}:`, e)
                                }
                            }
                        }
                    }

                    const filesToMove = readdirSync(nestedDir)
                    for (const file of filesToMove) {
                        moveAllRecursively(path.join(nestedDir, file), path.join(binaryDir, file))
                    }
                    console.log('[SetupManager] Relocation complete.')
                }

                // Ensure permissions on Linux
                if (!IS_WINDOWS) {
                    try {
                        chmodSync(expectedBinPath, '755')
                        console.log('[SetupManager] Updated binary permissions.')
                    } catch (err) {
                        console.error('[SetupManager] Failed to update permissions:', err)
                    }
                }
            }

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
            const maxRetries = 3
            let retryCount = 0

            const attemptRequest = () => {
                const options = {
                    hostname: 'api.github.com',
                    path: '/repos/ggml-org/llama.cpp/releases/latest',
                    headers: { 
                        'User-Agent': 'LocalAI-Desktop-App',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    timeout: 30000 // 30 second timeout
                }

                console.log(`[SetupManager] Attempt ${retryCount + 1}/${maxRetries} to resolve binary URL...`)

                const req = https.get(options, (res) => {
                    let body = ''
                    console.log(`[SetupManager] resolveLatestBinaryUrl: HTTP ${res.statusCode}`)
                    
                    if (res.statusCode !== 200) {
                        if (res.statusCode === 403) {
                            reject(new Error('GitHub API rate limit exceeded. Please try again later.'))
                            return
                        }
                        reject(new Error(`GitHub API returned status ${res.statusCode}`))
                        return
                    }
                    
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
                            console.log(`[SetupManager] Platform Check: IS_WINDOWS=${IS_WINDOWS}, platform=${process.platform}`)

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
                        if (retryCount < maxRetries - 1) {
                            retryCount++
                            console.log(`[SetupManager] Retrying in 2 seconds...`)
                            setTimeout(attemptRequest, 2000)
                        } else {
                            // Fallback to direct URL if GitHub API fails
                            console.log('[SetupManager] GitHub API failed, using fallback URL...')
                            const fallbackUrl = this.getFallbackBinaryUrl()
                            if (fallbackUrl) {
                                console.log(`[SetupManager] Using fallback URL: ${fallbackUrl}`)
                                resolve(fallbackUrl)
                            } else {
                                reject(new Error('Failed to connect to GitHub API after multiple attempts. Please check your internet connection.'))
                            }
                        }
                    })
                }).on('error', (err) => {
                    console.error('[SetupManager] GitHub API connection error:', err)
                    if (retryCount < maxRetries - 1) {
                        retryCount++
                        console.log(`[SetupManager] Retrying in 2 seconds...`)
                        setTimeout(attemptRequest, 2000)
                    } else {
                        // Fallback to direct URL if GitHub API fails
                        console.log('[SetupManager] GitHub API failed, using fallback URL...')
                        const fallbackUrl = this.getFallbackBinaryUrl()
                        if (fallbackUrl) {
                            console.log(`[SetupManager] Using fallback URL: ${fallbackUrl}`)
                            resolve(fallbackUrl)
                        } else {
                            reject(new Error('Failed to connect to GitHub API after multiple attempts. Please check your internet connection.'))
                        }
                    }
                }).on('timeout', () => {
                    console.error('[SetupManager] GitHub API request timeout')
                    if (retryCount < maxRetries - 1) {
                        retryCount++
                        console.log(`[SetupManager] Retrying in 2 seconds...`)
                        setTimeout(attemptRequest, 2000)
                    } else {
                        // Fallback to direct URL if GitHub API times out
                        console.log('[SetupManager] GitHub API timed out, using fallback URL...')
                        const fallbackUrl = this.getFallbackBinaryUrl()
                        if (fallbackUrl) {
                            console.log(`[SetupManager] Using fallback URL: ${fallbackUrl}`)
                            resolve(fallbackUrl)
                        } else {
                            reject(new Error('GitHub API request timed out after multiple attempts. Please check your internet connection.'))
                        }
                    }
                })
            }

            // Start the first attempt
            attemptRequest()
        }).finally(() => {
            this.isResolving = false
        })
    }

    private getFallbackBinaryUrl(): string | null {
        // Fallback to known stable release URLs
        if (IS_WINDOWS) {
            return 'https://github.com/ggml-org/llama.cpp/releases/download/b3995/llama-b3995-bin-win-x64.zip'
        } else {
            return 'https://github.com/ggml-org/llama.cpp/releases/download/b3995/llama-b3995-bin-ubuntu-x64.tar.gz'
        }
    }

    private downloadFile(url: string, destPath: string, downloadId: string, resume = false): Promise<void> {
        return new Promise((resolve, reject) => {
            const tempPath = `${destPath}.download`
            let aborted = false
            let paused = false
            let currentReq: http.ClientRequest | null = null

            const cleanup = (): void => {
                try {
                    if (existsSync(tempPath)) unlinkSync(tempPath)
                } catch { /* ignore */ }
            }

            const abort = (): void => {
                aborted = true
                if (currentReq) currentReq.destroy()
                console.log(`[Setup] Download cancelled: ${downloadId}`)
                cleanup()
                reject(new Error('Download cancelled'))
            }

            const pause = (): void => {
                paused = true
                if (currentReq) currentReq.destroy()
                console.log(`[Setup] Download paused: ${downloadId}`)
            }

            const resumeFn = (): void => {
                paused = false
                const downloaded = existsSync(tempPath) ? statSync(tempPath).size : 0
                startDownload(url, 0, downloaded)
            }

            this.activeDownloads.set(downloadId, { 
                abort, 
                pause, 
                resume: resumeFn, 
                url, 
                destPath, 
                status: 'downloading' 
            })

            const startDownload = (downloadUrl: string, redirectCount = 0, offset = 0): void => {
                if (redirectCount > 5) {
                    cleanup()
                    reject(new Error('Too many redirects'))
                    return
                }

                console.log(`[Setup] Starting download from: ${downloadUrl}${offset > 0 ? ` (offset: ${offset})` : ''}`)
                console.log('[Setup] Platform:', process.platform, 'Arch:', process.arch)

                const client = downloadUrl.startsWith('https') ? https : http
                const headers: Record<string, string> = { 'User-Agent': 'LocalAI-Desktop-App' }
                if (offset > 0) {
                    headers['Range'] = `bytes=${offset}-`
                }

                const req = client.get(downloadUrl, { headers, timeout: 300000 }, (res) => {
                    currentReq = req
                    console.log(`[SetupManager] downloadFile: HTTP ${res.statusCode} for ${downloadUrl}`)
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        console.log(`[Setup] Redirecting to: ${res.headers.location}`)
                        startDownload(res.headers.location, redirectCount + 1, offset)
                        return
                    }

                    if (res.statusCode !== 200 && res.statusCode !== 206) {
                        cleanup()
                        reject(new Error(`Download failed: HTTP ${res.statusCode}`))
                        return
                    }

                    console.log('[Setup] First chunk received, download is flowing')

                    // For 206 Partial Content
                    let total = parseInt(res.headers['content-length'] ?? '0', 10)
                    if (res.statusCode === 206 && res.headers['content-range']) {
                        const match = res.headers['content-range'].match(/\/(\d+)$/)
                        if (match) {
                            total = parseInt(match[1], 10)
                        }
                    } else if (offset > 0) {
                        total += offset
                    }

                    let downloaded = offset
                    const startTime = Date.now() - (offset > 0 ? 1000 : 0)

                    const file = createWriteStream(tempPath, { flags: offset > 0 ? 'a' : 'w' })

                    res.on('data', (chunk: Buffer) => {
                        if (aborted) return

                        // Reset timeout on every chunk
                        req.setTimeout(60000)

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
                        req.destroy()
                        file.destroy() // Explicitly destroy to release lock

                        // Wait slightly to let OS close handle
                        setTimeout(async () => {
                            if (aborted || paused) {
                                if (aborted) cleanup()
                                return
                            }

                            const finalize = async () => {
                                for (let attempt = 1; attempt <= 10; attempt++) {
                                    try {
                                        if (aborted) return

                                        if (existsSync(destPath)) {
                                            try { unlinkSync(destPath) } catch (e) { /* ignore */ }
                                        }
                                        renameSync(tempPath, destPath)
                                        console.log('[Setup] Download complete')

                                        this.activeDownloads.delete(downloadId)
                                        this.emit('complete', { id: downloadId, path: destPath })
                                        resolve()
                                        return
                                    } catch (err) {
                                        if (attempt === 10) {
                                            console.error('[Setup] Failed to rename temp file after 10 attempts:', err)
                                            if (!aborted) cleanup()
                                            reject(err)
                                            return
                                        }
                                        console.warn(`[Setup] Rename attempt ${attempt} failed, retrying in 1000ms...`)
                                        await new Promise(r => setTimeout(r, 1000))
                                    }
                                }
                            }

                            finalize()
                        }, 500) // Increased initial delay
                    })
                })

                req.on('timeout', () => {
                    console.error('[Setup] Download timed out after 60 seconds of inactivity')
                    req.destroy()
                    cleanup()
                    reject(new Error('Download timed out after 60 seconds of inactivity'))
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
