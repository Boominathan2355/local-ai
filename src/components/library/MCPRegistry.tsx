import React, { useState } from 'react'
import { AppSettings, McpServer } from '../../types/settings.types'
import '../../styles/mcp.css'

interface MCPRegistryProps {
    isOpen: boolean
    onClose: () => void
    settings: AppSettings
    onUpdateSettings: (changes: Partial<AppSettings>) => void
}

export const MCPRegistry: React.FC<MCPRegistryProps> = ({
    isOpen,
    onClose,
    settings,
    onUpdateSettings
}) => {
    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState<'sse' | 'stdio'>('sse')
    const [newUrlOrPath, setNewUrlOrPath] = useState('')

    if (!isOpen) return null

    const handleAddServer = () => {
        if (!newName || !newUrlOrPath) return

        const newServer: McpServer = {
            id: Date.now().toString(),
            name: newName,
            type: newType,
            urlOrPath: newUrlOrPath,
            enabled: true,
            status: 'disconnected'
        }

        onUpdateSettings({
            mcpServers: [...(settings.mcpServers || []), newServer]
        })

        // Reset form
        setNewName('')
        setNewUrlOrPath('')
    }

    const handleDeleteServer = (id: string) => {
        onUpdateSettings({
            mcpServers: settings.mcpServers.filter(s => s.id !== id)
        })
    }

    const handleToggleServer = (id: string) => {
        onUpdateSettings({
            mcpServers: settings.mcpServers.map(s =>
                s.id === id ? { ...s, enabled: !s.enabled } : s
            )
        })
    }

    return (
        <div className="mcp-overlay" id="mcp-registry">
            <div className="mcp-container">
                <header className="mcp__header">
                    <h2 className="mcp__title">🧩 MCP Registry</h2>
                    <button className="mcp__close" onClick={onClose} id="mcp-close">✕</button>
                </header>

                <div className="mcp__content">
                    <section className="mcp-section">
                        <h3 className="mcp-section__title">Add New Server</h3>
                        <div className="mcp-form">
                            <div className="mcp-form__field">
                                <label>Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="e.g. Google Search"
                                />
                            </div>
                            <div className="mcp-form__field">
                                <label>Type</label>
                                <select
                                    value={newType}
                                    onChange={(e) => setNewType(e.target.value as 'sse' | 'stdio')}
                                >
                                    <option value="sse">SSE (Network)</option>
                                    <option value="stdio">Stdio (Local)</option>
                                </select>
                            </div>
                            <div className="mcp-form__field mcp-form__field--grow">
                                <label>{newType === 'sse' ? 'Endpoint URL' : 'Command / Path'}</label>
                                <input
                                    type="text"
                                    value={newUrlOrPath}
                                    onChange={(e) => setNewUrlOrPath(e.target.value)}
                                    placeholder={newType === 'sse' ? 'http://localhost:3000/sse' : 'npx -y search-mcp'}
                                />
                            </div>
                            <button
                                className="mcp-form__submit"
                                onClick={handleAddServer}
                                disabled={!newName || !newUrlOrPath}
                            >
                                Add Server
                            </button>
                        </div>
                    </section>

                    <section className="mcp-section">
                        <h3 className="mcp-section__title">Registered Servers ({settings.mcpServers?.length || 0})</h3>
                        <div className="mcp-list">
                            {(!settings.mcpServers || settings.mcpServers.length === 0) ? (
                                <div className="mcp-list__empty">
                                    No MCP servers registered. Add one above to enhance your AI's capabilities.
                                </div>
                            ) : (
                                settings.mcpServers.map(server => (
                                    <div key={server.id} className={`mcp-item ${!server.enabled ? 'mcp-item--disabled' : ''}`}>
                                        <div className="mcp-item__info">
                                            <div className="mcp-item__top">
                                                <span className="mcp-item__name">{server.name}</span>
                                                <span className={`mcp-item__status mcp-item__status--${server.status}`}>
                                                    {server.status}
                                                </span>
                                            </div>
                                            <div className="mcp-item__details">
                                                <span className="mcp-item__type">{server.type.toUpperCase()}</span>
                                                <span className="mcp-item__url">{server.urlOrPath}</span>
                                            </div>
                                        </div>
                                        <div className="mcp-item__actions">
                                            <button
                                                className={`mcp-item__btn mcp-item__btn--toggle ${server.enabled ? 'active' : ''}`}
                                                onClick={() => handleToggleServer(server.id)}
                                            >
                                                {server.enabled ? 'Disable' : 'Enable'}
                                            </button>
                                            <button
                                                className="mcp-item__btn mcp-item__btn--delete"
                                                onClick={() => handleDeleteServer(server.id)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>

                <footer className="mcp__footer">
                    <p className="mcp__hint">
                        💡 MCP (Model Context Protocol) allows AI models to securely access local tools, databases, and APIs.
                    </p>
                </footer>
            </div>
        </div>
    )
}
