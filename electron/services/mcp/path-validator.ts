import path from 'path'
import os from 'os'
import fs from 'fs/promises'

export interface ValidationResult {
    allowed: boolean
    reason?: string
    resolvedPath?: string
}

// Patterns that are always blocked, regardless of allowlist
const DENIED_PATTERNS = [
    /\.ssh\//i,
    /\.gnupg\//i,
    /\.env$/i,
    /\.env\./i,
    /\.git\/config$/i,
    /\.npmrc$/i,
    /\.docker\//i,
    /\/\.aws\//i,
    /\/\.kube\//i,
    /id_rsa/i,
    /\.pem$/i,
    /password/i,
    /credential/i,
    /secret/i,
    /token/i
]

export class PathValidator {
    private allowedPaths: string[] = []

    constructor(initialAllowedPaths: string[] = []) {
        this.updateAllowedPaths(initialAllowedPaths)
    }

    /**
     * Updates the list of allowed paths. All paths are resolved to absolute paths.
     */
    updateAllowedPaths(paths: string[]): void {
        this.allowedPaths = paths
            .map(p => this.resolveHomeDir(p))
            .map(p => path.resolve(p))
    }

    /**
     * Gets the currently active allowed paths List.
     */
    getAllowedPaths(): string[] {
        return [...this.allowedPaths]
    }

    /**
     * Replaces ~ with the actual home directory path
     */
    private resolveHomeDir(p: string): string {
        if (p.startsWith('~/') || p === '~') {
            return p.replace(/^~/, os.homedir())
        }
        return p
    }

    /**
     * Performs a 3-layer security check on a given path.
     * 1. Allowlist check (is it inside an allowed directory?)
     * 2. Symlink escape check (does the real path point outside?)
     * 3. Deny-list check (does it match a sensitive file pattern?)
     */
    async validatePath(targetPath: string): Promise<ValidationResult> {
        if (!targetPath) {
            return { allowed: false, reason: 'Path cannot be empty' }
        }

        // Must be an absolute path
        if (!path.isAbsolute(targetPath)) {
            return { allowed: false, reason: 'Paths must be absolute' }
        }

        const resolved = path.resolve(targetPath)

        // 1. Allowlist check
        const isInsideAllowed = this.allowedPaths.some(allowedPath => {
            const rel = path.relative(allowedPath, resolved)
            return !rel.startsWith('..') && !path.isAbsolute(rel)
        })

        if (!isInsideAllowed) {
            return { allowed: false, reason: 'Path is outside allowed directories' }
        }

        // 2. Symlink resolution (prevent escaping the sandbox via symlinks)
        try {
            const realPath = await fs.realpath(resolved)
            const isRealInsideAllowed = this.allowedPaths.some(allowedPath => {
                const rel = path.relative(allowedPath, realPath)
                return !rel.startsWith('..') && !path.isAbsolute(rel)
            })

            if (!isRealInsideAllowed) {
                return { allowed: false, reason: 'Symlink resolves to a path outside allowed directories' }
            }
        } catch (error: any) {
            // ENOENT is fine (file doesn't exist yet, e.g. for write operations)
            // But if it's a permissions error or something else, we should block
            if (error.code !== 'ENOENT') {
                return { allowed: false, reason: `Error resolving path: ${error.message}` }
            }
        }

        // 3. Deny-list check (sensitive patterns)
        const isDenied = DENIED_PATTERNS.some(pattern => pattern.test(resolved))
        if (isDenied) {
            return { allowed: false, reason: 'Path matches a sensitive system or credential file pattern' }
        }

        return { allowed: true, resolvedPath: resolved }
    }
}
