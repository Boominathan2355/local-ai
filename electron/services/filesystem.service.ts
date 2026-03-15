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
     * Create a new directory (recursive).
     */
    async createDirectory(dirPath: string): Promise<void> {
        const absolutePath = path.resolve(dirPath)
        await fs.mkdir(absolutePath, { recursive: true })
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
    /**
     * Create a new file (fails if exists).
     */
    async createFile(filePath: string, content: string): Promise<void> {
        const absolutePath = path.resolve(filePath)
        const dir = path.dirname(absolutePath)
        await fs.mkdir(dir, { recursive: true })
        // wx flag fails if file already exists
        await fs.writeFile(absolutePath, content, { encoding: 'utf8', flag: 'wx' })
    }

    /**
     * Delete a file or empty directory.
     */
    async deleteFile(filePath: string): Promise<void> {
        const absolutePath = path.resolve(filePath)
        const stats = await fs.stat(absolutePath)

        if (stats.isDirectory()) {
            await fs.rmdir(absolutePath)
        } else {
            await fs.unlink(absolutePath)
        }
    }

    /**
     * Rename or move a file.
     */
    async renameFile(oldPath: string, newPath: string): Promise<void> {
        const absOld = path.resolve(oldPath)
        const absNew = path.resolve(newPath)

        const newDir = path.dirname(absNew)
        await fs.mkdir(newDir, { recursive: true })
        await fs.rename(absOld, absNew)
    }

    /**
     * Copy a file.
     */
    async copyFile(sourcePath: string, destPath: string): Promise<void> {
        const absSource = path.resolve(sourcePath)
        const absDest = path.resolve(destPath)

        const destDir = path.dirname(absDest)
        await fs.mkdir(destDir, { recursive: true })
        await fs.copyFile(absSource, absDest)
    }

    /**
     * Get detailed file stats.
     */
    async getFileStats(filePath: string): Promise<Stats> {
        const absolutePath = path.resolve(filePath)
        return fs.stat(absolutePath)
    }

    /**
     * Count items in a directory (optionally recursive).
     */
    async countFiles(dirPath: string, recursive: boolean = false): Promise<{ files: number, dirs: number }> {
        const absolutePath = path.resolve(dirPath)
        let fileCount = 0
        let dirCount = 0

        async function count(currentPath: string) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    dirCount++
                    if (recursive) {
                        try {
                            await count(path.join(currentPath, entry.name))
                        } catch (e) {
                            // ignore permission errors when recursing
                        }
                    }
                } else {
                    fileCount++
                }
            }
        }

        await count(absolutePath)
        return { files: fileCount, dirs: dirCount }
    }

    /**
     * Search files by pattern (glob-like basic matching for now)
     */
    async searchFiles(dirPath: string, pattern: string, maxResults: number = 100): Promise<string[]> {
        const absolutePath = path.resolve(dirPath)
        const results: string[] = []

        // Convert simple wildcard * to regex
        const regexPattern = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i')

        async function search(currentPath: string) {
            if (results.length >= maxResults) return

            let entries;
            try {
                entries = await fs.readdir(currentPath, { withFileTypes: true })
            } catch (e) {
                return // Ignore inaccessible dirs
            }

            for (const entry of entries) {
                if (results.length >= maxResults) return

                const fullPath = path.join(currentPath, entry.name)

                if (regexPattern.test(entry.name)) {
                    results.push(fullPath)
                }

                if (entry.isDirectory()) {
                    await search(fullPath)
                }
            }
        }

        await search(absolutePath)
        return results
    }
}
