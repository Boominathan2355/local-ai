import { ipcMain, BrowserWindow, app } from 'electron'
import path from 'path'
import os from 'os'
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
import { MCPToolsService } from '../services/mcp-tools.service'
import { ToolController } from '../services/mcp/tool-controller'
import { ParsedToolCall, ToolErrorCode } from '../../src/types/mcp.types'


import type { ChatMessage } from '../../src/types/chat.types'
import type { Conversation } from '../../src/types/conversation.types'



import { FileSystemService } from '../services/filesystem.service'
import { PathValidator } from '../services/mcp/path-validator'
import { registerDocumentTools } from '../services/mcp/document-tools/index'

const CHARS_PER_TOKEN = 4

const WEB_SEARCH_TOOL = {
    type: 'function',
    function: {
        name: 'web_search',
        description: 'Search the web for real-time information, news, current events, or facts. Use this when you need up-to-date data or information not in your training set.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The specific search query to look up on the web.'
                }
            },
            required: ['query']
        }
    }
}



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
            console.log('[Search] Cloud model detected, using original content as query')
            return content
        } else {
            console.log('[Search] Refining query using local model...')
            const refined = await getCompletion(baseUrl, messages, signal, 0.3, 50)
            console.log(`[Search] Refined query: "${refined || content}"`)
            return refined || content
        }
    } catch (err) {
        if (err instanceof Error && err.message === 'aborted') throw err
        console.error('[Search] Query generation failed:', err)
        return content
    }
}

