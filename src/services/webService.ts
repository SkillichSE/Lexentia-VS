import * as https from 'https'
import * as http from 'http'

export async function fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https:') ? https : http

        const req = client.get(url, (res) => {
            let data = ''
            res.setEncoding('utf8')
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                resolve(data.slice(0, 50000))
            })
        })

        req.on('error', reject)
        req.setTimeout(30000, () => {
            req.destroy()
            reject(new Error('timeout'))
        })
    })
}

export async function webSearch(query: string): Promise<string> {
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    try {
        const html = await fetchUrl(searchUrl)
        const results = parseSearchResults(html)
        return results.slice(0, 5).map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
    } catch {
        return `search failed for: ${query}`
    }
}

function parseSearchResults(html: string): Array<{title: string, url: string, snippet: string}> {
    const results: Array<{title: string, url: string, snippet: string}> = []

    const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>(.*?)<\/a>/g
    let match

    while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
        const url = decodeHtmlEntities(match[1])
        const title = stripHtml(match[2])
        results.push({ title, url, snippet: '' })
    }

    return results
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function decodeHtmlEntities(text: string): string {
    return text.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/')
}
