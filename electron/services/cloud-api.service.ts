import https from 'https'

/**
 * Cloud API providers for streaming chat completions.
 * Supports OpenAI, Anthropic (Claude), and Google (Gemini).
 */

export type CloudProvider = 'openai' | 'anthropic' | 'google'

interface ChatMessage {
    role: string
    content: string | Array<{ type: string; text?: string; image_url?: { url: string }; source?: { type: string; media_type: string; data: string } }>
}

interface StreamOptions {
    provider: CloudProvider
    apiKey: string
    model: string
    messages: ChatMessage[]
    temperature: number
    maxTokens: number
    signal: AbortSignal
    onToken: (token: string) => void
}

/** Cloud model definitions */
export interface CloudModel {
    id: string
    name: string
    provider: CloudProvider
    modelId: string
    description: string
    supportsImages: boolean
    tier: string
}

export const CLOUD_MODELS: CloudModel[] = [
    // OpenAI
    {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        modelId: 'gpt-4o',
        description: 'Most capable OpenAI model with vision support',
        supportsImages: true,
        tier: 'cloud'
    },
    {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        description: 'Fast and affordable with vision support',
        supportsImages: true,
        tier: 'cloud'
    },
    {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        modelId: 'gpt-3.5-turbo',
        description: 'Fast general-purpose text model',
        supportsImages: false,
        tier: 'cloud'
    },
    // Anthropic
    {
        id: 'claude-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        description: 'Best balance of intelligence and speed with vision',
        supportsImages: true,
        tier: 'cloud'
    },
    {
        id: 'claude-haiku',
        name: 'Claude 3.5 Haiku',
        provider: 'anthropic',
        modelId: 'claude-3-5-haiku-20241022',
        description: 'Fast and compact Claude model',
        supportsImages: false,
        tier: 'cloud'
    },
    // Google
    {
        id: 'gemini-pro',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        modelId: 'gemini-2.0-flash',
        description: 'Google multimodal model with vision',
        supportsImages: true,
        tier: 'cloud'
    },
    {
        id: 'gemini-flash-lite',
        name: 'Gemini 2.0 Flash Lite',
        provider: 'google',
        modelId: 'gemini-2.0-flash-lite',
        description: 'Lightweight Google model for quick tasks',
        supportsImages: true,
        tier: 'cloud'
    },
    // Agent
    {
        id: 'claude-agent',
        name: 'Claude 3.5 Sonnet (Agent)',
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        description: 'Advanced Claude model configured for autonomous task execution with MCP tools.',
        supportsImages: true,
        tier: 'agent'
    }
]

/**
 * Streams a chat completion from a cloud API provider.
 * Returns the full accumulated response.
 */
export function streamCloudCompletion(options: StreamOptions): Promise<string> {
    const { provider } = options
    switch (provider) {
        case 'openai': return streamOpenAI(options)
        case 'anthropic': return streamAnthropic(options)
        case 'google': return streamGoogle(options)
        default: return Promise.reject(new Error(`Unknown provider: ${provider}`))
    }
}

/** Checks if a model ID belongs to a cloud model */
export function getCloudModel(modelId: string): CloudModel | undefined {
    return CLOUD_MODELS.find((m) => m.id === modelId)
}

// ─── OpenAI ───────────────────────────────────────

function streamOpenAI(options: StreamOptions): Promise<string> {
    const { apiKey, model, messages, temperature, maxTokens, signal, onToken } = options

    const body = JSON.stringify({
        model,
        messages: messages.map(formatOpenAIMessage),
        stream: true,
        temperature,
        max_tokens: maxTokens
    })

    return httpsStream({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body,
        signal,
        parseToken: (parsed) => (parsed as any).choices?.[0]?.delta?.content ?? '',
        onToken
    })
}

function formatOpenAIMessage(msg: ChatMessage): unknown {
    if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content }
    }
    // Multimodal
    return {
        role: msg.role,
        content: msg.content.map((part) => {
            if (part.type === 'text') return { type: 'text', text: part.text }
            if (part.type === 'image_url') return { type: 'image_url', image_url: part.image_url }
            return part
        })
    }
}

// ─── Anthropic (Claude) ──────────────────────────