function sanitizeToolArguments(raw: string): Record<string, any> {
    if (!raw || !raw.trim()) return {}
    try {
        // Fast path — already valid JSON
        return JSON.parse(raw)
    } catch {
        // Slow path — try to recover
        let cleaned = raw
        // Strip thinking/reasoning tokens from any model
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '')
        cleaned = cleaned.replace(/<\/?think>/gi, '')
        cleaned = cleaned.replace(/\[INST\][\s\S]*?\[\/INST\]/gi, '')
        // Strip markdown code fences
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
        cleaned = cleaned.trim()
        // Extract first complete JSON object
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
            try { return JSON.parse(match[0]) } catch { /* fall through */ }
        }
        // Extract first complete JSON array
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
        if (arrayMatch) {
            try { return JSON.parse(arrayMatch[0]) } catch { /* fall through */ }
        }
        console.error('[MCP] Could not parse tool arguments after sanitization:', raw)
        return {}
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
    mcpController: ToolController,
    initialModelId: string | null = null
): void {
    let activeAbortController: AbortController | null = null
    let activeModelId: string | null = initialModelId
 
    // Load persisted per-tool enabled states into registry on startup
    const initToolStates = async () => {
        const settings = await storage.getSettings()
        const storedEnabledTools: string[] | undefined = settings.mcpEnabledTools

        if (storedEnabledTools === undefined || storedEnabledTools === null) {
            // TRUE first run — no setting exists yet. 
            // Use registry defaults (terminal tools already set to false above).
            // Persist current registry state so next run loads from settings.
            const allTools = mcpController.registry.getAllTools()
            const defaultEnabled = allTools.filter(t => t.enabled).map(t => t.name)
            await storage.setSettings({ mcpEnabledTools: defaultEnabled })
        } else if (storedEnabledTools.length === 0) {
            // Legacy "all enabled" sentinel — migrate to explicit list
            const allTools = mcpController.registry.getAllTools()
            // Enable all non-terminal tools, keep terminal disabled
            for (const tool of allTools) {
                const shouldEnable = tool.category !== 'terminal'
                mcpController.registry.setToolEnabled(tool.name, shouldEnable)
            }
            const enabledNames = allTools
                .filter(t => t.category !== 'terminal')
                .map(t => t.name)
            await storage.setSettings({ mcpEnabledTools: enabledNames })
        } else {
            // Normal run — apply persisted states
            const allTools = mcpController.registry.getAllTools()
            for (const tool of allTools) {
                mcpController.registry.setToolEnabled(
                    tool.name,
                    storedEnabledTools.includes(tool.name)
                )
            }
        }
    }
    initToolStates()

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
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_UPDATE_TITLE, (_event, id: string, title: string) => storage.updateConversationTitle(id, title))
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_UPDATE, (_event, id: string, data: any) => {
        storage.updateConversation(id, data)
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
        const metadata = {
            supportsVision: model?.supportsVision ?? false,
            supportsThinking: model?.supportsThinking ?? false
        }
        console.log(`[Chat] Model metadata for ${modelId}:`, metadata)
        console.log(`[Chat] Model found:`, !!model, model?.name)
        return metadata
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

    // --- MCP Permissions Bridge ---
    mcpController.permissions.on('permission-requested', (request) => {
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
            windows[0].webContents.send(IPC_CHANNELS.CHAT_TOOL_PERMISSIONS_REQUEST, request)
        }
    })

    ipcMain.on(IPC_CHANNELS.CHAT_TOOL_PERMISSIONS_RESPONSE, (_event, response: { requestId: string, approved: boolean, always?: boolean }) => {
        mcpController.permissions.resolvePermission(response)
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

    ipcMain.handle(IPC_CHANNELS.SYSTEM_SELECT_DIRECTORY, async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return { canceled: true, paths: [] }

        const { dialog } = require('electron')
        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
            title: 'Select a folder to add to sandbox'
        })

        return {
            canceled: result.canceled,
            paths: result.filePaths
        }
    })

    // --- MCP Tool Management ---
    ipcMain.handle(IPC_CHANNELS.MCP_GET_TOOLS, async () => {
        const allTools = mcpController.registry.getAllTools()
        console.log('[MCP_GET_TOOLS] tool count:', allTools.length, allTools.map(t => t.name))
        
        if (allTools.length === 0) {
            console.warn('[MCP] WARNING: Registry is empty! Re-initializing tools...')
            mcpController.registry.registerFileTools()
            mcpController.registry.registerTerminalTools()
            mcpController.registry.registerDocumentTools()
        }

        return allTools.map(tool => ({
            name: tool.name,
            category: tool.category,
            description: tool.description,
            enabled: tool.enabled,
            permissionLevel: tool.permissionLevel,
        }))
    })

    ipcMain.handle(IPC_CHANNELS.MCP_SET_TOOL_ENABLED,
        async (_event, toolName: string, enabled: boolean) => {
            // Update in-memory registry immediately
            mcpController.registry.setToolEnabled(toolName, enabled)

            // Persist to settings
            const settings = await storage.getSettings()
            const allTools = mcpController.registry.getAllTools()

            // Build the new enabled list — only store names of ENABLED tools
            // Empty array means "all enabled" — only write explicit list when
            // something is actually disabled
            const enabledNames = allTools
                .filter(t => t.enabled)
                .map(t => t.name)

            const allEnabled = enabledNames.length === allTools.length
            await storage.setSettings({
                mcpEnabledTools: allEnabled ? [] : enabledNames
            })

            return { success: true, toolName, enabled }
        }
    )

    // --- Settings / Storage ---
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => storage.getSettings())
    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, settings) => storage.setSettings(settings))
    ipcMain.handle(IPC_CHANNELS.STORAGE_EXPORT, () => storage.exportData())
    ipcMain.handle(IPC_CHANNELS.STORAGE_IMPORT, (_event, jsonString: string) => {
        storage.importData(jsonString)
        return { success: true }
    })

    // --- Chat ---
    ipcMain.handle(IPC_CHANNELS.CHAT_SEND_MESSAGE, async (event, conversationId: string, content: string, systemPrompt: string, images?: string[], searchEnabled?: boolean, retryId?: string, quotedMessageId?: string, quotedMessageText?: string, isAgentModeIn?: boolean, enabledToolCategoriesIn?: string[]) => {
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
                    window.webContents.send(IPC_CHANNELS.CHAT_SEARCH_STATUS, { conversationId, status: 'Optimizing search query...' })
                    const refinedQuery = await generateSearchQuery(content, llamaServer.baseUrl, !!isCloudModel, activeAbortController.signal)

                    window.webContents.send(IPC_CHANNELS.CHAT_SEARCH_STATUS, { conversationId, status: `Searching for: ${refinedQuery}...` })
                    const searchResults = await searchService.search(refinedQuery, {
                        serperApiKey: settings.serperApiKey,
                        tavilyApiKey: settings.tavilyApiKey
                    }, activeAbortController.signal)

                    if (searchResults.length > 0) {
                        window.webContents.send(IPC_CHANNELS.CHAT_SEARCH_STATUS, { conversationId, status: `Injected ${searchResults.length} search results` })
                        const contextString = searchResults.map(r => `Source: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}`).join('\n\n')
                        const searchPrompt = `Relevant real-time web search results:\n\n${contextString}\n\nUse these results to provide an up-to-date answer. If they are not relevant, rely on your general knowledge.`

                        // Append search results to the system prompt or as a new system message
                        // We use the first system message if it exists, otherwise create one
                        const systemIdx = messages.findIndex(m => m.role === 'system')
                        if (systemIdx !== -1) {
                            messages[systemIdx].content = `${messages[systemIdx].content}\n\n${searchPrompt}`
                        } else {
                            messages.unshift({ role: 'system', content: searchPrompt })
                        }
                    } else {
                        window.webContents.send(IPC_CHANNELS.CHAT_SEARCH_STATUS, { conversationId, status: 'No relevant search results found' })
                    }
                } catch (searchErr) {
                    if (searchErr instanceof Error && searchErr.message === 'aborted') throw searchErr
                    console.error('[SearchService] Search failed:', searchErr)
                    window.webContents.send(IPC_CHANNELS.CHAT_SEARCH_STATUS, { conversationId, status: 'Search failed' })
                }
            } else if (searchEnabled) {
                window.webContents.send(IPC_CHANNELS.CHAT_SEARCH_STATUS, { conversationId, status: 'Search disabled: Missing API keys' })
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

                    let toolCallCount = 0
                    const MAX_TOOL_CALLS = 3

                    while (toolCallCount < MAX_TOOL_CALLS) {
                        // For OpenAI, we can pass tools natively
                        const openaiOptions = { ...options, tools: [WEB_SEARCH_TOOL] }

                        // We need a non-streaming call or a way to handle tool_calls in stream
                        // For simplicity in this first version, let's use a standard completion if we want tools
                        // Actually, let's keep it consistent and just use the same loop pattern

                        assistantContent = await cloudModelService.streamOpenAI(openaiOptions, (token) => {
                            assistantContent += token
                            window.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, { conversationId, token, done: false })
                        }, activeAbortController.signal)

                        // TODO: Implement OpenAI native tool-call parsing here if needed
                        // For now, the cloud service doesn't return tool_calls in stream tokens easily
                        // I'll stick to the local fallback for now and refine cloud native tool-calling next.
                        break
                    }
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
                let localMessages: Array<{ role: string; content: any; tool_call_id?: string; tool_calls?: any[] }> = messages
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
                }

                const convo = storage.getConversation(conversationId)
                let enabledToolCategories = enabledToolCategoriesIn || (convo?.enabledToolCategories as string[]) || []
                const isAgentMode = isAgentModeIn || (selectedModel?.tier === 'agent')

                // Build OpenAI-format tools for native tool calling
                let tools: any[] | undefined = undefined

                if (isAgentMode) {
                    const allToolDefs = mcpController.registry.getToolDefinitionsOpenAI()

                    if (enabledToolCategories.length === 0) {
                        enabledToolCategories = ['file_control', 'document_creator', 'web_search']
                        // NOTE: terminal is intentionally excluded from default — user must opt in
                    }

                    // Filter to only enabled categories AND respect individual enabled state
                    const enabledToolDefs = allToolDefs.filter(td => {
                        const toolDef = mcpController.registry.getTool(td.function.name)
                        if (!toolDef) return false
                        // Must pass BOTH category filter AND individual enabled state
                        return enabledToolCategories.includes(toolDef.category) && toolDef.enabled
                    })
                    // Add web_search if enabled
                    if (enabledToolCategories.includes('web_search')) {
                        enabledToolDefs.push(WEB_SEARCH_TOOL as any)
                    }
                    if (enabledToolDefs.length > 0) {
                        tools = enabledToolDefs
                    }
                    console.log(`[Chat] Native tool calling: ${tools?.length ?? 0} tools provided to model`)
                }

                // When building tools[] for llama.cpp, if terminal category is requested
                // but all terminal tools are disabled, send a system note:
                const terminalRequested = enabledToolCategories.includes('terminal')
                const terminalToolsEnabled = tools?.some(t => {
                    const def = mcpController.registry.getTool(t.function.name)
                    return def?.category === 'terminal' && def?.enabled
                })

                if (terminalRequested && !terminalToolsEnabled) {
                    // Inject into system prompt so model knows why
                    systemPrompt += '\n\nNote: Terminal tools are currently disabled. ' +
                        'The user must enable them in MCP Tool Center → Tool Catalog before ' +
                        'you can run commands.'
                }

                const allowedPaths = [
                    os.homedir(),
                    app.getPath('userData'),
                    ...(settings.mcpAllowedPaths || [])
                ]

                let toolInstructions = ''
                if (isAgentMode && tools && tools.length > 0) {
                    toolInstructions = `\n\n[SYSTEM: AGENT MODE ACTIVE]
- TOOLS: ${tools.map(t => t.function.name).join(', ')}.
- DIR: Use 'create_directory' for folders. Never 'create_file'.
- FILE: Use 'write_file' or 'create_file' for content.
- AUTH: Full access granted. Use absolute paths.
- ACTION: Execute tools IMMEDIATELY. Do not ask for permission. Proceed without ceremony.`
                }

                const finalPrompt = `${systemPrompt}${toolInstructions}`
                // Build history from messages (excluding system prompt which is prepended in runGeneration)
                const history = localMessages.filter(m => m.role !== 'system')
                const win = window
                const toolController = mcpController
                const signal = activeAbortController.signal

                // Set up the local tooling services
                const toolSvc = new MCPToolsService(allowedPaths)

                const addSandboxPath = async (newPath: string): Promise<void> => {
                    const settings = await storage.getSettings()
                    const existing: string[] = settings.mcpAllowedPaths || []

                    // Deduplicate — don't add if already present
                    if (existing.some(p => path.resolve(p) === path.resolve(newPath))) return

                    const updated = [...existing, newPath]
                    await storage.setSettings({ mcpAllowedPaths: updated })

                    // Hot-reload path validator — no restart needed
                    toolSvc.updateAllowedPaths([
                        ...updated,
                        app.getPath('userData')
                    ])
                }
                const executeTerminalTool = async (name: string, args: any) => await toolSvc.runCommand(args.command, args.cwd)
                const docValidator = new PathValidator(allowedPaths)
                const docFs = new FileSystemService()
                const executeDocumentTool = registerDocumentTools(toolController, docFs, docValidator)
                const executeWebSearch = async (_name: string, _args: any) => {
                    throw new Error('web_search should be handled before tool execution')
                }
                const executeFileTool = async (name: string, args: any) => {
                    if (name === 'list_directory') return await toolSvc.listDirectory(args.dir_path ?? args.path)
                    if (name === 'create_directory') return await toolSvc.createDirectory(args.dir_path ?? args.path)
                    if (name === 'delete_directory') return await toolSvc.deleteDirectory(args.dir_path ?? args.path)
                    if (name === 'read_file') return await toolSvc.readFile(args.file_path ?? args.path)
                    if (name === 'write_file') return await toolSvc.writeFile(args.file_path ?? args.path, args.content)
                    if (name === 'create_file') return await toolSvc.createFile(args.file_path ?? args.path, args.content)
                    if (name === 'delete_file') return await toolSvc.deleteFile(args.file_path ?? args.path)
                    if (name === 'rename') return await toolSvc.rename(args.old_path, args.new_path)
                    if (name === 'copy_file') return await toolSvc.copyFile(args.source, args.destination)
                    if (name === 'search_files') return await toolSvc.searchFiles(args.path, args.pattern, args.max_results)
                    if (name === 'count_files') return await toolSvc.countFiles(args.path, args.recursive)
                    if (name === 'file_details') return await toolSvc.fileDetails(args.path)
                    throw new Error(`Execution of tool ${name} is not implemented natively yet.`)
                }

                const MAX_TOOL_ITERATIONS = 10
                let loopCount = 0

                const runGeneration = async (): Promise<void> => {
                    if (signal.aborted) return

                    // Check if thinking mode is actually enabled in the server
                    const isThinkingEnabled = llamaServer.isThinkingModeEnabled() && 
                        selectedModel?.supportsThinking

                    // For thinking models, don't add system prefill that conflicts with enable_thinking
                    const messages = isThinkingEnabled 
                        ? history // Only use history, no system prompt for thinking models
                        : [{ role: 'system', content: finalPrompt }, ...history]

                    console.log(`[Chat] Thinking mode enabled: ${isThinkingEnabled}`)
                    console.log(`[Chat] Messages count: ${messages.length}`)
                    console.log(`[Chat] Message structure:`, messages.map(m => ({ role: m.role, content: m.content?.substring(0, 50) + '...' })))

                    const result = await streamCompletion(
                        llamaServer.baseUrl,
                        messages,
                        signal,
                        (token) => win.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, {
                            conversationId,
                            token,
                            type: 'text'
                        }),
                        images || [],
                        settings.temperature,
                        settings.maxTokens,
                        tools || [],
                        settings
                    )

                    assistantContent = result.content

                    // ── Tool calling turn ──────────────────────────────────────────────────
                    const hasToolCalls = result.toolCalls.length > 0
                    const wantsToolExecution = result.finishReason === 'tool_calls' || 
                        (result.finishReason === 'stop' && hasToolCalls) ||
                        (result.finishReason === 'length' && hasToolCalls)

                    if (wantsToolExecution) {

                        if (loopCount >= MAX_TOOL_ITERATIONS) {
                            console.error('[MCP] Tool loop exceeded max iterations, forcing stop')
                            win.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, {
                                conversationId,
                                token: '\n\n[Tool loop limit reached]',
                                type: 'text'
                            })
                            return
                        }
                        loopCount++

                        // Append assistant message that contains the tool_calls
                        history.push({
                            role: 'assistant',
                            content: result.content || null,
                            tool_calls: result.toolCalls.map(tc => ({
                                id: tc.id,
                                type: 'function',
                                function: { name: tc.function.name, arguments: tc.function.arguments }
                            }))
                        })

                        // Execute each tool call sequentially
                        for (const tc of result.toolCalls) {
                            if (signal.aborted) break

                            // Notify renderer — tool is starting
                            win.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, {
                                conversationId,
                                type: 'tool_start',
                                toolName: tc.function.name,
                                input: sanitizeToolArguments(tc.function.arguments)
                            })

                            let toolResultContent: string

                            try {
                                const parsed = {
                                    toolName: tc.function.name,
                                    args: sanitizeToolArguments(tc.function.arguments),
                                    rawText: ''
                                }

                                let toolResult = await toolController.execute(
                                    parsed,
                                    conversationId,
                                    async (name: string, args: Record<string, any>) => {
                                        const toolDef = toolController.registry.getTool(name)
                                        const category = toolDef?.category

                                        if (name === 'web_search')           return executeWebSearch(name, args)
                                        if (category === 'terminal')         return executeTerminalTool(name, args)
                                        if (category === 'document_creator') return executeDocumentTool(name, args)
                                        if (category === 'file_control')     return executeFileTool(name, args)

                                        // Fallback — try each executor and return first success
                                        console.warn(`[MCP] Unknown tool category for "${name}", trying all executors`)
                                        try { return await executeFileTool(name, args) } catch {}
                                        try { return await executeDocumentTool(name, args) } catch {}
                                        try { return await executeTerminalTool(name, args) } catch {}
                                        throw new Error(`No executor found for tool: ${name}`)
                                    }
                                )

                                // Check if tool failed due to path being outside sandbox
                                if (
                                    !toolResult.success &&
                                    toolResult.errorCode === ToolErrorCode.PATH_OUTSIDE_SANDBOX &&
                                    toolResult.args?.path
                                ) {
                                    const requestedPath = toolResult.args.path as string
                                    // Determine the directory to add (if file path, use its parent dir)
                                    // Use path.extname to detect files vs directories — works on all platforms
                                    // A path with no extension is likely a directory; one with extension is a file
                                    const hasExtension = path.extname(requestedPath).length > 0
                                    const dirToAdd = hasExtension
                                        ? path.dirname(requestedPath)
                                        : requestedPath

                                    // Sensitive path patterns — never allow these to reach the approval dialog
                                    const SENSITIVE_PATH_PATTERNS = [
                                        // Unix — system files
                                        /\/etc\/(?:passwd|shadow|sudoers|hosts|ssh)/i,
                                        /\/proc\//i,
                                        /\/sys\//i,
                                        /\/dev\//i,

                                        // Unix — credentials and keys
                                        /[\/\\]\.ssh[\/\\]/i,
                                        /[\/\\]\.gnupg[\/\\]/i,
                                        /[\/\\]\.aws[\/\\]/i,
                                        /[\/\\]\.config[\/\\](?:google-chrome|chromium|mozilla)/i,

                                        // Unix — browser profiles
                                        /[\/\\]\.mozilla[\/\\]/i,

                                        // Unix — macOS sensitive
                                        /[\/\\]Library[\/\\]Keychains/i,
                                        /[\/\\]Library[\/\\]Application Support[\/\\](?:Google|Mozilla)/i,

                                        // Windows — system directories
                                        /[a-zA-Z]:[\/\\]Windows[\/\\]System32/i,
                                        /[a-zA-Z]:[\/\\]Windows[\/\\]SysWOW64/i,
                                        /[a-zA-Z]:[\/\\]Windows[\/\\]System/i,

                                        // Windows — credential stores
                                        /[\/\\]AppData[\/\\]Roaming[\/\\]Microsoft[\/\\](?:Credentials|Protect|Vault)/i,
                                        /[\/\\]AppData[\/\\]Local[\/\\]Microsoft[\/\\](?:Credentials|Vault)/i,

                                        // Windows — browser credentials
                                        /[\/\\]AppData[\/\\](?:Local|Roaming)[\/\\](?:Google|Mozilla|Microsoft)[\/\\]/i,

                                        // Windows — SSH keys
                                        /[\/\\]\.ssh[\/\\]/i,
                                        /[\/\\]OpenSSH[\/\\]/i,

                                        // Windows — registry hives (if somehow path-accessed)
                                        /[a-zA-Z]:[\/\\]Windows[\/\\]System32[\/\\]config[\/\\](?:SAM|SYSTEM|SECURITY)/i,
                                    ]

                                    const isSensitivePath = SENSITIVE_PATH_PATTERNS.some(pattern =>
                                        pattern.test(dirToAdd)
                                    )

                                    if (isSensitivePath) {
                                        toolResultContent = `Access denied: "${dirToAdd}" is a protected system path and cannot be added to the sandbox.`
                                        // Skip approval dialog entirely — fall through to append tool result
                                    } else {
                                        // Ask user via existing permission UI
                                        const approved = await toolController.permissions.requestSandboxApproval(
                                            dirToAdd,
                                            conversationId
                                        )

                                        if (approved) {
                                            // Persist and hot-reload
                                            await addSandboxPath(dirToAdd)

                                            // Retry the original tool call now that path is allowed
                                            const retryStartTime = Date.now()
                                            try {
                                                const retryParsed = {
                                                    toolName: tc.function.name,
                                                    args: sanitizeToolArguments(tc.function.arguments),
                                                    rawText: ''
                                                }
                                                toolResult = await toolController.execute(
                                                    retryParsed,
                                                    conversationId,
                                                    async (name: string, args: Record<string, any>) => {
                                                        const toolDef = toolController.registry.getTool(name)
                                                        const category = toolDef?.category

                                                        if (name === 'web_search')           return executeWebSearch(name, args)
                                                        if (category === 'terminal')         return executeTerminalTool(name, args)
                                                        if (category === 'document_creator') return executeDocumentTool(name, args)
                                                        if (category === 'file_control')     return executeFileTool(name, args)

                                                        console.warn(`[MCP] Unknown tool category for "${name}", trying all executors`)
                                                        try { return await executeFileTool(name, args) } catch {}
                                                        try { return await executeDocumentTool(name, args) } catch {}
                                                        try { return await executeTerminalTool(name, args) } catch {}
                                                        throw new Error(`No executor found for tool: ${name}`)
                                                    }
                                                )
                                            } catch (retryErr: any) {
                                                toolResult = {
                                                    success: false,
                                                    toolName: tc.function.name,
                                                    args: sanitizeToolArguments(tc.function.arguments),
                                                    error: retryErr.message,
                                                    durationMs: Date.now() - retryStartTime
                                                }
                                            }

                                            toolResultContent = toolResult.success
                                                ? (typeof toolResult.result === 'string'
                                                    ? toolResult.result
                                                    : JSON.stringify(toolResult.result, null, 2))
                                                : `Error after sandbox approval: ${toolResult.error}`
                                        } else {
                                            // User denied — tell LLM clearly
                                            toolResultContent = `Access denied: The user did not allow access to "${dirToAdd}". Do not retry this path.`
                                        }
                                    }
                                } else {
                                    // Normal result serialization
                                    toolResultContent = toolResult.success
                                        ? (typeof toolResult.result === 'string'
                                            ? toolResult.result
                                            : JSON.stringify(toolResult.result, null, 2))
                                        : `Error: ${toolResult.error || 'Tool execution failed'}`
                                }

                            } catch (err: any) {
                                console.error(`[MCP] Tool execution error (${tc.function.name}):`, err)
                                toolResultContent = `Error: ${err.message || 'Unknown error'}`
                            }

                            // Append tool result to history so LLM sees it next turn
                            history.push({
                                role: 'tool',
                                tool_call_id: tc.id,
                                content: toolResultContent
                            })

                            // Notify renderer — tool is done
                            win.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, {
                                conversationId,
                                type: 'tool_end',
                                toolName: tc.function.name,
                                result: toolResultContent.slice(0, 300) // preview only
                            })
                        }

                        // Loop — send updated history back to LLM for final response
                        if (!signal.aborted) {
                            await runGeneration()
                        }
                        return
                    }

                    // ── Final text response turn ───────────────────────────────────────────
                    // (No tool_calls — LLM gave its final answer, runGeneration is done)
                }

                await runGeneration()
            } // End else (local model logic)

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

    ipcMain.handle(IPC_CHANNELS.SETUP_CHECK_UPDATES, () => setupManager.checkForUpdate())

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
        const err = (e: any) => win?.webContents.send(IPC_CHANNELS.DOWNLOAD_ERROR, e)
        
        downloadService.on('progress', prog)
        downloadService.on('error', err)
        
        try {
            const p = await downloadService.downloadModel(modelId)
            win?.webContents.send(IPC_CHANNELS.DOWNLOAD_COMPLETE, { id: `model:${modelId}`, path: p })
            return { success: true, path: p }
        } catch (error) {
            return { error: error instanceof Error ? error.message : 'Error' }
        } finally {
            downloadService.removeListener('progress', prog)
            downloadService.removeListener('error', err)
        }
    })
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_CANCEL, (_event, id: string) => {
        console.log(`[IPC] Received DOWNLOAD_CANCEL for: ${id}`)
        if (id === 'engine' || id === 'binary') {
            setupManager.cancelDownload('binary')
        } else if (id.startsWith('model:')) {
            downloadService.cancelDownload(id)
        } else {
            // Try both just in case
            setupManager.cancelDownload(id)
            downloadService.cancelDownload(id)
        }
        return { success: true }
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_PAUSE, (_event, id: string) => {
        downloadService.pauseDownload(id)
        return { success: true }
    })

    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_RESUME, (_event, id: string) => {
        downloadService.resumeDownload(id)
        return { success: true }
    })

    ipcMain.handle(IPC_CHANNELS.SETUP_PAUSE, () => {
        setupManager.pauseDownload('binary')
        return { success: true }
    })

    ipcMain.handle(IPC_CHANNELS.SETUP_RESUME, () => {
        setupManager.resumeDownload('binary')
        return { success: true }
    })

}

