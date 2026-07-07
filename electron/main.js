import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { randomBytes } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const { autoUpdater } = require('electron-updater')
let mainWindow = null

const updateState = {
    configured: false,
    checking: false,
    downloading: false,
    updateAvailable: false,
    downloaded: false,
    currentVersion: app.getVersion(),
    availableVersion: null,
    message: 'Updates are not checked yet.',
    error: null,
    technicalError: null,
    progress: null,
    releaseDate: null,
    lastCheckedAt: null,
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
        updateState.downloading = false
        updateState.updateAvailable = false
        updateState.downloaded = false
        updateState.availableVersion = null
        updateState.releaseDate = null
        updateState.progress = null
        updateState.error = null
        updateState.technicalError = null
        updateState.message = 'Checking for updates...'
        updateState.lastCheckedAt = new Date().toISOString()
    })

    autoUpdater.on('update-available', (info) => {
        updateState.checking = false
        updateState.downloading = false
        updateState.updateAvailable = true
        updateState.downloaded = false
        updateState.availableVersion = info.version || null
        updateState.releaseDate = info.releaseDate || null
        updateState.progress = null
        updateState.message = `Version ${updateState.availableVersion || 'update'} is ready to download.`
    })

    autoUpdater.on('update-not-available', () => {
        updateState.checking = false
        updateState.downloading = false
        updateState.updateAvailable = false
        updateState.downloaded = false
        updateState.availableVersion = null
        updateState.releaseDate = null
        updateState.progress = null
        updateState.message = 'You are on the latest version.'
    })

    autoUpdater.on('download-progress', (progress) => {
        updateState.checking = false
        updateState.downloading = true
        updateState.progress = Math.round(progress.percent || 0)
        updateState.message = `Downloading version ${updateState.availableVersion || 'update'}... ${updateState.progress}%`
    })

    autoUpdater.on('update-downloaded', (info) => {
        updateState.checking = false
        updateState.downloading = false
        updateState.downloaded = true
        updateState.availableVersion = info.version || updateState.availableVersion
        updateState.releaseDate = info.releaseDate || updateState.releaseDate
        updateState.progress = 100
        updateState.message = `Version ${updateState.availableVersion || 'update'} is ready. Restart Omni to install it.`
    })

    autoUpdater.on('error', (err) => {
        const formatted = formatUpdaterError(err)
        updateState.checking = false
        updateState.downloading = false
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
                updateState.downloading = false
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
                updateState.downloading = true
                updateState.progress = 0
                updateState.message = `Preparing version ${updateState.availableVersion || 'update'} for download...`
                await autoUpdater.downloadUpdate()
            } catch (err) {
                const formatted = formatUpdaterError(err)
                updateState.downloading = false
                updateState.error = formatted.message
                updateState.technicalError = formatted.technicalError
                updateState.message = formatted.message
            }
            return { ...updateState }
        },
        quitAndInstall: () => autoUpdater.quitAndInstall(false, true),
    }
}

function attachDesktopSessionHeaders(session) {
    const desktopToken = process.env.OMNI_LOCAL_API_TOKEN
    if (!desktopToken) return

    session.webRequest.onBeforeSendHeaders(
        { urls: ['http://127.0.0.1:9474/*'] },
        (details, callback) => {
            details.requestHeaders['x-omni-session'] = desktopToken
            callback({ requestHeaders: details.requestHeaders })
        }
    )
}

function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }
    if (!mainWindow.isVisible()) {
        mainWindow.show()
    }
    mainWindow.focus()
}

function renderStartupError(message) {
    if (!mainWindow || mainWindow.isDestroyed()) return

    const safeMessage = String(message || 'Omni could not finish starting.').replace(/[&<>"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
    }[char]))

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Omni Startup Error</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; background: #111827; color: #f9fafb; margin: 0; padding: 32px; }
      .wrap { max-width: 720px; margin: 0 auto; padding: 24px; border-radius: 16px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); }
      h1 { margin-top: 0; font-size: 24px; }
      p { line-height: 1.5; color: #d1d5db; }
      code { display: block; margin-top: 16px; padding: 12px; border-radius: 10px; background: rgba(0,0,0,0.25); color: #f3f4f6; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Omni could not finish starting</h1>
      <p>The local app server did not become ready in time. Your data is still on disk. Please try reopening Omni once.</p>
      <code>${safeMessage}</code>
    </div>
  </body>
</html>`

    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    mainWindow.show()
    mainWindow.focus()
}

const startServer = async () => {
    // Static ES imports run before this file's body, so the server must be
    // imported dynamically after these production paths are available.
    process.env.NODE_ENV = 'production'
    process.env.OMNI_RESOURCES_PATH = process.resourcesPath
    process.env.OMNI_APP_PATH = app.getAppPath()
    process.env.OMNI_APP_VERSION = app.getVersion()
    process.env.OMNI_LOCAL_API_TOKEN = randomBytes(32).toString('hex')

    await import('../server/index.js')
}

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, '../public/omni.ico'),
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    })

    attachDesktopSessionHeaders(mainWindow.webContents.session)

    // Remove the default Electron menu bar for a cleaner app look
    Menu.setApplicationMenu(null)

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
        mainWindow.focus()
    })

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
                renderStartupError(err?.message || err)
            }
        }
    }

    pollServer()
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        focusMainWindow()
    })
}

app.whenReady().then(async () => {
    configureUpdater()
    await startServer()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
        else focusMainWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
