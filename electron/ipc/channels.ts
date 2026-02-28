/**
 * IPC Channel constants for type-safe communication
 * between main and renderer processes.
 */
export const IPC_CHANNELS = {
    // Chat
    CHAT_SEND_MESSAGE: 'chat:send-message',
    CHAT_STOP_GENERATION: 'chat:stop-generation',
    CHAT_STREAM_TOKEN: 'chat:stream-token',
    CHAT_STREAM_COMPLETE: 'chat:stream-complete',
    CHAT_STREAM_ERROR: 'chat:stream-error',

    // Conversations
    CONVERSATION_LIST: 'conversation:list',
    CONVERSATION_CREATE: 'conversation:create',
    CONVERSATION_DELETE: 'conversation:delete',
    CONVERSATION_GET_MESSAGES: 'conversation:get-messages',
    CONVERSATION_UPDATE_TITLE: 'conversation:update-title',

    // Model
    MODEL_GET_STATUS: 'model:get-status',
    MODEL_STATUS_CHANGED: 'model:status-changed',
    MODEL_START: 'model:start',
    MODEL_STOP: 'model:stop',
    MODEL_SWITCH: 'model:switch',
    MODEL_GET_ACTIVE: 'model:get-active',
    MODEL_DELETE: 'model:delete',

    // Settings
    SETTINGS_GET: 'settings:get',
    SETTINGS_SET: 'settings:set',

    // Storage
    STORAGE_EXPORT: 'storage:export',
    STORAGE_IMPORT: 'storage:import',

    // System
    SYSTEM_GET_INFO: 'system:get-info',

    // Download & Setup
    DOWNLOAD_GET_MODELS: 'download:get-models',
    DOWNLOAD_GET_DOWNLOADED: 'download:get-downloaded',
    DOWNLOAD_START_MODEL: 'download:start-model',
    DOWNLOAD_START_BINARY: 'download:start-binary',
    DOWNLOAD_CANCEL: 'download:cancel',
    DOWNLOAD_PROGRESS: 'download:progress',
    DOWNLOAD_COMPLETE: 'download:complete',
    DOWNLOAD_ERROR: 'download:error',
    SETUP_GET_STATUS: 'setup:get-status'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