/**
 * Structured result from streamCompletion, supporting both text and tool calls.
 */
interface StreamCompletionResult {
    content: string
    finishReason: string
    toolCalls: Array<{
        id: string
        type: string
        function: { name: string; arguments: string }
    }>
}

async function streamCompletion(
    endpoint: string,
    messages: any[],
    signal: AbortSignal,
    onToken: (token: string) => void,
    images: string[],
    temperature: number | undefined,
    maxTokens: number | undefined,
    tools: any[],
    settings?: any
): Promise<StreamCompletionResult> {
    const hasTools = Array.isArray(tools) && tools.length > 0

    const body: Record<string, any> = {
        model: settings?.modelName || 'local-model',
        messages,
        stream: true,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 2048,
    }

    if (hasTools) {
        body.tools = tools
        body.tool_choice = 'auto'
    }

    console.log(`[Chat] Request body:`, JSON.stringify(body, null, 2))

    const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
    })

    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText)
        throw new Error(`LLM request failed (${response.status}): ${errorText}`)
    }

    if (!response.body) {
        throw new Error('No response body from LLM endpoint')
    }

    // Accumulate tool_call fragments indexed by their stream index
    const accToolCalls: Record<number, {
        id: string
        type: string
        function: { name: string; arguments: string }
    }> = {}

    let accText = ''
    let finishReason = 'stop'
    let buffer = ''

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            // Keep last incomplete line in buffer
            buffer = lines.pop() ?? ''

            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed || !trimmed.startsWith('data:')) continue

                const dataStr = trimmed.slice(5).trim()
                if (dataStr === '[DONE]') break

                let chunk: any
                try {
                    chunk = JSON.parse(dataStr)
                } catch {
                    continue // skip malformed chunk
                }

                const choice = chunk.choices?.[0]
                if (!choice) continue

                // Capture finish reason whenever it appears
                if (choice.finish_reason) {
                    finishReason = choice.finish_reason
                }

                const delta = choice.delta
                if (!delta) continue

                // ── Text token ───────────────────────────────────────────
                if (typeof delta.content === 'string' && delta.content.length > 0) {
                    accText += delta.content
                    onToken(delta.content)
                }

                // ── Tool call fragments ───────────────────────────────────
                if (Array.isArray(delta.tool_calls)) {
                    for (const tc of delta.tool_calls) {
                        const idx: number = tc.index ?? 0
                        if (!accToolCalls[idx]) {
                            accToolCalls[idx] = {
                                id: '',
                                type: 'function',
                                function: { name: '', arguments: '' }
                            }
                        }
                        const slot = accToolCalls[idx]
                        if (tc.id)                       slot.id = tc.id
                        if (tc.type)                     slot.type = tc.type
                        if (tc.function?.name)           slot.function.name += tc.function.name
                        if (tc.function?.arguments)      slot.function.arguments += tc.function.arguments
                    }
                }
            }
        }
    } finally {
        reader.releaseLock()
    }

    return {
        content: accText,
        finishReason,
        toolCalls: Object.values(accToolCalls).filter(tc => tc.function.name)
    }
}
