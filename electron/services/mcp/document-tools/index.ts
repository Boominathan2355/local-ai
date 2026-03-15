import { ToolController } from '../tool-controller'
import { PathValidator } from '../path-validator'
import { FileSystemService } from '../../filesystem.service'
import path from 'path'

import { generatePdfDocument } from './pdf.generator'
import { generateWordDocument } from './word.generator'
import { generateExcelDocument } from './excel.generator'
import { generatePowerpointDocument } from './powerpoint.generator'
import { generateCsvDocument } from './csv.generator'
import { generateTextDocument } from './text.generator'
import { DocumentOptions } from '../../../../src/types/mcp.types'

async function createDocumentTool(
    args: Record<string, any>,
    fsService: FileSystemService,
    pathValidator: PathValidator
): Promise<string> {
    const { path: outputPath, format, options } = args
    if (!outputPath) throw new Error("Missing required argument: 'path'")
    if (!format) throw new Error("Missing required argument: 'format'")
    if (!options) throw new Error("Missing required argument: 'options'")

    const validation = await pathValidator.validatePath(outputPath)
    if (!validation.allowed) {
        throw new Error(`Path validation failed: ${validation.reason}`)
    }

    const docOpts = options as DocumentOptions
    let buffer: Buffer

    try {
        switch (format.toLowerCase()) {
            case 'pdf':
                buffer = await generatePdfDocument(docOpts)
                break
            case 'docx':
            case 'doc':
                buffer = await generateWordDocument(docOpts)
                break
            case 'xlsx':
            case 'xls':
                buffer = await generateExcelDocument(docOpts)
                break
            case 'pptx':
            case 'ppt':
                buffer = await generatePowerpointDocument(docOpts)
                break
            case 'csv':
                buffer = await generateCsvDocument(docOpts)
                break
            case 'md':
            case 'html':
            case 'txt':
                buffer = await generateTextDocument(docOpts, format)
                break
            default:
                throw new Error(`Unsupported document format: ${format}`)
        }

        const resolvedPath = validation.resolvedPath!
        const dir = path.dirname(resolvedPath)

        // Ensure path exists before writing
        await fsService.createFile(resolvedPath, '') // Create empty file first to handle dir creation/wx checks
        const fsPromises = require('fs/promises')
        await fsPromises.writeFile(resolvedPath, buffer) // Then write actual buffer

        return `Document successfully created at ${outputPath}`
    } catch (error: any) {
        throw new Error(`Document generation failed: ${error.message}`)
    }
}

/**
 * Registers document generation tools with the ToolController.
 */
export function registerDocumentTools(
    controller: ToolController,
    fsService: FileSystemService,
    pathValidator: PathValidator
) {
    return async function executeDocumentTool(toolName: string, args: Record<string, any>): Promise<any> {
        switch (toolName) {
            case 'create_document':
                return createDocumentTool(args, fsService, pathValidator)
            default:
                throw new Error(`Document tool '${toolName}' implementation not found.`)
        }
    }
}
