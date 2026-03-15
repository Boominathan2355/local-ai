import { stringify } from 'csv-stringify/sync'
import { DocumentOptions } from '../../../../src/types/mcp.types'

export async function generateCsvDocument(options: DocumentOptions): Promise<Buffer> {
    if (!options.tableData || options.tableData.length === 0) {
        return Buffer.from('No tabular data provided.', 'utf-8')
    }

    // Options for standard comma separated CSV with headers
    const csvContent = stringify(options.tableData, {
        header: true,
        objectMode: true
    })

    return Buffer.from(csvContent, 'utf-8')
}
