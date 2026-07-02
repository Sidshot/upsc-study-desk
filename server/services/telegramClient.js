/**
 * MyStudy Server — Telegram Client Service
 *
 * GramJS-based Telegram user-client that provides:
 * - Session-based authentication (persisted to disk)
 * - Channel / group discovery (dialogs)
 * - Video message listing with thumbnail extraction
 * - Chunked media streaming for arbitrarily large files
 *
 * All BigInt values are converted to strings before leaving this module
 * so they survive JSON.stringify without the "BigInt not serializable" error.
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { Api } from 'telegram/tl/index.js'
import bigInt from 'big-integer'
import fs from 'fs'
import path from 'path'
import { getDataDir } from '../database.js'

// ── Module-level state ──────────────────────────────────────────────────────
let client = null
let currentPhone = null   // remembered between sendCode → signIn
let currentApiKey = null

/**
 * Path to the persisted session string on disk
 */
function sessionFilePath() {
    return path.join(getDataDir(), 'telegram_session.txt')
}

/**
 * Read the saved session string (or return empty string for a fresh session)
 */
function loadSessionString() {
    try {
        if (fs.existsSync(sessionFilePath())) {
            return fs.readFileSync(sessionFilePath(), 'utf-8').trim()
        }
    } catch (err) {
        console.error('[Telegram] Failed to read session file:', err.message)
    }
    return ''
}

/**
 * Persist the current session string to disk so re-auth is not needed
 */
function saveSession() {
    try {
        const sessionStr = client.session.save()
        fs.writeFileSync(sessionFilePath(), sessionStr, 'utf-8')
        console.log('[Telegram] Session saved to disk')
    } catch (err) {
        console.error('[Telegram] Failed to save session:', err.message)
    }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Return the existing client or create + connect a new one.
 * apiId / apiHash come from the frontend (stored in user settings).
 */
export async function getClient(apiId, apiHash) {
    if (!apiId || !apiHash || !Number.isFinite(Number(apiId))) {
        throw new Error('Valid Telegram API ID and API Hash are required')
    }

    const nextApiKey = `${Number(apiId)}:${apiHash}`
    if (client && currentApiKey && currentApiKey !== nextApiKey) {
        try {
            await client.disconnect()
        } catch { /* best effort */ }
        client = null
        currentPhone = null
    }

    if (client) {
        if (!client.connected) {
            await client.connect()
            console.log('[Telegram] Re-connected existing client')
        }
        return client
    }

    const sessionStr = loadSessionString()
    const session = new StringSession(sessionStr)

    client = new TelegramClient(session, Number(apiId), apiHash, {
        connectionRetries: 5,
        // Suppress the interactive prompt GramJS uses by default
        // — we handle auth ourselves via the REST API.
    })

    await client.connect()
    currentApiKey = nextApiKey
    console.log('[Telegram] Client connected (session length:', sessionStr.length, ')')
    return client
}

/**
 * Step 1 of login — request a verification code via SMS / Telegram message.
 */
export async function sendCode(apiId, apiHash, phone) {
    const cl = await getClient(apiId, apiHash)
    currentPhone = phone

    const result = await cl.sendCode(
        { apiId: Number(apiId), apiHash },
        phone,
    )

    console.log('[Telegram] Code sent to', phone)
    return { phoneCodeHash: result.phoneCodeHash }
}

/**
 * Step 2 of login — submit the verification code.
 * Returns { ok: true } on success, or { needsPassword: true } for 2FA accounts.
 */
export async function signIn(apiId, apiHash, phone, code, phoneCodeHash) {
    const cl = await getClient(apiId, apiHash)

    try {
        await cl.invoke(
            new Api.auth.SignIn({
                phoneNumber: phone,
                phoneCodeHash,
                phoneCode: code,
            }),
        )
        saveSession()
        console.log('[Telegram] Signed in successfully')
        return { ok: true }
    } catch (err) {
        // Telegram returns this error when the account has a 2FA password
        if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
            console.log('[Telegram] 2FA password required')
            return { needsPassword: true }
        }
        throw err
    }
}

/**
 * Step 2b — submit the 2FA password (only needed if signIn returned needsPassword)
 */
