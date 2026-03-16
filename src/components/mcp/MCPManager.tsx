import React, { useState, useEffect } from 'react'
import {
    Search,
    Activity,
    X,
    Cpu,
    Shield,
    Info,
    Settings,
    Plus,
    Trash,
    RefreshCw,
    Folder,
    FolderOpen,
    Terminal,
    FileText
} from 'lucide-react'
import { AppSettings } from '../../types/settings.types'
import { ToolLogEntry, ToolCategory } from '../../types/mcp.types'
import { getLocalAI } from '../../helpers/ipc.helper'

interface ToolItem {
    name: string
    category: string
    description: string
    enabled: boolean
    permissionLevel: string
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
    const [logs, setLogs] = useState<ToolLogEntry[]>([])
    const [isRefreshingLogs, setIsRefreshingLogs] = useState(false)

    const [tools, setTools] = useState<ToolItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadTools = async () => {
            if (!isOpen) return
            try {
                setLoading(true)
                const api = getLocalAI()
                console.log('[MCPManager] API trace:', { 
                    apiExists: !!api, 
                    mcpExists: !!(api as any)?.mcp, 
                    getToolsExists: !!(api as any)?.mcp?.getTools 
                })

                if (!api?.mcp?.getTools) {
                    setError('MCP API not available. Please check if the backend service is running correctly.')
                    return
                }
                const result = await api.mcp.getTools()
                console.log('[MCPManager] tools received:', result)
                console.log('[MCPManager] tools loaded:', result?.length)
                setTools(Array.isArray(result) ? result : [])
                setError(null)
            } catch (err: any) {
                console.error('[MCPManager] failed to load tools:', err)
                setError(err.message || 'Failed to load tools')
            } finally {
                setLoading(false)
            }
        }
        loadTools()
    }, [isOpen])

    const handleToolToggle = async (toolName: string, newEnabled: boolean) => {
        const api = getLocalAI()
        if (!api?.mcp) return
        try {
            await api.mcp.setToolEnabled(toolName, newEnabled)
            setTools((prev: ToolItem[]) => prev.map((t: ToolItem) =>
                t.name === toolName ? { ...t, enabled: newEnabled } : t
            ))
        } catch (error) {
            console.error(`Failed to toggle tool ${toolName}:`, error)
        }
    }

    const toggleCategory = async (category: string, enable: boolean) => {
        const api = getLocalAI()
        if (!api?.mcp) return
        const categoryTools = tools.filter(t => t.category === category)
        try {
            for (const tool of categoryTools) {
                if (tool.enabled !== enable) {
                    await api.mcp.setToolEnabled(tool.name, enable)
                }
            }
            setTools((prev: ToolItem[]) => prev.map((t: ToolItem) =>
                t.category === category ? { ...t, enabled: enable } : t
            ))
        } catch (error) {
            console.error(`Failed to toggle category ${category}:`, error)
        }
    }

    const formatToolName = (name: string) => {
        return name
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
    }

    const getToolIcon = (category: string) => {
        switch (category) {
            case 'web_search': return <Search size={18} />
            case 'file_control': return <Folder size={18} />
            case 'terminal': return <Terminal size={18} />
            case 'document_creator': return <FileText size={18} />
            default: return <Cpu size={18} />
        }
    }

    const enabledTools = settings.mcpEnabledTools || ['web_search', 'file_control', 'terminal', 'document_creator']

    const handleToggleTool = (id: ToolCategory) => {
        if (enabledTools.includes(id)) {
            onUpdateSettings({ mcpEnabledTools: enabledTools.filter((t: string) => t !== id) })
        } else {
            onUpdateSettings({ mcpEnabledTools: [...enabledTools, id] })
        }
    }

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
        onUpdateSettings({ mcpAllowedPaths: paths.filter((p: string) => p !== pathToRemove) })
    }

    const fetchLogs = async () => {
        const api = getLocalAI()
        if (!api?.mcp) return
        setIsRefreshingLogs(true)
        try {
            const fetchedLogs = await api.mcp.getLogs()
            setLogs(fetchedLogs)
        } catch (error) {
            console.error('Failed to fetch MCP logs:', error)
        } finally {
            setIsRefreshingLogs(false)
        }
    }

    useEffect(() => {
        if (isOpen && activeTab === 'logs') {
            fetchLogs()
        }
    }, [isOpen, activeTab])

    const handleClearLogs = async () => {
        const api = getLocalAI()
        if (!api?.mcp) return
        try {
            await api.mcp.clearLogs()
            setLogs([])
        } catch (error) {
            console.error('Failed to clear MCP logs:', error)
        }
    }

    if (!isOpen) return null

    return (
        <div className="settings-overlay flex items-center justify-center p-4" id="mcp-manager" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="settings-full-container mcp-manager">
                <header className="mcp-manager__header">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-lg bg-blue-600 flex items-center justify-center">
                            <Cpu size={20} color="#fff" />
                        </div>
                        <div>
                            <span className="font-bold text-base dark:text-gray-100">MCP Tool Center</span>
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Autonomous Agent Capabilities</div>
                        </div>
                    </div>
                    <button className="settings-top-nav__icon-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </header>

                <div className="mcp-manager__body">
                    <aside className="mcp-manager__sidebar">
                        <nav className="mcp-manager__nav">
                            <button
                                className={`mcp-manager__nav-item ${activeTab === 'catalog' ? 'mcp-manager__nav-item--active' : ''}`}
                                onClick={() => setActiveTab('catalog')}
                            >
                                <Cpu size={18} />
                                <span>Tool Catalog</span>
                            </button>
                            <button
                                className={`mcp-manager__nav-item ${activeTab === 'config' ? 'mcp-manager__nav-item--active' : ''}`}
                                onClick={() => setActiveTab('config')}
                            >
                                <Settings size={18} />
                                <span>Configuration</span>
                            </button>
                            <button
                                className={`mcp-manager__nav-item ${activeTab === 'logs' ? 'mcp-manager__nav-item--active' : ''}`}
                                onClick={() => setActiveTab('logs')}
                            >
                                <Activity size={18} />
                                <span>Audit Logs</span>
                            </button>
                        </nav>

                        <div className="mcp-sidebar-footer">
                            <div className="mcp-info-box">
                                <div className="mcp-info-box__title">Agent Mode</div>
                                <div className="mcp-info-box__text">Tools are used autonomously by the Agent. Use caution when granting access.</div>
                            </div>
                        </div>
                    </aside>

                    <main className="mcp-manager__main">
                        <div className="mcp-manager__main-inner">
                            {activeTab === 'catalog' && (
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-xl font-bold dark:text-gray-100">Available MCP Tools</h3>
                                        <p className="text-sm text-gray-500 mt-1">Manage the global capabilities available to your AI agent.</p>
                                    </div>

                                    {loading ? (
                                        <div className="flex items-center justify-center py-12 space-x-2 text-gray-500">
                                            <RefreshCw size={20} className="animate-spin" />
                                            <span className="font-bold uppercase tracking-widest text-[10px]">Loading tools...</span>
                                        </div>
                                    ) : error ? (
                                        <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 text-center">
                                            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                                                <X size={24} />
                                            </div>
                                            <div className="text-sm font-bold text-red-700 dark:text-red-400 mb-1">Failed to Load Tools</div>
                                            <div className="text-xs text-red-600/70 dark:text-red-400/70 mb-4">{error}</div>
                                            <button 
                                              onClick={() => { (window as any).location.reload() }}
                                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
                                            >
                                                Retry Connection
                                            </button>
                                        </div>
                                    ) : tools.length === 0 ? (
                                        <div className="text-center py-12 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl">
                                            <Cpu size={48} className="mx-auto text-gray-200 dark:text-gray-800 mb-4" />
                                            <div className="text-gray-400 font-bold uppercase tracking-widest text-xs">No tools found</div>
                                            <p className="text-[11px] text-gray-500 mt-2 px-12">The tool registry returned an empty list. Try restarting the application or refreshing.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-8">
                                            {['file_control', 'document_creator', 'terminal', 'web_search'].map(category => {
                                                const categoryTools = tools.filter(t => t.category === category)
                                                if (categoryTools.length === 0) return null

                                                const anyTerminalEnabled = tools.some(t => t.category === 'terminal' && t.enabled)

                                                return (
                                                    <div key={category} className="space-y-4">
                                                        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                                                            <div className="flex items-center space-x-2">
                                                                <div className="text-gray-400">
                                                                    {getToolIcon(category)}
                                                                </div>
                                                                <h4 className="font-bold text-sm uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                                                    {category.replace('_', ' ')}
                                                                </h4>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <button
                                                                    onClick={() => toggleCategory(category, true)}
                                                                    className="text-[10px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 uppercase"
                                                                >
                                                                    Enable All
                                                                </button>
                                                                <span className="text-gray-300 dark:text-gray-700">•</span>
                                                                <button
                                                                    onClick={() => toggleCategory(category, false)}
                                                                    className="text-[10px] font-bold text-gray-500 hover:text-gray-600 dark:text-gray-400 uppercase"
                                                                >
                                                                    Disable All
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {category === 'terminal' && anyTerminalEnabled && (
                                                            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 flex items-start space-x-2 text-[11px] text-red-700 dark:text-red-400">
                                                                <Terminal size={14} className="mt-0.5 flex-shrink-0" />
                                                                <span>⚠️ Terminal tools can execute system commands. Only enable if you trust the AI's actions in this session.</span>
                                                            </div>
                                                        )}

                                                        <div className="mcp-tool-grid">
                                                            {categoryTools.map(tool => (
                                                                <div key={tool.name} className={`mcp-tool-card ${tool.enabled ? 'mcp-tool-card--enabled' : ''}`}>
                                                                    <div className="mcp-tool-card__header">
                                                                        <div className="flex items-center space-x-2">
                                                                            <div className="mcp-tool-card__name">{formatToolName(tool.name)}</div>
                                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                                                                                tool.permissionLevel === 'terminal' ? 'bg-red-100 text-red-700' :
                                                                                tool.permissionLevel === 'destructive' ? 'bg-orange-100 text-orange-700' :
                                                                                tool.permissionLevel === 'write' ? 'bg-blue-100 text-blue-700' :
                                                                                'bg-gray-100 text-gray-600'
                                                                            }`}>
                                                                                {tool.permissionLevel}
                                                                            </span>
                                                                        </div>
                                                                        <label className="mcp-switch">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={tool.enabled}
                                                                                onChange={() => handleToolToggle(tool.name, !tool.enabled)}
                                                                            />
                                                                            <span className="mcp-switch__slider"></span>
                                                                        </label>
                                                                    </div>
                                                                    <div className="mcp-tool-card__info">
                                                                        <div className="mcp-tool-card__desc">
                                                                            {tool.description.split('.')[0].substring(0, 60)}...
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    <div className="mt-8 p-5 rounded-xl bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-800 flex items-start space-x-3 text-xs text-gray-600 dark:text-gray-400">
                                        <Shield size={18} className="flex-shrink-0 text-gray-500 mt-0.5" />
                                        <span>All file and terminal operations are strictly sandboxed to your active workspace and allowed directories configured in the Settings tab.</span>
                                    </div>
                                </div>
                            )}


                            {activeTab === 'config' && (
                                <div className="mcp-config-group">
                                    <div className="mcp-config-header">
                                        <h3 className="text-xl font-bold dark:text-gray-100">Global Configuration</h3>
                                        <p className="text-sm text-gray-500 mt-1">Configure security limits and default behavior for the tool environment.</p>
                                    </div>

                                    <div className="mcp-config-section">
                                        <div className="mcp-config-row">
                                            <div className="mcp-config-row__info">
                                                <div className="mcp-config-row__title">Auto-Approve Read Tools</div>
                                                <p className="mcp-config-row__desc">Automatically allow non-destructive operations (read_file, list_directory) without asking.</p>
                                            </div>
                                            <div className="mcp-config-row__action">
                                                <label className="mcp-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.mcpAutoApproveReads}
                                                        onChange={(e) => onUpdateSettings({ mcpAutoApproveReads: e.target.checked })}
                                                    />
                                                    <span className="mcp-switch__slider"></span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                            <div className="mcp-config-label">Resource Limits</div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                                                    <label className="mcp-config-label">Max File Size (MB)</label>
                                                    <input
                                                        type="number"
                                                        className="settings-input"
                                                        value={settings.mcpMaxFileSizeMB || 10}
                                                        onChange={(e) => onUpdateSettings({ mcpMaxFileSizeMB: parseInt(e.target.value) || 10 })}
                                                    />
                                                </div>
                                                <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                                                    <label className="mcp-config-label">Terminal Timeout (ms)</label>
                                                    <input
                                                        type="number"
                                                        className="settings-input"
                                                        value={settings.mcpTerminalTimeoutMs || 60000}
                                                        onChange={(e) => onUpdateSettings({ mcpTerminalTimeoutMs: parseInt(e.target.value) || 60000 })}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                            <div className="mcp-config-label">Document Output Path</div>
                                            <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                                                <div className="mcp-input-group">
                                                    <input
                                                        type="text"
                                                        placeholder="Leave empty to use active workspace..."
                                                        className="settings-input font-mono text-sm"
                                                        value={settings.mcpDocumentOutputPath || ''}
                                                        onChange={(e) => onUpdateSettings({ mcpDocumentOutputPath: e.target.value })}
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            const api = getLocalAI()
                                                            const path = await api?.system?.selectDirectory()
                                                            if (path) onUpdateSettings({ mcpDocumentOutputPath: path })
                                                        }}
                                                        className="mcp-input-group__btn"
                                                        title="Select Folder"
                                                    >
                                                        <FolderOpen size={16} />
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-gray-500 mt-2">Where created PDFs, Words, and Excels should be saved.</p>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                            <div className="mcp-config-label">Allowed Paths (Sandbox)</div>
                                            <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 space-y-3">
                                                <div className="mcp-input-group">
                                                    <input
                                                        type="text"
                                                        placeholder="Add absolute path..."
                                                        value={newPath}
                                                        onChange={(e) => setNewPath(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
                                                        className="settings-input text-sm"
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            const api = getLocalAI()
                                                            const path = await api?.system?.selectDirectory()
                                                            if (path) setNewPath(path)
                                                        }}
                                                        className="mcp-input-group__btn mr-1" // minor margin for visual spacing from Add button
                                                        title="Select Folder"
                                                    >
                                                        <FolderOpen size={16} />
                                                    </button>
                                                    <button
                                                        onClick={handleAddPath}
                                                        className="mcp-btn-secondary"
                                                    >
                                                        Add
                                                    </button>
                                                </div>

                                                <div className="space-y-2 mt-4">
                                                    {(settings.mcpAllowedPaths || []).length === 0 ? (
                                                        <div className="mcp-logs-empty !py-8 !bg-transparent !border-none">
                                                            <p className="text-xs italic text-gray-500">No allowed paths added. Only the current workspace will be accessible.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {(settings.mcpAllowedPaths || []).map(path => (
                                                                <div key={path} className="mcp-path-item">
                                                                    <code className="mcp-path-item__code">{path}</code>
                                                                    <button
                                                                        onClick={() => handleRemovePath(path)}
                                                                        className="mcp-path-item__remove"
                                                                    >
                                                                        <Trash size={14} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}


                            {activeTab === 'logs' && (
                                <div className="space-y-6 h-full flex flex-col">
                                    <div className="mcp-logs-header">
                                        <div>
                                            <h3 className="text-xl font-bold dark:text-gray-100">Audit Logs</h3>
                                            <p className="text-sm text-gray-500 mt-1">System-wide record of all executed tool calls.</p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={fetchLogs}
                                                disabled={isRefreshingLogs}
                                                className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                                title="Refresh Logs"
                                            >
                                                <RefreshCw size={18} className={isRefreshingLogs ? "animate-spin" : ""} />
                                            </button>
                                            <button
                                                onClick={handleClearLogs}
                                                className="text-xs font-bold px-3 py-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-100 dark:border-red-900/30"
                                            >
                                                Clear Logs
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-8">
                                        {logs.length === 0 ? (
                                            <div className="mcp-logs-empty">
                                                <Info className="mcp-logs-empty__icon" />
                                                <p className="mcp-logs-empty__text">No recent tool executions found.</p>
                                            </div>
                                        ) : (
                                            <div className="mcp-log-list">
                                                {logs.map(log => (
                                                    <div key={log.id} className="mcp-log-item">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <div className="flex items-center space-x-2">
                                                                <div className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-green-500' :
                                                                    log.status === 'error' ? 'bg-red-500' :
                                                                        log.status === 'timeout' ? 'bg-orange-500' :
                                                                            log.status === 'denied' ? 'bg-red-800' :
                                                                                'bg-blue-500'
                                                                    }`} />
                                                                <span className="font-mono text-xs font-bold dark:text-gray-100">{log.toolName}</span>
                                                            </div>
                                                            <span className="text-[10px] text-gray-400 font-mono">
                                                                {new Date(log.timestamp).toLocaleTimeString()}
                                                            </span>
                                                        </div>

                                                        <div className="text-[11px] bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg text-gray-600 dark:text-gray-400 mb-3 truncate font-mono border border-gray-100 dark:border-gray-800">
                                                            {JSON.stringify(log.args)}
                                                        </div>

                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                                                {log.category}
                                                            </span>
                                                            <div className="text-[11px] font-mono text-gray-500 flex items-center space-x-2">
                                                                <span className={log.status === 'error' || log.status === 'denied' ? 'text-red-500' : log.status === 'success' ? 'text-green-500' : ''}>
                                                                    {log.status.toUpperCase()}
                                                                </span>
                                                                {log.durationMs > 0 && (
                                                                    <>
                                                                        <span className="opacity-30">•</span>
                                                                        <span>{log.durationMs}ms</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
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
