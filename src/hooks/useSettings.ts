import { useState, useEffect, useCallback, useRef } from 'react'

import { getLocalAI } from '../helpers/ipc.helper'
import type { AppSettings } from '../types/settings.types'
import { DEFAULT_SETTINGS } from '../types/settings.types'

interface UseSettingsReturn {
    settings: AppSettings
    updateSettings: (changes: Partial<AppSettings>) => void
    isLoaded: boolean
}

/**
 * Manages application settings via IPC persistence.
 */
export function useSettings(): UseSettingsReturn {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
    const [isLoaded, setIsLoaded] = useState(false)
    const initializedRef = useRef(false)

    useEffect(() => {
        if (initializedRef.current) return
        initializedRef.current = true

        const api = getLocalAI()
        if (!api) {
            setIsLoaded(true)
            return
        }

        api.settings.get().then((loaded) => {
            setSettings(loaded)
            setIsLoaded(true)
        })

        const cleanup = api.onSettingsChanged((updated) => {
            setSettings(updated)
        })

        return cleanup
    }, [])

    const updateSettings = useCallback((changes: Partial<AppSettings>) => {
        const api = getLocalAI()
        if (!api) return

        api.settings.set(changes).then((updated) => {
            setSettings(updated)
        })
    }, [])

    return { settings, updateSettings, isLoaded }
}
