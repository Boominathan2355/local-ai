import React from 'react'

interface ToolCallCardProps {
    toolName: string
    args: Record<string, any>
    result?: string
    error?: string
    status: 'calling' | 'success' | 'error'
    durationMs?: number
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
    toolName,
    args,
    result,
    error,
    status,
    durationMs
}) => {
    return (
        <div className={`mcp-tool-card status-${status} text-sm my-2 p-3 rounded-md border bg-opacity-10 dark:bg-opacity-10`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                        {status === 'calling' && '🔄 '}
                        {status === 'success' && '✅ '}
                        {status === 'error' && '❌ '}
                        Tool: {toolName}
                    </span>
                    {durationMs && (
                        <span className="text-xs text-gray-500">
                            ({(durationMs / 1000).toFixed(1)}s)
                        </span>
                    )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${status === 'calling' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                        status === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                    {status.toUpperCase()}
                </span>
            </div>

            <div className="space-y-2 mt-2">
                <div className="bg-gray-50 dark:bg-[#1a1b26] p-2 rounded text-xs font-mono overflow-x-auto">
                    <div className="text-gray-500 mb-1 select-none">Args:</div>
                    <pre className="text-gray-800 dark:text-gray-300">
                        {JSON.stringify(args, null, 2)}
                    </pre>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-xs text-red-600 dark:text-red-400">
                        <div className="font-semibold mb-1">Error:</div>
                        <div className="whitespace-pre-wrap">{error}</div>
                    </div>
                )}

                {result && status === 'success' && toolName !== 'run_command' && (
                    <div className="bg-gray-50 dark:bg-[#1a1b26] p-2 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto">
                        <div className="text-gray-500 mb-1 select-none">Result:</div>
                        <div className="text-gray-800 dark:text-gray-300 whitespace-pre-wrap font-mono">
                            {result}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
