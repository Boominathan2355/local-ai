import ExcelJS from 'exceljs'
import { DocumentOptions } from '../../../../src/types/mcp.types'

export async function generateExcelDocument(options: DocumentOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = options.author || 'Local AI Assistant'
    workbook.created = new Date()

    const sheetName = options.title ? options.title.substring(0, 31).replace(/[\*\?\/\\\[\]]/g, '') : 'Data'
    const worksheet = workbook.addWorksheet(sheetName)

    let currentRowNumber = 1

    if (options.title) {
        worksheet.getCell(`A${currentRowNumber}`).value = options.title
        worksheet.getCell(`A${currentRowNumber}`).font = { size: 16, bold: true }
        // Attempt to merge across headers if table exists
        if (options.tableData && options.tableData.length > 0) {
            const numCols = Object.keys(options.tableData[0]).length
            worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, Math.max(numCols, 1))
        }
        currentRowNumber += 2
    }

    if (options.sections) {
        for (const section of options.sections) {
            if (section.heading) {
                worksheet.getCell(`A${currentRowNumber}`).value = section.heading
                worksheet.getCell(`A${currentRowNumber}`).font = { bold: true, size: 12 }
                currentRowNumber++
            }
            if (section.content) {
                worksheet.getCell(`A${currentRowNumber}`).value = section.content
                worksheet.getRow(currentRowNumber).height = 40
                worksheet.getCell(`A${currentRowNumber}`).alignment = { wrapText: true, vertical: 'top' }
                currentRowNumber += 2
            }
        }
    }

    if (options.tableData && options.tableData.length > 0) {
        const headers = Object.keys(options.tableData[0])

        // Add Headers
        const headerRow = worksheet.getRow(currentRowNumber)
        headerRow.values = headers
        headerRow.font = { bold: true }
        headerRow.commit()
        currentRowNumber++

        // Add Data
        for (const row of options.tableData) {
            const dataRow = worksheet.getRow(currentRowNumber)
            dataRow.values = headers.map(h => row[h])
            dataRow.commit()
            currentRowNumber++
        }

        // Auto-fit columns roughly
        worksheet.columns.forEach(column => {
            column.width = 20 // Reasonable default
        })
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
}
