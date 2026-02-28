import { ipcMain, BrowserWindow } from 'electron'
import http from 'http'

import { IPC_CHANNELS } from './channels'
import { LlamaServerService } from '../services/llama-server.service'
import { StorageService } from '../services/storage.service'
import { SystemMonitorService } from '../services/system-monitor.service'
import { DownloadService } from '../services/download.service'
import { getCloudModel, streamCloudCompletion, CLOUD_MODELS } from '../services/cloud-api.service'

import type { ChatMessage } from '../../src/types/chat.types'
import type { Conversation } from '../../src/types/conversation.types'

const CHARS_PER_TOKEN = 4

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Registers all IPC handlers for main↔renderer communication.
 */
export function registerIpcHandlers(
    llamaServer: LlamaServerService,
    storage: StorageService,
    systemMonitor: SystemMonitorService,
    downloadService: DownloadService
): void {
    let activeAbortController: AbortController | null = null
    let activeModelId: string | null = null

    // --- Conversations ---

    ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST, () => {
        return storage.getConversations()
    })

    ipcMain.handle(IPC_CHANNELS.CONVERSATION_CREATE, () => {
        const conversation: Conversation = {
            id: generateId(),
            title: 'New Chat',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageCount: 0
        }
        return storage.createConversation(conversation)
    })

    ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, (_event, id: string) => {
        storage.deleteConversation(id)
        return { success: true }
    })

    ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET_MESSAGES, (_event, conversationId: string) => {
        return storage.getMessages(conversationId)
    })

    ipcMain.handle(IPC_CHANNELS.CONVERSATION_UPDATE_TITLE, (_event, id: string, title: string) => {
        storage.updateConversationTitle(id, title)
        return { success: true }
    })

    // --- Model ---

    ipcMain.handle(IPC_CHANNELS.MODEL_GET_STATUS, () => {
        return {
            status: llamaServer.status,
            modelName: null,
            error: null,
            tokensPerSecond: null
        }
    })

    ipcMain.handle(IPC_CHANNELS.MODEL_START, async () => {
        const modelPath = downloadService.getFirstAvailableModelPath()
        if (!modelPath) {
            return { error: 'No model found. Please download a model first.' }
        }

        llamaServer.updateConfig({
            binaryPath: downloadService.getBinaryPath(),
            modelPath
        })

        // Detect which model this is
        const downloaded = downloadService.getDownloadedModels()
        const match = downloaded.find((m) => modelPath.includes(m.filename))
        activeModelId = match?.id ?? null

        try {
            await llamaServer.start()
            return { success: true, activeModelId }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to start server'
            return { error: message }
        }
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_GET_MODELS, () => {
        const localModels = downloadService.getAvailableModels().map(m => ({
            ...m,
            downloaded: downloadService.isModelDownloaded(m.id)
        }))
        const cloudModelsMapped = CLOUD_MODELS.map(m => ({
            id: m.id,
            name: m.name,
            description: m.description,
            sizeGB: 0,
            ramRequired: 0,
            url: '',
            filename: '',
            tier: 'cloud' as any,
            provider: m.provider,
            supportsImages: m.supportsImages,
            downloaded: true // Cloud models are always "ready"
        }))
        return [...localModels, ...cloudModelsMapped]
    })

    ipcMain.handle(IPC_CHANNELS.MODEL_GET_ACTIVE, () => {
        return { activeModelId }
    })

    ipcMain.handle(IPC_CHANNELS.MODEL_SWITCH, async (_event, modelId: string) => {
        if (modelId === activeModelId) return { success: true }

        const isCloud = !!getCloudModel(modelId)

        if (llamaServer.status === 'generating') {
            return { error: 'Stop current generation before switching models' }
        }

        // Stop local server if running
        await llamaServer.stop()

        if (isCloud) {
            activeModelId = modelId
            return { success: true, activeModelId }
        }

        const model = downloadService.getAvailableModels().find(m => m.id === modelId)
        if (!model) return { error: 'Model not found' }

        const isDownloaded = downloadService.isModelDownloaded(modelId)
        if (!isDownloaded) return { error: 'Model not downloaded' }

        const modelPath = downloadService.getModelPath(modelId)
        if (!modelPath) return { error: 'Model file not found' }

        llamaServer.updateConfig({
            binaryPath: downloadService.getBinaryPath(),
            modelPath
        })

        activeModelId = modelId

        try {
            await llamaServer.start()
            return { success: true, activeModelId }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to start server'
            return { error: message }
        }
    })

    ipcMain.handle(IPC_CHANNELS.MODEL_DELETE, (_event, modelId: string) => {
        // Don't allow deleting the active model
        if (modelId === activeModelId) {
            return { error: 'Cannot delete the active model. Switch to another model first.' }
        }
        return downloadService.deleteModel(modelId)
    })

    // --- System ---

    ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_INFO, () => {
        return systemMonitor.getSystemInfo()
    })

    // --- Settings ---

    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
        return storage.getSettings()
    })

    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, settings) => {
        return storage.setSettings(settings)
    })

    // --- Storage ---

    ipcMain.handle(IPC_CHANNELS.STORAGE_EXPORT, () => {
        return storage.exportData()
    })

    ipcMain.handle(IPC_CHANNELS.STORAGE_IMPORT, (_event, jsonString: string) => {
        storage.importData(jsonString)
        return { success: true }
    })

    // --- Chat ---

    ipcMain.handle(
        IPC_CHANNELS.CHAT_SEND_MESSAGE,
        async (event, conversationId: string, content: string, systemPrompt: string, images?: string[]) => {
            const window = BrowserWindow.fromWebContents(event.sender)
            if (!window) return { error: 'No window found' }

            const cloudModel = activeModelId ? getCloudModel(activeModelId) : undefined

            // System guard for local models only
            if (!cloudModel) {
                const guard = systemMonitor.canGenerate()
                if (!guard.allowed) {
                    return { error: guard.reason }
                }

                // Server readiness check
                if (llamaServer.status !== 'ready' && llamaServer.status !== 'generating') {
                    return { error: 'Model is not ready. Please wait for it to load.' }
                }
            }

            systemMonitor.setGenerating(true)

            // Save user message
            const userMessage: ChatMessage = {
                id: generateId(),
                conversationId,
                role: 'user',
                content,
                tokenCount: estimateTokens(content),
                createdAt: Date.now(),
                images
            }
            storage.addMessage(userMessage)

            // Auto-title
            const conversation = storage.getConversation(conversationId)
            if (conversation && conversation.title === 'New Chat') {
                const title = content.slice(0, 60) + (content.length > 60 ? '...' : '')
                storage.updateConversationTitle(conversationId, title)
            }

            try {
                activeAbortController = new AbortController()
                let assistantContent = ''

                if (cloudModel) {
                    // Cloud API flow
                    const settings = storage.getSettings()
                    const apiKey = settings.apiKeys[cloudModel.provider as keyof typeof settings.apiKeys]

                    if (!apiKey) {
                        throw new Error(`API Key for ${cloudModel.provider} is missing. Please add it in Settings.`)
                    }

                    // Build context for cloud
                    const contextMessages = storage.getRollingContext(conversationId, 4000)
                    const messages = [
                        { role: 'system', content: systemPrompt },
                        ...contextMessages.map((m) => {
                            if (m.images && m.images.length > 0) {
                                return {
                                    role: m.role,
                                    content: [
                                        { type: 'text', text: m.content },
                                        ...m.images.map(img => ({
                                            type: 'image_url',
                                            image_url: { url: img }
                                        }))
                                    ]
                                }
                            }
                            return { role: m.role, content: m.content }
                        })
                    ]

                    // If latest message has images, ensure they are sent
                    if (images && images.length > 0) {
                        const lastMsg = messages[messages.length - 1]
                        if (typeof lastMsg.content === 'string') {
                            lastMsg.content = [
                                { type: 'text', text: lastMsg.content },
                                ...images.map(img => ({ type: 'image_url', image_url: { url: img } }))
                            ]
                        }
                    }

                    assistantContent = await streamCloudCompletion({
                        provider: cloudModel.provider,
                        apiKey,
                        model: cloudModel.modelId,
                        messages: messages as any,
                        temperature: settings.temperature,
                        maxTokens: settings.maxTokens,
                        signal: activeAbortController.signal,
                        onToken: (token) => {
                            window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, {
                                conversationId,
                                token,
                                done: false
                            })
                        }
                    })
                } else {
                    // Local llama flow
                    const contextMessages = storage.getRollingContext(
                        conversationId,
                        2048 - estimateTokens(systemPrompt) - 256
                    )

                    const messages = [
                        { role: 'system' as const, content: systemPrompt },
                        ...contextMessages.map((m) => ({ role: m.role, content: m.content }))
                    ]

                    assistantContent = await streamCompletion(
                        llamaServer.baseUrl,
                        messages,
                        activeAbortController.signal,
                        (token: string) => {
                            window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, {
                                conversationId,
                                token,
                                done: false
                            })
                        }
                    )
                }

                // Save assistant message
                const assistantMessage: ChatMessage = {
                    id: generateId(),
                    conversationId,
                    role: 'assistant',
                    content: assistantContent,
                    tokenCount: estimateTokens(assistantContent),
                    createdAt: Date.now()
                }
                storage.addMessage(assistantMessage)

                window.webContents.send(IPC_CHANNELS.CHAT_STREAM_COMPLETE, { conversationId })
                return { success: true }
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Generation failed'
                if (errorMessage !== 'aborted') {
                    window.webContents.send(IPC_CHANNELS.CHAT_STREAM_ERROR, {
                        conversationId,
                        error: errorMessage
                    })
                }
                return { error: errorMessage }
            } finally {
                systemMonitor.setGenerating(false)
                activeAbortController = null
            }
        }
    )

    ipcMain.handle(IPC_CHANNELS.CHAT_STOP_GENERATION, () => {
        if (activeAbortController) {
            activeAbortController.abort()
            activeAbortController = null
        }
        return { success: true }
    })

    // --- Download & Setup ---



    ipcMain.handle(IPC_CHANNELS.SETUP_GET_STATUS, () => {
        return {
            hasBinary: downloadService.isBinaryDownloaded(),
            hasModel: downloadService.getFirstAvailableModelPath() !== null,
            binaryPath: downloadService.getBinaryPath(),
            modelPath: downloadService.getFirstAvailableModelPath()
        }
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_GET_DOWNLOADED, () => {
        return downloadService.getDownloadedModels()
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_START_MODEL, async (event, modelId: string) => {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) return { error: 'No window' }

        const onProgress = (progress: unknown): void => {
            window.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, progress)
        }

        downloadService.on('progress', onProgress)

        try {
            const modelPath = await downloadService.downloadModel(modelId)
            window.webContents.send(IPC_CHANNELS.DOWNLOAD_COMPLETE, { id: `model:${modelId}`, path: modelPath })
            return { success: true, path: modelPath }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Download failed'
            window.webContents.send(IPC_CHANNELS.DOWNLOAD_ERROR, { id: `model:${modelId}`, error: message })
            return { error: message }
        } finally {
            downloadService.removeListener('progress', onProgress)
        }
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_START_BINARY, async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) return { error: 'No window' }

        const onProgress = (progress: unknown): void => {
            window.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, progress)
        }

        downloadService.on('progress', onProgress)

        try {
            const binaryPath = await downloadService.downloadBinary()
            window.webContents.send(IPC_CHANNELS.DOWNLOAD_COMPLETE, { id: 'binary', path: binaryPath })
            return { success: true, path: binaryPath }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Download failed'
            window.webContents.send(IPC_CHANNELS.DOWNLOAD_ERROR, { id: 'binary', error: message })
            return { error: message }
        } finally {
            downloadService.removeListener('progress', onProgress)
        }
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_CANCEL, (_event, downloadId: string) => {
        downloadService.cancelDownload(downloadId)
        return { success: true }
    })
}

