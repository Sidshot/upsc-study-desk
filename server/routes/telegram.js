/**
 * MyStudy Server — Telegram Routes
 *
 * REST endpoints for the Telegram integration.
 * Auth flow: POST send-code → POST sign-in → (optional) POST sign-in-2fa
 * Data:      GET dialogs → GET messages/:chatId → GET stream/:chatId/:msgId
 */

import express from 'express'
import * as tg from '../services/telegramClient.js'
import { getOne } from '../database.js'
import { buildTelegramCourseStructure } from '../services/telegramCourseParser.js'
import {
    getCacheStatus,
    getCachedMedia,
    getParseRules,
    saveParseRules,
    upsertMediaBatch,
} from '../services/telegramIndex.js'
import { cancelScanJob, getScanJob, startScanJob } from '../services/telegramScanJobs.js'

const router = express.Router()

function readSetting(key) {
    const row = getOne('SELECT value FROM settings WHERE key = ?', [key])
    if (!row?.value) return ''
    try {
        return JSON.parse(row.value) || ''
    } catch {
        return row.value || ''
    }
}

function resolveCredentials(req) {
    return {
        apiId: req.body?.apiId || req.query?.apiId || readSetting('telegramApiId'),
        apiHash: req.body?.apiHash || req.query?.apiHash || readSetting('telegramApiHash'),
    }
}

async function requireClient(req) {
    const { apiId, apiHash } = resolveCredentials(req)
    if (!apiId || !apiHash) {
        const err = new Error('Telegram API credentials are required. Add them in Settings first.')
        err.statusCode = 400
        throw err
    }
    await tg.getClient(apiId, apiHash)
    return { apiId, apiHash }
}

// ── Auth & Status ───────────────────────────────────────────────────────────

/**
 * GET /status
 * Check whether the Telegram client is connected & authenticated.
 */
