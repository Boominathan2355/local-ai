import https from 'https';
import { URL } from 'url';

export interface CloudChatOptions {
    apiKey: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
    stream: boolean;
}

export class CloudModelService {
    /**
     * Streams completions from OpenAI-compatible APIs.
     */
    async streamOpenAI(options: CloudChatOptions, onToken: (token: string) => void, signal: AbortSignal): Promise<string> {
        return this.streamHttpsRequest({
            url: 'https://api.openai.com/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${options.apiKey}`
            },
            body: {
                model: options.model,
                messages: options.messages,
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
        return this.streamHttpsRequest({
            url: 'https://api.anthropic.com/v1/messages',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': options.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: {
                model: options.model,
                messages: options.messages.filter(m => m.role !== 'system'),
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

        return this.streamHttpsRequest({
            url,
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                contents: options.messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                })),
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
