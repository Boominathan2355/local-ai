import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

import { LlamaServerService } from '../services/llama-server.service'
import { StorageService } from '../services/storage.service'
import { DownloadService } from '../services/download.service'
import { SearchService } from '../services/search.service'
import { CloudModelService } from '../services/cloud-model.service'
import { registerIpcHandlers } from '../ipc/handlers'
import { IPC_CHANNELS } from '../ipc/channels'

const WINDOW_CONFIG = {
    WIDTH: 1200,
    HEIGHT: 800,
    MIN_WIDTH: 800,
    MIN_HEIGHT: 600
} as const

let mainWindow: BrowserWindow | null = null
let llamaServer: LlamaServerService | null = null
let storage: StorageService | null = null
let downloadService: DownloadService | null = null
let searchService: SearchService | null = null
let cloudModelService: CloudModelService | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: WINDOW_CONFIG.WIDTH,
        height: WINDOW_CONFIG.HEIGHT,
        minWidth: WINDOW_CONFIG.MIN_WIDTH,
        minHeight: WINDOW_CONFIG.MIN_HEIGHT,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#0a0a0f',
        title: 'Local AI Assistant',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

function initServices(): void {
    storage = new StorageService()

    const llamaBasePath = is.dev
        ? join(__dirname, '../../llama')
        : join(app.getPath('userData'), 'llama')

    downloadService = new DownloadService(llamaBasePath)
    searchService = new SearchService()
    cloudModelService = new CloudModelService()

    const initialModelPath = downloadService.getFirstAvailableModelPath()
    let initialModelId: string | null = null

    if (initialModelPath) {
        const downloaded = downloadService.getDownloadedModels()
        const match = downloaded.find((m) => initialModelPath.includes(m.filename))
        initialModelId = match?.id ?? null
    }

    llamaServer = new LlamaServerService({
        binaryPath: downloadService.getBinaryPath(),
        modelPath: initialModelPath ?? join(llamaBasePath, 'models', 'model.gguf')
    })

    llamaServer.on('statusChanged', (status) => {
        mainWindow?.webContents.send(IPC_CHANNELS.MODEL_STATUS_CHANGED, status)
    })

    llamaServer.on('error', (error) => console.error('[LlamaServer]', error))

    llamaServer.on('log', (log) => {
        if (is.dev) console.log('[LlamaServer]', log)
    })

    if (llamaServer && storage && downloadService && searchService && cloudModelService) {
        registerIpcHandlers(llamaServer, storage, downloadService, searchService, cloudModelService, initialModelId)
    }

    storage.on('settingsChanged', (settings) => {
        mainWindow?.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settings)
    })

    if (downloadService.isBinaryDownloaded() && initialModelPath) {
        llamaServer.start().catch((err) => console.error('[LlamaServer] Failed to start:', err))
    }
}

async function gracefulShutdown(): Promise<void> {
    if (llamaServer) await llamaServer.stop()
}

app.whenReady().then(() => {
    initServices()
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (event) => {
    event.preventDefault()
    await gracefulShutdown()
    app.exit(0)
})