export async function signIn2FA(password) {
    if (!client) throw new Error('No active client — call sendCode first')

    // GramJS exposes a convenient helper that handles SRP internally
    await client.signInWithPassword(
        { password: () => password },
    )

    saveSession()
    console.log('[Telegram] 2FA sign-in successful')
    return { ok: true }
}

/**
 * Connection & auth status check.  Returns basic user info if logged in.
 */
export async function getStatus() {
    if (!client || !client.connected) {
        return { connected: false, loggedIn: false }
    }

    try {
        const me = await client.getMe()
        return {
            connected: true,
            loggedIn: true,
            user: {
                id: me.id.toString(),
                firstName: me.firstName,
                lastName: me.lastName || '',
                username: me.username || '',
                phone: me.phone || '',
            },
        }
    } catch {
        return { connected: true, loggedIn: false }
    }
}

/**
 * Fetch all dialogs and return only channels / supergroups (megagroups).
 */
export async function getDialogs() {
    if (!client) throw new Error('Client not initialised')

    const dialogs = await client.getDialogs({})
    const results = []

    for (const d of dialogs) {
        const entity = d.entity
        if (!entity) continue

        // We only care about channels (broadcasts) and megagroups
        const isChannel = entity.className === 'Channel' && !entity.megagroup
        const isGroup = entity.className === 'Channel' && entity.megagroup

        if (!isChannel && !isGroup) continue

        results.push({
            id: entity.id.toString(),
            title: d.title || entity.title || '',
            isChannel,
            isGroup,
            isForum: !!entity.forum,
            accessHash: entity.accessHash?.toString() || '',
        })
    }

    console.log(`[Telegram] Found ${results.length} channels/groups`)
    return results
}

/**
 * Fetch topics (forums) for a specific chat.
 */
export async function getTopics(chatId, limit = 500) {
    if (!client) throw new Error('Client not initialised')

    let entity
    try {
        entity = await client.getEntity(BigInt(chatId))
    } catch {
        await client.getDialogs({})
        entity = await client.getEntity(BigInt(chatId))
    }

    if (!entity.forum) {
        return []
    }

    const topics = []
    let offsetDate = 0
    let offsetId = 0
    let offsetTopic = 0
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 100))

    while (topics.length < limit) {
        const result = await client.invoke(
            new Api.channels.GetForumTopics({
                channel: entity,
                offsetDate,
                offsetId,
                offsetTopic,
                limit: Math.min(pageSize, limit - topics.length),
            })
        )

        const page = result.topics || []
        if (page.length === 0) break

        for (const topic of page) {
            topics.push({
                id: topic.id,
                title: topic.title,
                date: topic.date,
            })
        }

        const lastTopic = page[page.length - 1]
        offsetDate = lastTopic.date || 0
        offsetId = lastTopic.topMessage || lastTopic.id || 0
        offsetTopic = lastTopic.id || 0

        if (page.length < pageSize) break
    }

    return topics
}

/**
 * Fetch messages from a chat, filtered to video and PDF only.
 *
 * @param {string} chatId   - Peer ID as a string (comes from URL param)
 * @param {number} limit    - Max messages to scan per batch
 * @param {number} offsetId - Telegram message-id offset for pagination
 * @param {number|null} topicId - Optional topic ID for forums
 */
