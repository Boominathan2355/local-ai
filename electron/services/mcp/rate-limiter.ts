export interface RateLimitResult {
    allowed: boolean;
    retryAfterMs?: number;
    reason?: string;
}

export interface RateLimiterConfig {
    windowMs: number;          // Time window in milliseconds
    maxCallsPerWindow: number; // Max total calls allowed in window
    maxPerToolName: number;    // Max calls allowed for a specific tool in window
}

interface CallRecord {
    timestamp: number;
    toolName: string;
}

export class RateLimiter {
    private config: RateLimiterConfig;
    private callLog: CallRecord[] = [];

    constructor(config: Partial<RateLimiterConfig> = {}) {
        this.config = {
            windowMs: config.windowMs || 60_000,           // 1 minute default
            maxCallsPerWindow: config.maxCallsPerWindow || 30, // 30 calls min total default
            maxPerToolName: config.maxPerToolName || 10      // 10 calls per tool min default
        };
    }

    /**
     * Checks if a tool call is allowed within the rate limits.
     * Records the call if allowed.
     */
    canExecute(toolName: string): RateLimitResult {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        // Clean up old records outside the current window
        this.callLog = this.callLog.filter(record => record.timestamp > windowStart);

        // Check global limit
        if (this.callLog.length >= this.config.maxCallsPerWindow) {
            const oldestCall = this.callLog[0];
            const retryAfterMs = oldestCall.timestamp + this.config.windowMs - now;
            return {
                allowed: false,
                reason: `Global rate limit exceeded (${this.config.maxCallsPerWindow} calls per ${this.config.windowMs / 1000}s).`,
                retryAfterMs
            };
        }

        // Check per-tool limit
        const toolCalls = this.callLog.filter(record => record.toolName === toolName);
        if (toolCalls.length >= this.config.maxPerToolName) {
            const oldestToolCall = toolCalls[0];
            const retryAfterMs = oldestToolCall.timestamp + this.config.windowMs - now;
            return {
                allowed: false,
                reason: `Rate limit for tool '${toolName}' exceeded (${this.config.maxPerToolName} calls per ${this.config.windowMs / 1000}s).`,
                retryAfterMs
            };
        }

        // Action is allowed, record the timestamp
        this.callLog.push({ timestamp: now, toolName });
        return { allowed: true };
    }

    /**
     * Updates the rate limiter configuration dynamically
     */
    updateConfig(newConfig: Partial<RateLimiterConfig>) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * For testing/debugging purposes
     */
    getStats() {
        return {
            currentWindowCalls: this.callLog.length,
            limit: this.config.maxCallsPerWindow
        };
    }
}
