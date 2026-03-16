import React from 'react'
import { Check, X, AlertTriangle } from 'lucide-react'
import { ToolPermissionRequest } from '../../../src/types/mcp.types'

interface ToolPermissionCardProps {
    request: ToolPermissionRequest
    onResponse: (requestId: string, approved: boolean, always?: boolean) => void
}

export const ToolPermissionCard: React.FC<ToolPermissionCardProps> = ({ request, onResponse }) => {
    const isSandboxRequest = request.type === 'sandbox_add'

    const title = isSandboxRequest
        ? '📁 Add Folder to Sandbox?'
        : 'Tool Permission Required'

    const description = isSandboxRequest
        ? request.warningMessage || `Allow access to "${request.sandboxPath}"?`
        : (
            <>
                The AI agent wants to execute <span className="font-semibold text-blue-600 dark:text-blue-400">{request.toolName}</span>
                which requires <span className="font-semibold uppercase px-1 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">{request.permissionLevel}</span> access.
            </>
        )

    return (
        <div className="mcp-permission-card my-4 p-4 border-2 border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-900/20 shadow-md">
            <div className="flex items-start space-x-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 mt-1 flex-shrink-0" />
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                        {title}
                    </h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                        {description}
                    </p>

                    {request.warningMessage && !isSandboxRequest && (
                        <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm rounded border border-red-200 dark:border-red-800">
                            <strong>Warning:</strong> {request.warningMessage}
                        </div>
                    )}

                    {!isSandboxRequest && (
                        <div className="mt-3 bg-white dark:bg-[#1a1b26] p-3 rounded text-xs font-mono border border-gray-200 dark:border-gray-700 overflow-x-auto">
                            <div className="text-gray-500 mb-1 select-none font-sans font-semibold">Arguments:</div>
                            <pre className="text-gray-800 dark:text-gray-300">
                                {JSON.stringify(request.args, null, 2)}
                            </pre>
                        </div>
                    )}

                    <div className="mt-4 flex flex-col sm:flex-row gap-3">
                        {isSandboxRequest ? (
                            <>
                                <button
                                    onClick={() => onResponse(request.requestId, true)}
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded flex items-center justify-center space-x-2 transition-colors focus:ring-2 focus:ring-green-500 focus:outline-none"
                                >
                                    <Check className="w-4 h-4" />
                                    <span>Allow & Remember</span>
                                </button>
                                <button
                                    onClick={() => onResponse(request.requestId, false)}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded flex items-center justify-center space-x-2 transition-colors focus:ring-2 focus:ring-red-500 focus:outline-none"
                                >
                                    <X className="w-4 h-4" />
                                    <span>Deny</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => onResponse(request.requestId, true, false)}
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded flex items-center justify-center space-x-2 transition-colors focus:ring-2 focus:ring-green-500 focus:outline-none"
                                >
                                    <Check className="w-4 h-4" />
                                    <span>Allow Once</span>
                                </button>
                                <button
                                    onClick={() => onResponse(request.requestId, true, true)}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded flex items-center justify-center space-x-2 transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                >
                                    <Check className="w-4 h-4" />
                                    <span>Allow Always</span>
                                </button>
                                <button
                                    onClick={() => onResponse(request.requestId, false)}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded flex items-center justify-center space-x-2 transition-colors focus:ring-2 focus:ring-red-500 focus:outline-none"
                                >
                                    <X className="w-4 h-4" />
                                    <span>Deny</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
