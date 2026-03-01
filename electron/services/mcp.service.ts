import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { EventEmitter } from 'events'
import { McpServer } from '../../src/types/settings.types'
import { FilesystemMcpService } from './filesystem-mcp.service'
import { TerminalMcpService } from './terminal-mcp.service'
import { DesktopCommanderMcpService } from './desktop-commander-mcp.service'
import { StorageService } from './storage.service'

interface ConnectedServer {
    config: McpServer
    client: Client
    transport: StdioClientTransport | SSEClientTransport
}

/**
 * Manages Model Context Protocol (MCP) server connections.
 */
export class McpService extends EventEmitter {
    private connectedServers: Map<string, ConnectedServer> = new Map()
    private filesystemMcp = new FilesystemMcpService()
    private terminalMcp = new TerminalMcpService()
    private desktopCommanderMcp: DesktopCommanderMcpService

    private readonly BUILTIN_SERVERS = {
        filesystem: { id: 'builtin-filesystem', name: 'Filesystem (Built-in)', enabled: true },
        terminal: { id: 'builtin-terminal', name: 'Terminal (Built-in)', enabled: true },
        desktopCommander: { id: 'builtin-commander', name: 'Desktop Commander (Built-in)', enabled: true }
    }

    constructor(storage: StorageService) {
        super()
        this.desktopCommanderMcp = new DesktopCommanderMcpService(storage)
    }

    /**
     * Connects to an MCP server based on the configuration.
     */
    async connect(serverConfig: McpServer): Promise<void> {
        if (!serverConfig.enabled) return
        if (serverConfig.id.startsWith('builtin-')) return

        try {
            this.emit('statusChanged', serverConfig.id, 'connecting')
            let transport: StdioClientTransport | SSEClientTransport

            if (serverConfig.type === 'stdio') {
                transport = new StdioClientTransport({
                    command: serverConfig.urlOrPath,
                    args: []
                })
            } else {
                transport = new SSEClientTransport(new URL(serverConfig.urlOrPath))
            }

            const client = new Client(
                { name: 'local-ai-assistant', version: '1.0.0' },
                { capabilities: {} }
            )

            await client.connect(transport)

            this.connectedServers.set(serverConfig.id, {
                config: serverConfig,
                client,
                transport
            })

            console.log(`MCP server connected: ${serverConfig.name}`)
            this.emit('statusChanged', serverConfig.id, 'connected')
        } catch (error) {
            console.error(`Failed to connect to MCP server ${serverConfig.name}:`, error)
            this.emit('statusChanged', serverConfig.id, 'error')
            throw error
        }
    }

    /**
     * Disconnects from an MCP server.
     */
    async disconnect(serverId: string): Promise<void> {
        if (serverId.startsWith('builtin-')) return

        const connected = this.connectedServers.get(serverId)
        if (connected) {
            await connected.transport.close()
            this.connectedServers.delete(serverId)
            console.log(`MCP server disconnected: ${connected.config.name}`)
        }
        this.emit('statusChanged', serverId, 'disconnected')
    }

    /**
     * Gets the connection status of a server.
     */
    getServerStatus(serverId: string): 'connected' | 'error' | 'disconnected' | 'connecting' {
        if (serverId === this.BUILTIN_SERVERS.filesystem.id || serverId === this.BUILTIN_SERVERS.terminal.id) {
            return 'connected'
        }
        const connected = this.connectedServers.get(serverId)
        if (connected) return 'connected'
        return 'disconnected'
    }

    /**
     * Lists tools for a connected server.
     */
    async listTools(serverId: string): Promise<any[]> {
        // Built-in servers
        if (serverId === this.BUILTIN_SERVERS.terminal.id) return this.terminalMcp.getTools()
        if (serverId === this.BUILTIN_SERVERS.filesystem.id) return this.filesystemMcp.getTools()
        if (serverId === this.BUILTIN_SERVERS.desktopCommander.id) return this.desktopCommanderMcp.getTools()

        // External servers
        const connected = this.connectedServers.get(serverId)
        if (!connected) throw new Error(`MCP Client not found for server: ${serverId}`)

        try {
            const response = await connected.client.listTools()
            // Ensure every tool has a tier, defaulting to 'restricted' for unknown external tools
            return (response.tools || []).map((tool: any) => ({
                ...tool,
                tier: tool.tier || 'restricted'
            }))
        } catch (error) {
            console.error(`Error listing tools for MCP server ${serverId}:`, error)
            return []
        }
    }

