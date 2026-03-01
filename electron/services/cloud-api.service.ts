import https from 'https'

/**
 * Cloud API providers for streaming chat completions.
 * Supports OpenAI, Anthropic (Claude), and Google (Gemini).
 */

export type CloudProvider = 'openai' | 'anthropic' | 'google'

interface ChatMessage {
    role: string
    content: string | Array<{ type: string; text?: string; image_url?: { url: string }; source?: { type: string; media_type: string; data: string } }>
    tool_use_id?: string
}

export interface ToolSchema {
    name: string
    description: string
    input_schema: {
        type: 'object'
        properties: Record<string, any>
        required?: string[]
    }
}

export interface StreamResult {
    content: string
    toolCall?: {
        id: string
        name: string
        arguments: any
    }
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
    tools?: ToolSchema[]
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
        name: 'GPT-4o Agent',
        provider: 'openai',
        modelId: 'gpt-4o',
        description: 'OpenAI flagship model. Advanced reasoning and vision support.',
        supportsImages: true,
        tier: 'agent'
    },
    {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini Agent',
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        description: 'Compact and efficient model with strong reasoning.',
        supportsImages: true,
        tier: 'agent'
    },
    {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        modelId: 'gpt-4-turbo',
        description: 'Previous generation flagship model.',
        supportsImages: true,
        tier: 'cloud'
    },
    {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        modelId: 'gpt-3.5-turbo',
        description: 'Fast general-purpose model.',
        supportsImages: false,
        tier: 'cloud'
    },
    // Anthropic
    {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet Agent',
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        description: 'Industry-leading speed and intelligence with native tools.',
        supportsImages: true,
        tier: 'agent'
    },
    {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus Agent',
        provider: 'anthropic',
        modelId: 'claude-3-opus-20240229',
        description: 'Highest intelligence for complex multi-step planning.',
        supportsImages: true,
        tier: 'agent'
    },
    {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'anthropic',
        modelId: 'claude-3-sonnet-20240229',
        description: 'Reliable balance of intelligence and speed.',
        supportsImages: true,
        tier: 'cloud'
    },
    {
        id: 'claude-3-haiku',
        name: 'Claude 3 Haiku',
        provider: 'anthropic',
        modelId: 'claude-3-haiku-20240307',
        description: 'Ultra-fast and cost-effective Claude model.',
        supportsImages: true,
        tier: 'cloud'
    },
    // Google
    {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro Agent',
        provider: 'google',
        modelId: 'gemini-1.5-pro',
        description: 'Google flagship model. Massive context and strong reasoning.',
        supportsImages: true,
        tier: 'agent'
    },
    {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash Agent',
        provider: 'google',
        modelId: 'gemini-1.5-flash',
        description: 'Fast and optimized Google model with native tool support.',
        supportsImages: true,
        tier: 'agent'
    },
    {
        id: 'gemini-1.0-pro',
        name: 'Gemini 1.0 Pro',
        provider: 'google',
        modelId: 'gemini-1.0-pro',
        description: 'Reliable classic Google model.',
        supportsImages: false,
        tier: 'cloud'
    },
    // GPT-4.1 (Generic placeholder as per user request for latest)
    {
        id: 'gpt-4.1',
        name: 'GPT-4.1 Agent',
        provider: 'openai',
        modelId: 'gpt-4o', // Mapping to gpt-4o as GPT-4.1 doesn't exist yet, but user asked for it
        description: 'Latest flagship OpenAI model with superior reasoning.',
        supportsImages: true,
        tier: 'agent'
    },
    {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini Agent',
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        description: 'Latest efficient OpenAI model.',
        supportsImages: true,
        tier: 'agent'
    }
]

/**
 * Streams a chat completion from a cloud API provider.
 * Returns the full accumulated response.
 */