/**
 * Streams a completion from the llama.cpp server using SSE.
 * Returns the full accumulated response text.
 */
function streamCompletion(
    baseUrl: string,
    messages: Array<{ role: string; content: string }>,
    signal: AbortSignal,
    onToken: (token: string) => void
): Promise<string> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new Error('aborted'))
            return
        }

        const body = JSON.stringify({
            messages,
            stream: true,
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 1024
        })

        const url = new URL('/v1/chat/completions', baseUrl)

        const req = http.request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            },
            (res) => {
                let accumulated = ''
                let buffer = ''

                res.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString()

                    const lines = buffer.split('\n')
                    buffer = lines.pop() ?? ''

                    for (const line of lines) {
                        const trimmed = line.trim()
                        if (!trimmed || !trimmed.startsWith('data: ')) continue

                        const data = trimmed.slice(6)
                        if (data === '[DONE]') {
                            resolve(accumulated)
                            return
                        }

                        try {
                            const parsed = JSON.parse(data)
                            const token = parsed.choices?.[0]?.delta?.content
                            if (token) {
                                accumulated += token
                                onToken(token)
                            }
                        } catch {
                            // Skip malformed JSON lines
                        }
                    }
                })

                res.on('end', () => {
                    resolve(accumulated)
                })

                res.on('error', (err) => {
                    reject(err)
                })
            }
        )

        signal.addEventListener('abort', () => {
            req.destroy()
            reject(new Error('aborted'))
        })

        req.on('error', (err) => {
            reject(err)
        })

        req.write(body)
        req.end()
    })
}
