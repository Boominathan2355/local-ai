import { useState, useEffect, useRef } from 'react'

import { getLocalAI } from '../helpers/ipc.helper'
import type { ModelStatusType } from '../types/model.types'

interface UseModelStatusReturn {
    status: ModelStatusType
    isReady: boolean
    supportsVision: boolean
    supportsThinking: boolean
}

/**
 * Subscribes to model status changes from the main process.
 */
export function useModelStatus(): UseModelStatusReturn {
    const [status, setStatus] = useState<ModelStatusType>('disconnected')
    const [supportsVision, setSupportsVision] = useState(false)
    const [supportsThinking, setSupportsThinking] = useState(false)
    const cleanupRef = useRef<(() => void) | null>(null)

    useEffect(() => {
        const api = getLocalAI()
        if (!api) return

        // Get initial status
        api.model.getStatus().then((modelStatus) => {
            setStatus(modelStatus.status)
            setSupportsVision(!!(modelStatus as any).supportsVision)
            setSupportsThinking(!!(modelStatus as any).supportsThinking)
        })

        // Subscribe to changes
        cleanupRef.current = api.model.onStatusChanged((newStatus: any) => {
            if (typeof newStatus === 'string') {
                setStatus(newStatus as ModelStatusType)
            } else if (newStatus && typeof newStatus === 'object') {
                setStatus(newStatus.status)
                if (newStatus.supportsVision !== undefined) {
                    setSupportsVision(!!newStatus.supportsVision)
                }
                if (newStatus.supportsThinking !== undefined) {
                    setSupportsThinking(!!newStatus.supportsThinking)
                }
            }
        })

        return () => {
            cleanupRef.current?.()
        }
    }, [])

    return {
        status,
        isReady: status === 'ready',
        supportsVision,
        supportsThinking
    }
}
