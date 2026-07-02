import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const { autoUpdater } = require('electron-updater')
const updateState = {
    configured: false,
    checking: false,
    updateAvailable: false,
    downloaded: false,
    version: app.getVersion(),
    message: 'Updates are not checked yet.',
    error: null,
    technicalError: null,
    progress: null,
}

function formatUpdaterError(err) {
    const rawMessage = err?.message || String(err)

    if (rawMessage.includes('latest.yml') || rawMessage.includes('404')) {
        return {
            message: 'No published update was found yet. Publish a GitHub release with the generated installer files, including latest.yml, then try again.',
            technicalError: rawMessage,
        }
    }

    if (rawMessage.toLowerCase().includes('authentication token')) {
        return {
            message: 'The update check could not access the GitHub release. Check that the release is public or that the publishing token is configured correctly.',
            technicalError: rawMessage,
        }
    }

    return {
        message: 'Update check failed. Please try again later.',
        technicalError: rawMessage,
    }
}

function configureUpdater() {
    updateState.configured = app.isPackaged
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
        updateState.checking = true
        updateState.error = null
        updateState.technicalError = null
        updateState.message = 'Checking for updates...'
    })

    autoUpdater.on('update-available', (info) => {
        updateState.checking = false
        updateState.updateAvailable = true
        updateState.downloaded = false
        updateState.version = info.version || updateState.version
        updateState.message = `Update ${updateState.version} is available.`
    })

    autoUpdater.on('update-not-available', () => {
        updateState.checking = false
        updateState.updateAvailable = false
        updateState.downloaded = false
        updateState.message = 'You are on the latest version.'
    })

    autoUpdater.on('download-progress', (progress) => {
        updateState.progress = Math.round(progress.percent || 0)
        updateState.message = `Downloading update... ${updateState.progress}%`
    })

    autoUpdater.on('update-downloaded', (info) => {
        updateState.downloaded = true
        updateState.version = info.version || updateState.version
        updateState.message = 'Update downloaded. Restart to install.'
    })

    autoUpdater.on('error', (err) => {
        const formatted = formatUpdaterError(err)
        updateState.checking = false
        updateState.error = formatted.message
        updateState.technicalError = formatted.technicalError
        updateState.message = formatted.message
    })

    globalThis.omniUpdater = {
        getStatus: () => ({ ...updateState }),
        check: async () => {
            if (!app.isPackaged) {
                updateState.configured = false
                updateState.message = 'Updates are only checked from the installed app.'
                return { ...updateState }
            }

            updateState.configured = true
            try {
                await autoUpdater.checkForUpdates()
            } catch (err) {
                const formatted = formatUpdaterError(err)
                updateState.checking = false
                updateState.error = formatted.message
                updateState.technicalError = formatted.technicalError
                updateState.message = formatted.message
            }
            return { ...updateState }
        },
        download: async () => {
            if (!updateState.updateAvailable) {
                return { ...updateState, message: 'No update is available to download.' }
            }

            try {
                await autoUpdater.downloadUpdate()
            } catch (err) {
                const formatted = formatUpdaterError(err)
                updateState.error = formatted.message
                updateState.technicalError = formatted.technicalError
                updateState.message = formatted.message
            }
            return { ...updateState }
        },
        quitAndInstall: () => autoUpdater.quitAndInstall(false, true),
    }
}

const startServer = async () => {
    // Static ES imports run before this file's body, so the server must be
    // imported dynamically after these production paths are available.
    process.env.NODE_ENV = 'production'
    process.env.OMNI_RESOURCES_PATH = process.resourcesPath
    process.env.OMNI_APP_PATH = app.getAppPath()
    process.env.OMNI_APP_VERSION = app.getVersion()

    await import('../server/index.js')
}

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, '../public/omni.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    })

    // Remove the default Electron menu bar for a cleaner app look
    Menu.setApplicationMenu(null)

    // Wait for the local Express server to start responding, then load the UI
    const pollServer = async (retries = 30) => {
        try {
            await fetch('http://127.0.0.1:9474/api/health')
            mainWindow.loadURL('http://127.0.0.1:9474')
        } catch (err) {
            if (retries > 0) {
                setTimeout(() => pollServer(retries - 1), 500)
            } else {
                console.error('Server did not start in time:', err)
            }
        }
    }

    pollServer()
}

app.whenReady().then(async () => {
    configureUpdater()
    await startServer()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
