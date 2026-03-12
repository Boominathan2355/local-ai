import https from 'https';
import { URL } from 'url';

export interface CloudChatOptions {
    apiKey: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    images?: string[];
    temperature?: number;
    maxTokens?: number;
    stream: boolean;
}

export class CloudModelService {
    /**
     * Streams completions from OpenAI-compatible APIs.
     */
    async streamOpenAI(options: CloudChatOptions, onToken: (token: string) => void, signal: AbortSignal): Promise<string> {
        // Build multimodal messages: only the last user message gets the images
        const messages = this.buildOpenAIMessages(options.messages, options.images)

        return this.streamHttpsRequest({
            url: 'https://api.openai.com/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${options.apiKey}`
            },
            body: {
                model: options.model,
                messages,
                temperature: options.temperature,
                max_tokens: options.maxTokens,
                stream: true
            },
            onToken,
            signal,
            parser: (data: string) => {
                if (data === '[DONE]') return null;
                try {
                    const parsed = JSON.parse(data);
                    return parsed.choices?.[0]?.delta?.content || '';
                } catch {
                    return '';
                }
            }
        });
    }

    /**
     * Streams completions from Anthropic API.
     */
    async streamAnthropic(options: CloudChatOptions, onToken: (token: string) => void, signal: AbortSignal): Promise<string> {
        const messages = this.buildAnthropicMessages(options.messages, options.images)

        return this.streamHttpsRequest({
            url: 'https://api.anthropic.com/v1/messages',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': options.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: {
                model: options.model,
                messages: messages.filter(m => m.role !== 'system'),
                system: options.messages.find(m => m.role === 'system')?.content,
                max_tokens: options.maxTokens || 1024,
                temperature: options.temperature,
                stream: true
            },
            onToken,
            signal,
            parser: (data: string) => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'content_block_delta') {
                        return parsed.delta?.text || '';
                    }
                    return '';
                } catch {
                    return '';
                }
            }
        });
    }

    /**
     * Streams completions from Google Gemini API.
     */
    async streamGemini(options: CloudChatOptions, onToken: (token: string) => void, signal: AbortSignal): Promise<string> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?alt=sse&key=${options.apiKey}`;

        // Build Gemini contents with optional image support
        const contents = this.buildGeminiContents(options.messages, options.images)

        return this.streamHttpsRequest({
            url,
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                contents,
                generationConfig: {
                    temperature: options.temperature,
                    maxOutputTokens: options.maxTokens
                }
            },
            onToken,
            signal,
            parser: (data: string) => {
                try {
                    const parsed = JSON.parse(data);
                    return parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                } catch {
                    return '';
                }
            }
        });
    }

    // --- Multimodal helpers ---

    private buildOpenAIMessages(
        messages: Array<{ role: string; content: string }>,
        images?: string[]
    ): Array<{ role: string; content: any }> {
        if (!images || images.length === 0) return messages as any

        return messages.map((msg, i) => {
            // Attach images to the last user message
            if (msg.role === 'user' && i === messages.length - 1) {
                const parts: any[] = [{ type: 'text', text: msg.content }]
                for (const img of images) {
                    parts.push({ type: 'image_url', image_url: { url: img } })
                }
                return { role: 'user', content: parts }
            }
            return msg
        })
    }

    private buildAnthropicMessages(
        messages: Array<{ role: string; content: string }>,
        images?: string[]
    ): Array<{ role: string; content: any }> {
        if (!images || images.length === 0) return messages as any

        return messages.map((msg, i) => {
            if (msg.role === 'user' && i === messages.length - 1) {
                const parts: any[] = []
                for (const img of images) {
                    // Extract mime type and base64 data from data URL
                    const match = img.match(/^data:([^;]+);base64,(.+)$/)
                    if (match) {
                        parts.push({
                            type: 'image',
                            source: { type: 'base64', media_type: match[1], data: match[2] }
                        })
                    }
                }
                parts.push({ type: 'text', text: msg.content })
                return { role: 'user', content: parts }
            }
            return msg
        })
    }

    private buildGeminiContents(
        messages: Array<{ role: string; content: string }>,
        images?: string[]
    ): Array<{ role: string; parts: any[] }> {
        return messages
            .filter(m => m.role !== 'system')
            .map((msg, i, arr) => {
                const isLast = i === arr.length - 1
                const parts: any[] = []

                if (msg.role === 'user' && isLast && images && images.length > 0) {
                    for (const img of images) {
                        const match = img.match(/^data:([^;]+);base64,(.+)$/)
                        if (match) {
                            parts.push({
                                inline_data: { mime_type: match[1], data: match[2] }
                            })
                        }
                    }
                }
                parts.push({ text: msg.content })

                return {
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts
                }
            })
    }

    private async streamHttpsRequest(params: {
        url: string;
        headers: Record<string, string>;
        body: any;
        onToken: (token: string) => void;
        signal: AbortSignal;
        parser: (data: string) => string | null;
    }): Promise<string> {
        return new Promise((resolve, reject) => {
            if (params.signal.aborted) return reject(new Error('aborted'));

            const url = new URL(params.url);
            const body = JSON.stringify(params.body);

            const req = https.request({
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    ...params.headers,
                    'Content-Length': Buffer.byteLength(body)
                }
            }, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    let errorBody = '';
                    res.on('data', (chunk) => { errorBody += chunk; });
                    res.on('end', () => {
                        reject(new Error(`API Error: ${res.statusCode} - ${errorBody}`));
                    });
                    return;
                }

                let fullContent = '';
                let buffer = '';

                res.on('data', (chunk) => {
                    if (params.signal.aborted) return;

                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        let data = '';
                        if (trimmed.startsWith('data: ')) {
                            data = trimmed.slice(6);
                        } else if (trimmed.startsWith('event: ')) {
                            continue; // Skip event lines
                        } else {
                            // Some APIs might send JSON directly in SSE or slightly variation
                            data = trimmed;
                        }

                        if (data === '[DONE]') break;

                        const token = params.parser(data);
                        if (token !== null) {
                            fullContent += token;
                            params.onToken(token);
                        }
                    }
                });

                res.on('end', () => {
                    resolve(fullContent);
                });

                res.on('error', reject);
            });

            params.signal.addEventListener('abort', () => {
                req.destroy();
                reject(new Error('aborted'));
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
}
