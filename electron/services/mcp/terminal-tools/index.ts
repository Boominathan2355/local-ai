import { ToolController } from '../tool-controller'
import { PathValidator } from '../path-validator'
import { runCommandTool } from './run-command.tool'

/**
 * Registers terminal tools with the ToolController.
 */
export function registerTerminalTools(
    controller: ToolController,
    pathValidator: PathValidator
) {
    return async function executeTerminalTool(toolName: string, args: Record<string, any>): Promise<any> {
        switch (toolName) {
            case 'run_command':
                return runCommandTool(args, pathValidator)
            default:
                throw new Error(`Terminal tool '${toolName}' implementation not found.`)
        }
    }
}
