import os from 'os'
import { execSync } from 'child_process'

const CPU_THRESHOLD_PERCENT = 90
const MIN_FREE_MEMORY_MB = 500

interface SystemMetrics {
    cpuUsagePercent: number
    freeMemoryMB: number
    totalMemoryMB: number
}

export interface SystemInfo {
    totalRamMB: number
    freeRamMB: number
    cpuCores: number
    diskFreeGB: number
}

/**
 * Monitors system resources to prevent overloading during inference.
 * Guards against running generation when CPU or memory is critically low.
 */
export class SystemMonitorService {
    private isGenerating = false

    /**
     * Returns current system resource metrics.
     */
    getMetrics(): SystemMetrics {
        const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024))
        const freeMemoryMB = Math.round(os.freemem() / (1024 * 1024))

        const cpus = os.cpus()
        let totalIdle = 0
        let totalTick = 0

        for (const cpu of cpus) {
            totalIdle += cpu.times.idle
            totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle
        }

        const cpuUsagePercent = Math.round(((totalTick - totalIdle) / totalTick) * 100)

        return { cpuUsagePercent, freeMemoryMB, totalMemoryMB }
    }

    /**
     * Returns system hardware info for model compatibility checks.
     */
    getSystemInfo(llamaDir?: string): SystemInfo {
        const totalRamMB = Math.round(os.totalmem() / (1024 * 1024))
        const freeRamMB = Math.round(os.freemem() / (1024 * 1024))
        const cpuCores = os.cpus().length

        let diskFreeGB = 0
        try {
            const dir = llamaDir ?? os.homedir()
            const output = execSync(`df -BG "${dir}" | tail -1 | awk '{print $4}'`, {
                encoding: 'utf-8',
                timeout: 3000
            }).trim()
            diskFreeGB = parseFloat(output.replace('G', '')) || 0
        } catch {
            diskFreeGB = 0
        }

        return { totalRamMB, freeRamMB, cpuCores, diskFreeGB }
    }

    /**
     * Checks if the system can safely handle a new generation request.
     */
    canGenerate(): { allowed: boolean; reason?: string } {
        if (this.isGenerating) {
            return { allowed: false, reason: 'A generation is already in progress' }
        }

        const metrics = this.getMetrics()

        if (metrics.cpuUsagePercent > CPU_THRESHOLD_PERCENT) {
            return { allowed: false, reason: `CPU usage is too high (${metrics.cpuUsagePercent}%)` }
        }

        if (metrics.freeMemoryMB < MIN_FREE_MEMORY_MB) {
            return { allowed: false, reason: `Free memory too low (${metrics.freeMemoryMB}MB)` }
        }

        return { allowed: true }
    }

    setGenerating(value: boolean): void {
        this.isGenerating = value
    }

    get generating(): boolean {
        return this.isGenerating
    }
}

