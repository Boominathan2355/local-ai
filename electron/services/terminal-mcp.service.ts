import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Service providing terminal tools for MCP.
 */
export class TerminalMcpService {
    /**
     * Executes a command in the terminal.
     */
    async executeCommand(command: string) {
        try {
            const { stdout, stderr } = await execAsync(command)
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
     * Returns tool definitions for this service.
     */
    getTools() {
        return [
            {
                name: 'execute_command',
                description: 'Execute a command in the local terminal and return the output.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'The shell command to execute.' }
                    },
                    required: ['command']
                }
            }
        ]
    }
}
