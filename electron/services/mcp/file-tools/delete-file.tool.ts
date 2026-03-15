import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

export async function deleteFileTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<string> {
    const { path: filePath } = args
    if (!filePath) throw new Error("Missing required argument: 'path'")

    const validation = await pathValidator.validatePath(filePath)
    if (!validation.allowed) {
        throw new Error(`Path validation failed: ${validation.reason}`)
    }

    await fsService.deleteFile(validation.resolvedPath!)
    return `Successfully deleted ${filePath}`
}
