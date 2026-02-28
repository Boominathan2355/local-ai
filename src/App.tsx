import React, { useState, useEffect, useCallback } from 'react'

import { ConversationSidebar } from './components/sidebar/ConversationSidebar'
import { ChatWindow } from './components/chat/ChatWindow'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { ModelSetup } from './components/setup/ModelSetup'
import { ModelLibrary } from './components/library/ModelLibrary'

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

const App: React.FC = () => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isLibraryOpen, setIsLibraryOpen] = useState(false)
    const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
    const [activeModelId, setActiveModelId] = useState<string | null>(null)

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
        stopGeneration
    } = useChat(activeConversationId)

    const { status: modelStatus, isReady: modelReady } = useModelStatus()
    const { settings, updateSettings } = useSettings()

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
            })
        }
    }, [])

    const handleSwitchModel = useCallback((modelId: string) => {
        const api = getLocalAI()
        if (!api) return

        api.model.switchModel(modelId).then((result) => {
            if (result.activeModelId) {
                setActiveModelId(result.activeModelId)
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
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                width: '100vw',
                background: 'var(--bg-primary)',
                color: 'var(--text-secondary)'
            }}>
                Loading...
            </div>
        )
    }

    // Show setup wizard if binary or model is missing
    if (needsSetup) {
        return <ModelSetup onComplete={handleSetupComplete} />
    }

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw' }} id="app-root">
            <ConversationSidebar
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelectConversation={selectConversation}
                onDeleteConversation={deleteConversation}
                onNewChat={createConversation}
                onOpenSettings={() => setIsSettingsOpen(true)}
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
                modelStatus={modelStatus}
                onSwitchModel={handleSwitchModel}
                onOpenLibrary={() => setIsLibraryOpen(true)}
                settings={settings}
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
        </div>
    )
}

export default App