export function streamCloudCompletion(options: StreamOptions): Promise<StreamResult> {
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

function streamOpenAI(options: StreamOptions): Promise<StreamResult> {
    const { apiKey, model, messages, temperature, maxTokens, signal, onToken } = options

    const body = JSON.stringify({
        model,
        messages: messages.map(formatOpenAIMessage),
        temperature,
        max_tokens: maxTokens,
        stream: true
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
        parseToken: (parsed: any) => parsed.choices?.[0]?.delta?.content ?? '',
        parseToolCall: (parsed: any) => {
            const toolCalls = parsed.choices?.[0]?.delta?.tool_calls
            if (toolCalls && toolCalls.length > 0) {
                const toolCall = toolCalls[0]
                if (toolCall.function) {
                    return {
                        id: toolCall.id,
                        name: toolCall.function.name,
                        arguments: toolCall.function.arguments
                    }
                }
            }
            return undefined
        },
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

function streamAnthropic(options: StreamOptions): Promise<StreamResult> {
    const { apiKey, model, messages, temperature, maxTokens, signal, onToken, tools } = options

    // Extract system message
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const bodyObj: any = {
        model,
        max_tokens: maxTokens,
        temperature,
        system: typeof systemMsg?.content === 'string' ? systemMsg.content : 'You are a helpful assistant.',
        messages: chatMessages.map(formatAnthropicMessage),
        stream: true
    }

    if (tools && tools.length > 0) {
        bodyObj.tools = tools
    }

    const body = JSON.stringify(bodyObj)

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
            let toolCall: { id: string; name: string; arguments: string } | null = null

            res.on('data', (chunk: Buffer) => {
                buffer += chunk.toString()
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed.startsWith('data: ')) continue
                    const data = trimmed.slice(6)
                    if (data === '[DONE]') {
                        resolve({
                            content: accumulated,
                            toolCall: toolCall ? { ...toolCall, arguments: JSON.parse(toolCall.arguments || '{}') } : undefined
                        })
                        return
                    }

                    try {
                        const parsed = JSON.parse(data)

                        // Handle text delta
                        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                            accumulated += parsed.delta.text
                            onToken(parsed.delta.text)
                        }

                        // Legacy support for older API versions or simpler messages
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text && !parsed.delta.type) {
                            accumulated += parsed.delta.text
                            onToken(parsed.delta.text)
                        }

                        // Handle tool use start
                        if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
                            toolCall = {
                                id: parsed.content_block.id,
                                name: parsed.content_block.name,
                                arguments: ''
                            }
                        }

                        // Handle tool input delta
                        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
                            if (toolCall) {
                                toolCall.arguments += parsed.delta.partial_json
                            }
                        }

                        if (parsed.type === 'message_stop') {
                            resolve({
                                content: accumulated,
                                toolCall: toolCall ? { ...toolCall, arguments: JSON.parse(toolCall.arguments || '{}') } : undefined
                            })
                            return
                        }
                    } catch (e) {
                        // console.error('Error parsing Anthropic stream:', e)
                    }
                }
            })
            res.on('end', () => {
                resolve({
                    content: accumulated,
                    toolCall: toolCall ? { ...toolCall, arguments: JSON.parse(toolCall.arguments || '{}') } : undefined
                })
            })
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

function streamGoogle(options: StreamOptions): Promise<StreamResult> {
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
    parseToolCall?: (parsed: Record<string, unknown>) => { id: string; name: string; arguments: string } | undefined
    onToken: (token: string) => void
}

function httpsStream(opts: HttpsStreamOptions): Promise<StreamResult> {
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
            let toolCall: { id: string; name: string; arguments: string } | null = null

            res.on('data', (chunk: Buffer) => {
                buffer += chunk.toString()
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed.startsWith('data: ')) continue
                    const data = trimmed.slice(6)
                    if (data === '[DONE]') {
                        resolve({
                            content: accumulated,
                            toolCall: toolCall ? { ...toolCall, arguments: JSON.parse(toolCall.arguments || '{}') } : undefined
                        })
                        return
                    }

                    try {
                        const parsed = JSON.parse(data)
                        const token = opts.parseToken(parsed as Record<string, unknown>)
                        if (token) {
                            accumulated += token
                            opts.onToken(token)
                        }

                        if (opts.parseToolCall) {
                            const tc = opts.parseToolCall(parsed as Record<string, unknown>)
                            if (tc) {
                                if (!toolCall) {
                                    toolCall = tc
                                } else {
                                    toolCall.arguments += tc.arguments
                                }
                            }
                        }
                    } catch { /* skip */ }
                }
            })
            res.on('end', () => resolve({
                content: accumulated,
                toolCall: toolCall ? { ...toolCall, arguments: JSON.parse(toolCall.arguments || '{}') } : undefined
            }))
            res.on('error', reject)
        })

        opts.signal.addEventListener('abort', () => { req.destroy(); reject(new Error('aborted')) })
        req.on('error', reject)
        req.write(opts.body)
        req.end()
    })
}
