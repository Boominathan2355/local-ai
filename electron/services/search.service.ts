import https from 'https'

export interface SearchResult {
    title: string
    link: string
    snippet: string
}

/**
 * Service to handle web searching via Serper.dev API
 */
export class SearchService {
    async search(query: string, settings: { serperApiKey?: string, tavilyApiKey?: string }): Promise<SearchResult[]> {
        if (settings.tavilyApiKey) {
            try {
                return await this.searchTavily(query, settings.tavilyApiKey)
            } catch (err) {
                console.error('[SearchService] Tavily search failed, falling back to Serper:', err)
            }
        }

        if (settings.serperApiKey) {
            return await this.searchSerper(query, settings.serperApiKey)
        }

        throw new Error('No search API key configured (Tavily or Serper)')
    }

    private async searchSerper(query: string, apiKey: string): Promise<SearchResult[]> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({ q: query })
            const options = {
                hostname: 'google.serper.dev',
                port: 443,
                path: '/search',
                method: 'POST',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                }
            }

            const req = https.request(options, (res) => {
                let body = ''
                res.on('data', (chunk) => body += chunk.toString())
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body)
                        const results = (parsed.organic || []).slice(0, 5).map((r: any) => ({
                            title: r.title,
                            link: r.link,
                            snippet: r.snippet
                        }))
                        resolve(results)
                    } catch (err) {
                        reject(new Error('Failed to parse search results'))
                    }
                })
            })

            req.on('error', (err) => reject(err))
            req.write(data)
            req.end()
        })
    }

    private async searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                query,
                search_depth: 'basic',
                include_answer: false,
                max_results: 5
            })
            const options = {
                hostname: 'api.tavily.com',
                port: 443,
                path: '/search',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            }

            const req = https.request(options, (res) => {
                let body = ''
                res.on('data', (chunk) => body += chunk.toString())
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body)
                        const results = (parsed.results || []).map((r: any) => ({
                            title: r.title,
                            link: r.url,
                            snippet: r.content
                        }))
                        resolve(results)
                    } catch (err) {
                        reject(new Error('Failed to parse Tavily results'))
                    }
                })
            })

            req.on('error', (err) => reject(err))
            req.write(data)
            req.end()
        })
    }
}
