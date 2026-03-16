// ─── Tool Categories & Permissions ─────────────────────────

export type ToolCategory = 'web_search' | 'file_control' | 'document_creator' | 'terminal'

export type ToolPermissionLevel = 'read' | 'write' | 'destructive' | 'terminal'

export interface ToolDefinition {
    name: string
    category: ToolCategory
    description: string
    parameterSchema: Record<string, any>     // JSON Schema for validation
    permissionLevel: ToolPermissionLevel
    maxExecutionTimeMs: number
    enabled: boolean
}

// ─── Tool Execution ────────────────────────────────────────

export interface ParsedToolCall {
    toolName: string
    args: Record<string, any>
    rawText: string                          // original <tool_call>...</tool_call> text
}

export interface ToolResult {
    success: boolean
    toolName: string
    args: Record<string, any>
    result?: any
    error?: string
    errorCode?: ToolErrorCode
    durationMs: number
}

export enum ToolErrorCode {
    PATH_OUTSIDE_SANDBOX = 'E_SANDBOX',
    PATH_SENSITIVE = 'E_SENSITIVE',
    SYMLINK_ESCAPE = 'E_SYMLINK',
    FILE_NOT_FOUND = 'E_NOT_FOUND',
    FILE_EXISTS = 'E_EXISTS',
    FILE_TOO_LARGE = 'E_TOO_LARGE',
    PERMISSION_DENIED = 'E_PERMISSION',
    USER_DENIED = 'E_USER_DENIED',
    TIMEOUT = 'E_TIMEOUT',
    RATE_LIMITED = 'E_RATE_LIMIT',
    GENERATION_FAILED = 'E_GEN_FAIL',
    INVALID_ARGS = 'E_INVALID_ARGS',
    DISK_FULL = 'E_DISK_FULL',
    COMMAND_BLOCKED = 'E_CMD_BLOCKED'
}

// ─── Permission System ─────────────────────────────────────

export interface ToolPermissionRequest {
    requestId: string
    toolName: string
    args: Record<string, any>
    conversationId: string
    permissionLevel: ToolPermissionLevel
    warningMessage?: string                  // shown for destructive/terminal ops
    // NEW — distinguishes sandbox path requests from tool execution requests
    type: 'tool_execution' | 'sandbox_add'
    // NEW — populated when type === 'sandbox_add'
    sandboxPath?: string
}

export interface ToolPermissionResponse {
    requestId: string
    approved: boolean
    always?: boolean
}

// ─── Logging ───────────────────────────────────────────────

export interface ToolLogEntry {
    id: string
    timestamp: number
    conversationId: string
    toolName: string
    category: ToolCategory
    args: Record<string, any>               // sanitized — no file content
    status: 'pending' | 'approved' | 'denied' | 'success' | 'error' | 'timeout'
    durationMs: number
    resultSummary?: string                  // truncated to 200 chars
    error?: string
}

// ─── Tool Chain (multi-step tracking) ──────────────────────

export interface ToolChainStep {
    toolName: string
    args: Record<string, any>
    status: 'pending' | 'running' | 'success' | 'error'
    resultSummary: string
    durationMs: number
}

export interface ToolChain {
    steps: ToolChainStep[]
    totalDurationMs: number
    conversationId: string
}

// ─── Document Creator ──────────────────────────────────────

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'md' | 'html' | 'txt'

export interface DocumentOptions {
    format?: DocumentFormat
    title?: string
    author?: string
    content?: string
    outputPath?: string
    sections?: Array<{ heading?: string; content?: string }>
    tableData?: any[]
    options?: {
        header?: string
        footer?: string
        fontSize?: number
        delimiter?: string
        css?: string
        template?: 'report' | 'article' | 'minimal'
    }
}

export interface GeneratedDocument {
    filePath: string
    sizeBytes: number
    format: DocumentFormat
    pageCount?: number
}

// ─── Terminal ──────────────────────────────────────────────

export interface TerminalArgs {
    command: string
    cwd?: string
    timeoutMs?: number
}

export interface TerminalResult {
    stdout: string
    stderr: string
    exitCode: number
    timedOut: boolean
}

// ─── File Details ──────────────────────────────────────────

export interface FileDetails {
    name: string
    path: string
    size: number
    sizeHuman: string
    extension: string
    isFile: boolean
    isDirectory: boolean
    isSymlink: boolean
    permissions: string
    created: number
    modified: number
    accessed: number
}

// ─── Chat Tool Bar State ───────────────────────────────────

export interface ChatToolBarState {
    enabledCategories: ToolCategory[]
    isExpanded: boolean
}