export async function getMessages(chatId, limit = 50, offsetId = 0, topicId = null, options = {}) {
    if (!client) throw new Error('Client not initialised')

    // Resolve the chatId string to a proper InputPeer entity
    const entity = await client.getEntity(BigInt(chatId))

    const params = {
        limit: Number(limit),
        offsetId: Number(offsetId),
    }

    if (options.minId) {
        params.minId = Number(options.minId)
    }

    if (topicId) {
        params.replyTo = Number(topicId)
    }

    const videoMessages = await client.getMessages(entity, {
        ...params,
        filter: new Api.InputMessagesFilterVideo(),
    })

    const documentMessages = await client.getMessages(entity, {
        ...params,
        filter: new Api.InputMessagesFilterDocument(),
    })

    // Combine, deduplicate by ID, and sort by date descending
    const allMessages = [...videoMessages, ...documentMessages]
    const uniqueMessagesMap = new Map()
    for (const msg of allMessages) {
        if (!uniqueMessagesMap.has(msg.id)) {
            uniqueMessagesMap.set(msg.id, msg)
        }
    }
    const messages = Array.from(uniqueMessagesMap.values()).sort((a, b) => b.date - a.date)

    const videos = []

    for (const msg of messages) {
        if (!msg.media || !msg.media.document) continue

        const doc = msg.media.document
        const mimeType = doc.mimeType || ''
        
        // Allow videos and PDFs
        const isPdf = mimeType === 'application/pdf'
        if (!mimeType.startsWith('video/') && !isPdf) continue

        // Pull the filename from document attributes if available
        let fileName = ''
        let duration = 0
        for (const attr of doc.attributes || []) {
            if (attr.className === 'DocumentAttributeFilename') {
                fileName = attr.fileName
            }
            if (attr.className === 'DocumentAttributeVideo') {
                duration = attr.duration || 0
            }
        }

        // Sometimes videos are sent without proper names
        if (!fileName) {
            fileName = isPdf ? `Document_${doc.id}.pdf` : `Video_${doc.id}.mp4`
        }

        // Optionally grab the smallest thumbnail as base64. Bulk scan keeps this off
        // because thumbnail downloads turn hundreds of metadata rows into hundreds of media requests.
        let thumbnail = null
        if (options.includeThumbnails !== false && doc.thumbs && doc.thumbs.length > 0) {
            try {
                const thumb = doc.thumbs[0] // smallest first
                const thumbBuf = await client.downloadMedia(msg.media, {
                    thumb: thumb,
                })
                if (thumbBuf) {
                    thumbnail = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`
                }
            } catch {
                // Thumbnail download failed — not critical, just skip
            }
        }

        videos.push({
            id: msg.id,
            date: msg.date,
            message: msg.message || '',
            fileName,
            mimeType,
            type: isPdf ? 'pdf' : 'video',
            size: doc.size?.toString() || '0',
            duration,
            thumbnail,
            chatId,
            topicId,
        })
    }

    console.log(`[Telegram] Chat ${chatId}: ${videos.length} videos (scanned ${messages.length} msgs)`)
    return videos
}

export async function scanMessages(chatId, options = {}) {
    const maxMessages = Math.min(Math.max(Number(options.maxMessages) || 500, 1), 5000)
    const batchSize = Math.min(Math.max(Number(options.batchSize) || 100, 1), 200)
    const topicIds = Array.isArray(options.topicIds) && options.topicIds.length > 0
        ? options.topicIds
        : [null]
    const collected = []

    for (const topicId of topicIds) {
        if (options.shouldCancel?.()) break
        let offsetId = 0
        const topicLimit = Math.max(1, Math.ceil(maxMessages / topicIds.length))

        while (collected.filter(item => String(item.topicId || '') === String(topicId || '')).length < topicLimit) {
            if (options.shouldCancel?.()) break
            const remainingForTopic = topicLimit - collected.filter(item => String(item.topicId || '') === String(topicId || '')).length
            const batch = await getMessages(
                chatId,
                Math.min(batchSize, remainingForTopic),
                offsetId,
                topicId,
                { includeThumbnails: false, minId: options.minId }
            )

            if (batch.length === 0) break

            const taggedBatch = batch.map(item => ({ ...item, chatId, topicId }))
            collected.push(...taggedBatch)
            await options.onBatch?.({
                topicId,
                batch: taggedBatch,
                collected: collected.length,
                maxMessages,
            })
            options.onProgress?.({
                topicId,
                collected: collected.length,
                maxMessages,
            })
            offsetId = Math.min(...batch.map(item => Number(item.id)).filter(Boolean))

            if (batch.length < Math.min(batchSize, remainingForTopic) || !offsetId) break
        }
    }

    const unique = new Map()
    for (const item of collected) {
        unique.set(`${item.chatId}:${item.topicId || 'main'}:${item.id}`, item)
    }

    return Array.from(unique.values()).sort((a, b) => b.date - a.date)
}

/**
 * Stream a video file from Telegram directly to an HTTP response.
 *
 * Supports HTTP Range requests so the browser can seek.
 * Uses GramJS iterDownload for chunked, memory-efficient transfer.
 *
 * @param {string}   chatId - Peer ID as a string
 * @param {number}   msgId  - Message ID containing the video
 * @param {string}   range  - Raw HTTP Range header (e.g. "bytes=0-1048575")
 * @param {Response} res    - Express response object (we write directly)
 */
export async function streamMedia(chatId, msgId, range, res) {
    if (!client) throw new Error('Client not initialised')

    let entity
    try {
        entity = await client.getEntity(BigInt(chatId))
    } catch (err) {
        console.log(`[Telegram] Entity ${chatId} not found in cache. Fetching dialogs...`)
        await client.getDialogs()
        entity = await client.getEntity(BigInt(chatId))
    }

    const [msg] = await client.getMessages(entity, { ids: [Number(msgId)] })

    if (!msg || !msg.media || !msg.media.document) {
        res.status(404).json({ error: 'Message or media not found' })
        return
    }

    const doc = msg.media.document
    const fileSize = Number(doc.size)   // BigInt → Number (safe for files < 8 PB)
    let mimeType = doc.mimeType || 'video/mp4'

    // Force proper video mime types (Telegram often sets application/octet-stream for files sent as documents)
    let fileName = ''
    for (const attr of doc.attributes || []) {
        if (attr.className === 'DocumentAttributeFilename') {
            fileName = attr.fileName || ''
        }
    }
    if (fileName.toLowerCase().endsWith('.pdf')) {
        mimeType = 'application/pdf'
    } else if (fileName.toLowerCase().endsWith('.mp4') || mimeType === 'application/octet-stream') {
        mimeType = 'video/mp4'
    } else if (fileName.toLowerCase().endsWith('.webm') || fileName.toLowerCase().endsWith('.mkv')) {
        mimeType = 'video/webm'
    }

    // ── Parse Range header ──────────────────────────────────────────────
    let start = 0
    let end = fileSize - 1

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        start = parseInt(parts[0], 10)
        end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

        if (start >= fileSize || end >= fileSize || start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
            res.end()
            return
        }
    }

    const contentLength = end - start + 1
    const CHUNK_SIZE = 512 * 1024   // 512 KB per Telegram request

    // ── Respond with appropriate status & headers ───────────────────────
    const headers = {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
    }
    
    if (mimeType === 'application/pdf') {
        headers['Content-Disposition'] = `inline; filename="${fileName || 'document.pdf'}"`
    }

    if (range) {
        headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
        headers['Content-Length'] = contentLength
        res.writeHead(206, headers)
    } else {
        headers['Content-Length'] = fileSize
        res.writeHead(200, headers)
    }

    // ── Stream chunks to the response ───────────────────────────────────
    let aborted = false
    res.on('close', () => { aborted = true })

    try {
        let bytesWritten = 0
        const bytesNeeded = contentLength
        
        // Telegram requires offset to be aligned to the chunk size boundary (usually 512KB)
        const alignedStart = Math.floor(start / CHUNK_SIZE) * CHUNK_SIZE
        let skipBytes = start - alignedStart

        for await (const chunk of client.iterDownload({
            file: new Api.InputDocumentFileLocation({
                id: doc.id,
                accessHash: doc.accessHash,
                fileReference: doc.fileReference,
                thumbSize: '',
            }),
            requestSize: CHUNK_SIZE,
            offset: bigInt(alignedStart),
            dcId: doc.dcId,
            fileSize: bigInt(fileSize),
        })) {
            if (aborted) break

            let slice = chunk

            // If this is the very first chunk, skip the unaligned bytes
            if (skipBytes > 0) {
                slice = chunk.slice(skipBytes)
                skipBytes = 0
            }

            // We may receive more bytes than needed in the last chunk
            const remaining = bytesNeeded - bytesWritten
            if (remaining < slice.length) {
                slice = slice.slice(0, remaining)
            }

            res.write(Buffer.from(slice))
            bytesWritten += slice.length

            if (bytesWritten >= bytesNeeded) break
        }
    } catch (err) {
        if (!aborted) {
            console.error('[Telegram] Stream error:', err.message)
        }
    } finally {
        res.end()
    }
}

/**
 * Log out of Telegram, delete local session, and tear down the client.
 */
export async function logout() {
    if (!client) return

    try {
        await client.invoke(new Api.auth.LogOut())
        console.log('[Telegram] Logged out')
    } catch (err) {
        console.error('[Telegram] Logout invoke error:', err.message)
    }

    // Remove persisted session
    try {
        if (fs.existsSync(sessionFilePath())) {
            fs.unlinkSync(sessionFilePath())
        }
    } catch { /* ignore */ }

    client = null
    currentPhone = null
    currentApiKey = null
}
