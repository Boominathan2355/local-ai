import { ipcMain, BrowserWindow } from 'electron'
import http from 'http'
import https from 'https'
import { URL } from 'url'

import { IPC_CHANNELS } from './channels'
import { LlamaServerService } from '../services/llama-server.service'
import { StorageService } from '../services/storage.service'
import { DownloadService } from '../services/download.service'
import { SearchService } from '../services/search.service'
import { CloudModelService } from '../services/cloud-model.service'
import { SetupManager } from '../services/setup.manager'

import type { ChatMessage } from '../../src/types/chat.types'
import type { Conversation } from '../../src/types/conversation.types'

const CHARS_PER_TOKEN = 4

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN)
}

async function getCompletion(
    baseUrl: string,
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal,
    temperature = 0.7,
    maxTokens = 1024
): Promise<string> {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            messages,
            stream: false,
            temperature,
            max_tokens: maxTokens
        })
        const url = new URL('/v1/chat/completions', baseUrl)
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let body = ''
            res.on('data', (chunk) => body += chunk.toString())
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body)
                    resolve(parsed.choices?.[0]?.message?.content || '')
                } catch (err) {
                    reject(new Error('Failed to parse completion'))
                }
            })
        })
        if (signal) signal.addEventListener('abort', () => req.destroy())
        req.on('error', (e) => reject(e))
        req.write(body)
        req.end()
    })
}

async function generateSearchQuery(content: string, baseUrl: string, isCloud: boolean, signal: AbortSignal, cloudService?: CloudModelService, cloudOptions?: any): Promise<string> {
    const prompt = `Convert the following user message into a short, effective search engine query. Return ONLY the search query text.\n\nUser Message: ${content}`
    const messages = [{ role: 'system', content: 'You are a search query optimizer.' }, { role: 'user', content: prompt }]

    try {
        if (isCloud && cloudService && cloudOptions) {
            return content
        } else {
            return await getCompletion(baseUrl, messages, signal, 0.3, 50)
        }
    } catch (err) {
        if (err instanceof Error && err.message === 'aborted') throw err
        console.error('[Search] Query generation failed:', err)
        return content
    }
}

/**
 * Registers all IPC handlers for main↔renderer communication.
 */
