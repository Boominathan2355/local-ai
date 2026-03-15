import { ToolLogEntry, ToolCategory, ToolResult, ParsedToolCall, ToolErrorCode } from '../../../src/types/mcp.types'
import { ToolRegistry } from './tool-registry'
import { PermissionManager } from './permission-manager'
import { StorageService } from '../storage.service'
import { RateLimiter } from './rate-limiter'
import { ToolLogger } from './tool-logger'
import { randomUUID } from 'crypto'

export class ToolController {
    public registry: ToolRegistry
    public permissions: PermissionManager
    public logger: ToolLogger
    public rateLimiter: RateLimiter

    constructor(storage: StorageService, autoApproveReads: boolean = false) {
        this.registry = new ToolRegistry()
        this.permissions = new PermissionManager(storage, autoApproveReads)
        this.logger = new ToolLogger()
        this.rateLimiter = new RateLimiter()
    }

    /**
     * Parse raw text containing <tool_call>... format.
     */
    parseToolCallText(rawText: string): ParsedToolCall | null {
        try {
            const match = rawText.match(/<tool_call>([\s\S]*?)<\/tool_call>/)
            if (!match) return null

            const content = match[1].trim()
            const parts = content.split('|')
            if (parts.length < 2) return null

            const toolName = parts[0].trim()
            const argsStr = parts.slice(1).join('|').trim()
            const args = JSON.parse(argsStr)

            return { toolName, args, rawText: match[0] }
        } catch (e) {
            console.error('Failed to parse tool call block:', e)
            return null
        }
    }

    /**
     * Main execution pipeline:
     * 1. Check if tool exists and is enabled
     * 2. Check rate limits
     * 3. Request permissions via IPC
     * 4. Log start
     * 5. Execute handler (to be implemented by specific execution services)
     * 6. Log result
     */
    async execute(
        parsed: ParsedToolCall,
        conversationId: string,
        executor: (toolName: string, args: Record<string, any>) => Promise<any>
    ): Promise<ToolResult> {
        const startTime = Date.now()
        const toolDef = this.registry.getTool(parsed.toolName)

        // Ensure tool is registered
        if (!toolDef) {
            return this.buildResult(parsed, false, undefined, `Tool '${parsed.toolName}' is not recognized.`, ToolErrorCode.INVALID_ARGS, startTime)
        }

        // Ensure tool is enabled
        if (!toolDef.enabled) {
            return this.buildResult(parsed, false, undefined, `Tool '${parsed.toolName}' is currently disabled in settings.`, ToolErrorCode.PERMISSION_DENIED, startTime)
        }

        // Rate limit check
        const rateCheck = this.rateLimiter.canExecute(parsed.toolName)
        if (!rateCheck.allowed) {
            return this.buildResult(parsed, false, undefined, rateCheck.reason, ToolErrorCode.RATE_LIMITED, startTime)
        }

        const logId = randomUUID()

        // Permission check
        const isApproved = await this.permissions.requestPermission(
            parsed.toolName,
            parsed.args,
            conversationId,
            toolDef.permissionLevel
        )

        if (!isApproved) {
            await this.logger.log({
                id: logId,
                timestamp: startTime,
                conversationId,
                toolName: parsed.toolName,
                category: toolDef.category,
                args: parsed.args,
                status: 'denied',
                durationMs: Date.now() - startTime,
                error: 'User denied permission'
            })
            return this.buildResult(parsed, false, undefined, 'User denied permission to execute this tool.', ToolErrorCode.USER_DENIED, startTime)
        }

        // Execute
        try {
            // Apply tool-specific timeout
            const result = await Promise.race([
                executor(parsed.toolName, parsed.args),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Tool execution timed out')), toolDef.maxExecutionTimeMs))
            ])

            const duration = Date.now() - startTime

            await this.logger.log({
                id: logId,
                timestamp: startTime,
                conversationId,
                toolName: parsed.toolName,
                category: toolDef.category,
                args: parsed.args,
                status: 'success',
                durationMs: duration,
                resultSummary: typeof result === 'string' ? result.substring(0, 100) : 'Success'
            })

            return this.buildResult(parsed, true, result, undefined, undefined, startTime)

        } catch (error: any) {
            const duration = Date.now() - startTime
            const isTimeout = error.message.includes('timed out')

            await this.logger.log({
                id: logId,
                timestamp: startTime,
                conversationId,
                toolName: parsed.toolName,
                category: toolDef.category,
                args: parsed.args,
                status: isTimeout ? 'timeout' : 'error',
                durationMs: duration,
                error: error.message
            })

            return this.buildResult(
                parsed,
                false,
                undefined,
                error.message || 'Unknown error occurred during execution',
                isTimeout ? ToolErrorCode.TIMEOUT : undefined,
                startTime
            )
        }
    }

    private buildResult(parsed: ParsedToolCall, success: boolean, result: any, error?: string, errorCode?: ToolErrorCode, startTime: number = Date.now()): ToolResult {
        return {
            success,
            toolName: parsed.toolName,
            args: parsed.args,
            result,
            error,
            errorCode,
            durationMs: Date.now() - startTime
        }
    }
}
