import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { statfsSync } from 'fs'
import { EventEmitter } from 'events'

import type { Conversation } from '../../src/types/conversation.types'
import type { ChatMessage } from '../../src/types/chat.types'
import type { AppSettings } from '../../src/types/settings.types'
import { DEFAULT_SETTINGS } from '../../src/types/settings.types'

interface StorageData {
    conversations: Conversation[]
    messages: Record<string, ChatMessage[]>
    settings: AppSettings
}

export interface SystemMetrics {
    cpuUsagePercent: number
    freeMemoryMB: number
    totalMemoryMB: number
}

export interface SystemInfo {
    totalRamMB: number
    freeRamMB: number
    cpuCores: number
    cpuUsagePercent: number
    diskFreeGB: number
    diskTotalGB: number
    gpuName?: string
    gpuMemoryTotalMB?: number
    gpuMemoryFreeMB?: number
}

const STORAGE_FILE = 'local-ai-data.json'
const CPU_THRESHOLD_PERCENT = 90
const MIN_FREE_MEMORY_MB = 500

/**
 * JSON-file based persistence and system monitoring service.
 * Stores app data and checks system health for local inference.
 */
export class StorageService extends EventEmitter {
    private data: StorageData
    private readonly filePath: string
    private isGenerating = false
    private activeGeneratingId: string | null = null
    private hasNvidiaGpu = false

    constructor() {
        super()
        const userDataPath = app.getPath('userData')
        mkdirSync(userDataPath, { recursive: true })
        this.filePath = path.join(userDataPath, STORAGE_FILE)
        this.data = this.load()
        this.save()

        try {
            execSync('nvidia-smi --version', { stdio: 'ignore' })
            this.hasNvidiaGpu = true
        } catch {
            this.hasNvidiaGpu = false
        }
    }

    // --- Monitoring ---

