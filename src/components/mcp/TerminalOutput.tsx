import React from 'react'

interface TerminalOutputProps {
    command: string
    output: string
    durationMs?: number
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({ command, output, durationMs }) => {
    return (
        <div className="mcp-terminal-output my-3 rounded-md overflow-hidden border border-gray-700 font-mono text-sm shadow-md">
            <div className="bg-gray-800 text-gray-300 px-4 py-2 flex items-center justify-between text-xs border-b border-gray-700">
                <div className="flex items-center space-x-2">
                    <span className="text-green-400">~/terminal</span>
                    <span className="text-gray-500">$</span>
                    <span className="font-semibold">{command}</span>
                </div>
                {durationMs && (
                    <span className="text-gray-500">{durationMs}ms</span>
                )}
            </div>
            <div className="bg-gray-900 text-gray-100 p-4 overflow-x-auto max-h-64 overflow-y-auto w-full">
                <pre className="whitespace-pre-wrap leading-relaxed">
                    {output || 'Command executed successfully with no output.'}
                </pre>
            </div>
        </div>
    )
}
