export interface ModelInfo {
    id: string
    name: string
    description: string
    sizeGB: number
    ramRequired: number
    tier: string
    filename: string
    downloaded: boolean
    provider?: 'local' | 'openai' | 'anthropic' | 'google'
}

export interface SystemInfo {
    totalRamMB: number
    freeRamMB: number
    cpuCores: number
    cpuUsagePercent: number
    diskFreeGB: number
    diskTotalGB: number
    gpuName?: string
    gpuMemoryTotalMB?: number
    gpuMemoryFreeMB?: number
}

export interface CompatibilityStatus {
    label: string
    className: string
    isRecommended?: boolean
    hasGpu?: boolean
    level: 'good' | 'warn' | 'bad'
}

/**
 * Calculates compatibility based on RAM and GPU availability.
 */
export function getCompatibility(ramRequired: number, systemInfo: SystemInfo | null): CompatibilityStatus {
    if (!systemInfo) return { label: 'Checking...', className: '', level: 'warn' }

    const totalRamGB = systemInfo.totalRamMB / 1024
    const hasGpu = !!systemInfo.gpuName

    if (totalRamGB >= ramRequired * 1.3) {
        return {
            label: 'Will run great',
            className: 'compat--good',
            level: 'good',
            hasGpu
        }
    }

    if (totalRamGB >= ramRequired) {
        return {
            label: 'Tight fit',
            className: 'compat--warn',
            level: 'warn',
            hasGpu
        }
    }

    return {
        label: 'Needs more RAM',
        className: 'compat--bad',
        level: 'bad',
        hasGpu
    }
}

/**
 * Finds the most capable model that fits comfortably in the system.
 * Considers RAM (bottleneck), GPU VRAM (performance), and CPU cores (throughput).
 * Returns both the model ID and a descriptive reason.
 */
export function getRecommendation(models: any[], systemInfo: SystemInfo | null): { id: string, reason: string } | null {
    if (!systemInfo || models.length === 0) return null

    const totalRamGB = systemInfo.totalRamMB / 1024
    const gpuVramGB = (systemInfo.gpuMemoryTotalMB || 0) / 1024
    const cpuCores = systemInfo.cpuCores

    // Filter local models only
    const localModels = models.filter((m: any) => (!m.provider || m.provider === 'local') && m.tier !== 'agent' && m.tier !== 'custom')

    if (localModels.length === 0) return null

    const scoredModels = localModels.map(model => {
        let score = 0
        const ramRequired = model.ramRequired

        // 1. Hard Check: RAM Compatibility (Critical)
        if (totalRamGB < ramRequired) return { id: model.id, score: -1000 }

        // 2. RAM Overhead Score (Higher overhead is safer)
        if (totalRamGB >= ramRequired * 1.5) score += 30
        else if (totalRamGB >= ramRequired * 1.3) score += 20
        else score += 5

        // 3. GPU Acceleration Score (Major performance boost)
        if (gpuVramGB > 0) {
            if (gpuVramGB >= model.sizeGB + 1.0) score += 50 // Fits entirely
            else if (gpuVramGB >= model.sizeGB * 0.5) score += 20 // Partial
        }

        // 4. CPU Throughput Score
        if (model.tier === 'heavy' || model.ramRequired >= 16) {
            if (cpuCores >= 8) score += 20
            else if (cpuCores < 4) score -= 40
        } else if (model.tier === 'medium' || model.ramRequired >= 10) {
            if (cpuCores >= 6) score += 15
            else if (cpuCores < 4) score -= 10
        } else {
            score += 10
        }

        // 5. Tier Preference
        if (model.tier === 'heavy') score += 15
        else if (model.tier === 'medium') score += 10
        else if (model.tier === 'light') score += 5

        return { id: model.id, score }
    })

    const best = scoredModels
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)[0]

    if (!best) return localModels[0] ? { id: localModels[0].id, reason: 'High compatibility' } : null

    const model = localModels.find(m => m.id === best.id)
    let reason = 'Balanced for your system'

    if (gpuVramGB >= model.sizeGB + 1.0) reason = 'Optimized: Fits entirely in VRAM'
    else if (gpuVramGB > 0) reason = 'Hardware accelerated (GPU)'
    else if (cpuCores >= 8 && model.ramRequired >= 10) reason = 'Great for high-core CPU'
    else if (model.ramRequired <= 4) reason = 'Lightweight and fast'

    return { id: best.id, reason }
}

/**
 * Finds the most capable model that fits comfortably in the system.
 */
export function getBestFitModelId(models: any[], systemInfo: SystemInfo | null): string | null {
    return getRecommendation(models, systemInfo)?.id || null
}
