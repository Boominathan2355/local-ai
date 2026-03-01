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

async function generateSearchQuery(content: string, baseUrl: string, isCloud: boolean, cloudService?: CloudModelService, cloudOptions?: any): Promise<string> {
    const prompt = `Convert the following user message into a short, effective search engine query. Return ONLY the search query text.\n\nUser Message: ${content}`
    const messages = [{ role: 'system', content: 'You are a search query optimizer.' }, { role: 'user', content: prompt }]

    try {
        if (isCloud && cloudService && cloudOptions) {
            // Simplified for now - use non-streaming for query generation if possible, but cloudService only has streaming. 
            // We'll use the local model for query generation to keep it fast and free if available, otherwise just use the raw content.
            return content
        } else {
            return await getCompletion(baseUrl, messages, undefined, 0.3, 50)
        }
    } catch (err) {
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
    ipcMain.handle(IPC_CHANNELS.MODEL_GET_STATUS, () => ({
        status: llamaServer.status,
        modelName: null,
        error: null,
        tokensPerSecond: null
    }))

    ipcMain.handle(IPC_CHANNELS.MODEL_START, async () => {
        const modelPath = downloadService.getFirstAvailableModelPath()
        if (!modelPath) return { error: 'No model found.' }
        llamaServer.updateConfig({ binaryPath: downloadService.getBinaryPath(), modelPath })
        const downloaded = downloadService.getDownloadedModels()
        const match = downloaded.find((m) => modelPath.includes(m.filename))
        activeModelId = match?.id ?? null
        try {
            await llamaServer.start()
            return { success: true, activeModelId, activeModelName: match?.name ?? null }
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
            activeModelTier: activeModel?.tier ?? null
        }
    })

    ipcMain.handle(IPC_CHANNELS.MODEL_SWITCH, async (_event, modelId: string) => {
        if (modelId === activeModelId) return { success: true }
        if (llamaServer.status === 'generating') return { error: 'Stop generation first' }
        await llamaServer.stop()
        const model = downloadService.getAvailableModels().find(m => m.id === modelId)
        if (!model || !downloadService.isModelDownloaded(modelId)) return { error: 'Model not ready' }
        const modelPath = downloadService.getModelPath(modelId)
        if (!modelPath) return { error: 'Path not found' }
        llamaServer.updateConfig({ binaryPath: downloadService.getBinaryPath(), modelPath })
        activeModelId = modelId
        try {
            await llamaServer.start()
            return { success: true, activeModelId, activeModelName: model.name, activeModelTier: model.tier }
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
    ipcMain.handle(IPC_CHANNELS.CHAT_SEND_MESSAGE, async (event, conversationId: string, content: string, systemPrompt: string, images?: string[], searchEnabled?: boolean) => {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) return { error: 'No window' }

        const guard = storage.canGenerate()
        if (!guard.allowed) return { error: guard.reason }

        const settings = storage.getSettings()
        const availableModels = downloadService.getAvailableModels()
        const selectedModel = availableModels.find(m => m.id === activeModelId)
        const isCloudModel = selectedModel && selectedModel.provider !== 'local'

        if (!isCloudModel && llamaServer.status !== 'ready' && llamaServer.status !== 'generating') {
            return { error: 'Local model not ready' }
        }

        storage.setGenerating(true)
        const userMessage: ChatMessage = {
            id: generateId(),
            conversationId,
            role: 'user',
            content,
            tokenCount: estimateTokens(content),
            createdAt: Date.now()
        }
        storage.addMessage(userMessage)
        window.webContents.send(IPC_CHANNELS.CONVERSATION_MESSAGES_UPDATED, { conversationId, message: userMessage })

        const conversation = storage.getConversation(conversationId)
        if (conversation && conversation.title === 'New Chat') {
            storage.updateConversationTitle(conversationId, content.slice(0, 60))
        }

        try {
            activeAbortController = new AbortController()
            const settings = storage.getSettings()

            const context = storage.getRollingContext(conversationId, settings.contextSize)
            let messages = [{ role: 'system', content: systemPrompt }, ...context.map(m => ({ role: m.role, content: m.content }))]

            if (searchEnabled && (settings.serperApiKey || settings.tavilyApiKey)) {
                try {
                    const refinedQuery = await generateSearchQuery(content, llamaServer.baseUrl, !!isCloudModel)
                    console.log(`[Search] Original: "${content}" -> Refined: "${refinedQuery}"`)

                    const searchResults = await searchService.search(refinedQuery, {
                        serperApiKey: settings.serperApiKey,
                        tavilyApiKey: settings.tavilyApiKey
                    })

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
                    console.error('[SearchService] Search failed:', searchErr)
                    // Continue with normal chat if search fails
                }
            }

            let assistantContent = ''
            if (isCloudModel && selectedModel) {
                const options = {
                    apiKey: '',
                    model: selectedModel.id,
                    messages,
                    temperature: settings.temperature,
                    maxTokens: settings.maxTokens,
                    stream: true
                }

                if (selectedModel.provider === 'openai') {
                    options.apiKey = settings.openaiApiKey || ''
                    if (!options.apiKey) throw new Error('OpenAI API Key is missing in settings')
                    assistantContent = await cloudModelService.streamOpenAI(options, (token) => {
                        window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                    }, activeAbortController.signal)
                } else if (selectedModel.provider === 'anthropic') {
                    options.apiKey = settings.anthropicApiKey || ''
                    if (!options.apiKey) throw new Error('Anthropic API Key is missing in settings')
                    assistantContent = await cloudModelService.streamAnthropic(options, (token) => {
                        window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                    }, activeAbortController.signal)
                } else if (selectedModel.provider === 'google') {
                    options.apiKey = settings.geminiApiKey || ''
                    if (!options.apiKey) throw new Error('Gemini API Key is missing in settings')
                    assistantContent = await cloudModelService.streamGemini(options, (token) => {
                        window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                    }, activeAbortController.signal)
                }
            } else {
                assistantContent = await streamCompletion(llamaServer.baseUrl, messages, activeAbortController.signal, (token) => {
                    window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                }, ["<|user|>", "user:", "<|assistant|>", "assistant:"], settings.temperature, settings.maxTokens)
            }

            const assistantMsg: ChatMessage = { id: generateId(), conversationId, role: 'assistant', content: assistantContent, tokenCount: estimateTokens(assistantContent), createdAt: Date.now() }
            storage.addMessage(assistantMsg)
            window.webContents.send(IPC_CHANNELS.CONVERSATION_MESSAGES_UPDATED, { conversationId, message: assistantMsg })
            window.webContents.send(IPC_CHANNELS.CHAT_STREAM_COMPLETE, { conversationId })
            return { success: true }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error'
            if (msg !== 'aborted') window.webContents.send(IPC_CHANNELS.CHAT_STREAM_ERROR, { conversationId, error: msg })
            return { error: msg }
        } finally {
            storage.setGenerating(false)
            activeAbortController = null
        }
    })

    ipcMain.handle(IPC_CHANNELS.CHAT_STOP_GENERATION, () => {
        if (activeAbortController) activeAbortController.abort()
        return { success: true }
    })

    // --- Setup & Download ---
    ipcMain.handle(IPC_CHANNELS.SETUP_GET_STATUS, () => ({
        hasBinary: downloadService.isBinaryDownloaded(),
        hasModel: downloadService.getFirstAvailableModelPath() !== null,
        binaryPath: downloadService.getBinaryPath(),
        modelPath: downloadService.getFirstAvailableModelPath()
    }))
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
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_START_BINARY, async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const prog = (p: any) => win?.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, p)
        downloadService.on('progress', prog)
        try {
            const p = await downloadService.downloadBinary()
            win?.webContents.send(IPC_CHANNELS.DOWNLOAD_COMPLETE, { id: 'binary', path: p })
            return { success: true, path: p }
        } catch (err) {
            return { error: err instanceof Error ? err.message : 'Error' }
        } finally {
            downloadService.removeListener('progress', prog)
        }
    })
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_CANCEL, (_event, id) => {
        downloadService.cancelDownload(id)
        return { success: true }
    })
}

function streamCompletion(
    baseUrl: string,
    messages: Array<{ role: string; content: string }>,
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
            res.on('end', () => resolve(acc))
        })
        signal.addEventListener('abort', () => req.destroy())
        req.on('error', (e) => reject(e))
        req.write(body)
        req.end()
    })
}
