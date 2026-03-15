import { ToolDefinition, ToolCategory, ToolPermissionLevel } from '../../../src/types/mcp.types'

export class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map()

    constructor() {
        // Initialize with core tools disabled (need explicitly enabling)
        this.registerFileTools()
        this.registerTerminalTools()
        this.registerDocumentTools()
        // Other tools will be registered as implemented in phases
    }

    /**
     * Registers a new tool into the system
     */
    registerTool(tool: ToolDefinition): void {
        this.tools.set(tool.name, tool)
    }

    /**
     * Retrieves a tool definition by name
     */
    getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name)
    }

    /**
     * Gets all registered tools, optionally filtered by category
     */
    getAllTools(category?: ToolCategory): ToolDefinition[] {
        const all = Array.from(this.tools.values())
        if (category) {
            return all.filter(t => t.category === category)
        }
        return all
    }

    /**
     * Gets all tools that are currently enabled
     */
    getEnabledTools(category?: ToolCategory): ToolDefinition[] {
        return this.getAllTools(category).filter(t => t.enabled)
    }

    /**
     * Returns enabled tools in OpenAI-compatible tools format
     * for llama.cpp /v1/chat/completions endpoint.
     */
    getToolDefinitionsOpenAI(): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, any> } }> {
        return this.getEnabledTools().map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: this.convertToJsonSchema(tool.parameterSchema)
            }
        }))
    }

    /**
     * Converts internal parameterSchema (e.g. {path: 'string', content: 'string'})
     * to proper JSON Schema format.
     */
    private convertToJsonSchema(schema: Record<string, any>): Record<string, any> {
        const properties: Record<string, any> = {}
        const required: string[] = []

        for (const [key, value] of Object.entries(schema)) {
            if (typeof value === 'object' && value !== null) {
                // Handle detailed schema object
                properties[key] = {
                    type: value.type || 'string',
                    ...(value.description && { description: value.description })
                }
                if (!value.optional) {
                    required.push(key)
                }
            } else {
                // Fallback to legacy string shorthand
                const isOptional = typeof value === 'string' && value.endsWith('?')
                const rawType = typeof value === 'string' ? value.replace('?', '') : 'string'

                const typeMap: Record<string, string> = {
                    'string': 'string',
                    'number': 'number',
                    'boolean': 'boolean',
                    'object': 'object'
                }

                properties[key] = { type: typeMap[rawType] || 'string' }

                if (!isOptional) {
                    required.push(key)
                }
            }
        }

        return {
            type: 'object',
            properties,
            required
        }
    }

    /**
     * Enables or disables a specific tool globally
     */
    setToolEnabled(name: string, enabled: boolean): void {
        const tool = this.tools.get(name)
        if (tool) {
            tool.enabled = enabled
        }
    }

    /**
     * Bulk enables/disables tools by category (used to sync with settings)
     */
    setCategoryEnabled(category: ToolCategory, enabled: boolean): void {
        const toolsArray = Array.from(this.tools.values())
        for (const tool of toolsArray) {
            if (tool.category === category) {
                tool.enabled = enabled
            }
        }
    }

    // ─── Initial Registration Data (Phase 3 Shell) ────────────────

    public registerFileTools() {
        const fileTools: ToolDefinition[] = [
            {
                name: 'read_file',
                category: 'file_control',
                description: 'Read a file\'s contents (max 10MB)',
                permissionLevel: 'read',
                maxExecutionTimeMs: 10_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute file path to read from (e.g. /home/bn/file.txt or C:\\path\\to\\file.txt)' }
                }
            },
            {
                name: 'write_file',
                category: 'file_control',
                description: 'Write content to a file (creates or overwrites)',
                permissionLevel: 'write',
                maxExecutionTimeMs: 15_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute file path to write to (e.g. /home/bn/file.txt)' },
                    content: { type: 'string', description: 'The entire string content to write to the file' }
                }
            },
            {
                name: 'create_file',
                category: 'file_control',
                description: 'Create a new file (fails if exists)',
                permissionLevel: 'write',
                maxExecutionTimeMs: 5_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute file path to create' },
                    content: { type: 'string', description: 'The string content to write to the new file' }
                }
            },
            {
                name: 'create_directory',
                category: 'file_control',
                description: 'Create a new directory (recursive)',
                permissionLevel: 'write',
                maxExecutionTimeMs: 5_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute directory path to create' }
                }
            },
            {
                name: 'delete_directory',
                category: 'file_control',
                description: 'Delete an empty directory',
                permissionLevel: 'destructive',
                maxExecutionTimeMs: 5_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute directory path to delete' }
                }
            },
            {
                name: 'delete_file',
                category: 'file_control',
                description: 'Delete a file',
                permissionLevel: 'destructive',
                maxExecutionTimeMs: 5_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute file path to delete' }
                }
            },
            {
                name: 'list_directory',
                category: 'file_control',
                description: 'List contents of a directory. IMPORTANT: You MUST provide an absolute path, never a relative path.',
                permissionLevel: 'read',
                maxExecutionTimeMs: 10_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', optional: true, description: 'The absolute directory path to list (e.g. /home/). If not provided, it will default to your allowed workspace root.' },
                    show_hidden: { type: 'boolean', optional: true, description: 'Include hidden files' }
                }
            },
            {
                name: 'count_files',
                category: 'file_control',
                description: 'Count items in a directory',
                permissionLevel: 'read',
                maxExecutionTimeMs: 15_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute directory path to count' },
                    recursive: { type: 'boolean', optional: true, description: 'Count recursively' }
                }
            },
            {
                name: 'file_details',
                category: 'file_control',
                description: 'Get file stat details',
                permissionLevel: 'read',
                maxExecutionTimeMs: 5_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute path to the file or directory' }
                }
            },
            {
                name: 'rename',
                category: 'file_control',
                description: 'Rename or move a file or directory',
                permissionLevel: 'destructive', 
                maxExecutionTimeMs: 5_000,
                enabled: true,
                parameterSchema: { 
                    old_path: { type: 'string', description: 'The absolute path of the existing entry' }, 
                    new_path: { type: 'string', description: 'The absolute path of the new destination' }
                }
            },
            {
                name: 'copy_file',
                category: 'file_control',
                description: 'Copy a file',
                permissionLevel: 'write',
                maxExecutionTimeMs: 10_000,
                enabled: true,
                parameterSchema: { 
                    source: { type: 'string', description: 'The absolute path of the source file' }, 
                    destination: { type: 'string', description: 'The absolute path for the copy destination' }
                }
            },
            {
                name: 'search_files',
                category: 'file_control',
                description: 'Find files by name pattern',
                permissionLevel: 'read',
                maxExecutionTimeMs: 30_000,
                enabled: true,
                parameterSchema: { 
                    path: { type: 'string', description: 'The absolute directory path to search in' }, 
                    pattern: { type: 'string', description: 'The regex or glob pattern to search for' }, 
                    max_results: { type: 'number', optional: true }
                }
            }
        ]

        fileTools.forEach(t => this.registerTool(t))
    }

    public registerTerminalTools() {
        this.registerTool({
            name: 'run_command',
            category: 'terminal',
            description: 'Run a shell command on the local system',
            permissionLevel: 'terminal',
            maxExecutionTimeMs: 120_000,
            enabled: false,
            parameterSchema: { 
                command: { type: 'string', description: 'The shell command to execute' }, 
                cwd: { type: 'string', optional: true, description: 'The absolute directory path to run the command in' }
            }
        })
    }

    public registerDocumentTools() {
        this.registerTool({
            name: 'create_document',
            category: 'document_creator',
            description: 'Create documents in various formats: PDF, DOCX, XLSX, PPTX, CSV, Markdown, HTML, TXT. Use this tool to generate reports, summaries, and structured documents. Specify the desired format in the "format" parameter.',
            permissionLevel: 'write',
            maxExecutionTimeMs: 30_000,
            enabled: true,
            parameterSchema: {
                path: { type: 'string', description: 'The absolute file path where the document should be saved (e.g. /home/user/report.pdf)' },
                format: { type: 'string', description: 'Output format: pdf, docx, xlsx, pptx, csv, md, html, or txt' },
                options: { type: 'object', description: 'Document content and styling. Must include "title" (string) and "content" (string, Markdown format). Optional: "author", "subject", "margins", "fontSize".' }
            }
        })
    }
}
