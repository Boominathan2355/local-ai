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
     * Returns tool definitions for this service.
     */
    getTools() {
        return [
            {
                name: 'read_file',
                description: 'Read the content of a file from the filesystem.',
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
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'The path of the file to delete.' }
                    },
                    required: ['path']
                }
            }
        ]
    }
}