router.get('/status', async (req, res) => {
    try {
        try {
            await requireClient(req)
        } catch (err) {
            if (err.statusCode === 400) {
                return res.json({ connected: false, loggedIn: false })
            }
            throw err
        }
        const status = await tg.getStatus()
        res.json(status)
    } catch (err) {
        console.error('[Telegram] /status error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * POST /send-code
 * Body: { apiId, apiHash, phone }
 * Sends a verification code to the given phone number.
 */
router.post('/send-code', async (req, res) => {
    try {
        const { apiId, apiHash } = resolveCredentials(req)
        const { phone } = req.body
        if (!apiId || !apiHash || !phone) {
            return res.status(400).json({ error: 'Telegram API credentials and phone are required' })
        }

        const result = await tg.sendCode(apiId, apiHash, phone)
        res.json(result)
    } catch (err) {
        console.error('[Telegram] /send-code error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * POST /sign-in
 * Body: { apiId, apiHash, phone, code, phoneCodeHash }
 * Submits the verification code. Returns { ok: true } or { needsPassword: true }.
 */
router.post('/sign-in', async (req, res) => {
    try {
        const { apiId, apiHash } = resolveCredentials(req)
        const { phone, code, phoneCodeHash } = req.body
        if (!apiId || !apiHash || !phone || !code || !phoneCodeHash) {
            return res.status(400).json({ error: 'Telegram API credentials, phone, code, and phoneCodeHash are required' })
        }

        const result = await tg.signIn(apiId, apiHash, phone, code, phoneCodeHash)
        res.json(result)
    } catch (err) {
        console.error('[Telegram] /sign-in error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * POST /sign-in-2fa
 * Body: { password }
 * Submits the 2FA password for accounts that require it.
 */
router.post('/sign-in-2fa', async (req, res) => {
    try {
        const { password } = req.body
        if (!password) {
            return res.status(400).json({ error: 'password is required' })
        }

        const result = await tg.signIn2FA(password)
        res.json(result)
    } catch (err) {
        console.error('[Telegram] /sign-in-2fa error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * POST /logout
 * Log out of Telegram and delete the local session.
 */
router.post('/logout', async (req, res) => {
    try {
        await tg.logout()
        res.json({ ok: true })
    } catch (err) {
        console.error('[Telegram] /logout error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

// ── Data ────────────────────────────────────────────────────────────────────

/**
 * GET /dialogs?apiId=...&apiHash=...
 * Returns channels and supergroups the user has joined.
 */
router.get('/dialogs', async (req, res) => {
    try {
        // Ensure the client is alive (re-creates if needed)
        await requireClient(req)
        const dialogs = await tg.getDialogs()
        res.json(dialogs)
    } catch (err) {
        console.error('[Telegram] /dialogs error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * GET /topics/:chatId?apiId=...&apiHash=...
 * Returns forum topics for the specified chat (if it's a forum).
 */
router.get('/topics/:chatId', async (req, res) => {
    try {
        await requireClient(req)
        const topics = await tg.getTopics(req.params.chatId)
        res.json(topics)
    } catch (err) {
        console.error('[Telegram] /topics error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * GET /messages/:chatId?apiId=...&apiHash=...&limit=50&offsetId=0&topicId=...
 * Returns video messages from the specified chat.
 */
router.get('/messages/:chatId', async (req, res) => {
    try {
        const { limit, offsetId, topicId } = req.query
        const mediaKinds = req.query.mediaKinds
            ? String(req.query.mediaKinds).split(',').map(kind => kind.trim()).filter(Boolean)
            : ['video', 'pdf', 'image']

        await requireClient(req)
        const messages = await tg.getMessages(
            req.params.chatId,
            Number(limit) || 50,
            Number(offsetId) || 0,
            topicId ? Number(topicId) : null,
            { mediaKinds }
        )
        res.json(messages)
    } catch (err) {
        console.error('[Telegram] /messages error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * POST /analyze
 * Body: { chatId, chatTitle, topicId, topicTitle, messages }
 * Converts already-loaded Telegram media rows into the normal course import structure.
 */
router.post('/analyze', async (req, res) => {
    try {
        const { chatId, chatTitle, topicId, topicTitle, messages } = req.body || {}
        if (!chatId || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'chatId and messages are required' })
        }

        const course = buildTelegramCourseStructure({
            chatId,
            chatTitle,
            topicTitle,
            topics: topicId ? [{ id: topicId, title: topicTitle }] : [],
            messages: messages.map(msg => ({ ...msg, chatId, topicId: topicId || msg.topicId || null })),
            rules: getParseRules(chatId),
        })

        res.json({ course })
    } catch (err) {
        console.error('[Telegram] /analyze error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * POST /scan-preview
 * Body: { chatId, chatTitle, topics, maxMessages }
 * Bulk-scans Telegram metadata and returns an import-ready smart course preview.
 */
router.post('/scan-preview', async (req, res) => {
    try {
        const { chatId, chatTitle, topics = [], maxMessages = 500 } = req.body || {}
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' })
        }

        await requireClient(req)
        const topicIds = Array.isArray(topics) && topics.length > 0
            ? topics.map(topic => topic.id)
            : []
        const messages = await tg.scanMessages(chatId, { topicIds, maxMessages })
        const cache = upsertMediaBatch({ chatId, chatTitle, topics, messages })
        const rules = getParseRules(chatId)
        const topicTitle = topics.length === 1 ? topics[0].title : null
        const course = buildTelegramCourseStructure({
            chatId,
            chatTitle,
            topicTitle,
            topics,
            messages,
            rules,
        })

        res.json({
            course,
            scanned: messages.length,
            cached: cache.totalCached,
            maxMessages: Number(maxMessages) || 500,
        })
    } catch (err) {
        console.error('[Telegram] /scan-preview error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * POST /scan-jobs
 * Starts a background Telegram metadata scan and returns a job id for polling.
 */
router.post('/scan-jobs', async (req, res) => {
    try {
        const { chatId, chatTitle, topics = [], maxMessages = 500, onlyNew = false } = req.body || {}
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' })
        }

        await requireClient(req)
        const job = startScanJob({ chatId, chatTitle, topics, maxMessages, onlyNew })
        res.status(202).json({ job })
    } catch (err) {
        console.error('[Telegram] /scan-jobs error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

router.get('/scan-jobs/:jobId', async (req, res) => {
    try {
        const job = getScanJob(req.params.jobId)
        if (!job) return res.status(404).json({ error: 'Scan job not found' })
        res.json({ job })
    } catch (err) {
        console.error('[Telegram] /scan-jobs status error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

router.post('/scan-jobs/:jobId/cancel', async (req, res) => {
    try {
        const job = cancelScanJob(req.params.jobId)
        if (!job) return res.status(404).json({ error: 'Scan job not found' })
        res.json({ job })
    } catch (err) {
        console.error('[Telegram] /scan-jobs cancel error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * GET /cache-status/:chatId
 * Returns local Telegram metadata cache status and saved parsing rules.
 */
router.get('/cache-status/:chatId', async (req, res) => {
    try {
        res.json(getCacheStatus(req.params.chatId))
    } catch (err) {
        console.error('[Telegram] /cache-status error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * POST /cached-preview
 * Body: { chatId, chatTitle, topics, maxMessages }
 * Builds an import preview from already-indexed Telegram metadata.
 */
router.post('/cached-preview', async (req, res) => {
    try {
        const { chatId, chatTitle, topics = [], maxMessages = 1000 } = req.body || {}
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' })
        }

        const topicIds = Array.isArray(topics) && topics.length > 0
            ? topics.map(topic => topic.id)
            : []
        const messages = getCachedMedia(chatId, { topicIds, limit: maxMessages })
        const rules = getParseRules(chatId)
        const topicTitle = topics.length === 1 ? topics[0].title : null
        const course = buildTelegramCourseStructure({
            chatId,
            chatTitle,
            topicTitle,
            topics,
            messages,
            rules,
        })

        res.json({
            course,
            cached: messages.length,
            maxMessages: Number(maxMessages) || 1000,
        })
    } catch (err) {
        console.error('[Telegram] /cached-preview error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * GET/PUT /rules/:chatId
 * Reads or saves per-group parsing preferences.
 */
router.get('/rules/:chatId', async (req, res) => {
    try {
        res.json(getParseRules(req.params.chatId))
    } catch (err) {
        console.error('[Telegram] /rules GET error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

router.put('/rules/:chatId', async (req, res) => {
    try {
        const rules = saveParseRules(req.params.chatId, req.body || {})
        res.json({ rules })
    } catch (err) {
        console.error('[Telegram] /rules PUT error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * GET /stream/:chatId/:msgId?apiId=...&apiHash=...
 * Streams the video media directly to the response (supports Range requests).
 * This endpoint does NOT return JSON — the service writes raw bytes to `res`.
 */
async function handleStream(req, res, options = {}) {
    try {
        await requireClient(req)
        await tg.streamMedia(
            req.params.chatId,
            Number(req.params.msgId),
            req.headers.range,
            res,
            options,
        )
    } catch (err) {
        console.error('[Telegram] /stream error:', err.message)
        if (!res.headersSent) {
            const message = err.message || 'Telegram stream failed'
            const isAuthError = /AUTH_KEY_UNREGISTERED|SESSION|not initialised|credentials/i.test(message)
            res.set('X-Omni-Stream-Error', isAuthError ? 'telegram-auth' : 'telegram-stream')
            res.status(isAuthError ? 401 : 500).json({ error: message })
        }
    }
}

router.head('/stream/:chatId/:msgId', (req, res) => handleStream(req, res, { headOnly: true }))
router.get('/stream/:chatId/:msgId', handleStream)

export default router
