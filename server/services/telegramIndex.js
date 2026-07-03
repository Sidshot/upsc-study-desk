import { getAll, getOne, run, runInTransaction, transaction } from '../database.js'

function nowIso() {
    return new Date().toISOString()
}

function safeJsonParse(value, fallback = {}) {
    if (!value) return fallback
    try {
        return JSON.parse(value)
    } catch {
        return fallback
    }
}

function normalizeTopicId(topicId) {
    if (topicId === undefined || topicId === null || topicId === '') return null
    return String(topicId)
}

function mediaIndexId(chatId, topicId, messageId) {
    return `${chatId}:${normalizeTopicId(topicId) || 'main'}:${messageId}`
}

function mapMediaRow(row) {
    const raw = safeJsonParse(row.raw_json, {})
    return {
        ...raw,
        id: row.message_id,
        chatId: row.chat_id,
        topicId: row.topic_id || null,
        topicTitle: row.topic_title || '',
        date: row.message_date || 0,
        fileName: row.file_name || raw.fileName || '',
        mimeType: row.mime_type || raw.mimeType || '',
        type: row.media_type || raw.type || 'video',
        size: String(row.file_size || raw.size || 0),
        duration: row.duration || raw.duration || 0,
        message: row.caption || raw.message || '',
    }
}

export function getParseRules(chatId) {
    const row = getOne('SELECT rules_json FROM telegram_parse_rules WHERE chat_id = ?', [String(chatId)])
    return safeJsonParse(row?.rules_json, {})
}

export function saveParseRules(chatId, rules) {
    const cleanRules = {
        groupBy: rules?.groupBy || 'auto',
        defaultScanLimit: Number(rules?.defaultScanLimit) || 500,
        ignoredWords: Array.isArray(rules?.ignoredWords) ? rules.ignoredWords.slice(0, 100) : [],
        moduleOverrides: rules?.moduleOverrides && typeof rules.moduleOverrides === 'object' ? rules.moduleOverrides : {},
        courseTitleOverride: typeof rules?.courseTitleOverride === 'string' ? rules.courseTitleOverride.slice(0, 200) : '',
    }

    run(`
        INSERT INTO telegram_parse_rules (chat_id, rules_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
            rules_json = excluded.rules_json,
            updated_at = excluded.updated_at
    `, [String(chatId), JSON.stringify(cleanRules), nowIso()])

    return cleanRules
}

export function upsertSource(source, writer = run) {
    if (!source?.chatId && !source?.id) return
    const chatId = String(source.chatId || source.id)
    writer(`
        INSERT INTO telegram_sources (
            chat_id, title, is_forum, access_hash, last_scanned_at, custom_metadata
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
            title = excluded.title,
            is_forum = excluded.is_forum,
            access_hash = COALESCE(excluded.access_hash, telegram_sources.access_hash),
            last_scanned_at = excluded.last_scanned_at,
            custom_metadata = excluded.custom_metadata
    `, [
        chatId,
        source.title || 'Telegram Source',
        source.isForum ? 1 : 0,
        source.accessHash || null,
        nowIso(),
        JSON.stringify(source.customMetadata || {}),
    ])
}

export function upsertMediaBatch({ chatId, chatTitle, topics = [], messages = [] }) {
    if (!chatId || !Array.isArray(messages) || messages.length === 0) {
        return { indexed: 0, totalCached: countCachedMedia(chatId) }
    }

    const topicTitles = new Map(topics.map(topic => [String(topic.id), topic.title || '']))
    const indexedAt = nowIso()

    transaction(() => {
        upsertSource({ chatId, title: chatTitle || 'Telegram Source', isForum: topics.length > 0 }, runInTransaction)

        for (const msg of messages) {
            const topicId = normalizeTopicId(msg.topicId)
            const id = mediaIndexId(chatId, topicId, msg.id)
            const fileSize = Number(msg.size || msg.fileSize || 0)
            runInTransaction(`
                INSERT INTO telegram_media_index (
                    id, chat_id, topic_id, topic_title, message_id, message_date,
                    file_name, mime_type, media_type, file_size, duration, caption,
                    raw_json, indexed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chat_id, topic_id, message_id) DO UPDATE SET
                    topic_title = excluded.topic_title,
                    message_date = excluded.message_date,
                    file_name = excluded.file_name,
                    mime_type = excluded.mime_type,
                    media_type = excluded.media_type,
                    file_size = excluded.file_size,
                    duration = excluded.duration,
                    caption = excluded.caption,
                    raw_json = excluded.raw_json,
                    indexed_at = excluded.indexed_at
            `, [
                id,
                String(chatId),
                topicId,
                msg.topicTitle || (topicId ? topicTitles.get(String(topicId)) : '') || '',
                Number(msg.id),
                Number(msg.date || 0),
                msg.fileName || '',
                msg.mimeType || '',
                msg.type || 'video',
                fileSize,
                Number(msg.duration || 0),
                msg.message || '',
                JSON.stringify(msg),
                indexedAt,
            ])
        }

        const latestMessageId = Math.max(...messages.map(msg => Number(msg.id) || 0))
        const mediaCount = countCachedMedia(chatId)
        runInTransaction(`
            UPDATE telegram_sources
            SET last_message_id = MAX(COALESCE(last_message_id, 0), ?),
                media_count = ?,
                last_scanned_at = ?
            WHERE chat_id = ?
        `, [latestMessageId, mediaCount, indexedAt, String(chatId)])
    })

    return { indexed: messages.length, totalCached: countCachedMedia(chatId) }
}

export function countCachedMedia(chatId, topicIds = []) {
    if (!chatId) return 0
    if (topicIds.length === 0) {
        return getOne('SELECT COUNT(*) AS count FROM telegram_media_index WHERE chat_id = ?', [String(chatId)])?.count || 0
    }
    const topicSet = new Set(topicIds.map(topicId => normalizeTopicId(topicId)))
    return getCachedMedia(chatId).filter(item => topicSet.has(normalizeTopicId(item.topicId))).length
}

export function getCachedMedia(chatId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 1000, 1), 10000)
    const topicIds = Array.isArray(options.topicIds) ? options.topicIds.map(normalizeTopicId) : []

    let rows
    if (topicIds.length > 0) {
        const placeholders = topicIds.map(() => '?').join(', ')
        rows = getAll(`
            SELECT * FROM telegram_media_index
            WHERE chat_id = ? AND topic_id IN (${placeholders})
            ORDER BY message_date DESC, message_id DESC
            LIMIT ?
        `, [String(chatId), ...topicIds, limit])
    } else {
        rows = getAll(`
            SELECT * FROM telegram_media_index
            WHERE chat_id = ?
            ORDER BY message_date DESC, message_id DESC
            LIMIT ?
        `, [String(chatId), limit])
    }

    return rows.map(mapMediaRow)
}

export function getCacheStatus(chatId) {
    const source = getOne('SELECT * FROM telegram_sources WHERE chat_id = ?', [String(chatId)])
    return {
        chatId: String(chatId),
        title: source?.title || '',
        lastScannedAt: source?.last_scanned_at || null,
        lastMessageId: source?.last_message_id || 0,
        mediaCount: source?.media_count || countCachedMedia(chatId),
        rules: getParseRules(chatId),
    }
}
