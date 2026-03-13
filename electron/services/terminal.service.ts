import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface CommandResult {
    stdout: string
    stderr: string
    exitCode: number
}

export class TerminalService {
    /**
     * Execute a shell command.
     */
    async runCommand(command: string, cwd?: string): Promise<CommandResult> {
        try {
            const { stdout, stderr } = await execAsync(command, { cwd })
            return {
                stdout,
                stderr,
                exitCode: 0
            }
        } catch (error: any) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                exitCode: error.code || 1
            }
        }
    }
}
