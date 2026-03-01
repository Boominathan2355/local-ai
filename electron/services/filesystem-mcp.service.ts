import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Service providing filesystem tools for MCP.
 */
export class FilesystemMcpService {
    /**
     * Lists files and directories in a given path.
     */
    async listDirectory(dirPath: string) {
        try {
            const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.resolve(process.cwd(), dirPath)
            const entries = await fs.readdir(absolutePath, { withFileTypes: true })
            return entries.map(entry => ({
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file'
            }))
        } catch (error) {
            throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Reads the content of a file.
     */
    async readFile(filePath: string) {
        try {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
            return await fs.readFile(absolutePath, 'utf8')
        } catch (error) {
            throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Writes content to a file.
     */
    async writeFile(filePath: string, content: string) {
        try {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
            const dir = path.dirname(absolutePath)
            await fs.mkdir(dir, { recursive: true })
            await fs.writeFile(absolutePath, content, 'utf8')
            return `Successfully wrote to ${filePath}`
        } catch (error) {
            throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Creates a directory.
     */
    async createDirectory(dirPath: string) {
        try {
            const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.resolve(process.cwd(), dirPath)
            await fs.mkdir(absolutePath, { recursive: true })
            return `Successfully created directory ${dirPath}`
        } catch (error) {
            throw new Error(`Failed to create directory: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Deletes a file.
     */
    async deleteFile(filePath: string) {
        try {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
            await fs.unlink(absolutePath)
            return `Successfully deleted ${filePath}`
        } catch (error) {
            throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Reads multiple files at once.
     */
    async readMultipleFiles(filePaths: string[]) {
        const results: Record<string, string> = {}
        for (const filePath of filePaths) {
            try {
                results[filePath] = await this.readFile(filePath)
            } catch (error) {
                results[filePath] = `Error: ${error instanceof Error ? error.message : String(error)}`
            }
        }
        return results
    }

    /**
     * Moves or renames a file.
     */
    async moveFile(sourcePath: string, destPath: string) {
        try {
            const src = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(process.cwd(), sourcePath)
            const dst = path.isAbsolute(destPath) ? destPath : path.resolve(process.cwd(), destPath)
            await fs.mkdir(path.dirname(dst), { recursive: true })
            await fs.rename(src, dst)
            return `Successfully moved ${sourcePath} to ${destPath}`
        } catch (error) {
            throw new Error(`Failed to move file: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Surgically edits a block of text in a file.
     */
    async editBlock(filePath: string, findContent: string, replaceWith: string) {
        try {
            const content = await this.readFile(filePath)
            if (!content.includes(findContent)) {
                throw new Error(`Content to replace not found in ${filePath}`)
            }
            const newContent = content.replace(findContent, replaceWith)
            await this.writeFile(filePath, newContent)
            return `Successfully updated ${filePath}`
        } catch (error) {
            throw new Error(`Failed to edit block: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Gets detailed file/directory information.
     */
    async getFileInfo(filePath: string) {
        try {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
            const stats = await fs.stat(absolutePath)
            return {
                path: absolutePath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                permissions: stats.mode
            }
        } catch (error) {
            throw new Error(`Failed to get file info: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Placeholder for writing a PDF file.
     */
    async writePdf(filePath: string, content: string) {
        // Since we don't have a PDF library yet, we'll write it as a formatted text file
        // or a simple placeholder if a library is needed later.
        return this.writeFile(filePath, content)
    }

    /**
     * Returns tool definitions for this service.
     */
    getTools() {
        return [
            {
                name: 'read_file',
                description: 'Read the content of a file from the filesystem.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The absolute or relative path to the file.' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'write_file',
                description: 'Create a new file or overwrite an existing file with the provided content.',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The path where the file should be created/updated.' },
                        content: { type: 'string', description: 'The content to write to the file.' }
                    },
                    required: ['path', 'content']
                }
            },
            {
                name: 'list_directory',
                description: 'List the contents of a directory.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The path of the directory to list.' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'create_directory',
                description: 'Create a new directory (including parent directories if they do not exist).',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The path of the directory to create.' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'delete_file',
                description: 'Delete a file from the filesystem.',
                tier: 'dangerous',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The path of the file to delete.' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'read_multiple_files',
                description: 'Read the contents of multiple files in parallel.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: {
                        paths: { type: 'array', items: { type: 'string' }, description: 'The list of paths to read.' }
                    },
                    required: ['paths']
                }
            },
            {
                name: 'move_file',
                description: 'Move or rename a file/directory.',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        source: { type: 'string', description: 'The source path.' },
                        destination: { type: 'string', description: 'The destination path.' }
                    },
                    required: ['source', 'destination']
                }
            },
            {
                name: 'edit_block',
                description: 'Replace a specific block of text in a file with new content.',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The path to the file.' },
                        find: { type: 'string', description: 'The exact string to find.' },
                        replace: { type: 'string', description: 'The replacement string.' }
                    },
                    required: ['path', 'find', 'replace']
                }
            },
            {
                name: 'get_file_info',
                description: 'Get detailed information and stats for a file or directory.',
                tier: 'safe',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The path to the file/directory.' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'write_pdf',
                description: 'Create a PDF document (simulated via text for now).',
                tier: 'restricted',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The path where the PDF should be created.' },
                        content: { type: 'string', description: 'The content of the PDF.' }
                    },
                    required: ['path', 'content']
                }
            }
        ]
    }
}
