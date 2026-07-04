import { getAll, getOne, runInTransaction, transaction } from '../database.js'
import { createId, nowIso, safeJsonParse } from './sourceUtils.js'

function parseTelegramStreamUrl(url = '') {
    const match = String(url).match(/\/api\/telegram\/stream\/([^/?#]+)\/(\d+)/)
    if (!match) return null
    return {
        chatId: decodeURIComponent(match[1]),
        messageId: Number(match[2]),
    }
}

function mediaTypeForVideo(row) {
    if (row.type) return row.type
    if (row.mime_type?.startsWith?.('image/')) return 'image'
    if (row.mime_type === 'application/pdf' || row.file_name?.toLowerCase?.().endsWith('.pdf')) return 'pdf'
    return 'video'
}

function sourceCapabilities() {
    return {
        adapterInterfaceVersion: 1,
        incrementalSync: true,
        topics: true,
        captions: true,
        mediaStreaming: true,
        deleteDetection: false,
        versionHistory: false,
        linkedFromLegacyImport: true,
    }
}

function sourceRules() {
    return {
        fileTypes: ['video', 'pdf', 'image', 'audio', 'document', 'other'],
        groupBy: 'auto',
        newOnly: true,
        linkedFromLegacyImport: true,
    }
}

function upsertLegacySource({ chatId, title, maxMessageId, now }) {
    const sourceId = `source_telegram_${chatId}`
    runInTransaction(`
        INSERT INTO sources (
            id, type, name, status, health_state, capabilities_json, rules_json,
            discovery_cursor_json, sync_cursor_json, last_scanned_at,
            last_imported_at, last_error_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = COALESCE(NULLIF(sources.name, ''), excluded.name),
            status = CASE WHEN sources.status = 'created' THEN excluded.status ELSE sources.status END,
            health_state = CASE WHEN sources.health_state = 'disconnected' THEN excluded.health_state ELSE sources.health_state END,
            capabilities_json = excluded.capabilities_json,
            rules_json = CASE WHEN sources.rules_json = '{}' THEN excluded.rules_json ELSE sources.rules_json END,
            discovery_cursor_json = CASE WHEN sources.discovery_cursor_json = '{}' THEN excluded.discovery_cursor_json ELSE sources.discovery_cursor_json END,
            sync_cursor_json = CASE WHEN sources.sync_cursor_json = '{}' THEN excluded.sync_cursor_json ELSE sources.sync_cursor_json END,
            last_imported_at = COALESCE(sources.last_imported_at, excluded.last_imported_at),
            updated_at = excluded.updated_at
    `, [
        sourceId,
        'telegram',
        title || 'Telegram Source',
        'linked',
        'connected',
        JSON.stringify(sourceCapabilities()),
        JSON.stringify(sourceRules()),
        JSON.stringify({ chatId: String(chatId), linkedFromLegacyImport: true }),
        JSON.stringify({ chatId: String(chatId), lastMessageId: maxMessageId || 0, lastMessageIds: {} }),
        null,
        now,
        '{}',
        now,
        now,
    ])
    return sourceId
}

function upsertMetadataAndSearch({ importedItemId, sourceId, courseId, videoId, sourceName, row, metadata, now }) {
    const mediaType = mediaTypeForVideo(row)
    const searchText = [
        row.title,
        row.description,
        row.file_name,
        sourceName,
        metadata.telegram?.chatId,
        metadata.telegram?.messageId,
        mediaType,
    ].filter(Boolean).join(' ')

    runInTransaction(`
        INSERT INTO metadata_store (
            id, imported_item_id, source_id, course_id, video_id, title,
            description, caption, file_name, source_name, topic_name,
            media_type, source_date, fields_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(imported_item_id) DO UPDATE SET
            source_id = excluded.source_id,
            course_id = excluded.course_id,
            video_id = excluded.video_id,
            title = excluded.title,
            description = excluded.description,
            caption = excluded.caption,
            file_name = excluded.file_name,
            source_name = excluded.source_name,
            media_type = excluded.media_type,
            fields_json = excluded.fields_json,
            updated_at = excluded.updated_at
    `, [
        `metadata_${importedItemId}`,
        importedItemId,
        sourceId,
        courseId,
        videoId,
        row.title || '',
        row.description || '',
        row.description || '',
        row.file_name || '',
        sourceName || '',
        metadata.telegram?.topicId || '',
        mediaType,
        0,
        JSON.stringify(metadata),
        now,
    ])

    runInTransaction(`
        INSERT INTO search_index (
            id, imported_item_id, search_text, title, media_type,
            source_id, course_id, rank_weight, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(imported_item_id) DO UPDATE SET
            search_text = excluded.search_text,
            title = excluded.title,
            media_type = excluded.media_type,
            source_id = excluded.source_id,
            course_id = excluded.course_id,
            indexed_at = excluded.indexed_at
    `, [
        `search_${importedItemId}`,
        importedItemId,
        searchText.toLowerCase(),
        row.title || '',
        mediaType,
        sourceId,
        courseId,
        1,
        now,
    ])
}

export function linkLegacyTelegramImports() {
    const rows = getAll(`
        SELECT
            c.id AS course_id,
            c.title AS course_title,
            c.original_title AS course_original_title,
            c.date_added AS course_date_added,
            m.id AS module_id,
            m.title AS module_title,
            v.id AS video_id,
            v.title,
            v.original_title,
            v.description,
            v.file_name,
            v.file_size,
            v.duration,
            v.url,
            v.type,
            v.source_metadata
        FROM courses c
        JOIN videos v ON v.course_id = c.id
        LEFT JOIN modules m ON m.id = v.module_id
        LEFT JOIN imported_items ii ON ii.video_id = v.id
        WHERE c.source_type = 'telegram'
          AND v.url LIKE '%/api/telegram/stream/%'
          AND ii.id IS NULL
        ORDER BY c.id, v."order" ASC
    `)

    const linkableRows = rows
        .map(row => ({ row, parsed: parseTelegramStreamUrl(row.url) }))
        .filter(item => item.parsed)

    if (linkableRows.length === 0) {
        return { linked: 0, sources: 0, skipped: rows.length }
    }

    const sourceStats = new Map()
    for (const { row, parsed } of linkableRows) {
        const key = parsed.chatId
        const existing = sourceStats.get(key) || {
            chatId: key,
            title: row.course_original_title || row.course_title || 'Telegram Source',
            maxMessageId: 0,
            count: 0,
        }
        existing.maxMessageId = Math.max(existing.maxMessageId, parsed.messageId || 0)
        existing.count += 1
        sourceStats.set(key, existing)
    }

    let linked = 0
    const now = nowIso()

    transaction(() => {
        for (const stat of sourceStats.values()) {
            upsertLegacySource({ ...stat, now })
        }

        for (const { row, parsed } of linkableRows) {
            const sourceId = `source_telegram_${parsed.chatId}`
            const sourceItemKey = `${parsed.chatId}:main:${parsed.messageId}`
            const importedItemId = `imported_legacy_${row.video_id}`
            const mediaType = mediaTypeForVideo(row)
            const existingMetadata = safeJsonParse(row.source_metadata, {})
            const sourceName = sourceStats.get(parsed.chatId)?.title || row.course_title || 'Telegram Source'
            const metadata = {
                ...existingMetadata,
                url: row.url,
                legacyLinked: true,
                schemaVersion: 1,
                sourceId,
                sourceType: 'telegram',
                sourceItemKey,
                moduleTitle: row.module_title || '',
                telegram: {
                    ...(existingMetadata.telegram || {}),
                    chatId: parsed.chatId,
                    messageId: parsed.messageId,
                },
            }

            runInTransaction(`
                INSERT INTO imported_items (
                    id, source_id, source_item_key, course_id, module_id, video_id,
                    schema_version, title, description, media_type, mime_type,
                    file_name, file_size, duration, thumbnail_data, metadata_json,
                    lifecycle_state, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_id, source_item_key) DO UPDATE SET
                    course_id = COALESCE(imported_items.course_id, excluded.course_id),
                    module_id = COALESCE(imported_items.module_id, excluded.module_id),
                    video_id = COALESCE(imported_items.video_id, excluded.video_id),
                    metadata_json = excluded.metadata_json,
                    lifecycle_state = 'available',
                    updated_at = excluded.updated_at
            `, [
                importedItemId,
                sourceId,
                sourceItemKey,
                row.course_id,
                row.module_id,
                row.video_id,
                1,
                row.title || row.file_name || 'Telegram Item',
                row.description || '',
                mediaType,
                '',
                row.file_name || '',
                Number(row.file_size || 0),
                Number(row.duration || 0),
                null,
                JSON.stringify(metadata),
                'available',
                row.course_date_added || now,
                now,
            ])

            runInTransaction('UPDATE videos SET source_metadata = ? WHERE id = ?', [
                JSON.stringify(metadata),
                row.video_id,
            ])

            upsertMetadataAndSearch({
                importedItemId,
                sourceId,
                courseId: row.course_id,
                videoId: row.video_id,
                sourceName,
                row,
                metadata,
                now,
            })
            linked += 1
        }
    })

    const linkedSources = getOne('SELECT COUNT(*) AS count FROM sources WHERE type = ? AND id LIKE ?', ['telegram', 'source_telegram_%'])?.count || 0
    return { linked, sources: linkedSources, skipped: rows.length - linked }
}