function streamAnthropic(options: StreamOptions): Promise<string> {
    const { apiKey, model, messages, temperature, maxTokens, signal, onToken } = options

    // Extract system message
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const body = JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: typeof systemMsg?.content === 'string' ? systemMsg.content : 'You are a helpful assistant.',
        messages: chatMessages.map(formatAnthropicMessage),
        stream: true
    })

    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new Error('aborted')); return }

        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        }, (res) => {
            let accumulated = ''
            let buffer = ''

            res.on('data', (chunk: Buffer) => {
                buffer += chunk.toString()
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed.startsWith('data: ')) continue
                    const data = trimmed.slice(6)
                    if (data === '[DONE]') { resolve(accumulated); return }

                    try {
                        const parsed = JSON.parse(data)
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            accumulated += parsed.delta.text
                            onToken(parsed.delta.text)
                        }
                        if (parsed.type === 'message_stop') {
                            resolve(accumulated)
                            return
                        }
                    } catch { /* skip */ }
                }
            })
            res.on('end', () => resolve(accumulated))
            res.on('error', reject)
        })

        signal.addEventListener('abort', () => { req.destroy(); reject(new Error('aborted')) })
        req.on('error', reject)
        req.write(body)
        req.end()
    })
}

function formatAnthropicMessage(msg: ChatMessage): unknown {
    if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content }
    }
    return {
        role: msg.role,
        content: msg.content.map((part) => {
            if (part.type === 'text') return { type: 'text', text: part.text }
            if (part.source) return { type: 'image', source: part.source }
            // Convert OpenAI-style image_url to Anthropic format
            if (part.type === 'image_url' && part.image_url?.url) {
                const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)/)
                if (match) {
                    return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }
                }
            }
            return part
        })
    }
}

// ─── Google (Gemini) ─────────────────────────────

function streamGoogle(options: StreamOptions): Promise<string> {
    const { apiKey, model, messages, temperature, maxTokens, signal, onToken } = options

    // Convert to Gemini format
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const contents = chatMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: formatGeminiParts(msg.content)
    }))

    const body = JSON.stringify({
        contents,
        systemInstruction: systemMsg ? { parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : '' }] } : undefined,
        generationConfig: { temperature, maxOutputTokens: maxTokens }
    })

    const path = `/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`

    return httpsStream({
        hostname: 'generativelanguage.googleapis.com',
        path,
        headers: { 'Content-Type': 'application/json' },
        body,
        signal,
        parseToken: (parsed) => {
            const parts = (parsed as any).candidates?.[0]?.content?.parts
            if (parts && parts.length > 0) return parts[0].text ?? ''
            return ''
        },
        onToken
    })
}

function formatGeminiParts(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): unknown[] {
    if (typeof content === 'string') return [{ text: content }]
    return content.map((part) => {
        if (part.type === 'text') return { text: part.text }
        if (part.type === 'image_url' && part.image_url?.url) {
            const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)/)
            if (match) {
                return { inlineData: { mimeType: match[1], data: match[2] } }
            }
        }
        return { text: '' }
    })
}

// ─── Shared HTTPS SSE helper ─────────────────────

interface HttpsStreamOptions {
    hostname: string
    path: string
    headers: Record<string, string>
    body: string
    signal: AbortSignal
    parseToken: (parsed: Record<string, unknown>) => string
    onToken: (token: string) => void
}

function httpsStream(opts: HttpsStreamOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        if (opts.signal.aborted) { reject(new Error('aborted')); return }

        const req = https.request({
            hostname: opts.hostname,
            path: opts.path,
            method: 'POST',
            headers: {
                ...opts.headers,
                'Content-Length': Buffer.byteLength(opts.body).toString()
            }
        }, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                let errorBody = ''
                res.on('data', (c: Buffer) => { errorBody += c.toString() })
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(errorBody)
                        reject(new Error(parsed.error?.message ?? `API error ${res.statusCode}`))
                    } catch {
                        reject(new Error(`API error ${res.statusCode}: ${errorBody.slice(0, 200)}`))
                    }
                })
                return
            }

            let accumulated = ''
            let buffer = ''

            res.on('data', (chunk: Buffer) => {
                buffer += chunk.toString()
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed.startsWith('data: ')) continue
                    const data = trimmed.slice(6)
                    if (data === '[DONE]') { resolve(accumulated); return }

                    try {
                        const parsed = JSON.parse(data)
                        const token = opts.parseToken(parsed as Record<string, unknown>)
                        if (token) {
                            accumulated += token
                            opts.onToken(token)
                        }
                    } catch { /* skip */ }
                }
            })
            res.on('end', () => resolve(accumulated))
            res.on('error', reject)
        })

        opts.signal.addEventListener('abort', () => { req.destroy(); reject(new Error('aborted')) })
        req.on('error', reject)
        req.write(opts.body)
        req.end()
    })
}
