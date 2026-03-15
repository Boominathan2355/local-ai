import { exec } from 'child_process'
import { promisify } from 'util'
import { PathValidator } from '../path-validator'
import path from 'path'

const execAsync = promisify(exec)

// Commands that are intrinsically dangerous and should be blocked completely
// at the executor level, regardless of user approval.
const BLOCKED_COMMANDS = [
    'rm -rf /',
    'mkfs',
    'dd if=',
    'chmod -R 777 /',
    '> /dev/sda'
]

export async function runCommandTool(
    args: Record<string, any>,
    pathValidator: PathValidator
): Promise<string> {
    const { command, cwd } = args
    if (!command) throw new Error("Missing required argument: 'command'")

    // Additional hardcoded security checks
    for (const blocked of BLOCKED_COMMANDS) {
        if (command.includes(blocked)) {
            throw new Error(`Command blocked for safety: Contains forbidden pattern '${blocked}'`)
        }
    }

    // Determine the working directory
    let workingDirectory: string | undefined
    if (cwd) {
        const validation = await pathValidator.validatePath(cwd)
        if (!validation.allowed) {
            throw new Error(`Invalid working directory: ${validation.reason}`)
        }
        workingDirectory = validation.resolvedPath!
    }

    try {
        // Run with a generous 2 minute timeout and 1MB buffer limit
        const { stdout, stderr } = await execAsync(command, {
            cwd: workingDirectory,
            timeout: 120 * 1000,
            maxBuffer: 1024 * 1024 // 1MB 
        })

        let output = ''
        if (stdout) output += `STDOUT:\n${stdout}\n`
        if (stderr) output += `STDERR:\n${stderr}`

        if (!output) {
            output = 'Command executed successfully with no output.'
        }

        return output.trim()
    } catch (error: any) {
        // If it timed out or hit buffer limits
        let errorMessage = `Command failed: ${error.message}`
        if (error.stdout) errorMessage += `\nSTDOUT before failure:\n${error.stdout}`
        if (error.stderr) errorMessage += `\nSTDERR before failure:\n${error.stderr}`

        throw new Error(errorMessage)
    }
}
