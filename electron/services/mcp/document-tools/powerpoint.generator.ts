import pptxgen from 'pptxgenjs'
import { DocumentOptions } from '../../../../src/types/mcp.types'

export async function generatePowerpointDocument(options: DocumentOptions): Promise<Buffer> {
    const pres = new pptxgen()

    pres.author = options.author || 'Local AI Assistant'
    pres.company = 'Local AI Context'
    pres.title = options.title || 'Presentation'

    // Title Slide
    if (options.title) {
        const slide = pres.addSlide()
        slide.addText(options.title, {
            x: 1, y: 2, w: '80%', h: 1.5,
            fontSize: 44, bold: true, color: '363636', align: 'center'
        })
        if (options.author) {
            slide.addText(options.author, {
                x: 1, y: 3.5, w: '80%', h: 1,
                fontSize: 24, color: '666666', align: 'center'
            })
        }
    }

    // Content Slides
    if (options.sections) {
        for (const section of options.sections) {
            // Very simple mapping: 1 section = 1 slide
            const slide = pres.addSlide()
            if (section.heading) {
                slide.addText(section.heading, {
                    x: 0.5, y: 0.5, w: '90%', h: 1,
                    fontSize: 32, bold: true, color: '363636'
                })
            }
            if (section.content) {
                slide.addText(section.content, {
                    x: 0.5, y: 1.5, w: '90%', h: 3.5,
                    fontSize: 18, color: '363636', align: 'left', valign: 'top'
                })
            }
        }
    }

    // Attempting to render table if it exists
    if (options.tableData && options.tableData.length > 0) {
        const slide = pres.addSlide()
        slide.addText(options.title ? `${options.title} - Data` : 'Data Table', {
            x: 0.5, y: 0.5, w: '90%', h: 0.8, fontSize: 24, bold: true, color: '363636'
        })

        const headers = Object.keys(options.tableData[0])
        const rows = options.tableData.map((row: any) => headers.map((h: string) => String(row[h] || '')))
        const tableData = [headers, ...rows]

        slide.addTable(tableData as any, {
            x: 0.5, y: 1.5, w: '90%', fontSize: 12, border: { type: 'solid', color: 'DFDFDF' }
        })
    }

    // pptxgen writes to an ArrayBuffer when write('arraybuffer') is called.
    // However, it's promise-based for newer versions but uses a callback/promise hybrid.
    const buffer = await pres.write({ outputType: 'nodebuffer' })
    return buffer as Buffer
}
