import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { EventEmitter } from 'events'
import { McpServer } from '../../src/types/settings.types'
import { FilesystemMcpService } from './filesystem-mcp.service'
import { TerminalMcpService } from './terminal-mcp.service'

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

    private readonly BUILTIN_SERVERS = {
        filesystem: { id: 'builtin-filesystem', name: 'Filesystem (Built-in)', enabled: true },
        terminal: { id: 'builtin-terminal', name: 'Terminal (Built-in)', enabled: true }
    }

    constructor() {
        super()
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
    async listTools(serverId: string) {
        if (serverId === this.BUILTIN_SERVERS.filesystem.id) {
            return this.filesystemMcp.getTools()
        }
        if (serverId === this.BUILTIN_SERVERS.terminal.id) {
            return this.terminalMcp.getTools()
        }

        const connected = this.connectedServers.get(serverId)
        if (!connected) return []

        try {
            const response = await connected.client.listTools()
            return response.tools || []
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
            switch (toolName) {
                case 'read_file': return this.filesystemMcp.readFile(args.path)
                case 'write_file': return this.filesystemMcp.writeFile(args.path, args.content)
                case 'list_directory': return this.filesystemMcp.listDirectory(args.path)
                case 'create_directory': return this.filesystemMcp.createDirectory(args.path)
                case 'delete_file': return this.filesystemMcp.deleteFile(args.path)
                default: throw new Error(`Unknown filesystem tool: ${toolName}`)
            }
        }

        // Handle built-in terminal tools
        if (serverId === this.BUILTIN_SERVERS.terminal.id) {
            switch (toolName) {
                case 'execute_command': return this.terminalMcp.executeCommand(args.command)
                default: throw new Error(`Unknown terminal tool: ${toolName}`)
            }
        }

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
