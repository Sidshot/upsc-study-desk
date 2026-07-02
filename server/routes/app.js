import express from 'express'
import { getDataDir } from '../database.js'

const router = express.Router()
const UPDATE_REPOSITORY = 'Sidshot/upsc-study-desk'

function updater() {
    return globalThis.omniUpdater || null
}

router.get('/info', (req, res) => {
    res.json({
        name: 'Omni',
        version: process.env.OMNI_APP_VERSION || process.env.npm_package_version || '4.0.1',
        dataDir: getDataDir(),
        updateRepository: UPDATE_REPOSITORY,
        updatesAvailable: Boolean(updater()),
    })
})

router.get('/update/status', (req, res) => {
    const api = updater()
    if (!api) {
        return res.json({
            available: false,
            configured: false,
            checking: false,
            updateRepository: UPDATE_REPOSITORY,
            message: 'Updates are available in the installed desktop app after a release feed is configured.',
        })
    }

    res.json({ updateRepository: UPDATE_REPOSITORY, ...api.getStatus() })
})

router.post('/update/check', async (req, res) => {
    const api = updater()
    if (!api) {
        return res.status(503).json({ error: 'Desktop updater is not available in this runtime.' })
    }

    try {
        res.json(await api.check())
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/update/download', async (req, res) => {
    const api = updater()
    if (!api) {
        return res.status(503).json({ error: 'Desktop updater is not available in this runtime.' })
    }

    try {
        res.json(await api.download())
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/update/restart', (req, res) => {
    const api = updater()
    if (!api) {
        return res.status(503).json({ error: 'Desktop updater is not available in this runtime.' })
    }

    res.json({ success: true })
    setTimeout(() => api.quitAndInstall(), 250)
})

export default router
