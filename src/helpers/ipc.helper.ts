import type { LocalAIApi } from '../../electron/preload/index'

declare global {
    interface Window {
        localAI: LocalAIApi
    }
}

/**
 * Type-safe accessor for the localAI bridge exposed via preload.
 * Returns undefined if called outside Electron context.
 */
export function getLocalAI(): LocalAIApi | undefined {
    return window.localAI
}
