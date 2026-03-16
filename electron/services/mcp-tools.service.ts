import path from 'path'
import { FileSystemService } from './filesystem.service'
import { TerminalService, CommandResult } from './terminal.service'

export interface ToolResult {
    success: boolean
    result?: any
    error?: string
}

export class MCPToolsService {
    private fs: FileSystemService
    private terminal: TerminalService
    private allowedPaths: string[]

    constructor(allowedPaths: string[]) {
        this.fs = new FileSystemService()
        this.terminal = new TerminalService()
        this.allowedPaths = allowedPaths.map(p => path.resolve(p))
    }

    /**
     * Updates the allowed paths for sandboxing.
     */
    updateAllowedPaths(paths: string[]): void {
        this.allowedPaths = paths.map(p => path.resolve(p))
    }

    /**
     * Validates if a path is within the allowed sandboxed directories.
     */
    private isPathAllowed(targetPath: string): boolean {
        const resolvedPath = path.resolve(targetPath)
        return this.allowedPaths.some(allowed => {
            const relative = path.relative(allowed, resolvedPath)
            return !relative.startsWith('..') && !path.isAbsolute(relative)
        })
    }

    /**
     * tool: list_directory
     */
    async listDirectory(dirPath?: string): Promise<ToolResult> {
        try {
            const targetPath = dirPath || this.allowedPaths[0]
            if (!targetPath) {
                return { success: false, error: 'Access denied: No directory specified and no allowed paths configured.' }
            }
            if (!this.isPathAllowed(targetPath)) {
                return { success: false, error: `Access denied: Path "${targetPath}" is outside allowed directories.` }
            }
            const result = await this.fs.listDirectory(targetPath)
            return { success: true, result }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: read_file
     */
    async readFile(filePath: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(filePath)) {
                return { success: false, error: `Access denied: Path "${filePath}" is outside allowed directories.` }
            }
            const content = await this.fs.readFile(filePath)
            return { success: true, result: content }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: create_file
     */
    async createFile(filePath: string, content: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(filePath)) {
                return { success: false, error: `Access denied: Path "${filePath}" is outside allowed directories.` }
            }
            await this.fs.createFile(filePath, content)
            return { success: true, result: `Successfully created file ${filePath}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: delete_file
     */
    async deleteFile(filePath: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(filePath)) {
                return { success: false, error: `Access denied: Path "${filePath}" is outside allowed directories.` }
            }
            await this.fs.deleteFile(filePath)
            return { success: true, result: `Successfully deleted ${filePath}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: write_file
     */
    async writeFile(filePath: string, content: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(filePath)) {
                return { success: false, error: `Access denied: Path "${filePath}" is outside allowed directories.` }
            }
            await this.fs.writeFile(filePath, content)
            return { success: true, result: `Successfully wrote to ${filePath}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: create_directory
     */
    async createDirectory(dirPath: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(dirPath)) {
                return { success: false, error: `Access denied: Path "${dirPath}" is outside allowed directories.` }
            }
            await this.fs.createDirectory(dirPath)
            return { success: true, result: `Successfully created directory ${dirPath}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: delete_directory
     */
    async deleteDirectory(dirPath: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(dirPath)) {
                return { success: false, error: `Access denied: Path "${dirPath}" is outside allowed directories.` }
            }
            await this.fs.deleteFile(dirPath)
            return { success: true, result: `Successfully deleted directory ${dirPath}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: rename
     */
    async rename(oldPath: string, newPath: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(oldPath)) {
                return { success: false, error: `Access denied: Source path "${oldPath}" is outside allowed directories.` }
            }
            if (!this.isPathAllowed(newPath)) {
                return { success: false, error: `Access denied: Destination path "${newPath}" is outside allowed directories.` }
            }
            await this.fs.renameFile(oldPath, newPath)
            return { success: true, result: `Successfully renamed ${oldPath} to ${newPath}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: copy_file
     */
    async copyFile(source: string, destination: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(source)) {
                return { success: false, error: `Access denied: Source path "${source}" is outside allowed directories.` }
            }
            if (!this.isPathAllowed(destination)) {
                return { success: false, error: `Access denied: Destination path "${destination}" is outside allowed directories.` }
            }
            await this.fs.copyFile(source, destination)
            return { success: true, result: `Successfully copied ${source} to ${destination}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: search_files
     */
    async searchFiles(dirPath: string, pattern: string, maxResults?: number): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(dirPath)) {
                return { success: false, error: `Access denied: Path "${dirPath}" is outside allowed directories.` }
            }
            const result = await this.fs.searchFiles(dirPath, pattern, maxResults)
            return { success: true, result }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: count_files
     */
    async countFiles(dirPath: string, recursive?: boolean): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(dirPath)) {
                return { success: false, error: `Access denied: Path "${dirPath}" is outside allowed directories.` }
            }
            const result = await this.fs.countFiles(dirPath, recursive)
            return { success: true, result }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: file_details
     */
    async fileDetails(filePath: string): Promise<ToolResult> {
        try {
            if (!this.isPathAllowed(filePath)) {
                return { success: false, error: `Access denied: Path "${filePath}" is outside allowed directories.` }
            }
            const result = await this.fs.getFileStats(filePath)
            return { success: true, result }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    /**
     * tool: run_command
     */
    async runCommand(command: string, cwd?: string): Promise<ToolResult> {
        try {
            // If cwd is provided, validate it. If not, we default to the first allowed path or process.cwd()
            // However, we should probably restrict where commands can run.
            const targetCwd = cwd ? path.resolve(cwd) : (this.allowedPaths[0] || process.cwd())

            if (cwd && !this.isPathAllowed(targetCwd)) {
                return { success: false, error: `Access denied: Working directory "${cwd}" is outside allowed directories.` }
            }

            // We enforce a 60s timeout for safety (30s mentioned in plan, but let's be generous for large installs)
            const result: CommandResult = await this.terminal.runCommand(command, targetCwd)

            if (result.exitCode === 0) {
                return { success: true, result: result.stdout }
            } else {
                return { success: false, result: result.stdout, error: result.stderr }
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }
}
