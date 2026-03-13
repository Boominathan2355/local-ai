export interface ParsedModelOutput {
    content: string
    reasoningContent?: string
    isThinking: boolean
}

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
