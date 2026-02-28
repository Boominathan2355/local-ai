import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'

import type { Conversation } from '../../src/types/conversation.types'
import type { ChatMessage } from '../../src/types/chat.types'
import type { AppSettings } from '../../src/types/settings.types'
import { DEFAULT_SETTINGS } from '../../src/types/settings.types'

interface StorageData {
    conversations: Conversation[]
    messages: Record<string, ChatMessage[]>
    settings: AppSettings
}

const STORAGE_FILE = 'local-ai-data.json'

/**
 * JSON-file based persistence service.
 * Stores conversations, messages, and settings in Electron's userData directory.
 * No native dependencies — works on all platforms.
 */
export class StorageService {
    private data: StorageData
    private readonly filePath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        mkdirSync(userDataPath, { recursive: true })
        this.filePath = path.join(userDataPath, STORAGE_FILE)
        this.data = this.load()
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
        this.data.messages[message.conversationId].push(message)

        const conversation = this.data.conversations.find((c) => c.id === message.conversationId)
        if (conversation) {
            conversation.updatedAt = Date.now()
            conversation.messageCount = this.data.messages[message.conversationId].length
        }

        this.save()
    }

    /**
     * Returns the last N messages that fit within the token budget
     * for the rolling context window.
     */
    getRollingContext(conversationId: string, maxTokens: number): ChatMessage[] {
        const messages = this.getMessages(conversationId)
        const result: ChatMessage[] = []
        let tokenCount = 0

        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i]
            if (tokenCount + msg.tokenCount > maxTokens) break
            result.unshift(msg)
            tokenCount += msg.tokenCount
        }

        return result
    }

    // --- Settings ---

    getSettings(): AppSettings {
        return { ...this.data.settings }
    }

    setSettings(settings: Partial<AppSettings>): AppSettings {
        this.data.settings = { ...this.data.settings, ...settings }
        this.save()
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

                // Ensure parsed.settings exists to avoid errors when accessing properties
                const parsedSettings = parsed.settings || {}

                return {
                    conversations: parsed.conversations || [],
                    messages: parsed.messages || {},
                    settings: {
                        ...DEFAULT_SETTINGS,
                        ...parsedSettings,
                        apiKeys: {
                            ...DEFAULT_SETTINGS.apiKeys,
                            ...(parsedSettings.apiKeys || {})
                        },
                        activatedCloudModels: parsedSettings.activatedCloudModels || [],
                        mcpServers: parsedSettings.mcpServers || []
                    }
                }
            }
        } catch (err) {
            console.error('[StorageService] Failed to load data, starting fresh:', err)
        }

        return {
            conversations: [],
            messages: {},
            settings: { ...DEFAULT_SETTINGS }
        }
    }

    private save(): void {
        try {
            writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
        } catch (err) {
            console.error('[StorageService] Failed to save data:', err)
        }
    }
}
