import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

export async function searchFilesTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<any> {
    const { path: dirPath, pattern, max_results = 100 } = args
    if (!dirPath) throw new Error("Missing required argument: 'path'")
    if (!pattern) throw new Error("Missing required argument: 'pattern'")

    const validation = await pathValidator.validatePath(dirPath)
    if (!validation.allowed) {
        throw new Error(`Path validation failed: ${validation.reason}`)
    }

    // Hard cap at 500 max results to prevent token flooding
    const safeMax = Math.min(max_results, 500)

    const matches = await fsService.searchFiles(validation.resolvedPath!, pattern, safeMax)

    return {
        path: validation.resolvedPath!,
        pattern,
        matchesFound: matches.length,
        truncated: matches.length >= safeMax,
        matches
    }
}
