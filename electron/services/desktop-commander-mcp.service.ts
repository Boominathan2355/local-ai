import { spawn, ChildProcess } from 'child_process'
import * as os from 'os'
import * as fs from 'fs/promises'
import * as path from 'path'
import { StorageService } from './storage.service'

/**
 * Service providing a comprehensive suite of desktop automation tools (Desktop Commander).
 */
export class DesktopCommanderMcpService {
    private activeProcesses: Map<string, ChildProcess> = new Map()
    private processOutputs: Map<string, string[]> = new Map()
    private activeSearches: Map<string, { abortController: AbortController; results: string[] }> = new Map()
    private recentToolCalls: any[] = []

    constructor(private storage: StorageService) { }

    // --- Configuration ---
    async getConfig() {
        return this.storage.getSettings()
    }

    async setConfigValue(key: string, value: any) {
        const settings = this.storage.getSettings()
        const updated = { ...settings, [key]: value }
        await this.storage.setSettings(updated)
        return `Successfully set ${key} to ${JSON.stringify(value)}`
    }

    // --- Search System ---
    async startSearch(query: string, rootDir: string = process.cwd()) {
        const searchId = `search-${Date.now()}`
        const abortController = new AbortController()
        const results: string[] = []

        this.activeSearches.set(searchId, { abortController, results })

        // Kick off search in background
        this.runSearch(searchId, query, rootDir, abortController.signal)

        return { searchId, message: `Search started for "${query}" in ${rootDir}` }
    }

