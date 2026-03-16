import PDFDocument from 'pdfkit'
import { DocumentOptions } from '../../../../src/types/mcp.types'

export async function generatePdfDocument(options: DocumentOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 })
            const buffers: Buffer[] = []

            doc.on('data', buffers.push.bind(buffers))
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers)
                resolve(pdfData)
            })

            // Meta
            doc.info['Title'] = options.title || 'Document'
            doc.info['Author'] = options.author || 'Local AI Assistant'

            // Title
            if (options.title) {
                doc.fontSize(24).font('Helvetica-Bold').text(options.title, { align: 'center' })
                doc.moveDown(2)
            }

            // Sections
            if (options.sections) {
                for (const section of options.sections) {
                    if (section.heading) {
                        doc.fontSize(16).font('Helvetica-Bold').text(section.heading)
                        doc.moveDown(0.5)
                    }
                    if (section.content) {
                        doc.fontSize(12).font('Helvetica').text(section.content, { align: 'left', lineGap: 4 })
                        doc.moveDown(1.5)
                    }
                }
            }

            // Basic Table representation (PDFKit doesn't have native tables without add-ons)
            if (options.tableData && options.tableData.length > 0) {
                doc.addPage()
                doc.fontSize(16).font('Helvetica-Bold').text('Data Table')
                doc.moveDown(1)

                doc.fontSize(10).font('Helvetica')
                const headers = Object.keys(options.tableData[0])

                // Very rudimentary column simulation
                const startX = 50
                let currentY = doc.y
                const colWidth = (doc.page.width - 100) / headers.length

                // Print Headers
                headers.forEach((h, i) => {
                    doc.text(String(h).substring(0, 15), startX + (i * colWidth), currentY, { width: colWidth })
                })
                currentY += 15
                doc.moveTo(startX, currentY).lineTo(doc.page.width - 50, currentY).stroke()
                currentY += 5

                // Print Rows
                for (const row of options.tableData) {
                    if (currentY > doc.page.height - 100) {
                        doc.addPage()
                        currentY = 50
                    }
                    headers.forEach((h, i) => {
                        doc.text(String(row[h] || '').substring(0, 15), startX + (i * colWidth), currentY, { width: colWidth })
                    })
                    currentY += 15
                }
            }

            doc.end()
        } catch (error) {
            reject(error)
        }
    })
}
