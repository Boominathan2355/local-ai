export interface ParsedModelOutput {
    content: string
    reasoningContent?: string
    isThinking: boolean
}

/**
 * Parses the raw text output from a model to extract content within <think>...</think> tags.
 * Returns the separated reasoning content and the final response content.
 * 
 * @param text The raw output from the language model
 * @returns ParsedModelOutput containing content, optional reasoning, and thinking status
 */
export function parseThinkingProcess(text: string): ParsedModelOutput {
    if (!text) {
        return { content: '', isThinking: false }
    }

    const thinkStartMatch = text.match(/<think>/)

    // If no <think> wrapper exists, it's just regular content
    if (!thinkStartMatch || thinkStartMatch.index === undefined) {
        return { content: text, isThinking: false }
    }

    // Usually models only output one <think> block at the very beginning,
    // but we'll parse the last one in case there are multiple or it's malformed.
    const firstThinkStart = thinkStartMatch.index

    // Extract everything before the first <think> tag as standard content
    let content = text.substring(0, firstThinkStart)
    let reasoningContent = ''

    const thinkEndMatch = text.indexOf('</think>', firstThinkStart)
    const isThinking = thinkEndMatch === -1

    if (isThinking) {
        // Still thinking, take everything after <think>
        reasoningContent = text.substring(firstThinkStart + 7) // 7 is length of <think>
    } else {
        // Thinking is complete
        reasoningContent = text.substring(firstThinkStart + 7, thinkEndMatch)
        // Add anything after </think> back to the main content
        content += text.substring(thinkEndMatch + 8) // 8 is length of </think>
    }

    return {
        content: content.trim(),
        reasoningContent: reasoningContent.trim(),
        isThinking
    }
}
