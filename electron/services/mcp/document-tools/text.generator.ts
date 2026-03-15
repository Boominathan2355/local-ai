import { DocumentOptions } from '../../../../src/types/mcp.types'

export async function generateTextDocument(
    options: DocumentOptions,
    format: 'txt' | 'md' | 'html'
): Promise<Buffer> {
    if (format === 'html') {
        const title = options.title || 'Document'

        let htmlContext = `<!DOCTYPE html>\n<html lang="en">\n<head>\n`
        htmlContext += `  <meta charset="UTF-8">\n`
        htmlContext += `  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n`
        htmlContext += `  <title>${title}</title>\n`
        htmlContext += `  <style>\n`
        htmlContext += `    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 2rem; }\n`
        htmlContext += `    h1 { color: #2563eb; }\n`
        htmlContext += `    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }\n`
        htmlContext += `    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }\n`
        htmlContext += `    th { background-color: #f8fafc; }\n`
        htmlContext += `  </style>\n</head>\n<body>\n`

        htmlContext += `  <h1>${title}</h1>\n`

        if (options.sections) {
            for (const section of options.sections) {
                if (section.heading) {
                    htmlContext += `  <h2>${section.heading}</h2>\n`
                }
                if (section.content) {
                    htmlContext += `  <p>${section.content.replace(/\\n/g, '<br>')}</p>\n`
                }
            }
        }

        if (options.tableData && options.tableData.length > 0) {
            htmlContext += `  <table>\n    <thead>\n      <tr>\n`
            const headers = Object.keys(options.tableData[0])
            for (const header of headers) {
                htmlContext += `        <th>${header}</th>\n`
            }
            htmlContext += `      </tr>\n    </thead>\n    <tbody>\n`

            for (const row of options.tableData) {
                htmlContext += `      <tr>\n`
                for (const header of headers) {
                    htmlContext += `        <td>${row[header] || ''}</td>\n`
                }
                htmlContext += `      </tr>\n`
            }
            htmlContext += `    </tbody>\n  </table>\n`
        }

        htmlContext += `</body>\n</html>`
        return Buffer.from(htmlContext, 'utf-8')
    }

    if (format === 'md') {
        let mdContent = `# ${options.title || 'Document'}\n\n`

        if (options.sections) {
            for (const section of options.sections) {
                if (section.heading) mdContent += `## ${section.heading}\n\n`
                if (section.content) mdContent += `${section.content}\n\n`
            }
        }

        if (options.tableData && options.tableData.length > 0) {
            const headers = Object.keys(options.tableData[0])
            mdContent += `| ${headers.join(' | ')} |\n`
            mdContent += `| ${headers.map(() => '---').join(' | ')} |\n`

            for (const row of options.tableData) {
                const rowValues = headers.map(h => String(row[h] || '').replace(/\\|/g, '\\\\|'))
                mdContent += `| ${rowValues.join(' | ')} |\n`
            }
            mdContent += '\n'
        }

        return Buffer.from(mdContent, 'utf-8')
    }

    // Default to plain txt
    let txtContent = `${options.title || 'Document'}\n${'='.repeat(options.title?.length || 8)}\n\n`

    if (options.sections) {
        for (const section of options.sections) {
            if (section.heading) txtContent += `${section.heading}\n${'-'.repeat(section.heading.length)}\n`
            if (section.content) txtContent += `${section.content}\n\n`
        }
    }

    if (options.tableData && options.tableData.length > 0) {
        // Very basic text representation of a table
        txtContent += `[Table Data attached: ${options.tableData.length} rows]\n`
        txtContent += JSON.stringify(options.tableData, null, 2)
    }

    return Buffer.from(txtContent, 'utf-8')
}
