import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export async function fileDetailsTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<any> {
    const { path: filePath } = args
    if (!filePath) throw new Error("Missing required argument: 'path'")

    const validation = await pathValidator.validatePath(filePath)
    if (!validation.allowed) {
        throw new Error(`Path validation failed: ${validation.reason}`)
    }

    const stats = await fsService.getFileStats(validation.resolvedPath!)

    return {
        path: validation.resolvedPath!,
        size: stats.size,
        sizeHuman: formatBytes(stats.size),
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        isSymbolicLink: stats.isSymbolicLink(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
    }
}
