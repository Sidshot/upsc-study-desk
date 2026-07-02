/**
 * MyStudy Server — Telegram Routes
 *
 * REST endpoints for the Telegram integration.
 * Auth flow: POST send-code → POST sign-in → (optional) POST sign-in-2fa
 * Data:      GET dialogs → GET messages/:chatId → GET stream/:chatId/:msgId
 */

import express from 'express'
import * as tg from '../services/telegramClient.js'

const router = express.Router()

// ── Auth & Status ───────────────────────────────────────────────────────────

/**
 * GET /status
 * Check whether the Telegram client is connected & authenticated.
 */
router.get('/status', async (req, res) => {
    try {
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
        const { apiId, apiHash, phone } = req.body
        if (!apiId || !apiHash || !phone) {
            return res.status(400).json({ error: 'apiId, apiHash, and phone are required' })
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
        const { apiId, apiHash, phone, code, phoneCodeHash } = req.body
        if (!apiId || !apiHash || !phone || !code || !phoneCodeHash) {
            return res.status(400).json({ error: 'apiId, apiHash, phone, code, and phoneCodeHash are required' })
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
        const { apiId, apiHash } = req.query
        if (!apiId || !apiHash) {
            return res.status(400).json({ error: 'apiId and apiHash query params are required' })
        }

        // Ensure the client is alive (re-creates if needed)
        await tg.getClient(apiId, apiHash)
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
        const { apiId, apiHash } = req.query
        if (!apiId || !apiHash) {
            return res.status(400).json({ error: 'apiId and apiHash query params are required' })
        }

        await tg.getClient(apiId, apiHash)
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
        const { apiId, apiHash, limit, offsetId, topicId } = req.query
        if (!apiId || !apiHash) {
            return res.status(400).json({ error: 'apiId and apiHash query params are required' })
        }

        await tg.getClient(apiId, apiHash)
        const messages = await tg.getMessages(
            req.params.chatId,
            Number(limit) || 50,
            Number(offsetId) || 0,
            topicId ? Number(topicId) : null
        )
        res.json(messages)
    } catch (err) {
        console.error('[Telegram] /messages error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

/**
 * GET /stream/:chatId/:msgId?apiId=...&apiHash=...
 * Streams the video media directly to the response (supports Range requests).
 * This endpoint does NOT return JSON — the service writes raw bytes to `res`.
 */
router.get('/stream/:chatId/:msgId', async (req, res) => {
    try {
        const { apiId, apiHash } = req.query
        if (!apiId || !apiHash) {
            return res.status(400).json({ error: 'apiId and apiHash query params are required' })
        }

        await tg.getClient(apiId, apiHash)
        await tg.streamMedia(
            req.params.chatId,
            Number(req.params.msgId),
            req.headers.range,
            res,
        )
    } catch (err) {
        console.error('[Telegram] /stream error:', err.message)
        if (!res.headersSent) {
            res.status(500).json({ error: err.message })
        }
    }
})

export default router
