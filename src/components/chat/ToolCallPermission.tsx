import React from 'react'
import { Check, X, Terminal, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'

interface ToolCallPermissionProps {
    toolName: string
    args: any
    tier?: 'safe' | 'restricted' | 'dangerous'
    onAllow: (always?: boolean) => void
    onDeny: () => void
}

export const ToolCallPermission: React.FC<ToolCallPermissionProps> = ({
    toolName,
    args,
    tier = 'restricted',
    onAllow,
    onDeny
}) => {
    const getTierConfig = () => {
        switch (tier) {
            case 'safe':
                return {
                    icon: <ShieldCheck size={16} className="tier-icon--safe" />,
                    label: 'Safe Tier',
                    color: '#10b981',
                    description: 'This tool is generally safe to run.'
                }
            case 'dangerous':
                return {
                    icon: <ShieldAlert size={16} className="tier-icon--dangerous" />,
                    label: 'Dangerous Tier',
                    color: '#ef4444',
                    description: 'This tool can modify system state or processes. Use with caution.'
                }
            default:
                return {
                    icon: <Shield size={16} className="tier-icon--restricted" />,
                    label: 'Restricted Tier',
                    color: '#f59e0b',
                    description: 'This tool requires elevated permissions.'
                }
        }
    }

    const tierConfig = getTierConfig()

    return (
        <div className={`tool-permission tool-permission--${tier}`}>
            <div className="tool-permission__header">
                <Terminal size={16} />
                <span className="tool-permission__title">Permission Requested</span>
                <div className="tool-permission__tier" style={{ color: tierConfig.color }}>
                    {tierConfig.icon}
                    <span>{tierConfig.label}</span>
                </div>
            </div>
            <div className="tool-permission__body">
                <p className="tool-permission__text">
                    The AI wants to use the tool: <strong>{toolName}</strong>
                </p>
                <div className="tool-permission__tier-desc">
                    {tierConfig.description}
                </div>
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
                <div className="tool-permission__allow-group">
                    <button
                        className="tool-permission__btn tool-permission__btn--allow"
                        onClick={() => onAllow(false)}
                    >
                        <Check size={14} />
                        Allow Once
                    </button>
                    {tier !== 'dangerous' && (
                        <button
                            className="tool-permission__btn tool-permission__btn--always"
                            onClick={() => onAllow(true)}
                        >
                            <Check size={14} className="double-check" />
                            Allow Always
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
