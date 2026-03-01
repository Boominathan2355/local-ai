import React from 'react'
import { Check, X, Terminal } from 'lucide-react'

interface ToolCallPermissionProps {
    toolName: string
    args: any
    onAllow: () => void
    onDeny: () => void
}

export const ToolCallPermission: React.FC<ToolCallPermissionProps> = ({
    toolName,
    args,
    onAllow,
    onDeny
}) => {
    return (
        <div className="tool-permission">
            <div className="tool-permission__header">
                <Terminal size={16} />
                <span className="tool-permission__title">Permission Requested</span>
            </div>
            <div className="tool-permission__body">
                <p className="tool-permission__text">
                    The AI wants to use the tool: <strong>{toolName}</strong>
                </p>
                <pre className="tool-permission__args">
                    {JSON.stringify(args, null, 2)}
                </pre>
            </div>
            <div className="tool-permission__actions">
                <button
                    className="tool-permission__btn tool-permission__btn--deny"
                    onClick={onDeny}
                >
                    <X size={14} />
                    Deny
                </button>
                <button
                    className="tool-permission__btn tool-permission__btn--allow"
                    onClick={onAllow}
                >
                    <Check size={14} />
                    Allow
                </button>
            </div>
        </div>
    )
}
