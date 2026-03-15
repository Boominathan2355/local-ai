import { ToolController } from '../tool-controller'
import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

import { readFileTool } from './read-file.tool'
import { writeFileTool } from './write-file.tool'
import { createFileTool } from './create-file.tool'
import { deleteFileTool } from './delete-file.tool'
import { listDirectoryTool } from './list-directory.tool'
import { countFilesTool } from './count-files.tool'
import { fileDetailsTool } from './file-details.tool'
import { renameFileTool } from './rename-file.tool'
import { copyFileTool } from './copy-file.tool'
import { searchFilesTool } from './search-files.tool'

/**
 * Registers all file tools with the ToolController and maps them to their implementations.
 */
export function registerFileTools(
    controller: ToolController,
    fsService: FileSystemService,
    pathValidator: PathValidator
) {
    // Note: The schemas and basic definitions are already in tool-registry.ts
    // This file acts as the router to the actual execution logic when `controller.execute` happens.

    return async function executeFileTool(toolName: string, args: Record<string, any>): Promise<any> {
        switch (toolName) {
            case 'read_file':
                return readFileTool(args, fsService, pathValidator)
            case 'write_file':
                return writeFileTool(args, fsService, pathValidator)
            case 'create_file':
                return createFileTool(args, fsService, pathValidator)
            case 'delete_file':
                return deleteFileTool(args, fsService, pathValidator)
            case 'list_directory':
                return listDirectoryTool(args, fsService, pathValidator)
            case 'create_directory': {
                const dirPath = args.path
                if (!dirPath) throw new Error("Missing required argument: 'path'")
                const validation = await pathValidator.validatePath(dirPath)
                if (!validation.allowed) throw new Error(`Path validation failed: ${validation.reason}`)
                await fsService.createDirectory(validation.resolvedPath!)
                return `Directory created: ${dirPath}`
            }
            case 'delete_directory': {
                const dirPath = args.path
                if (!dirPath) throw new Error("Missing required argument: 'path'")
                const validation = await pathValidator.validatePath(dirPath)
                if (!validation.allowed) throw new Error(`Path validation failed: ${validation.reason}`)
                // deleteFile handles both files and directories (rmdir for dirs)
                await fsService.deleteFile(validation.resolvedPath!)
                return `Directory deleted: ${dirPath}`
            }
            case 'count_files':
                return countFilesTool(args, fsService, pathValidator)
            case 'file_details':
                return fileDetailsTool(args, fsService, pathValidator)
            case 'rename':
                return renameFileTool(args, fsService, pathValidator)
            case 'copy_file':
                return copyFileTool(args, fsService, pathValidator)
            case 'search_files':
                return searchFilesTool(args, fsService, pathValidator)
            default:
                throw new Error(`File tool '${toolName}' implementation not found.`)
        }
    }
}
