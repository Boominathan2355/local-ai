import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'

const execAsync = promisify(exec)

export type SecurityTier = 'safe' | 'restricted' | 'dangerous'

export interface ToolDefinition {
    name: string
    description: string
    tier: SecurityTier
    inputSchema?: any
}

interface TerminalSession {
    id: string
    cwd: string
    activeProcesses: Map<string, ChildProcess>
    processOutputs: Map<string, string[]>
}

/**
 * Service providing terminal tools for MCP.
 */
export class TerminalMcpService {
    private sessions: Map<string, TerminalSession> = new Map()

    constructor() {
        // Create initial default terminal
        this.createTerminal('default')
    }

    private getSession(terminalId: string = 'default'): TerminalSession {
        const session = this.sessions.get(terminalId)
        if (!session) throw new Error(`Terminal session "${terminalId}" not found.`)
        return session
    }

    /**
     * Creates a new independent terminal session.
     */
    async createTerminal(terminalId?: string): Promise<string> {
        const id = terminalId || `term-${Date.now()}`
        if (this.sessions.has(id)) {
            if (terminalId) return `Terminal "${id}" already exists.`
            // If auto-generated, avoid collisions (highly unlikely)
            return this.createTerminal()
        }

        this.sessions.set(id, {
            id,
            cwd: process.cwd(),
            activeProcesses: new Map(),
            processOutputs: new Map()
        })
        return `Terminal session "${id}" created.`
    }

    /**
     * Lists all active terminal sessions.
     */
    async listTerminals() {
        return Array.from(this.sessions.keys()).map(id => ({
            id,
            cwd: this.sessions.get(id)?.cwd
        }))
    }

    /**
     * Closes a terminal session and kills its processes.
     */
    async closeTerminal(terminalId: string) {
        if (terminalId === 'default') throw new Error("Cannot close the default terminal.")
        const session = this.sessions.get(terminalId)
        if (session) {
            for (const processId of Array.from(session.activeProcesses.keys())) {
                await this.terminateProcess(processId, terminalId)
            }
            this.sessions.delete(terminalId)
            return `Terminal session "${terminalId}" closed.`
        }
        throw new Error(`Terminal session "${terminalId}" not found.`)
    }

