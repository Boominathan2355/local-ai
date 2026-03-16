import { FileSystemService } from '../../filesystem.service'
import { PathValidator } from '../path-validator'

export async function copyFileTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<string> {
    const { source, destination } = args
    if (!source) throw new Error("Missing required argument: 'source'")
    if (!destination) throw new Error("Missing required argument: 'destination'")

    const sourceValidation = await pathValidator.validatePath(source)
    if (!sourceValidation.allowed) {
        throw new Error(`Source path validation failed: ${sourceValidation.reason}`)
    }

    const destValidation = await pathValidator.validatePath(destination)
    if (!destValidation.allowed) {
        throw new Error(`Destination path validation failed: ${destValidation.reason}`)
    }

    await fsService.copyFile(sourceValidation.resolvedPath!, destValidation.resolvedPath!)

    return `Copied ${source} to ${destination}`
}
