import React, { useState } from 'react'
import {
    Search,
    Activity,
    X,
    Cpu,
    Shield,
    Info,
    CheckCircle2,
    Settings,
    Plus,
    Trash
} from 'lucide-react'
import { AppSettings } from '../../types/settings.types'

interface MCPTool {
    id: string
    name: string
    description: string
    icon: React.ReactNode
    status: 'enabled' | 'disabled'
}

interface MCPManagerProps {
    isOpen: boolean
    onClose: () => void
    settings: AppSettings
    onUpdateSettings: (changes: Partial<AppSettings>) => void
}

export const MCPManager: React.FC<MCPManagerProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
    const [activeTab, setActiveTab] = useState<'catalog' | 'logs' | 'config'>('catalog')
    const [newPath, setNewPath] = useState('')

    const tools: MCPTool[] = [
        {
            id: 'web_search',
            name: 'Web Search',
            description: 'Access real-time web results via Serper or Tavily APIs. Always enabled.',
            icon: <Search size={20} />,
            status: 'enabled'
        }
    ]

    const handleAddPath = () => {
        if (!newPath.trim()) return
        const paths = settings.mcpAllowedPaths || []
        if (!paths.includes(newPath.trim())) {
            onUpdateSettings({ mcpAllowedPaths: [...paths, newPath.trim()] })
        }
        setNewPath('')
    }

    const handleRemovePath = (pathToRemove: string) => {
        const paths = settings.mcpAllowedPaths || []
        onUpdateSettings({ mcpAllowedPaths: paths.filter(p => p !== pathToRemove) })
    }

    if (!isOpen) return null

    return (
        <div className="settings-overlay" id="mcp-manager">
            <div className="settings-full-container">
                <header className="settings-top-nav">
                    <div className="settings-top-nav__left">
                        <div className="settings-top-nav__logo" style={{ background: 'var(--accent-primary)' }}>
                            <Cpu size={18} color="#fff" />
                        </div>
                        <span className="settings-top-nav__brand">MCP Tool Center</span>
                    </div>
                    <div className="settings-top-nav__right">
                        <button className="settings-top-nav__icon-btn settings-top-nav__close" onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>
                </header>

                <div className="settings-body">
                    <aside className="settings-sidebar">
                        <nav className="settings-sidebar__nav">
                            <button
                                className={`settings-nav-item ${activeTab === 'catalog' ? 'active' : ''}`}
                                onClick={() => setActiveTab('catalog')}
                            >
                                <span className="settings-nav-icon"><Cpu size={16} /></span>
                                <span>Tool Catalog</span>
                            </button>
                            <button
                                className={`settings-nav-item ${activeTab === 'config' ? 'active' : ''}`}
                                onClick={() => setActiveTab('config')}
                            >
                                <span className="settings-nav-icon"><Settings size={16} /></span>
                                <span>Configuration</span>
                            </button>
                        </nav>

                        <div className="settings-sidebar__footer">
                            <div className="settings-usage-card" style={{ border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                <div className="settings-usage-info">
                                    <div className="settings-usage-title">Agent Mode</div>
                                    <div className="settings-usage-subtitle">Tools are used autonomously by the Agent.</div>
                                </div>
                            </div>
                        </div>
                    </aside>

                    <main className="settings-main">
                        <div className="settings-main__content">
                            {activeTab === 'catalog' ? (
                                <div className="settings-section">
                                    <div className="settings-section__header">
                                        <h3 className="settings-section__title">Available MCP Tools</h3>
                                        <p className="settings-section__subtitle">Manage the capabilities available to your AI agent during autonomous tasks.</p>
                                    </div>

                                    <div className="settings-divider" />

                                    <div className="mcp-grid">
                                        {tools.map(tool => (
                                            <div key={tool.id} className="mcp-card">
                                                <div className="mcp-card__header">
                                                    <div className="mcp-card__icon">{tool.icon}</div>
                                                    <div className={`mcp-card__status ${tool.status}`}>
                                                        {tool.status === 'enabled' ? <CheckCircle2 size={12} /> : null}
                                                        {tool.status.toUpperCase()}
                                                    </div>
                                                </div>
                                                <div className="mcp-card__body">
                                                    <div className="mcp-card__name">{tool.name}</div>
                                                    <div className="mcp-card__desc">{tool.description}</div>
                                                </div>
                                                <div className="mcp-card__footer">
                                                    <button className="mcp-card__btn">Configure</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="settings-info-box" style={{ marginTop: 32 }}>
                                        <Shield size={16} />
                                        <span>All file and terminal operations are sandboxed to your active workspace directory by default.</span>
                                    </div>
                                </div>
                            ) : activeTab === 'logs' ? (
                                <div className="settings-section">
                                    <div className="settings-section__header">
                                        <h3 className="settings-section__title">Recent Executions</h3>
                                        <p className="settings-section__subtitle">Detailed log of tool calls made in the current session.</p>
                                    </div>
                                    <div className="settings-divider" />
                                    <div className="mcp-logs">
                                        <div className="mcp-log-entry empty">
                                            <Info size={16} />
                                            <span>No recent tool executions found.</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="settings-section">
                                    <div className="settings-section__header">
                                        <h3 className="settings-section__title">Global MCP Settings</h3>
                                        <p className="settings-section__subtitle">Configure how the agent interacts with your local system.</p>
                                    </div>

                                    <div className="settings-divider" />

                                    <div className="settings-item">
                                        <div className="settings-item__info">
                                            <div className="settings-item__label">Auto-Approve Read Tools</div>
                                            <p className="settings-item__desc">Automatically allow read_file and list_directory without asking.</p>
                                        </div>
                                        <div className="settings-item__control">
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.mcpAutoApproveReads}
                                                    onChange={(e) => onUpdateSettings({ mcpAutoApproveReads: e.target.checked })}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="settings-section" style={{ marginTop: 32 }}>
                                        <div className="settings-section__header">
                                            <h4 className="settings-section__title" style={{ fontSize: 14 }}>Allowed Paths (Sandbox)</h4>
                                            <p className="settings-section__subtitle">The agent can only access files and run commands in these directories.</p>
                                        </div>

                                        <div className="settings-paths-list" style={{ marginTop: 16 }}>
                                            {(settings.mcpAllowedPaths || []).map(path => (
                                                <div key={path} className="settings-path-item" style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    padding: '8px 12px',
                                                    borderRadius: 8,
                                                    marginBottom: 8,
                                                    border: '1px solid var(--border-subtle)'
                                                }}>
                                                    <code style={{ fontSize: 12 }}>{path}</code>
                                                    <button
                                                        onClick={() => handleRemovePath(path)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                    >
                                                        <Trash size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="settings-path-input" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                            <input
                                                type="text"
                                                placeholder="Add absolute path (e.g. /home/user/projects)"
                                                value={newPath}
                                                onChange={(e) => setNewPath(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
                                                style={{
                                                    flex: 1,
                                                    background: 'var(--bg-tertiary)',
                                                    border: '1px solid var(--border-main)',
                                                    borderRadius: 6,
                                                    padding: '8px 12px',
                                                    color: 'var(--text-primary)'
                                                }}
                                            />
                                            <button
                                                onClick={handleAddPath}
                                                style={{
                                                    background: 'var(--accent-primary)',
                                                    border: 'none',
                                                    borderRadius: 6,
                                                    padding: '0 12px',
                                                    color: 'white',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4
                                                }}
                                            >
                                                <Plus size={16} />
                                                <span>Add</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    )
}
