import React, { useState } from 'react'
import { ToolChain } from '../../../src/types/mcp.types'
import { ChevronDown, ChevronRight, Link2, Check, AlertCircle, Clock } from 'lucide-react'

interface ToolChainViewProps {
    chain: ToolChain
}

export const ToolChainView: React.FC<ToolChainViewProps> = ({ chain }) => {
    const [isExpanded, setIsExpanded] = useState(false)

    if (!chain || chain.steps.length === 0) return null

    const successCount = chain.steps.filter(s => s.status === 'success').length
    const hasError = chain.steps.some(s => s.status === 'error')

    // Status text logic
    let summaryText = ''
    if (hasError) summaryText = `${successCount} out of ${chain.steps.length} successful (Error encountered)`
    else if (successCount === chain.steps.length) summaryText = `All ${chain.steps.length} steps successful`
    else summaryText = `${successCount} out of ${chain.steps.length} complete...`

    return (
        <div className="mcp-tool-chain my-3 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
                <div className="flex items-center space-x-2">
                    <Link2 className="w-4 h-4 text-blue-500" />
                    <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                        Tool Chain ({chain.steps.length} steps)
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 darker:bg-gray-700 text-gray-600 dark:text-gray-400 ml-2">
                        {summaryText}
                    </span>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="flex items-center text-xs text-gray-500 space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{(chain.totalDurationMs / 1000).toFixed(1)}s</span>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                </div>
            </button>

            {isExpanded && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                    {chain.steps.map((step, idx) => (
                        <div key={idx} className="flex items-start space-x-3 text-sm">
                            <div className="mt-0.5 flex-shrink-0">
                                {step.status === 'success' && <Check className="w-4 h-4 text-green-500" />}
                                {step.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                {step.status === 'running' && <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />}
                                {step.status === 'pending' && <span className="w-4 h-4 inline-block bg-gray-300 rounded-full" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">{step.toolName}</span>
                                    <span className="text-xs text-gray-500">{(step.durationMs / 1000).toFixed(1)}s</span>
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                    {step.resultSummary || 'Running...'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
