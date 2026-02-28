import { useState, useEffect, useRef } from 'react'

import { getLocalAI } from '../helpers/ipc.helper'
import type { ModelStatusType } from '../types/model.types'

interface UseModelStatusReturn {
    status: ModelStatusType
    isReady: boolean
}

/**
 * Subscribes to model status changes from the main process.
 */
export function useModelStatus(): UseModelStatusReturn {
    const [status, setStatus] = useState<ModelStatusType>('disconnected')
    const cleanupRef = useRef<(() => void) | null>(null)

    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        // Get initial status
        api.model.getStatus().then((modelStatus) => {
            setStatus(modelStatus.status)
        })

        // Subscribe to changes
        cleanupRef.current = api.model.onStatusChanged((newStatus) => {
            setStatus(newStatus as ModelStatusType)
        })

        return () => {
            cleanupRef.current?.()
        }
    }, [])

    return {
        status,
        isReady: status === 'ready'
    }
}
