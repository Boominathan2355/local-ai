import React, { useState, useEffect } from 'react'
import {
    Link,
    Search,
    Plus,
    X,
    List,
    Settings,
    FileText,
    Activity,
    Terminal,
    Globe,
    Play,
    Square,
    Trash2,
    Info
} from 'lucide-react'
import { AppSettings, McpServer } from '../../types/settings.types'
import { getLocalAI } from '../../helpers/ipc.helper'
import '../../styles/mcp.css'

interface McpRegistryProps {
    isOpen: boolean
    onClose: () => void
    settings: AppSettings
    onUpdateSettings: (changes: Partial<AppSettings>) => void
}

export const McpRegistry: React.FC<McpRegistryProps> = ({
    isOpen,
    onClose,
    settings,
    onUpdateSettings
}) => {
    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState<'sse' | 'stdio'>('stdio')
    const [newUrlOrPath, setNewUrlOrPath] = useState('')
    const [serverTools, setServerTools] = useState<Record<string, any[]>>({})
    const [loadingServers, setLoadingServers] = useState<Record<string, boolean>>({})
    const [serverStatuses, setServerStatuses] = useState<Record<string, string>>({})

    useEffect(() => {
        if (isOpen) {
            // Re-fetch settings when registry opens to ensure synchronicity
            const api = getLocalAI()
            if (api) {
                api.settings.get().then(s => {
                    onUpdateSettings(s)
                })
            }
        }

        if (isOpen && settings.mcpServers) {
            const api = getLocalAI()
            settings.mcpServers.forEach(server => {
                if (server.enabled) {
                    if (!serverTools[server.id]) {
                        fetchTools(server.id)
                    }
                    if (api && !serverStatuses[server.id]) {
                        api.mcp.getServerStatus(server.id).then(status => {
                            setServerStatuses(prev => ({ ...prev, [server.id]: status }))
                        })
                    }
                } else {
                    setServerStatuses(prev => ({ ...prev, [server.id]: 'disconnected' }))
                }
            })
        }
    }, [isOpen, settings.mcpServers])

    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        const cleanup = api.mcp.onServerStatusChanged((data) => {
            setServerStatuses(prev => ({ ...prev, [data.serverId]: data.status }))
        })

        return cleanup
    }, [])

    const fetchTools = async (serverId: string) => {
        const api = getLocalAI()
        if (!api) return

        setLoadingServers(prev => ({ ...prev, [serverId]: true }))
        try {
            const tools = await api.mcp.getTools(serverId)
            setServerTools(prev => ({ ...prev, [serverId]: tools }))
        } catch (error) {
            console.error(`Error fetching tools for ${serverId}:`, error)
        } finally {
            setLoadingServers(prev => ({ ...prev, [serverId]: false }))
        }
    }

    const handleAddServer = async () => {
        if (!newName || !newUrlOrPath) return
        const api = getLocalAI()
        if (!api) return

        const newServer: McpServer = {
            id: Date.now().toString(),
            name: newName,
            type: newType,
            urlOrPath: newUrlOrPath,
            enabled: true,
            status: 'disconnected'
        }

        await api.mcp.addServer(newServer)

        // Refresh settings locally to trigger UI update
        const updatedServers = [...(settings.mcpServers || []), newServer]
        onUpdateSettings({ mcpServers: updatedServers })

        setNewName('')
        setNewUrlOrPath('')
    }

    const handleDeleteServer = async (id: string) => {
        const api = getLocalAI()
        if (!api) return
        await api.mcp.deleteServer(id)

        // Refresh settings locally
        const updatedServers = settings.mcpServers.filter(s => s.id !== id)
        onUpdateSettings({ mcpServers: updatedServers })
    }

    const handleToggleServer = async (id: string) => {
        const api = getLocalAI()
        if (!api) return
        await api.mcp.toggleServer(id)

        // Refresh settings locally
        const updatedServers = settings.mcpServers.map(s =>
            s.id === id ? { ...s, enabled: !s.enabled } : s
        )
        onUpdateSettings({ mcpServers: updatedServers })
    }

    if (!isOpen) return null

    return (
        <div className="mcp-overlay" id="mcp-registry">
            <div className="mcp-container">
                <header className="mcp__top-bar">
                    <div className="mcp__top-bar-left">
                        <div className="mcp__top-bar-logo">
                            <Link size={18} />
                        </div>
                        <span className="mcp__top-bar-title">MCP Registry</span>
                        <nav className="mcp__top-tabs">
                            <button className="mcp__top-tab mcp__top-tab--active">Servers</button>
                            <button className="mcp__top-tab">Analytics</button>
                            <button className="mcp__top-tab">Security</button>
                        </nav>
                    </div>
                    <div className="mcp__top-bar-right">
                        <div className="mcp__search-bar">
                            <span className="mcp__search-icon"><Search size={14} /></span>
                            <input
                                type="text"
                                placeholder="Search MCP servers..."
                                className="mcp__search-input"
                            />
                        </div>
                        <button className="mcp__add-btn" onClick={() => (document.getElementById('mcp-add-form') as any)?.scrollIntoView()}>
                            <Plus size={14} />
                            <span>Add Server</span>
                        </button>
                        <button className="mcp__close-circle" onClick={onClose}><X size={14} /></button>
                    </div>
                </header>

                <div className="mcp__body">
                    <aside className="mcp__sidebar">
                        <div className="mcp__sidebar-section">
                            <div className="mcp__sidebar-label">OVERVIEW</div>
                            <button className="mcp__sidebar-item mcp__sidebar-item--active">
                                <List size={16} /> Registry
                            </button>
                            <button className="mcp__sidebar-item">
                                <Settings size={16} /> Settings
                            </button>
                            <button className="mcp__sidebar-item">
                                <FileText size={16} /> Logs
                            </button>
                        </div>
                        <div className="mcp__sidebar-section">
                            <div className="mcp__sidebar-label">ENVIRONMENT</div>
                            <div className="mcp__sidebar-stat">
                                <span className="mcp__sidebar-stat-key"><Activity size={12} style={{ marginRight: 6 }} /> Servers</span>
                                <span className="mcp__sidebar-stat-val">{(settings.mcpServers || []).length}</span>
                            </div>
                        </div>
                    </aside>

                    <div className="mcp__main">
                        <div className="mcp-grid">
                            {(settings.mcpServers || []).map((server) => (
                                <div key={server.id} className={`mcp-card ${!server.enabled ? 'mcp-card--disabled' : ''}`}>
                                    <div className="mcp-card__header">
                                        <div className={`mcp-card__icon mcp-card__icon--${server.type}`}>
                                            {server.type === 'stdio' ? <Terminal size={20} /> : <Globe size={20} />}
                                        </div>
                                        <div className="mcp-card__header-text">
                                            <div className="mcp-card__name">{server.name}</div>
                                            <div className="mcp-card__status">
                                                <span className={`mcp-card__status-dot mcp-card__status-dot--${serverStatuses[server.id] || (server.enabled ? 'connected' : 'disconnected')}`}></span>
                                                <span style={{ textTransform: 'capitalize' }}>{serverStatuses[server.id] || (server.enabled ? 'Enabled' : 'Disabled')}</span>
                                            </div>
                                        </div>
                                        <div className="mcp-card__actions">
                                            <div
                                                className={`mcp-toggle-switch ${server.enabled ? 'active' : ''}`}
                                                onClick={() => handleToggleServer(server.id)}
                                            >
                                                <div className="mcp-toggle-knob" />
                                            </div>
                                            {!server.id.startsWith('builtin-') && (
                                                <button className="mcp-card__settings" onClick={() => handleDeleteServer(server.id)}><Trash2 size={14} /></button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mcp-card__tools">
                                        <div className="mcp-card__tools-label">AVAILABLE TOOLS</div>
                                        {loadingServers[server.id] ? (
                                            <div className="mcp-card__tool">Loading tools...</div>
                                        ) : serverTools[server.id]?.length > 0 ? (
                                            serverTools[server.id].slice(0, 3).map((tool: any) => (
                                                <div key={tool.name} className="mcp-card__tool">
                                                    <span>{tool.name}</span>
                                                    <span className="mcp-card__tool-info" title={tool.description}><Info size={12} /></span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="mcp-card__tool-empty">No tools available</div>
                                        )}
                                        {serverTools[server.id]?.length > 3 && (
                                            <div className="mcp-card__tool-more">+{serverTools[server.id].length - 3} more</div>
                                        )}
                                    </div>
                                    <div className="mcp-card__footer">
                                        <div className="mcp-card__id">{server.id.startsWith('builtin-') ? 'Built-in System Service' : server.urlOrPath}</div>
                                    </div>
                                </div>
                            ))}

                            {/* Add Server Form Card */}
                            <div className="mcp-card mcp-card--form" id="mcp-add-form">
                                <div className="mcp-card__form-header">Register New Server</div>
                                <div className="mcp-card__form-body">
                                    <input
                                        type="text"
                                        placeholder="Server Name"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="mcp__form-input"
                                    />
                                    <select
                                        value={newType}
                                        onChange={(e) => setNewType(e.target.value as any)}
                                        className="mcp__form-select"
                                    >
                                        <option value="stdio">stdio (Local Command)</option>
                                        <option value="sse">sse (Remote URL)</option>
                                    </select>
                                    <input
                                        type="text"
                                        placeholder={newType === 'stdio' ? 'Command/Path' : 'Server URL'}
                                        value={newUrlOrPath}
                                        onChange={(e) => setNewUrlOrPath(e.target.value)}
                                        className="mcp__form-input"
                                    />
                                    <button
                                        className="mcp__form-btn"
                                        onClick={handleAddServer}
                                        disabled={!newName || !newUrlOrPath}
                                    >
                                        Add Server
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
