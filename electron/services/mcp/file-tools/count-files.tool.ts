import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

export async function countFilesTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<any> {
    const { path: dirPath, recursive = false } = args
    if (!dirPath) throw new Error("Missing required argument: 'path'")

    const validation = await pathValidator.validatePath(dirPath)
    if (!validation.allowed) {
        throw new Error(`Path validation failed: ${validation.reason}`)
    }

    const counts = await fsService.countFiles(validation.resolvedPath!, recursive)

    return {
        path: validation.resolvedPath!,
        recursive,
        counts
    }
}
