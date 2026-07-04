import { getAll, run } from '../database.js'
import { asJson, createId, nowIso, safeJsonParse } from './sourceUtils.js'

export function upsertMetadataForImportedItem(importedItem, source = null) {
    if (!importedItem?.id) return null
    const metadata = safeJsonParse(importedItem.metadata_json || importedItem.metadataJson, {})
    const id = `meta_${importedItem.id}`
    run(`
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
            topic_name = excluded.topic_name,
            media_type = excluded.media_type,
            source_date = excluded.source_date,
            fields_json = excluded.fields_json,
            updated_at = excluded.updated_at
    `, [
        id,
        importedItem.id,
        importedItem.source_id || importedItem.sourceId,
        importedItem.course_id || importedItem.courseId || null,
        importedItem.video_id || importedItem.videoId || null,
        importedItem.title || '',
        importedItem.description || '',
        metadata.caption || importedItem.description || '',
        importedItem.file_name || importedItem.fileName || '',
        source?.name || metadata.sourceName || '',
        metadata.topicName || '',
        importedItem.media_type || importedItem.mediaType || 'other',
        Number(metadata.sourceDate || 0),
        asJson(metadata, {}),
        nowIso(),
    ])
    return id
}

export function rebuildSearchIndex() {
    const rows = getAll('SELECT * FROM metadata_store')
    for (const row of rows) {
        const text = [
            row.title,
            row.description,
            row.caption,
            row.file_name,
            row.source_name,
            row.topic_name,
            row.media_type,
        ].filter(Boolean).join(' ')
        run(`
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
            `search_${row.imported_item_id || createId('idx')}`,
            row.imported_item_id,
            text,
            row.title || '',
            row.media_type || 'other',
            row.source_id,
            row.course_id || null,
            1,
            nowIso(),
        ])
    }
    return { indexed: rows.length }
}
