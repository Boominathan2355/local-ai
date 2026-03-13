import fs from 'fs/promises'
import path from 'path'
import { Stats } from 'fs'

export interface FileInfo {
    name: string
    isDir: boolean
    size: number
    mtime: number
}

export interface DirectoryContent {
    files: FileInfo[]
    totalCount: number
    path: string
}

export class FileSystemService {
    /**
     * List contents of a directory with metadata.
     */
    async listDirectory(dirPath: string): Promise<DirectoryContent> {
        const absolutePath = path.resolve(dirPath)
        const entries = await fs.readdir(absolutePath, { withFileTypes: true })

        const files: FileInfo[] = await Promise.all(
            entries.map(async (entry) => {
                const fullPath = path.join(absolutePath, entry.name)
                let stats: Stats | null = null
                try {
                    stats = await fs.stat(fullPath)
                } catch (e) {
                    // Ignore broken links or permission issues for stats
                }

                return {
                    name: entry.name,
                    isDir: entry.isDirectory(),
                    size: stats?.size ?? 0,
                    mtime: stats?.mtimeMs ?? 0
                }
            })
        )

        return {
            files,
            totalCount: files.length,
            path: absolutePath
        }
    }

    /**
     * Read content of a file.
     */
    async readFile(filePath: string): Promise<string> {
        const absolutePath = path.resolve(filePath)
        return fs.readFile(absolutePath, 'utf8')
    }

    /**
     * Write content to a file.
     */
    async writeFile(filePath: string, content: string): Promise<void> {
        const absolutePath = path.resolve(filePath)
        const dir = path.dirname(absolutePath)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(absolutePath, content, 'utf8')
    }
}
