import React, { useState, useEffect, useCallback } from 'react'
import '@fontsource/space-grotesk/300.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';

import { ConversationSidebar } from './components/sidebar/ConversationSidebar'
import { ChatWindow } from './components/chat/ChatWindow'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { ModelSetup } from './components/setup/ModelSetup'
import { ModelLibrary } from './components/library/ModelLibrary'
import { McpRegistry } from './components/library/McpRegistry'
import { UserProfile } from './components/user/UserProfile'

import { useConversations } from './hooks/useConversations'
import { useChat } from './hooks/useChat'
import { useModelStatus } from './hooks/useModelStatus'
import { useSettings } from './hooks/useSettings'
import { getLocalAI } from './helpers/ipc.helper'

import './styles/index.css'
import './styles/sidebar.css'
import './styles/chat.css'
import './styles/settings.css'
import './styles/setup.css'
import './styles/model-library.css'
import './styles/user.css'

const App: React.FC = () => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isLibraryOpen, setIsLibraryOpen] = useState(false)
    const [isMcpOpen, setIsMcpOpen] = useState(false)
    const [isUserOpen, setIsUserOpen] = useState(false)
    const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
    const [activeModelId, setActiveModelId] = useState<string | null>(null)
    const [activeModelName, setActiveModelName] = useState<string | null>(null)

    const {
        conversations,
        activeConversationId,
        createConversation,
        deleteConversation,
        selectConversation
    } = useConversations()

    const {
        messages,
        streamingContent,
        isStreaming,
        error,
        sendMessage,
        stopGeneration,
        retryMessage,
        resendLastMessage,
        pendingToolCall,
        respondToToolCall
    } = useChat(activeConversationId)

    const { status: modelStatus, isReady: modelReady } = useModelStatus()
    const { settings, updateSettings } = useSettings()

    // Apply theme to document root
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', settings.theme || 'dark')
    }, [settings.theme])

    // Check if setup is needed on mount, and fetch active model
    useEffect(() => {
        const api = getLocalAI()
        if (!api) {
            setNeedsSetup(false)
            return
        }

        api.setup.getStatus().then((status) => {
            setNeedsSetup(!status.hasBinary || !status.hasModel)
        })

        api.model.getActive().then((result) => {
            setActiveModelId(result.activeModelId)
            if ((result as any).activeModelName) {
                setActiveModelName((result as any).activeModelName)
            }
        })
    }, [])

    const handleSetupComplete = useCallback(() => {
        setNeedsSetup(false)
        const api = getLocalAI()
        if (api) {
            api.model.startModel().then((result) => {
                if (result.activeModelId) {
                    setActiveModelId(result.activeModelId)
                }
                if ((result as any).activeModelName) {
                    setActiveModelName((result as any).activeModelName)
                }
            })
        }
    }, [])

    const handleSwitchModel = useCallback((modelId: string, modelName?: string) => {
        // Optimistically update the UI to make switching feel instantaneous
        setActiveModelId(modelId)
        if (modelName) {
            setActiveModelName(modelName)
        }

        const api = getLocalAI()
        if (!api) return

        api.model.switchModel(modelId).then((result) => {
            // Re-sync with actual result from backend
            if (result.activeModelId) {
                setActiveModelId(result.activeModelId)
            }
            if ((result as any).activeModelName) {
                setActiveModelName((result as any).activeModelName)
            }
        })
    }, [])

    const handleSendMessage = (content: string): void => {
        if (!activeConversationId) {
            const api = getLocalAI()
            if (api) {
                api.conversations.create().then((conversation) => {
                    selectConversation(conversation.id)
                    setTimeout(() => sendMessage(content), 50)
                })
            }
            return
        }
        sendMessage(content)
    }

    // Show loading state while checking setup
    if (needsSetup === null) {
        return (
            <div className="app-loading">
                <div className="app-loading__text">Initializing Assistant...</div>
            </div>
        )
    }

    // Show setup wizard if binary or model is missing
    if (needsSetup) {
        return <ModelSetup onComplete={handleSetupComplete} />
    }

    return (
        <div className="app-layout" id="app-root">
            <ConversationSidebar
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelectConversation={selectConversation}
                onDeleteConversation={deleteConversation}
                onNewChat={createConversation}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenMcp={() => setIsMcpOpen(true)}
                onOpenLibrary={() => setIsLibraryOpen(true)}
                onOpenUser={() => setIsUserOpen(true)}
                settings={settings}
            />

            <ChatWindow
                messages={messages}
                streamingContent={streamingContent}
                isStreaming={isStreaming}
                error={error}
                modelReady={modelReady}
                onSendMessage={handleSendMessage}
                onStopGeneration={stopGeneration}
                activeModelId={activeModelId}
                activeModelName={activeModelName}
                onRetryMessage={retryMessage}
                onResendLast={resendLastMessage}
                modelStatus={modelStatus}
                onSwitchModel={handleSwitchModel}
                settings={settings}
                onUpdateSettings={updateSettings}
                pendingToolCall={pendingToolCall}
                onRespondToToolCall={respondToToolCall}
            />

            <SettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                settings={settings}
                onUpdateSettings={updateSettings}
                modelStatus={modelStatus}
            />

            <ModelLibrary
                isOpen={isLibraryOpen}
                onClose={() => setIsLibraryOpen(false)}
                activeModelId={activeModelId}
                onModelSwitch={handleSwitchModel}
                settings={settings}
                onUpdateSettings={updateSettings}
            />

            <McpRegistry
                isOpen={isMcpOpen}
                onClose={() => setIsMcpOpen(false)}
                settings={settings}
                onUpdateSettings={updateSettings}
            />

            <UserProfile
                isOpen={isUserOpen}
                onClose={() => setIsUserOpen(false)}
                settings={settings}
                onUpdateSettings={updateSettings}
            />
        </div>
    )
}

export default App