export function registerIpcHandlers(
    llamaServer: LlamaServerService,
    storage: StorageService,
    downloadService: DownloadService,
    searchService: SearchService,
    cloudModelService: CloudModelService,
    setupManager: SetupManager,
    initialModelId: string | null = null
): void {
    let activeAbortController: AbortController | null = null
    let activeModelId: string | null = initialModelId

    // --- Conversations ---
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST, () => storage.getConversations())
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
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET_MESSAGES, (_event, conversationId: string) => storage.getMessages(conversationId))
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_UPDATE_TITLE, (_event, id: string, title: string) => {
        storage.updateConversationTitle(id, title)
        return { success: true }
    })

    // --- Model ---
    ipcMain.handle(IPC_CHANNELS.MODEL_GET_STATUS, () => {
        const models = downloadService.getAvailableModels()
        const activeModel = models.find(m => m.id === activeModelId)
        return {
            status: llamaServer.status,
            modelName: activeModel?.name ?? null,
            modelTier: activeModel?.tier ?? null,
            error: null,
            tokensPerSecond: null,
            supportsVision: activeModel?.supportsVision ?? false,
            supportsThinking: activeModel?.supportsThinking ?? false
        }
    })

    function getModelMetadata(modelId: string | null) {
        if (!modelId) return { supportsVision: false, supportsThinking: false }
        const model = downloadService.getAvailableModels().find(m => m.id === modelId)
        return {
            supportsVision: model?.supportsVision ?? false,
            supportsThinking: model?.supportsThinking ?? false
        }
    }

    ipcMain.handle(IPC_CHANNELS.MODEL_START, async () => {
        const modelPath = downloadService.getFirstAvailableModelPath()
        if (!modelPath) return { error: 'No model found' }

        const downloaded = downloadService.getDownloadedModels()
        const match = downloaded.find((m) => modelPath.includes(m.filename))
        activeModelId = match?.id ?? null

        const metadata = getModelMetadata(activeModelId)
        const mmprojPath = activeModelId ? downloadService.getMmprojPath(activeModelId) : null

        llamaServer.updateConfig({
            binaryPath: setupManager.getBinaryPath(),
            modelPath,
            mmprojPath: mmprojPath ?? undefined,
            ...metadata
        })
        try {
            await llamaServer.start()
            return {
                success: true,
                activeModelId,
                activeModelName: match?.name ?? null,
                ...metadata
            }
        } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to start' }
        }
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_GET_MODELS, () => {
        return downloadService.getAvailableModels().map(m => ({
            ...m,
            downloaded: downloadService.isModelDownloaded(m.id)
        }))
    })

    ipcMain.handle(IPC_CHANNELS.MODEL_GET_ACTIVE, () => {
        const models = downloadService.getAvailableModels()
        const activeModel = models.find(m => m.id === activeModelId)
        return {
            activeModelId,
            activeModelName: activeModel?.name ?? null,
            activeModelTier: activeModel?.tier ?? null,
            supportsVision: activeModel?.supportsVision ?? false,
            supportsThinking: activeModel?.supportsThinking ?? false
        }
    })

    ipcMain.handle(IPC_CHANNELS.MODEL_SWITCH, async (_event, modelId: string) => {
        if (modelId === activeModelId) return { success: true }
        if (llamaServer.status === 'generating') return { error: 'Stop generation first' }
        await llamaServer.stop()
        const model = downloadService.getAvailableModels().find(m => m.id === modelId)
        if (!model) return { error: 'Model not found' }
        if (!downloadService.isModelDownloaded(modelId)) return { error: 'Model not ready' }
        const modelPath = downloadService.getModelPath(modelId)
        if (!modelPath) return { error: 'Path not found' }
        const mmprojPath = downloadService.getMmprojPath(modelId)

        const metadata = getModelMetadata(modelId)

        llamaServer.updateConfig({
            binaryPath: setupManager.getBinaryPath(),
            modelPath,
            mmprojPath: mmprojPath ?? undefined,
            ...metadata
        })
        activeModelId = modelId
        try {
            await llamaServer.start()
            return {
                success: true,
                activeModelId,
                activeModelName: model.name,
                activeModelTier: model.tier,
                supportsVision: model.supportsVision ?? false,
                supportsThinking: model.supportsThinking ?? false
            }
        } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to switch' }
        }
    })

    ipcMain.handle(IPC_CHANNELS.MODEL_DELETE, (_event, modelId: string) => {
        if (modelId === activeModelId) return { error: 'Cannot delete active model' }
        return downloadService.deleteModel(modelId)
    })

    // --- System ---
    ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_INFO, () => storage.getSystemInfo())

    // --- Settings / Storage ---
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => storage.getSettings())
    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, settings) => storage.setSettings(settings))
    ipcMain.handle(IPC_CHANNELS.STORAGE_EXPORT, () => storage.exportData())
    ipcMain.handle(IPC_CHANNELS.STORAGE_IMPORT, (_event, jsonString: string) => {
        storage.importData(jsonString)
        return { success: true }
    })

    // --- Chat ---
    ipcMain.handle(IPC_CHANNELS.CHAT_SEND_MESSAGE, async (event, conversationId: string, content: string, systemPrompt: string, images?: string[], searchEnabled?: boolean, retryId?: string, quotedMessageId?: string, quotedMessageText?: string) => {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) return { error: 'No window' }

        const guard = storage.canGenerate()
        if (!guard.allowed) return { error: guard.reason }

        const settings = storage.getSettings()
        const availableModels = downloadService.getAvailableModels()
        const selectedModel = availableModels.find(m => m.id === activeModelId)
        const isCloudModel = selectedModel && selectedModel.provider !== 'local'

        if (!isCloudModel && llamaServer.status !== 'ready' && llamaServer.status !== 'generating') {
            console.warn(`[Chat] Local model not ready. Status: ${llamaServer.status}`)
            return { error: 'Local model not ready' }
        }

        console.log(`[Chat] Starting message for conversation: ${conversationId}`)
        let currentVersion = 1
        const userMessageId = retryId || generateId()

        if (retryId) {
            console.log(`[Chat] Creating new version for message: ${retryId}`)
            const existingMessages = storage.getMessages(conversationId)

            // If the content changed (e.g., from an edit), update the original user message
            const existingUserMsg = existingMessages.find(m => m.id === retryId)
            if (existingUserMsg && existingUserMsg.content !== content) {
                console.log(`[Chat] Updating content for message ${retryId}`)
                storage.updateMessage(conversationId, retryId, content)
                window.webContents.send(IPC_CHANNELS.CONVERSATION_MESSAGES_UPDATED, {
                    conversationId,
                    message: { ...existingUserMsg, content }
                })
            }

            const versions = existingMessages.filter(m => m.replyToId === retryId)
            currentVersion = versions.length + 1
        } else {
            const userMessage: ChatMessage = {
                id: userMessageId,
                conversationId,
                role: 'user',
                content,
                tokenCount: estimateTokens(content),
                createdAt: Date.now(),
                images: images && images.length > 0 ? images : undefined,
                quotedMessageId,
                quotedMessageText
            }
            storage.addMessage(userMessage)
            window.webContents.send(IPC_CHANNELS.CONVERSATION_MESSAGES_UPDATED, { conversationId, message: userMessage })
        }

        const conversation = storage.getConversation(conversationId)
        if (conversation && conversation.title === 'New Chat') {
            storage.updateConversationTitle(conversationId, content.slice(0, 60))
        }

        try {
            activeAbortController = new AbortController()
            const settings = storage.getSettings()

            const context = storage.getRollingContext(conversationId, settings.contextSize)
            let messages = [{ role: 'system', content: systemPrompt }, ...context.map(m => {
                if (m.id === userMessageId && m.quotedMessageId) {
                    const quotedMsg = storage.getMessages(conversationId).find(q => q.id === m.quotedMessageId)
                    if (quotedMsg) {
                        const quotedContent = m.quotedMessageText || quotedMsg.content
                        return { role: m.role, content: `> [Replying to ${quotedMsg.role}]:\n> ${quotedContent}\n\n${m.content}` }
                    }
                }
                return { role: m.role, content: m.content }
            })]

            if (searchEnabled && (settings.serperApiKey || settings.tavilyApiKey)) {
                try {
                    const refinedQuery = await generateSearchQuery(content, llamaServer.baseUrl, !!isCloudModel, activeAbortController.signal)
                    console.log(`[Search] Original: "${content}" -> Refined: "${refinedQuery}"`)

                    const searchResults = await searchService.search(refinedQuery, {
                        serperApiKey: settings.serperApiKey,
                        tavilyApiKey: settings.tavilyApiKey
                    }, activeAbortController.signal)

                    if (searchResults.length > 0) {
                        const contextString = searchResults.map(r => `Source: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}`).join('\n\n')
                        const searchPrompt = `As a helpful assistant, use the following real-time web search results to provide an up-to-date and accurate answer. If the results aren't relevant, rely on your general knowledge but prioritize these findings when applicable. Information from the web is more current than your training data.\n\nWEB SEARCH RESULTS:\n${contextString}`

                        // Inject search results into the last user message or as a system context
                        messages = [
                            { role: 'system', content: systemPrompt },
                            { role: 'system', content: searchPrompt },
                            ...context.map(m => ({ role: m.role, content: m.content }))
                        ]
                    }
                } catch (searchErr) {
                    if (searchErr instanceof Error && searchErr.message === 'aborted') throw searchErr
                    console.error('[SearchService] Search failed:', searchErr)
                    // Continue with normal chat if search fails
                }
            }

            console.log(`[Chat] Sending request to ${isCloudModel ? 'cloud' : 'local'} model...`)
            let assistantContent = ''
            if (isCloudModel && selectedModel) {
                const options = {
                    apiKey: '',
                    model: selectedModel.id,
                    messages,
                    images: images && images.length > 0 ? images : undefined,
                    temperature: settings.temperature,
                    maxTokens: settings.maxTokens,
                    stream: true
                }

                if (selectedModel.provider === 'openai') {
                    options.apiKey = settings.openaiApiKey || ''
                    if (!options.apiKey) throw new Error('OpenAI API Key is missing in settings')
                    assistantContent = await cloudModelService.streamOpenAI(options, (token) => {
                        assistantContent += token
                        window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                    }, activeAbortController.signal)
                } else if (selectedModel.provider === 'anthropic') {
                    options.apiKey = settings.anthropicApiKey || ''
                    if (!options.apiKey) throw new Error('Anthropic API Key is missing in settings')
                    assistantContent = await cloudModelService.streamAnthropic(options, (token) => {
                        assistantContent += token
                        window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                    }, activeAbortController.signal)
                } else if (selectedModel.provider === 'google') {
                    options.apiKey = settings.geminiApiKey || ''
                    if (!options.apiKey) throw new Error('Gemini API Key is missing in settings')
                    assistantContent = await cloudModelService.streamGemini(options, (token) => {
                        assistantContent += token
                        window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                    }, activeAbortController.signal)
                }
            } else {
                // For local llama-server: build multimodal messages if images are present
                let localMessages: Array<{ role: string; content: any }> = messages
                const hasImages = images && images.length > 0

                if (hasImages) {
                    const visionInstruction = "You are a multimodal AI assistant with visual capabilities. Analyze the provided images carefully to answer user queries accurately. If you see an image, you MUST describe or use it in your response as requested."
                    localMessages = messages.map((m, i) => {
                        if (m.role === 'system') {
                            return { ...m, content: `${visionInstruction}\n${m.content}` }
                        }
                        if (m.role === 'user' && i === messages.length - 1) {
                            const parts: any[] = [{ type: 'text', text: m.content }]
                            for (const img of images) {
                                parts.push({ type: 'image_url', image_url: { url: img } })
                            }
                            return { role: 'user', content: parts }
                        }
                        return m
                    })

                    // If no system message existed, prepend one
                    if (!localMessages.some(m => m.role === 'system')) {
                        localMessages.unshift({ role: 'system', content: visionInstruction })
                    }
                }

                console.log(`[Chat] Sending payload to llama-server. HasImages: ${hasImages}, MmprojPath: ${downloadService.getMmprojPath(activeModelId ?? '')}`)
                if (hasImages) {
                    const mmprojPath = activeModelId ? downloadService.getMmprojPath(activeModelId) : null
                    if (!mmprojPath) {
                        return { error: 'Active model does not support vision or vision projector is missing' }
                    }
                    console.log(`[Chat] Last message payload: ${JSON.stringify(localMessages[localMessages.length - 1], null, 2).substring(0, 500)}...`)
                }

                assistantContent = await streamCompletion(llamaServer.baseUrl, localMessages, activeAbortController.signal, (token) => {
                    assistantContent += token
                    window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                }, ["<|user|>", "user:", "<|assistant|>", "assistant:"], settings.temperature, settings.maxTokens)
            }
            console.log(`[Chat] Generation complete, length: ${assistantContent.length}`)

            const assistantMsg: ChatMessage = {
                id: generateId(),
                conversationId,
                role: 'assistant',
                content: assistantContent,
                tokenCount: estimateTokens(assistantContent),
                createdAt: Date.now(),
                replyToId: userMessageId,
                version: currentVersion,
                isActive: true
            }
            if (retryId) {
                storage.switchActiveVersion(conversationId, assistantMsg.id)
            }

            storage.addMessage(assistantMsg)
            window.webContents.send(IPC_CHANNELS.CONVERSATION_MESSAGES_UPDATED, { conversationId, message: assistantMsg })
            window.webContents.send(IPC_CHANNELS.CHAT_STREAM_COMPLETE, { conversationId })
            return { success: true }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error'
            if (msg !== 'aborted') {
                window.webContents.send(IPC_CHANNELS.CHAT_STREAM_ERROR, { conversationId, error: msg })
            } else {
                window.webContents.send(IPC_CHANNELS.CHAT_STREAM_COMPLETE, { conversationId })
            }
            return { error: msg }
        } finally {
            storage.setGenerating(false)
            // Broadcast final status
            window.webContents.send(IPC_CHANNELS.CONVERSATION_LIST, storage.getConversations())
            activeAbortController = null
        }
    })

    ipcMain.handle(IPC_CHANNELS.CHAT_STOP_GENERATION, () => {
        if (activeAbortController) activeAbortController.abort()
        storage.setGenerating(false)
        // Broadcast update to all listeners (sidebar etc)
        BrowserWindow.getAllWindows().forEach(w => {
            w.webContents.send(IPC_CHANNELS.CONVERSATION_LIST, storage.getConversations())
        })
        return { success: true }
    })

    ipcMain.handle(IPC_CHANNELS.CHAT_SWITCH_VERSION, (_event, conversationId: string, messageId: string) => {
        storage.switchActiveVersion(conversationId, messageId)
        BrowserWindow.getAllWindows().forEach(w => {
            w.webContents.send(IPC_CHANNELS.CONVERSATION_MESSAGES_UPDATED, { conversationId })
        })
        return { success: true }
    })

    // --- Setup & Download ---
    ipcMain.handle(IPC_CHANNELS.SETUP_GET_STATUS, () => setupManager.getStatus())

    ipcMain.handle(IPC_CHANNELS.SETUP_CHECK_UPDATES, () => setupManager.checkForUpdates())

    ipcMain.handle(IPC_CHANNELS.SETUP_INSTALL_ENGINE, async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const prog = (p: any) => win?.webContents.send(IPC_CHANNELS.SETUP_PROGRESS, p)
        setupManager.on('progress', prog)
        try {
            const p = await setupManager.installEngine()
            win?.webContents.send(IPC_CHANNELS.SETUP_COMPLETE, { id: 'engine', path: p })
            return { success: true, path: p }
        } catch (err) {
            return { error: err instanceof Error ? err.message : 'Error' }
        } finally {
            setupManager.removeListener('progress', prog)
        }
    })

    ipcMain.handle(IPC_CHANNELS.SETUP_UPDATE_ENGINE, async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const prog = (p: any) => win?.webContents.send(IPC_CHANNELS.SETUP_PROGRESS, p)
        setupManager.on('progress', prog)
        try {
            const p = await setupManager.updateEngine()
            win?.webContents.send(IPC_CHANNELS.SETUP_COMPLETE, { id: 'engine', path: p })
            return { success: true, path: p }
        } catch (err) {
            return { error: err instanceof Error ? err.message : 'Error' }
        } finally {
            setupManager.removeListener('progress', prog)
        }
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_GET_DOWNLOADED, () => downloadService.getDownloadedModels())
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_START_MODEL, async (event, modelId: string) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const prog = (p: any) => win?.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, p)
        downloadService.on('progress', prog)
        try {
            const p = await downloadService.downloadModel(modelId)
            win?.webContents.send(IPC_CHANNELS.DOWNLOAD_COMPLETE, { id: `model:${modelId}`, path: p })
            return { success: true, path: p }
        } catch (err) {
            return { error: err instanceof Error ? err.message : 'Error' }
        } finally {
            downloadService.removeListener('progress', prog)
        }
    })
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_CANCEL, (_event, id) => {
        if (id === 'engine' || id === 'binary') {
            setupManager.cancelDownload(id)
        } else {
            downloadService.cancelDownload(id)
        }
        return { success: true }
    })
}

function streamCompletion(
    baseUrl: string,
    messages: Array<{ role: string; content: any }>,
    signal: AbortSignal,
    onToken: (token: string) => void,
    stop: string[] = [],
    temperature = 0.7,
    maxTokens = 1024
): Promise<string> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new Error('aborted'))
        const body = JSON.stringify({
            messages,
            stream: true,
            temperature,
            max_tokens: maxTokens,
            stop
        })
        const url = new URL('/v1/chat/completions', baseUrl)
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let acc = ''
            let buffer = ''
            res.on('data', (chunk) => {
                buffer += chunk.toString()
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''
                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed || !trimmed.startsWith('data: ')) continue
                    const data = trimmed.slice(6)
                    if (data === '[DONE]') break
                    try {
                        const parsed = JSON.parse(data)
                        const token = parsed.choices?.[0]?.delta?.content || ''
                        if (token) {
                            acc += token
                            onToken(token)
                        }
                    } catch { /* skip */ }
                }
            })
            res.on('error', (e) => reject(e))
            res.on('end', () => resolve(acc))
        })
        signal.addEventListener('abort', () => req.destroy())
        req.on('error', (e) => reject(e))
        req.write(body)
        req.end()
    })
}
