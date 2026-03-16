import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import { ToolLogEntry, ToolCategory } from '../../../src/types/mcp.types'

export class ToolLogger {
    private logs: ToolLogEntry[] = []
    private readonly maxInMemory = 100
    private readonly maxPersisted = 500
    private logFilePath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        this.logFilePath = path.join(userDataPath, 'mcp-tool-logs.json')
        this.loadLogs()
    }

    /**
     * Adds a new log entry
     */
    async log(entry: ToolLogEntry): Promise<void> {
        // Sanitize arguments (don't log huge contents)
        const sanitizedArgs = this.sanitizeArgs(entry.args)

        const safeEntry = {
            ...entry,
            args: sanitizedArgs
        }

        this.logs.unshift(safeEntry)

        if (this.logs.length > this.maxPersisted) {
            this.logs = this.logs.slice(0, this.maxPersisted)
        }

        await this.persistLogs()
    }

    /**
     * Retrieves recent logs, optionally filtered by conversation
     */
    getLogs(conversationId?: string, limit: number = 50): ToolLogEntry[] {
        let result = this.logs
        if (conversationId) {
            result = result.filter(log => log.conversationId === conversationId)
        }
        return result.slice(0, limit)
    }

    /**
     * Clear all logs
     */
    async clearLogs(): Promise<void> {
        this.logs = []
        await this.persistLogs()
    }

    private sanitizeArgs(args: Record<string, any>): Record<string, any> {
        const sanitized = { ...args }

        // Truncate long strings (like file contents)
        for (const [key, value] of Object.entries(sanitized)) {
            if (typeof value === 'string' && value.length > 500) {
                sanitized[key] = `${value.substring(0, 500)}... [truncated ${value.length - 500} chars]`
            }
        }

        return sanitized
    }

    private async loadLogs(): Promise<void> {
        try {
            const data = await fs.readFile(this.logFilePath, 'utf-8')
            this.logs = JSON.parse(data)
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                console.error('Failed to load MCP tool logs:', error)
            }
            this.logs = []
        }
    }

    private async persistLogs(): Promise<void> {
        try {
            await fs.writeFile(
                this.logFilePath,
                JSON.stringify(this.logs, null, 2),
                'utf-8'
            )
        } catch (error) {
            console.error('Failed to persist MCP tool logs:', error)
        }
    }
}
