import { getAll, getOne, transaction, runInTransaction } from '../database.js'
import { asJson, createId, nowIso, safeJsonParse } from './sourceUtils.js'

function mapDiscovery(row) {
    if (!row) return null
    return {
        id: row.id,
        sourceId: row.source_id,
        sourceItemKey: row.source_item_key,
        parentKey: row.parent_key,
        topicKey: row.topic_key,
        title: row.title,
        description: row.description,
        fileName: row.file_name,
        mimeType: row.mime_type,
        mediaKind: row.media_kind,
        fileSize: row.file_size,
        duration: row.duration,
        sourceDate: row.source_date,
        sender: row.sender,
        raw: safeJsonParse(row.raw_json, {}),
        lifecycleState: row.lifecycle_state,
        discoveredAt: row.discovered_at,
        updatedAt: row.updated_at,
    }
}

export function upsertDiscoveries(sourceId, discoveries = []) {
    if (!sourceId || discoveries.length === 0) return { upserted: 0 }
    const now = nowIso()
    transaction(() => {
        for (const item of discoveries) {
            const id = item.id || createId('disc')
            runInTransaction(`
                INSERT INTO source_discoveries (
                    id, source_id, source_item_key, parent_key, topic_key, title,
                    description, file_name, mime_type, media_kind, file_size,
                    duration, source_date, sender, raw_json, lifecycle_state,
                    discovered_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_id, source_item_key) DO UPDATE SET
                    parent_key = excluded.parent_key,
                    topic_key = excluded.topic_key,
                    title = excluded.title,
                    description = excluded.description,
                    file_name = excluded.file_name,
                    mime_type = excluded.mime_type,
                    media_kind = excluded.media_kind,
                    file_size = excluded.file_size,
                    duration = excluded.duration,
                    source_date = excluded.source_date,
                    sender = excluded.sender,
                    raw_json = excluded.raw_json,
                    lifecycle_state = excluded.lifecycle_state,
                    updated_at = excluded.updated_at
            `, [
                id,
                sourceId,
                String(item.sourceItemKey || item.source_item_key || item.id),
                item.parentKey || null,
                item.topicKey || null,
                item.title || item.fileName || 'Untitled',
                item.description || '',
                item.fileName || '',
                item.mimeType || '',
                item.mediaKind || item.mediaType || 'other',
                Number(item.fileSize || item.size || 0),
                Number(item.duration || 0),
                Number(item.sourceDate || item.date || 0),
                item.sender || '',
                asJson(item.raw || item, {}),
                item.lifecycleState || 'discovered',
                item.discoveredAt || now,
                now,
            ])
        }
    })
    return { upserted: discoveries.length }
}

export function getDiscovery(discoveryId) {
    return mapDiscovery(getOne('SELECT * FROM source_discoveries WHERE id = ?', [discoveryId]))
}

export function listDiscoveries(sourceId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 1000)
    const offset = Math.max(Number(options.offset) || 0, 0)
    const where = ['source_id = ?']
    const params = [sourceId]

    if (options.mediaType) {
        where.push('media_kind = ?')
        params.push(options.mediaType)
    }
    if (options.topicKey) {
        where.push('topic_key = ?')
        params.push(options.topicKey)
    }
    if (options.q) {
        where.push('(title LIKE ? OR description LIKE ? OR file_name LIKE ?)')
        const q = `%${options.q}%`
        params.push(q, q, q)
    }
    if (options.dateFrom) {
        where.push('source_date >= ?')
        params.push(Number(options.dateFrom))
    }
    if (options.dateTo) {
        where.push('source_date <= ?')
        params.push(Number(options.dateTo))
    }

    const whereSql = where.join(' AND ')
    const rows = getAll(`
        SELECT * FROM source_discoveries
        WHERE ${whereSql}
        ORDER BY source_date DESC, updated_at DESC
        LIMIT ? OFFSET ?
    `, [...params, limit, offset])
    const count = getOne(`SELECT COUNT(*) AS count FROM source_discoveries WHERE ${whereSql}`, params)?.count || 0

    return {
        items: rows.map(mapDiscovery),
        total: count,
        limit,
        offset,
    }
}

export function buildPreview(sourceId, options = {}) {
    const result = listDiscoveries(sourceId, options)
    const counts = { total: result.total, video: 0, pdf: 0, image: 0, audio: 0, document: 0, other: 0 }
    let estimatedSize = 0
    for (const item of result.items) {
        const kind = counts[item.mediaKind] === undefined ? 'other' : item.mediaKind
        counts[kind] += 1
        estimatedSize += Number(item.fileSize || 0)
    }

    const groups = new Map()
    for (const item of result.items) {
        const key = item.mediaKind === 'video' ? 'lectures' : item.mediaKind === 'pdf' ? 'notes' : 'others'
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                title: key === 'lectures' ? 'Lectures' : key === 'notes' ? 'Notes & PDFs' : 'Others',
                items: [],
            })
        }
        groups.get(key).items.push(item)
    }

    return {
        previewId: createId('preview'),
        groups: [...groups.values()],
        counts,
        estimatedSize,
        limit: result.limit,
        offset: result.offset,
    }
}
