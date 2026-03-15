export interface ParsedModelOutput {
    content: string
    reasoningContent?: string
    isThinking: boolean
}

export type MCPContentSegment =
    | { type: 'text'; content: string }
    | { type: 'tool_call'; toolName: string; args: Record<string, any>; raw: string }
    | { type: 'tool_result'; toolName: string; content: string; success: boolean }

/**
 * Parses the raw text output from a model to extract content within <think> or [THOUGHT] tags.
 * Iteratively collects all distinct reasoning blocks and merges them.
 * 
 * @param text The raw output from the language model
 * @returns ParsedModelOutput 
 */
export function parseThinkingProcess(text: string): ParsedModelOutput {
    if (!text) {
        return { content: '', isThinking: false }
    }

    const TAG_PAIRS = [
        { start: /<think>/i, end: /<\/think>/i, implicitEnds: [] },
        { start: /\[THOUGHT\]/i, end: /\[\/THOUGHT\]/i, implicitEnds: [/\[FINAL\]/i, /\[ANSWER\]/i] }
    ]

    let totalReasoning = ''
    let finalContent = ''
    let remainingText = text
    let isCurrentlyThinking = false

    while (remainingText.length > 0) {
        let earliestMatch: { startIdx: number, pairIdx: number, matchText: string } | null = null

        // Find the earliest starting tag in the remaining text
        for (let i = 0; i < TAG_PAIRS.length; i++) {
            const match = remainingText.match(TAG_PAIRS[i].start)
            if (match && match.index !== undefined) {
                if (!earliestMatch || match.index < earliestMatch.startIdx) {
                    earliestMatch = { startIdx: match.index, pairIdx: i, matchText: match[0] }
                }
            }
        }

        if (!earliestMatch) {
            // No more reasoning blocks found
            finalContent += remainingText
            break
        }

        // Add everything before the start tag to the final content
        finalContent += remainingText.substring(0, earliestMatch.startIdx)

        const pair = TAG_PAIRS[earliestMatch.pairIdx]
        const startTagLength = earliestMatch.matchText.length
        const startTagEndIdx = earliestMatch.startIdx + startTagLength

        // Search for the end tag in the rest of the text
        const searchSpace = remainingText.substring(startTagEndIdx)
        const explicitEndMatch = searchSpace.match(pair.end)

        let endRelIdx = -1
        let endTagLength = 0

        if (explicitEndMatch && explicitEndMatch.index !== undefined) {
            endRelIdx = explicitEndMatch.index
            endTagLength = explicitEndMatch[0].length
        } else {
            // Check for implicit ends if no explicit end found
            for (const implicitRegex of pair.implicitEnds) {
                const implicitMatch = searchSpace.match(implicitRegex)
                if (implicitMatch && implicitMatch.index !== undefined) {
                    if (endRelIdx === -1 || implicitMatch.index < endRelIdx) {
                        endRelIdx = implicitMatch.index
                        endTagLength = implicitMatch[0].length // Now stripping the implicit tag too
                    }
                }
            }
        }

        if (endRelIdx === -1) {
            // No end tag found - this block is still "thinking" (possibly streaming)
            const reasoning = searchSpace
            totalReasoning += (totalReasoning ? '\n\n' : '') + reasoning.trim()
            isCurrentlyThinking = true
            remainingText = '' // Consume the rest of the text
        } else {
            // Found an end tag
            const reasoning = searchSpace.substring(0, endRelIdx)
            totalReasoning += (totalReasoning ? '\n\n' : '') + reasoning.trim()

            // Advance remainingText past the reasoning and the end tag
            remainingText = searchSpace.substring(endRelIdx + endTagLength)
        }
    }

    return {
        content: finalContent.trim(),
        reasoningContent: totalReasoning.trim(),
        isThinking: isCurrentlyThinking
    }
}

/**
 * Splits content into text segments and tool call segments.
 * Pattern: <tool_call>NAME|{JSON}</tool_call>
 */
export function parseMCPContent(text: string): MCPContentSegment[] {
    if (!text) return []

    // 1. Detect Tool Results (usually in user role messages but can be in stream)
    const toolResultRegex = /^\[TOOL_RESULT: ([^\]]+)\]\n([\s\S]*)$/
    const resultMatch = text.match(toolResultRegex)
    if (resultMatch) {
        const toolName = resultMatch[1]
        const content = resultMatch[2]
        const isSuccess = !content.startsWith('Error:')
        return [{
            type: 'tool_result',
            toolName,
            content: isSuccess ? content.replace(/^Success: true\nContent: /, '') : content,
            success: isSuccess
        }]
    }

    // 2. Detect Tool Calls in assistant output
    const segments: MCPContentSegment[] = []
    const toolCallRegex = /<tool_call>([^|]+)\|([^<]+)<\/tool_call>/g

    let lastIndex = 0
    let match

    while ((match = toolCallRegex.exec(text)) !== null) {
        // Add text before the tool call
        const textBefore = text.substring(lastIndex, match.index)
        if (textBefore.trim()) {
            segments.push({ type: 'text', content: textBefore })
        }

        const toolName = match[1]
        const argsStr = match[2]
        let args = {}
        try {
            args = JSON.parse(argsStr)
        } catch (e) {
            console.error('Failed to parse tool arguments:', argsStr)
        }

        segments.push({
            type: 'tool_call',
            toolName,
            args,
            raw: match[0]
        })

        lastIndex = toolCallRegex.lastIndex
    }

    // Add remaining text
    const remainingText = text.substring(lastIndex)
    if (remainingText.trim()) {
        segments.push({ type: 'text', content: remainingText })
    }

    return segments
}
