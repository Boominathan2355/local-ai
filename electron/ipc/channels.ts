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
    CHAT_SEARCH_STATUS: 'chat:search-status',
    CHAT_TOOL_PERMISSIONS_REQUEST: 'chat:tool-permissions-request',
    CHAT_TOOL_PERMISSIONS_RESPONSE: 'chat:tool-permissions-response',
    CHAT_SWITCH_VERSION: 'chat:switch-version',

    // Conversations
    CONVERSATION_LIST: 'conversation:list',
    CONVERSATION_CREATE: 'conversation:create',
    CONVERSATION_DELETE: 'conversation:delete',
    CONVERSATION_GET_MESSAGES: 'conversation:get-messages',
    CONVERSATION_UPDATE_TITLE: 'conversation:update-title',
    CONVERSATION_UPDATE: 'conversation:update',
    CONVERSATION_MESSAGES_UPDATED: 'conversation:messages-updated',

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
    SETTINGS_CHANGED: 'settings:changed',

    // Storage
    STORAGE_EXPORT: 'storage:export',
    STORAGE_IMPORT: 'storage:import',

    // System
    SYSTEM_GET_INFO: 'system:get-info',
    SYSTEM_SELECT_DIRECTORY: 'system:select-directory',

    // Download & Setup
    DOWNLOAD_GET_MODELS: 'download:get-models',
    DOWNLOAD_GET_DOWNLOADED: 'download:get-downloaded',
    DOWNLOAD_START_MODEL: 'download:start-model',
    DOWNLOAD_PAUSE: 'download:pause',
    DOWNLOAD_RESUME: 'download:resume',
    DOWNLOAD_CANCEL: 'download:cancel',
    DOWNLOAD_PROGRESS: 'download:progress',
    DOWNLOAD_COMPLETE: 'download:complete',
    DOWNLOAD_ERROR: 'download:error',

    // Setup
    SETUP_GET_STATUS: 'setup:get-status',
    SETUP_CHECK_UPDATES: 'setup:check-updates',
    SETUP_INSTALL_ENGINE: 'setup:install-engine',
    SETUP_UPDATE_ENGINE: 'setup:update-engine',
    SETUP_PAUSE: 'setup:pause',
    SETUP_RESUME: 'setup:resume',
    SETUP_PROGRESS: 'setup:progress',
    SETUP_COMPLETE: 'setup:complete',
    SETUP_ERROR: 'setup:error',

    // MCP
    MCP_TOOL_EXECUTE: 'mcp:tool-execute',
    MCP_TOOL_CANCEL: 'mcp:tool-cancel',
    MCP_GET_STATS: 'mcp:get-stats',
    MCP_GET_LOGS: 'mcp:get-logs',
    MCP_CLEAR_LOGS: 'mcp:clear-logs',
    MCP_GET_TOOLS: 'mcp:get-tools',
    MCP_SET_TOOL_ENABLED: 'mcp:set-tool-enabled'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