    private async runSearch(searchId: string, query: string, rootDir: string, signal: AbortSignal) {
        const search = this.activeSearches.get(searchId)
        if (!search) return

        try {
            const traverse = async (dir: string) => {
                if (signal.aborted) return

                const entries = await fs.readdir(dir, { withFileTypes: true })
                for (const entry of entries) {
                    if (signal.aborted) return
                    const fullPath = path.join(dir, entry.name)
                    if (entry.name.toLowerCase().includes(query.toLowerCase())) {
                        search.results.push(fullPath)
                    }
                    if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.includes('node_modules')) {
                        await traverse(fullPath)
                    }
                }
            }
            await traverse(rootDir)
        } catch (err) {
            console.error(`Search ${searchId} error:`, err)
        }
    }

    async getMoreSearchResults(searchId: string) {
        const search = this.activeSearches.get(searchId)
        if (!search) throw new Error(`Search ${searchId} not found`)
        return { results: search.results, complete: search.abortController.signal.aborted }
    }

    async stopSearch(searchId: string) {
        const search = this.activeSearches.get(searchId)
        if (search) {
            search.abortController.abort()
            return `Search ${searchId} stopped`
        }
        return `Search ${searchId} not found`
    }

    async listSearches() {
        return Array.from(this.activeSearches.keys())
    }

    // --- Process Control ---
    async startProcess(command: string, args: string[] = []) {
        const processId = `proc-${Date.now()}`
        const proc = spawn(command, args, { shell: true })

        this.activeProcesses.set(processId, proc)
        this.processOutputs.set(processId, [])

        proc.stdout?.on('data', (data) => {
            this.processOutputs.get(processId)?.push(data.toString())
        })

        proc.stderr?.on('data', (data) => {
            this.processOutputs.get(processId)?.push(`Error: ${data.toString()}`)
        })

        proc.on('close', (code) => {
            this.processOutputs.get(processId)?.push(`Process exited with code ${code}`)
            this.activeProcesses.delete(processId)
        })

        return { processId, status: 'spawned', command: `${command} ${args.join(' ')}` }
    }

    async readProcessOutput(processId: string) {
        const output = this.processOutputs.get(processId) || []
        return output.join('\n')
    }

    async interactWithProcess(processId: string, input: string) {
        const proc = this.activeProcesses.get(processId)
        if (!proc || !proc.stdin) throw new Error(`Process ${processId} not active or busy`)
        proc.stdin.write(input + '\n')
        return `Sent input to ${processId}`
    }

    async killProcess(processId: string) {
        const proc = this.activeProcesses.get(processId)
        if (proc) {
            proc.kill('SIGKILL')
            this.activeProcesses.delete(processId)
            return `Process ${processId} killed`
        }
        return `Process ${processId} not found`
    }

    async listProcesses() {
        return Array.from(this.activeProcesses.keys()).map(id => ({
            id,
            pid: this.activeProcesses.get(id)?.pid
        }))
    }

    // --- System / Monitoring ---
    async getUsageStats() {
        return {
            platform: os.platform(),
            release: os.release(),
            uptime: os.uptime(),
            loadavg: os.loadavg(),
            totalMemoryGB: os.totalmem() / (1024 ** 3),
            freeMemoryGB: os.freemem() / (1024 ** 3),
            cpus: os.cpus().length
        }
    }

    async listSessions() {
        // In this local app, sessions are just conversations.
        return this.storage.getConversations().map(c => ({ id: c.id, title: c.title }))
    }

    // --- Agent / Internal ---
    recordToolCall(call: any) {
        this.recentToolCalls.unshift({ ...call, timestamp: Date.now() })
        if (this.recentToolCalls.length > 50) this.recentToolCalls.pop()
    }

    async getRecentToolCalls() {
        return this.recentToolCalls
    }

    async giveFeedbackToDesktopCommander(feedback: string) {
        console.log(`[Agent Feedback]: ${feedback}`)
        return "Feedback received. Thank you!"
    }

    async getPrompts() {
        const settings = this.storage.getSettings()
        return {
            systemPrompt: settings.systemPrompt,
            agentModePrompt: "You are currently in AGENT MODE with enhanced Desktop Commander tools."
        }
    }

    /**
     * Returns tool definitions for this service.
     */
    getTools() {
        return [
            // Configuration
            { name: 'get_config', description: 'Get all application settings and configuration.', tier: 'safe' },
            {
                name: 'set_config_value',
                description: 'Set a specific configuration value.',
                tier: 'dangerous',
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'The settings key (e.g. userName, temperature).' },
                        value: { type: 'any', description: 'The value to set.' }
                    },
                    required: ['key', 'value']
                }
            },
            // Search
            {
                name: 'start_search',
                description: 'Start a recursive filename search on the system.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The filename substring to search for.' },
                        rootDir: { type: 'string', description: 'The root directory to start searching from.' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'get_more_search_results',
                description: 'Get accumulated results for an active search.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: { searchId: { type: 'string' } },
                    required: ['searchId']
                }
            },
            {
                name: 'stop_search',
                description: 'Abort an active search operation.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: { searchId: { type: 'string' } },
                    required: ['searchId']
                }
            },
            { name: 'list_searches', description: 'List IDs of all currently running search tasks.', tier: 'safe' },
            // Process Control
            {
                name: 'start_process',
                description: 'Launch a background process / command.',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'The command to run.' },
                        args: { type: 'array', items: { type: 'string' }, description: 'Arguments for the command.' }
                    },
                    required: ['command']
                }
            },
            {
                name: 'read_process_output',
                description: 'Read the captured stdout/stderr of a running process.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: { processId: { type: 'string' } },
                    required: ['processId']
                }
            },
            {
                name: 'interact_with_process',
                description: 'Send text input (stdin) to a running process.',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        processId: { type: 'string' },
                        input: { type: 'string' }
                    },
                    required: ['processId', 'input']
                }
            },
            {
                name: 'kill_process',
                description: 'Forcefully terminate a running process.',
                tier: 'dangerous',
                inputSchema: {
                    type: 'object',
                    properties: { processId: { type: 'string' } },
                    required: ['processId']
                }
            },
            { name: 'list_processes', description: 'List all active background processes managed by Desktop Commander.', tier: 'safe' },
            // System / Monitoring
            { name: 'get_usage_stats', description: 'Get basic system usage and host information.', tier: 'safe' },
            { name: 'list_sessions', description: 'List all stored chat sessions (conversations).', tier: 'safe' },
            // Agent / Internal
            { name: 'get_recent_tool_calls', description: 'Retrieve a history of recent tool calls recorded by the agent.', tier: 'safe' },
            {
                name: 'give_feedback_to_desktop_commander',
                description: 'Send internal performance or error feedback to the Desktop Commander service.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: { feedback: { type: 'string' } },
                    required: ['feedback']
                }
            },
            { name: 'get_prompts', description: 'Retrieve current system and agent prompts.', tier: 'safe' }
        ]
    }
}
