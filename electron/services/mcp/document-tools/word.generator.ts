import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } from 'docx'
import { DocumentOptions } from '../../../../src/types/mcp.types'

export async function generateWordDocument(options: DocumentOptions): Promise<Buffer> {
    const children: any[] = []

    // Title
    if (options.title) {
        children.push(new Paragraph({
            text: options.title,
            heading: HeadingLevel.TITLE
        }))
    }

    // Sections
    if (options.sections) {
        for (const section of options.sections) {
            if (section.heading) {
                children.push(new Paragraph({
                    text: section.heading,
                    heading: HeadingLevel.HEADING_1
                }))
            }
            if (section.content) {
                children.push(new Paragraph({
                    text: section.content
                }))
            }
        }
    }

    // Table
    if (options.tableData && options.tableData.length > 0) {
        const headers = Object.keys(options.tableData[0])
        const tableRows: TableRow[] = []

        // Header Row
        tableRows.push(new TableRow({
            children: headers.map(header => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })]
            }))
        }))

        // Data Rows
        for (const row of options.tableData) {
            tableRows.push(new TableRow({
                children: headers.map(header => new TableCell({
                    children: [new Paragraph({ text: String(row[header] || '') })]
                }))
            }))
        }

        children.push(new Table({ rows: tableRows }))
    }

    const doc = new Document({
        sections: [{ properties: {}, children }]
    })

    return Packer.toBuffer(doc)
}
