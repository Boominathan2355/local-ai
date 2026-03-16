import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

export async function renameFileTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<string> {
    const { old_path, new_path } = args
    if (!old_path) throw new Error("Missing required argument: 'old_path'")
    if (!new_path) throw new Error("Missing required argument: 'new_path'")

    const oldValidation = await pathValidator.validatePath(old_path)
    if (!oldValidation.allowed) {
        throw new Error(`Source path validation failed: ${oldValidation.reason}`)
    }

    const newValidation = await pathValidator.validatePath(new_path)
    if (!newValidation.allowed) {
        throw new Error(`Destination path validation failed: ${newValidation.reason}`)
    }

    await fsService.renameFile(oldValidation.resolvedPath!, newValidation.resolvedPath!)

    return `Successfully renamed/moved ${old_path} to ${new_path}`
}