    /**
     * Executes a command in the terminal within the current virtual CWD.
     */
    async executeCommand(command: string, terminalId?: string) {
        const session = this.getSession(terminalId)
        try {
            const { stdout, stderr } = await execAsync(command, { cwd: session.cwd })
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim()
            }
        } catch (error: any) {
            return {
                stdout: error.stdout?.trim() || '',
                stderr: error.stderr?.trim() || error.message
            }
        }
    }

    /**
     * Switches the virtual CWD.
     */
    async changeDirectory(newPath: string, terminalId?: string) {
        const session = this.getSession(terminalId)
        const targetPath = path.isAbsolute(newPath)
            ? newPath
            : path.resolve(session.cwd, newPath)

        session.cwd = targetPath
        return `[${session.id}] Changed directory to: ${session.cwd}`
    }

    /**
     * Returns the current virtual CWD.
     */
    async getCurrentWorkingDirectory(terminalId?: string) {
        return this.getSession(terminalId).cwd
    }

    /**
     * Returns terminal usage stats (simulated for simplicity).
     */
    async getTerminalUsageStats(terminalId?: string) {
        const session = this.getSession(terminalId)
        return {
            terminalId: session.id,
            platform: os.platform(),
            activeBackgroundProcesses: session.activeProcesses.size,
            uptime: Math.floor(process.uptime())
        }
    }

    /**
     * Starts a background process.
     */
    async startProcess(command: string, args: string[] = [], terminalId?: string) {
        const session = this.getSession(terminalId)
        const processId = `proc-${Date.now()}`
        const proc = spawn(command, args, {
            shell: true,
            cwd: session.cwd,
            env: { ...process.env }
        })

        session.activeProcesses.set(processId, proc)
        session.processOutputs.set(processId, [])

        proc.stdout?.on('data', (data) => {
            session.processOutputs.get(processId)?.push(data.toString())
        })

        proc.stderr?.on('data', (data) => {
            session.processOutputs.get(processId)?.push(`Error: ${data.toString()}`)
        })

        proc.on('close', (code) => {
            session.processOutputs.get(processId)?.push(`Process exited with code ${code}`)
            session.activeProcesses.delete(processId)
        })

        return { processId, status: 'spawned', terminalId: session.id, command: `${command} ${args.join(' ')}` }
    }

    /**
     * Reads process output.
     */
    async readProcessOutput(processId: string, terminalId?: string) {
        const session = this.getSession(terminalId)
        const output = session.processOutputs.get(processId) || []
        return output.join('\n')
    }

    /**
     * List active background processes.
     */
    async listActiveProcesses(terminalId?: string) {
        const session = this.getSession(terminalId)
        return Array.from(session.activeProcesses.keys()).map(id => ({
            id,
            pid: session.activeProcesses.get(id)?.pid
        }))
    }

    /**
     * Terminates a process.
     */
    async terminateProcess(processId: string, terminalId?: string) {
        const session = this.getSession(terminalId)
        const proc = session.activeProcesses.get(processId)
        if (proc) {
            if (os.platform() === 'win32') {
                proc.kill() // Standard kill on Windows
            } else {
                proc.kill('SIGTERM') // Clean termination on Unix
                setTimeout(() => { if (proc.killed === false) proc.kill('SIGKILL') }, 2000)
            }
            session.activeProcesses.delete(processId)
            return `Process ${processId} termination initiated in terminal ${session.id}.`
        }
        throw new Error(`Process ${processId} not found in terminal ${session.id}.`)
    }

    /**
     * Runs a script with platform-aware execution.
     */
    async runScript(scriptPath: string, terminalId?: string) {
        const ext = path.extname(scriptPath).toLowerCase()
        const isWin = os.platform() === 'win32'

        let cmd = ''
        if (ext === '.sh') {
            cmd = `sh "${scriptPath}"`
        } else if (ext === '.bat' || ext === '.cmd') {
            cmd = `cmd /c "${scriptPath}"`
        } else if (ext === '.ps1') {
            cmd = `powershell -File "${scriptPath}"`
        } else if (ext === '.js' || ext === '.ts') {
            cmd = `node "${scriptPath}"`
        } else {
            // General executable
            cmd = isWin ? `"${scriptPath}"` : `./"${scriptPath}"`
        }

        return this.executeCommand(cmd, terminalId)
    }

    /**
     * Sets an environment variable (simulated for the session).
     */
    async setEnvironmentVariable(key: string, value: string) {
        process.env[key] = value
        return `Environment variable ${key} set globally.`
    }

    /**
     * Returns tool definitions for this service with security tiers.
     */
    getTools(): ToolDefinition[] {
        return [
            // Management
            {
                name: 'create_terminal',
                description: 'Creates a new independent terminal session.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: { terminalId: { type: 'string', description: 'Optional unique name for the terminal.' } }
                }
            },
            {
                name: 'list_terminals',
                description: 'Lists all active terminal sessions.',
                tier: 'safe'
            },
            {
                name: 'close_terminal',
                description: 'Closes a terminal session and kills its processes.',
                tier: 'dangerous',
                inputSchema: {
                    type: 'object',
                    properties: { terminalId: { type: 'string' } },
                    required: ['terminalId']
                }
            },
            // Safe Tier
            {
                name: 'get_current_working_directory',
                description: 'Returns the current working directory of a terminal context.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: { terminalId: { type: 'string' } }
                }
            },
            {
                name: 'get_terminal_usage_stats',
                description: 'Returns basic statistics about a terminal session.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: { terminalId: { type: 'string' } }
                }
            },
            {
                name: 'list_active_processes',
                description: 'Lists all active background processes managed by a terminal session.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: { terminalId: { type: 'string' } }
                }
            },
            {
                name: 'read_process_output',
                description: 'Reads the captured output of a background process.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: {
                        processId: { type: 'string' },
                        terminalId: { type: 'string' }
                    },
                    required: ['processId']
                }
            },
            // Restricted Tier
            {
                name: 'run_command',
                description: 'Execute a command in a terminal and return the output.',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'The shell command to execute.' },
                        terminalId: { type: 'string' }
                    },
                    required: ['command']
                }
            },
            {
                name: 'start_process',
                description: 'Starts a background process in a terminal.',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string' },
                        args: { type: 'array', items: { type: 'string' } },
                        terminalId: { type: 'string' }
                    },
                    required: ['command']
                }
            },
            {
                name: 'change_directory',
                description: 'Changes the working directory of a terminal session.',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        terminalId: { type: 'string' }
                    },
                    required: ['path']
                }
            },
            // Dangerous Tier
            {
                name: 'run_script',
                description: 'Executes a script file in a terminal.',
                tier: 'dangerous',
                inputSchema: {
                    type: 'object',
                    properties: {
                        scriptPath: { type: 'string' },
                        terminalId: { type: 'string' }
                    },
                    required: ['scriptPath']
                }
            },
            {
                name: 'set_environment_variable',
                description: 'Sets an environment variable for the application session.',
                tier: 'dangerous',
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: { type: 'string' },
                        value: { type: 'string' }
                    },
                    required: ['key', 'value']
                }
            },
            {
                name: 'terminate_process',
                description: 'Forcefully terminates a background process in a terminal.',
                tier: 'dangerous',
                inputSchema: {
                    type: 'object',
                    properties: {
                        processId: { type: 'string' },
                        terminalId: { type: 'string' }
                    },
                    required: ['processId']
                }
            }
        ]
    }
}