    /**
     * Calls a tool on a specific server.
     */
    async callTool(serverId: string, toolName: string, args: any): Promise<any> {
        // Handle built-in filesystem tools
        if (serverId === this.BUILTIN_SERVERS.filesystem.id) {
            this.desktopCommanderMcp.recordToolCall({ serverId, toolName, args })
            switch (toolName) {
                case 'read_file': return this.filesystemMcp.readFile(args.path)
                case 'write_file': return this.filesystemMcp.writeFile(args.path, args.content)
                case 'list_directory': return this.filesystemMcp.listDirectory(args.path)
                case 'create_directory': return this.filesystemMcp.createDirectory(args.path)
                case 'delete_file': return this.filesystemMcp.deleteFile(args.path)
                case 'read_multiple_files': return this.filesystemMcp.readMultipleFiles(args.paths)
                case 'move_file': return this.filesystemMcp.moveFile(args.source, args.destination)
                case 'edit_block': return this.filesystemMcp.editBlock(args.path, args.find, args.replace)
                case 'get_file_info': return this.filesystemMcp.getFileInfo(args.path)
                case 'write_pdf': return this.filesystemMcp.writePdf(args.path, args.content)
                default: throw new Error(`Unknown filesystem tool: ${toolName}`)
            }
        }

        // Handle built-in terminal tools
        if (serverId === this.BUILTIN_SERVERS.terminal.id) {
            this.desktopCommanderMcp.recordToolCall({ serverId, toolName, args })
            const tid = args.terminalId // Can be undefined, service defaults to 'default'
            switch (toolName) {
                case 'create_terminal':
                    return this.terminalMcp.createTerminal(args.terminalId)
                case 'list_terminals':
                    return this.terminalMcp.listTerminals()
                case 'close_terminal':
                    return this.terminalMcp.closeTerminal(args.terminalId)
                case 'execute_command':
                case 'run_command':
                    return this.terminalMcp.executeCommand(args.command, tid)
                case 'change_directory':
                    return this.terminalMcp.changeDirectory(args.path, tid)
                case 'get_current_working_directory':
                    return this.terminalMcp.getCurrentWorkingDirectory(tid)
                case 'get_terminal_usage_stats':
                    return this.terminalMcp.getTerminalUsageStats(tid)
                case 'list_active_processes':
                    return this.terminalMcp.listActiveProcesses(tid)
                case 'read_process_output':
                    return this.terminalMcp.readProcessOutput(args.processId, tid)
                case 'start_process':
                    return this.terminalMcp.startProcess(args.command, args.args, tid)
                case 'terminate_process':
                    return this.terminalMcp.terminateProcess(args.processId, tid)
                case 'run_script':
                    return this.terminalMcp.runScript(args.scriptPath, tid)
                case 'set_environment_variable':
                    return this.terminalMcp.setEnvironmentVariable(args.key, args.value)
                default: throw new Error(`Unknown terminal tool: ${toolName}`)
            }
        }

        // Handle Desktop Commander tools
        if (serverId === this.BUILTIN_SERVERS.desktopCommander.id) {
            this.desktopCommanderMcp.recordToolCall({ serverId, toolName, args })
            switch (toolName) {
                case 'get_config': return this.desktopCommanderMcp.getConfig()
                case 'set_config_value': return this.desktopCommanderMcp.setConfigValue(args.key, args.value)
                case 'start_search': return this.desktopCommanderMcp.startSearch(args.query, args.rootDir)
                case 'get_more_search_results': return this.desktopCommanderMcp.getMoreSearchResults(args.searchId)
                case 'stop_search': return this.desktopCommanderMcp.stopSearch(args.searchId)
                case 'list_searches': return this.desktopCommanderMcp.listSearches()
                case 'start_process': return this.desktopCommanderMcp.startProcess(args.command, args.args)
                case 'read_process_output': return this.desktopCommanderMcp.readProcessOutput(args.processId)
                case 'interact_with_process': return this.desktopCommanderMcp.interactWithProcess(args.processId, args.input)
                case 'kill_process': return this.desktopCommanderMcp.killProcess(args.processId)
                case 'force_terminate': return this.desktopCommanderMcp.killProcess(args.processId)
                case 'list_processes': return this.desktopCommanderMcp.listProcesses()
                case 'get_usage_stats': return this.desktopCommanderMcp.getUsageStats()
                case 'list_sessions': return this.desktopCommanderMcp.listSessions()
                case 'get_recent_tool_calls': return this.desktopCommanderMcp.getRecentToolCalls()
                case 'give_feedback_to_desktop_commander': return this.desktopCommanderMcp.giveFeedbackToDesktopCommander(args.feedback)
                case 'get_prompts': return this.desktopCommanderMcp.getPrompts()
                default: throw new Error(`Unknown commander tool: ${toolName}`)
            }
        }

        this.desktopCommanderMcp.recordToolCall({ serverId, toolName, args })

        const connected = this.connectedServers.get(serverId)
        if (!connected) throw new Error(`Server ${serverId} not connected`)

        try {
            const response = await connected.client.callTool({
                name: toolName,
                arguments: args
            })
            return response.content
        } catch (error) {
            console.error(`Error calling tool ${toolName} on server ${serverId}:`, error)
            throw error
        }
    }

    /**
     * Returns the built-in servers.
     */
    getBuiltinServers(): McpServer[] {
        return Object.values(this.BUILTIN_SERVERS).map(s => ({
            ...s,
            type: 'stdio',
            urlOrPath: '',
            status: 'connected'
        })) as McpServer[]
    }

    /**
     * Shuts down all MCP connections.
     */
    async shutdown(): Promise<void> {
        const serverIds = Array.from(this.connectedServers.keys())
        for (const serverId of serverIds) {
            await this.disconnect(serverId)
        }
    }
}
