import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

export async function listDirectoryTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<any> {
    const { path: dirPath, show_hidden = false } = args
    if (!dirPath) throw new Error("Missing required argument: 'path'")

    const validation = await pathValidator.validatePath(dirPath)
    if (!validation.allowed) {
        throw new Error(`Path validation failed: ${validation.reason}`)
    }

    const content = await fsService.listDirectory(validation.resolvedPath!)

    // 1000 items limit to prevent flooding the context window
    const MAX_ITEMS = 1000
    let files = content.files

    if (!show_hidden) {
        files = files.filter(f => !f.name.startsWith('.'))
    }

    const total = files.length
    if (total > MAX_ITEMS) {
        files = files.slice(0, MAX_ITEMS)
    }

    return {
        path: content.path,
        totalItems: total,
        showing: files.length,
        truncated: total > MAX_ITEMS,
        items: files
    }
}