    getMetrics(): SystemMetrics {
        const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024))
        const freeMemoryMB = Math.round(os.freemem() / (1024 * 1024))
        const cpus = os.cpus()
        let totalIdle = 0
        let totalTick = 0
        for (const cpu of cpus) {
            totalIdle += cpu.times.idle
            totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle
        }
        const cpuUsagePercent = totalTick > 0 ? Math.round(((totalTick - totalIdle) / totalTick) * 100) : 0
        return { cpuUsagePercent, freeMemoryMB, totalMemoryMB }
    }

    getSystemInfo(llamaDir?: string): SystemInfo {
        const totalRamMB = Math.round(os.totalmem() / (1024 * 1024))
        const freeRamMB = Math.round(os.freemem() / (1024 * 1024))
        const cpuCores = os.cpus().length
        const metrics = this.getMetrics()
        const cpuUsagePercent = metrics.cpuUsagePercent

        let diskFreeGB = 0
        let diskTotalGB = 0
        try {
            const dir = llamaDir ?? os.homedir()
            const stats = statfsSync(dir)
            diskTotalGB = Math.round((stats.blocks * stats.bsize) / (1024 * 1024 * 1024))
            diskFreeGB = Math.round((stats.bfree * stats.bsize) / (1024 * 1024 * 1024))
        } catch { /* skip */ }

        let gpuName: string | undefined
        let gpuMemoryTotalMB: number | undefined
        let gpuMemoryFreeMB: number | undefined

        if (this.hasNvidiaGpu) {
            try {
                // Basic NVIDIA detection on Linux
                const nvidiaOutput = execSync('nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits', {
                    encoding: 'utf-8',
                    timeout: 3000,
                    stdio: ['ignore', 'pipe', 'ignore']
                }).trim()

                if (nvidiaOutput) {
                    const [name, total, free] = nvidiaOutput.split(',').map(s => s.trim())
                    gpuName = name
                    gpuMemoryTotalMB = parseInt(total)
                    gpuMemoryFreeMB = parseInt(free)
                }
            } catch { /* skip if command fails */ }
        }

        return {
            totalRamMB,
            freeRamMB,
            cpuCores,
            cpuUsagePercent,
            diskFreeGB,
            diskTotalGB,
            gpuName,
            gpuMemoryTotalMB,
            gpuMemoryFreeMB
        }
    }

    canGenerate(): { allowed: boolean; reason?: string } {
        if (this.isGenerating) return { allowed: false, reason: 'Already generating' }
        const metrics = this.getMetrics()
        if (metrics.cpuUsagePercent > CPU_THRESHOLD_PERCENT) return { allowed: false, reason: 'CPU usage too high' }
        if (metrics.freeMemoryMB < MIN_FREE_MEMORY_MB) return { allowed: false, reason: 'Free memory too low' }
        return { allowed: true }
    }

    setGenerating(v: boolean, conversationId?: string) {
        this.isGenerating = v
        if (v && conversationId) {
            this.activeGeneratingId = conversationId
        } else if (!v) {
            this.activeGeneratingId = null
        }

        // Update the conversation object in memory
        this.data.conversations.forEach(c => {
            c.isGenerating = (v && c.id === conversationId)
        })
    }

    // --- Conversations ---

    getConversations(): Conversation[] {
        return [...this.data.conversations].sort((a, b) => b.updatedAt - a.updatedAt)
    }

    getConversation(id: string): Conversation | undefined {
        return this.data.conversations.find((c) => c.id === id)
    }

    createConversation(conversation: Conversation): Conversation {
        this.data.conversations.push(conversation)
        this.data.messages[conversation.id] = []
        this.save()
        return conversation
    }

    updateConversationTitle(id: string, title: string): void {
        const conversation = this.data.conversations.find((c) => c.id === id)
        if (conversation) {
            conversation.title = title
            conversation.updatedAt = Date.now()
            this.save()
        }
    }

    updateConversation(id: string, data: Partial<Conversation>): void {
        const index = this.data.conversations.findIndex((c) => c.id === id)
        if (index !== -1) {
            this.data.conversations[index] = {
                ...this.data.conversations[index],
                ...data,
                updatedAt: Date.now()
            }
            this.save()
        }
    }

    deleteConversation(id: string): void {
        this.data.conversations = this.data.conversations.filter((c) => c.id !== id)
        delete this.data.messages[id]
        this.save()
    }

    // --- Messages ---

    getMessages(conversationId: string): ChatMessage[] {
        return this.data.messages[conversationId] ?? []
    }

    addMessage(message: ChatMessage): void {
        if (!this.data.messages[message.conversationId]) {
            this.data.messages[message.conversationId] = []
        }

        // Default to active for new messages
        if (message.isActive === undefined) {
            message.isActive = true
        }

        this.data.messages[message.conversationId].push(message)

        const conversation = this.data.conversations.find((c) => c.id === message.conversationId)
        if (conversation) {
            conversation.updatedAt = Date.now()
            conversation.messageCount = this.data.messages[message.conversationId].length
        }

        this.save()
    }

    updateMessage(conversationId: string, messageId: string, content: string): void {
        const messages = this.data.messages[conversationId]
        if (!messages) return
        const msg = messages.find(m => m.id === messageId)
        if (msg) {
            msg.content = content
            msg.createdAt = Date.now()
            this.save()
        }
    }

    pruneMessagesAfter(conversationId: string, messageId: string): void {
        const messages = this.data.messages[conversationId]
        if (!messages) return
        const index = messages.findIndex(m => m.id === messageId)
        if (index !== -1) {
            this.data.messages[conversationId] = messages.slice(0, index + 1)
            const conversation = this.data.conversations.find((c) => c.id === conversationId)
            if (conversation) {
                conversation.updatedAt = Date.now()
                conversation.messageCount = this.data.messages[conversationId].length
            }
            this.save()
        }
    }

    switchActiveVersion(conversationId: string, messageId: string): void {
        const messages = this.data.messages[conversationId]
        if (!messages) return

        const targetMsg = messages.find(m => m.id === messageId)
        if (!targetMsg || !targetMsg.replyToId) return

        // Set target as active, siblings as inactive
        messages.forEach(m => {
            if (m.replyToId === targetMsg.replyToId) {
                m.isActive = (m.id === messageId)
            }
        })

        this.save()
    }

    getRollingContext(conversationId: string, maxTokens: number): ChatMessage[] {
        const allMessages = this.getMessages(conversationId)
        // Filter out inactive assistant versions
        const filteredMessages = allMessages.filter(m => m.role !== 'assistant' || m.isActive !== false)

        const systemMessages = filteredMessages.filter(m => m.role === 'system')
        const otherMessages = filteredMessages.filter(m => m.role !== 'system')

        const result: ChatMessage[] = [...systemMessages]
        let currentTokens = systemMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0)

        // Add regular messages from the most recent backwards until maxTokens is reached
        const recentMessages: ChatMessage[] = []
        for (let i = otherMessages.length - 1; i >= 0; i--) {
            const msg = otherMessages[i]
            const msgTokens = msg.tokenCount || 0
            if (currentTokens + msgTokens > maxTokens) break
            recentMessages.unshift(msg)
            currentTokens += msgTokens
        }

        return [...result, ...recentMessages]
    }

    // --- Settings ---

    getSettings(): AppSettings {
        return { ...this.data.settings }
    }

    setSettings(settings: Partial<AppSettings>): AppSettings {
        this.data.settings = { ...this.data.settings, ...settings }
        this.save()
        this.emit('settingsChanged', this.data.settings)
        return this.data.settings
    }

    // --- Export/Import ---

    exportData(): string {
        return JSON.stringify(this.data, null, 2)
    }

    importData(jsonString: string): void {
        const imported = JSON.parse(jsonString) as StorageData
        this.data = imported
        this.save()
    }

    // --- Persistence ---

    private load(): StorageData {
        try {
            if (existsSync(this.filePath)) {
                const raw = readFileSync(this.filePath, 'utf-8')
                const parsed = JSON.parse(raw)
                const parsedSettings = parsed.settings || {}

                return {
                    conversations: parsed.conversations || [],
                    messages: parsed.messages || {},
                    settings: {
                        ...DEFAULT_SETTINGS,
                        ...parsedSettings
                    }
                }
            }
        } catch (err) {
            console.error('[StorageService] Failed to load data:', err)
        }
        return { conversations: [], messages: {}, settings: { ...DEFAULT_SETTINGS } }
    }

    private save(): void {
        try {
            writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
        } catch (err) {
            console.error('[StorageService] Failed to save data:', err)
        }
    }
}
