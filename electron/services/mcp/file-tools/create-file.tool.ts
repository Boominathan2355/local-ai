import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

export async function createFileTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<string> {
    const { path: filePath, content } = args
    if (!filePath) throw new Error("Missing required argument: 'path'")
    if (content === undefined) throw new Error("Missing required argument: 'content'")

    const validation = await pathValidator.validatePath(filePath)
    if (!validation.allowed) {
        throw new Error(`Path validation failed: ${validation.reason}`)
    }

    // 50MB limit for writing
    const MAX_SIZE = 50 * 1024 * 1024
    if (Buffer.byteLength(content, 'utf8') > MAX_SIZE) {
        throw new Error(`Content is too large to write (Max: 50MB)`)
    }

    await fsService.createFile(validation.resolvedPath!, content)
    return `Successfully created ${filePath}`
}
