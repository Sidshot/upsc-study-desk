import { app, BrowserWindow, Menu } from 'electron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { randomBytes } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const { autoUpdater } = require('electron-updater')
let mainWindow = null
let startupLogPath = null

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

function getStartupLogPath() {
    if (!startupLogPath) {
        startupLogPath = path.join(app.getPath('userData'), 'startup.log')
    }
    return startupLogPath
}

function logStartup(message, detail = '') {
    try {
        const logLine = `[${new Date().toISOString()}] ${message}${detail ? `\n${detail}` : ''}\n`
        fs.appendFileSync(getStartupLogPath(), logLine, 'utf8')
    } catch {
        // Startup logging must never block the app from opening.
    }
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

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
    }[char]))
}

function loadStartupScreen(message = 'Starting Omni...', detail = 'Preparing your study desk. This usually takes a few seconds.') {
    if (!mainWindow || mainWindow.isDestroyed()) return

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Omni</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Segoe UI, Arial, sans-serif;
        background: #0f172a;
        color: #f8fafc;
      }
      .panel {
        width: min(520px, calc(100vw - 48px));
        padding: 28px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 12px;
        background: #111827;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
      }
      .brand { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #93c5fd; font-weight: 700; }
      h1 { margin: 12px 0 8px; font-size: 24px; line-height: 1.2; letter-spacing: 0; }
      p { margin: 0; line-height: 1.5; color: #cbd5e1; }
      .bar { height: 6px; margin-top: 22px; overflow: hidden; border-radius: 999px; background: rgba(148, 163, 184, 0.18); }
      .bar::before {
        content: '';
        display: block;
        width: 42%;
        height: 100%;
        border-radius: inherit;
        background: #38bdf8;
        animation: loading 1.35s ease-in-out infinite;
      }
      @keyframes loading {
        0% { transform: translateX(-105%); }
        100% { transform: translateX(245%); }
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <div class="brand">Omni</div>
      <h1>${escapeHtml(message)}</h1>
      <p>${escapeHtml(detail)}</p>
      <div class="bar" aria-hidden="true"></div>
    </main>
  </body>
</html>`

    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    mainWindow.show()
    mainWindow.focus()
}

function renderStartupError(message) {
    if (!mainWindow || mainWindow.isDestroyed()) return

    const safeMessage = escapeHtml(message || 'Omni could not finish starting.')
    const safeLogPath = escapeHtml(getStartupLogPath())

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Omni Startup Error</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; background: #0f172a; color: #f9fafb; margin: 0; padding: 32px; }
      .wrap { max-width: 720px; margin: 0 auto; padding: 24px; border-radius: 12px; background: #111827; border: 1px solid rgba(148, 163, 184, 0.24); }
      h1 { margin-top: 0; font-size: 24px; }
      p { line-height: 1.5; color: #d1d5db; }
      code { display: block; margin-top: 16px; padding: 12px; border-radius: 10px; background: rgba(0,0,0,0.25); color: #f3f4f6; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Omni could not finish starting</h1>
      <p>The local app server did not become ready in time. Your data is still on disk. Please close Omni from Task Manager and reopen it once.</p>
      <code>${safeMessage}</code>
      <p>Startup log:</p>
      <code>${safeLogPath}</code>
    </div>
  </body>
</html>`

    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    mainWindow.show()
    mainWindow.focus()
}

function prepareServerEnvironment() {
    // Static ES imports run before this file's body, so the server must be
    // imported dynamically after these production paths are available.
    process.env.NODE_ENV = 'production'
    process.env.OMNI_RESOURCES_PATH = process.resourcesPath
    process.env.OMNI_APP_PATH = app.getAppPath()
    process.env.OMNI_APP_VERSION = app.getVersion()
    process.env.OMNI_LOCAL_API_TOKEN = randomBytes(32).toString('hex')
}

const startServer = async () => {
    prepareServerEnvironment()
    logStartup(`Starting server for Omni ${app.getVersion()}`)

    await import('../server/index.js')
    logStartup('Server module loaded')
}

const pollServerAndLoadUi = async (retries = 40) => {
    try {
        await fetch('http://127.0.0.1:9474/api/health')
        logStartup('Server health check passed')
        if (mainWindow && !mainWindow.isDestroyed()) {
            await mainWindow.loadURL('http://127.0.0.1:9474')
            mainWindow.show()
            mainWindow.focus()
        }
    } catch (err) {
        if (retries > 0) {
            setTimeout(() => pollServerAndLoadUi(retries - 1), 500)
        } else {
            const detail = err?.stack || err?.message || String(err)
            logStartup('Server health check failed', detail)
            renderStartupError(err?.message || err)
        }
    }
}

const startServerAndLoadUi = async () => {
    let serverReady = false
    const startupTimeoutMs = 25000
    const startupTimer = setTimeout(() => {
        if (serverReady) return
        const message = `Server startup took longer than ${startupTimeoutMs / 1000} seconds.`
        logStartup(message)
        renderStartupError(message)
    }, startupTimeoutMs)

    try {
        await startServer()
        serverReady = true
        clearTimeout(startupTimer)
        await pollServerAndLoadUi()
    } catch (err) {
        serverReady = true
        clearTimeout(startupTimer)
        const detail = err?.stack || err?.message || String(err)
        logStartup('Server startup failed', detail)
        renderStartupError(err?.message || err)
    }
}

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, '../public/omni.ico'),
        show: true,
        backgroundColor: '#111827',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    })

    attachDesktopSessionHeaders(mainWindow.webContents.session)

    // Remove the default Electron menu bar for a cleaner app look
    Menu.setApplicationMenu(null)

    mainWindow.on('closed', () => {
        mainWindow = null
    })

    loadStartupScreen()
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
    logStartup(`App ready for Omni ${app.getVersion()}`)
    configureUpdater()
    createWindow()
    startServerAndLoadUi()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
        else focusMainWindow()
    })
})

process.on('uncaughtException', (err) => {
    const detail = err?.stack || err?.message || String(err)
    logStartup('Uncaught exception', detail)
    renderStartupError(err?.message || err)
})

process.on('unhandledRejection', (reason) => {
    const detail = reason?.stack || reason?.message || String(reason)
    logStartup('Unhandled rejection', detail)
    renderStartupError(reason?.message || reason)
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
