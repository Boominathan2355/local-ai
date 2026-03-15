import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

export async function readFileTool(
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

    const stats = await fsService.getFileStats(validation.resolvedPath!)

    // 10MB limit for reading into memory
    const MAX_SIZE = 10 * 1024 * 1024
    if (stats.size > MAX_SIZE) {
        throw new Error(`File is too large to read (Size: ${Math.round(stats.size / 1024 / 1024)}MB, Max: 10MB)`)
    }

    return fsService.readFile(validation.resolvedPath!)
}
