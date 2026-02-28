/**
 * Estimates token count from text using ~4 characters per token approximation.
 */
export function estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4)
}

/**
 * Checks if a message fits within the remaining token budget.
 */
export function fitsInBudget(text: string, currentTokens: number, maxTokens: number): boolean {
    return currentTokens + estimateTokenCount(text) <= maxTokens
}
