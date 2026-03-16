import { ToolPermissionLevel, ToolPermissionRequest, ToolPermissionResponse } from '../../../src/types/mcp.types'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { StorageService } from '../storage.service'

export class PermissionManager extends EventEmitter {
    private pendingRequests: Map<string, {
        toolName: string,
        resolve: (approved: boolean) => void,
        reject: (error: Error) => void,
        timeout: NodeJS.Timeout
    }> = new Map()

    private autoApproveReads: boolean = false
    private storage: StorageService

    constructor(storage: StorageService, autoApproveReads: boolean = false) {
        super()
        this.storage = storage
        this.autoApproveReads = autoApproveReads
    }

    /**
     * Update the auto-approve setting
     */
    setAutoApproveReads(autoApprove: boolean) {
        this.autoApproveReads = autoApprove
    }

    /**
     * Requests permission to execute a tool.
     * Returns a Promise that resolves with a boolean indicating approval.
     */
    async requestPermission(
        toolName: string,
        args: Record<string, any>,
        conversationId: string,
        permissionLevel: ToolPermissionLevel,
        warningMessage?: string
    ): Promise<boolean> {
        // Auto-approve reads if configured
        if (permissionLevel === 'read' && this.autoApproveReads) {
            return true
        }

        // Check if tool is always allowed
        const settings = this.storage.getSettings()
        const alwaysAllowed = settings.mcpAlwaysAllowedTools || []
        if (alwaysAllowed.includes(toolName)) {
            console.log(`[MCP] Tool ${toolName} is always allowed, auto-approving.`)
            return true
        }

        const requestId = randomUUID()

        const request: ToolPermissionRequest = {
            requestId,
            toolName,
            args,
            conversationId,
            permissionLevel,
            type: 'tool_execution',
            warningMessage
        }

        return new Promise<boolean>((resolve, reject) => {
            // Timeout after 5 minutes (user might walk away)
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId)
                resolve(false) // Default to deny on timeout
            }, 5 * 60 * 1000)

            this.pendingRequests.set(requestId, { toolName, resolve, reject, timeout })

            // Emit event to be picked up by IPC handlers and sent to frontend
            this.emit('permission-requested', request)
        })
    }

    async requestSandboxApproval(
        sandboxPath: string,
        conversationId: string
    ): Promise<boolean> {
        const requestId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`

        const request: ToolPermissionRequest = {
            requestId,
            toolName: 'add_to_sandbox',
            args: { path: sandboxPath },
            conversationId,
            permissionLevel: 'write',
            type: 'sandbox_add',
            sandboxPath,
            warningMessage: `The AI wants to access "${sandboxPath}" which is outside your sandbox. Allow permanent access to this folder?`
        }

        return new Promise<boolean>((resolve) => {
            this.pendingRequests.set(requestId, {
                toolName: 'add_to_sandbox',
                resolve,
                reject: () => {}, // Sandbox approval doesn't really "reject" in terms of errors
                timeout: setTimeout(() => {
                    this.pendingRequests.delete(requestId)
                    resolve(false)
                }, 5 * 60 * 1000)
            })
            this.emit('permission-requested', request)
        })
    }

    /**
     * Resolves a pending permission request.
     * Called by the IPC handler when the user clicks Allow/Deny in UI.
     */
    resolvePermission(response: ToolPermissionResponse): void {
        const pending = this.pendingRequests.get(response.requestId)
        if (pending) {
            clearTimeout(pending.timeout)
            this.pendingRequests.delete(response.requestId)

            // If "Always Allow" was clicked, persist it to settings
            if (response.approved && response.always) {
                const settings = this.storage.getSettings()
                const current = settings.mcpAlwaysAllowedTools || []
                if (!current.includes(pending.toolName)) {
                    this.storage.setSettings({
                        mcpAlwaysAllowedTools: [...current, pending.toolName]
                    })
                }
            }
            pending.resolve(response.approved)
        }
    }

    /**
     * Clears all pending requests (e.g. if chat window is closed or generation stopped)
     */
    cancelAllRequests(): void {
        const pendingEntries = Array.from(this.pendingRequests.entries())
        for (const [id, pending] of pendingEntries) {
            clearTimeout(pending.timeout)
            pending.resolve(false)
        }
        this.pendingRequests.clear()
    }
}
