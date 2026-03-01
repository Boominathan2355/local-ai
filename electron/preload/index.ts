import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../ipc/channels'

import type { AppSettings } from '../../src/types/settings.types'
import type { StreamTokenEvent } from '../../src/types/chat.types'
import type { Conversation } from '../../src/types/conversation.types'
import type { ChatMessage } from '../../src/types/chat.types'
import type { ModelStatus } from '../../src/types/model.types'

export interface LocalAIApi {
    chat: {
        sendMessage: (conversationId: string, content: string, systemPrompt: string, images?: string[], searchEnabled?: boolean, retryId?: string) => Promise<{ success?: boolean; error?: string }>
        stopGeneration: () => Promise<{ success: boolean }>
        onStreamToken: (callback: (event: StreamTokenEvent) => void) => () => void
        onStreamComplete: (callback: (data: { conversationId: string }) => void) => () => void
        onStreamError: (callback: (data: { conversationId: string; error: string }) => void) => () => void
        switchVersion: (conversationId: string, messageId: string) => Promise<{ success: boolean }>
    }
    conversations: {
        list: () => Promise<Conversation[]>
        create: () => Promise<Conversation>
        delete: (id: string) => Promise<{ success: boolean }>
        getMessages: (conversationId: string) => Promise<ChatMessage[]>
        updateTitle: (id: string, title: string) => Promise<{ success: boolean }>
        onMessagesUpdated: (callback: (data: { conversationId: string; message?: ChatMessage }) => void) => () => void
    }
    model: {
        getStatus: () => Promise<ModelStatus>
        startModel: () => Promise<{ success?: boolean; error?: string; activeModelId?: string | null }>
        switchModel: (modelId: string) => Promise<{ success?: boolean; error?: string; activeModelId?: string | null }>
        getActive: () => Promise<{ activeModelId: string | null }>
        deleteModel: (modelId: string) => Promise<{ success: boolean; error?: string }>
        onStatusChanged: (callback: (status: string) => void) => () => void
    }
    settings: {
        get: () => Promise<AppSettings>
        set: (settings: Partial<AppSettings>) => Promise<AppSettings>
    }
    storage: {
        exportData: () => Promise<string>
        importData: (jsonString: string) => Promise<{ success: boolean }>
    }
    system: {
        getInfo: () => Promise<{
            totalRamMB: number
            freeRamMB: number
            cpuCores: number
            cpuUsagePercent: number
            diskFreeGB: number
            diskTotalGB: number
            gpuName?: string
            gpuMemoryTotalMB?: number
            gpuMemoryFreeMB?: number
        }>
    }
    download: {
        getModels: (options?: { includeCloud?: boolean }) => Promise<Array<{ id: string; name: string; description: string; sizeGB: number; ramRequired: number; tier: string; filename: string; downloaded: boolean }>>
        getDownloaded: () => Promise<Array<{ id: string; name: string; filename: string; sizeBytes: number; path: string }>>
        startModel: (modelId: string) => Promise<{ success?: boolean; error?: string; path?: string }>
        startBinary: () => Promise<{ success?: boolean; error?: string; path?: string }>
        cancel: (downloadId: string) => Promise<{ success: boolean }>
        onProgress: (callback: (progress: { id: string; filename: string; downloaded: number; total: number; percent: number; speedMBps: number; etaSeconds: number }) => void) => () => void
        onComplete: (callback: (data: { id: string; path: string }) => void) => () => void
        onError: (callback: (data: { id: string; error: string }) => void) => () => void
    }
    setup: {
        getStatus: () => Promise<{ hasBinary: boolean; hasModel: boolean; binaryPath: string; modelPath: string | null }>
    }
    onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void
}

/**
 * Creates a cleanup function for IPC event listeners.
 */
function createListener<T>(channel: string, callback: (data: T) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: T): void => {
        callback(data)
    }
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
}

const api: LocalAIApi = {
    chat: {
        sendMessage: (conversationId, content, systemPrompt, images, searchEnabled, retryId) =>
            ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_MESSAGE, conversationId, content, systemPrompt, images, searchEnabled, retryId),
        stopGeneration: () =>
            ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP_GENERATION),
        onStreamToken: (callback) =>
            createListener(IPC_CHANNELS.CHAT_STREAM_TOKEN, callback),
        onStreamComplete: (callback) =>
            createListener(IPC_CHANNELS.CHAT_STREAM_COMPLETE, callback),
        onStreamError: (callback) =>
            createListener(IPC_CHANNELS.CHAT_STREAM_ERROR, callback),
        switchVersion: (conversationId, messageId) =>
            ipcRenderer.invoke(IPC_CHANNELS.CHAT_SWITCH_VERSION, conversationId, messageId)
    },
    conversations: {
        list: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LIST),
        create: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CREATE),
        delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, id),
        getMessages: (conversationId) =>
            ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_GET_MESSAGES, conversationId),
        updateTitle: (id, title) =>
            ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_UPDATE_TITLE, id, title),
        onMessagesUpdated: (callback) =>
            createListener(IPC_CHANNELS.CONVERSATION_MESSAGES_UPDATED, callback)
    },
    model: {
        getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_GET_STATUS),
        startModel: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_START),
        switchModel: (modelId) => ipcRenderer.invoke(IPC_CHANNELS.MODEL_SWITCH, modelId),
        getActive: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_GET_ACTIVE),
        deleteModel: (modelId) => ipcRenderer.invoke(IPC_CHANNELS.MODEL_DELETE, modelId),
        onStatusChanged: (callback) =>
            createListener(IPC_CHANNELS.MODEL_STATUS_CHANGED, callback)
    },
    settings: {
        get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
        set: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings)
    },
    storage: {
        exportData: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_EXPORT),
        importData: (jsonString) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_IMPORT, jsonString)
    },
    system: {
        getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_INFO)
    },
    download: {
        getModels: (options) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_GET_MODELS, options),
        getDownloaded: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_GET_DOWNLOADED),
        startModel: (modelId) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START_MODEL, modelId),
        startBinary: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START_BINARY),
        cancel: (downloadId) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_CANCEL, downloadId),
        onProgress: (callback) => createListener(IPC_CHANNELS.DOWNLOAD_PROGRESS, callback),
        onComplete: (callback) => createListener(IPC_CHANNELS.DOWNLOAD_COMPLETE, callback),
        onError: (callback) => createListener(IPC_CHANNELS.DOWNLOAD_ERROR, callback)
    },
    setup: {
        getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SETUP_GET_STATUS)
    },
    onSettingsChanged: (callback) =>
        createListener(IPC_CHANNELS.SETTINGS_CHANGED, callback)
}

contextBridge.exposeInMainWorld('localAI', api)
