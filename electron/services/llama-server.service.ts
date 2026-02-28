import { ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync } from 'fs'
import path from 'path'
import http from 'http'

import type { ModelStatusType } from '../../src/types/model.types'

const DEFAULT_CONFIG = {
    port: 8080,
    host: '127.0.0.1',
    threads: 6,
    contextSize: 2048,
    gpuLayers: 0,
    maxRestartAttempts: 3,
    healthCheckIntervalMs: 5000,
    startupTimeoutMs: 30000
} as const

interface LlamaServerConfig {
    binaryPath: string
    modelPath: string
    port?: number
    host?: string
    threads?: number
    contextSize?: number
    gpuLayers?: number
}

/**
 * Manages the llama.cpp server process lifecycle.
 * Handles spawning, health checks, crash recovery, and clean shutdown.
 */
export class LlamaServerService extends EventEmitter {
    private process: ChildProcess | null = null
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null
    private restartCount = 0
    private isShuttingDown = false
    private currentStatus: ModelStatusType = 'disconnected'

    private config: Required<LlamaServerConfig>

    constructor(config: LlamaServerConfig) {
        super()
        this.config = {
            port: config.port ?? DEFAULT_CONFIG.port,
            host: config.host ?? DEFAULT_CONFIG.host,
            threads: config.threads ?? DEFAULT_CONFIG.threads,
            contextSize: config.contextSize ?? DEFAULT_CONFIG.contextSize,
            gpuLayers: config.gpuLayers ?? DEFAULT_CONFIG.gpuLayers,
            binaryPath: config.binaryPath,
            modelPath: config.modelPath
        }
    }

    get status(): ModelStatusType {
        return this.currentStatus
    }

    get baseUrl(): string {
        return `http://${this.config.host}:${this.config.port}`
    }

    /**
     * Updates the server configuration. Call before start() if paths changed.
     */
    updateConfig(partial: Partial<LlamaServerConfig>): void {
        if (partial.binaryPath) this.config.binaryPath = partial.binaryPath
        if (partial.modelPath) this.config.modelPath = partial.modelPath
        if (partial.port) this.config.port = partial.port
        if (partial.host) this.config.host = partial.host
        if (partial.threads) this.config.threads = partial.threads
        if (partial.contextSize) this.config.contextSize = partial.contextSize
        if (partial.gpuLayers !== undefined) this.config.gpuLayers = partial.gpuLayers
    }

    /**
     * Validates that the binary and model exist before starting.
     */
    private validatePaths(): { valid: boolean; error?: string } {
        if (!existsSync(this.config.binaryPath)) {
            return { valid: false, error: `llama-server binary not found at: ${this.config.binaryPath}` }
        }
        if (!existsSync(this.config.modelPath)) {
            return { valid: false, error: `Model file not found at: ${this.config.modelPath}` }
        }
        return { valid: true }
    }

    /**
     * Starts the llama.cpp server as a child process.
     */
    async start(): Promise<void> {
        const validation = this.validatePaths()
        if (!validation.valid) {
            this.setStatus('error')
            this.emit('error', validation.error)
            return
        }

        this.isShuttingDown = false
        this.setStatus('loading')

        const args = [
            '-m', this.config.modelPath,
            '-t', String(this.config.threads),
            '-c', String(this.config.contextSize),
            '-ngl', String(this.config.gpuLayers),
            '--host', this.config.host,
            '--port', String(this.config.port)
        ]

        try {
            this.process = spawn(this.config.binaryPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            })

            this.process.stdout?.on('data', (data: Buffer) => {
                this.emit('log', data.toString())
            })

            this.process.stderr?.on('data', (data: Buffer) => {
                this.emit('log', data.toString())
            })

            this.process.on('exit', (code) => {
                if (!this.isShuttingDown && code !== 0) {
                    this.handleCrash(code)
                }
            })

            this.process.on('error', (err) => {
                this.setStatus('error')
                this.emit('error', `Process error: ${err.message}`)
            })

            await this.waitForReady()
            this.startHealthCheck()
        } catch (err) {
            this.setStatus('error')
            const message = err instanceof Error ? err.message : 'Unknown error starting server'
            this.emit('error', message)
        }
    }

    /**
     * Polls the /health endpoint until the server responds.
     */
    private waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Server startup timed out'))
            }, DEFAULT_CONFIG.startupTimeoutMs)

            const check = (): void => {
                this.checkHealth()
                    .then((healthy) => {
                        if (healthy) {
                            clearTimeout(timeout)
                            this.restartCount = 0
                            this.setStatus('ready')
                            resolve()
                        } else {
                            setTimeout(check, 1000)
                        }
                    })
                    .catch(() => {
                        setTimeout(check, 1000)
                    })
            }

            setTimeout(check, 2000)
        })
    }

    /**
     * Performs a health check against the server.
     */
    private checkHealth(): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.get(`${this.baseUrl}/health`, (res) => {
                resolve(res.statusCode === 200)
            })
            req.on('error', () => resolve(false))
            req.setTimeout(3000, () => {
                req.destroy()
                resolve(false)
            })
        })
    }

    /**
     * Starts periodic health checks.
     */
    private startHealthCheck(): void {
        this.stopHealthCheck()
        this.healthCheckTimer = setInterval(() => {
            this.checkHealth().then((healthy) => {
                if (!healthy && !this.isShuttingDown) {
                    this.setStatus('error')
                    this.emit('error', 'Health check failed')
                }
            })
        }, DEFAULT_CONFIG.healthCheckIntervalMs)
    }

    private stopHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer)
            this.healthCheckTimer = null
        }
    }

    /**
     * Handles server crash with automatic restart up to max attempts.
     */
    private handleCrash(exitCode: number | null): void {
        this.setStatus('error')
        this.stopHealthCheck()

        if (this.restartCount < DEFAULT_CONFIG.maxRestartAttempts) {
            this.restartCount++
            this.emit('log', `Server crashed (code ${exitCode}), restarting (attempt ${this.restartCount})...`)
            setTimeout(() => this.start(), 2000)
        } else {
            this.emit('error', `Server crashed ${DEFAULT_CONFIG.maxRestartAttempts} times, giving up`)
        }
    }

    /**
     * Gracefully shuts down the server process.
     */
    async stop(): Promise<void> {
        this.isShuttingDown = true
        this.stopHealthCheck()

        if (this.process) {
            return new Promise((resolve) => {
                const killTimeout = setTimeout(() => {
                    this.process?.kill('SIGKILL')
                    resolve()
                }, 5000)

                this.process!.on('exit', () => {
                    clearTimeout(killTimeout)
                    resolve()
                })

                this.process!.kill('SIGTERM')
            })
        }

        this.process = null
        this.setStatus('disconnected')
    }

    private setStatus(status: ModelStatusType): void {
        this.currentStatus = status
        this.emit('statusChanged', status)
    }
}
