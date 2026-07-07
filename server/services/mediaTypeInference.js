import { getAll, runInTransaction, transaction } from '../database.js'
import { safeJsonParse } from './sourceUtils.js'

const SUPPORTED_TYPES = new Set(['video', 'pdf', 'image', 'audio', 'document', 'other'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.ts', '.m3u8'])
const PDF_EXTENSIONS = new Set(['.pdf'])
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac'])
const DOCUMENT_EXTENSIONS = new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.csv'])

function mediaTypeFromMime(mime = '') {
    const value = String(mime || '').toLowerCase()
    if (!value) return null
    if (value === 'application/pdf') return 'pdf'
    if (value.startsWith('image/')) return 'image'
    if (value.startsWith('audio/')) return 'audio'
    if (value.startsWith('video/')) return 'video'
    if (
        value.includes('word') ||
        value.includes('powerpoint') ||
        value.includes('excel') ||
        value === 'text/plain' ||
        value === 'text/csv'
    ) return 'document'
    return null
}

function mediaTypeFromName(value = '') {
    const raw = String(value || '').toLowerCase()
    const lower = raw.includes('://') || raw.startsWith('/api/')
        ? raw.split(/[?#]/)[0]
        : raw
    const match = lower.match(/(\.[a-z0-9]+)$/)
    if (!match) return null
    const ext = match[1]
    if (PDF_EXTENSIONS.has(ext)) return 'pdf'
    if (IMAGE_EXTENSIONS.has(ext)) return 'image'
    if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
    if (VIDEO_EXTENSIONS.has(ext)) return 'video'
    if (DOCUMENT_EXTENSIONS.has(ext)) return 'document'
    return null
}

function validType(value) {
    const normalized = String(value || '').toLowerCase()
    return SUPPORTED_TYPES.has(normalized) ? normalized : null
}

function metadataFor(row = {}) {
    if (typeof row.source_metadata === 'string') return safeJsonParse(row.source_metadata, {})
    if (typeof row.metadata_json === 'string') return safeJsonParse(row.metadata_json, {})
    if (row.metadata && typeof row.metadata === 'object') return row.metadata
    return {}
}

export function inferMediaType(row = {}, fallback = 'video') {
    const metadata = metadataFor(row)
    const raw = metadata.raw || {}

    const mimes = [
        row.mime_type,
        row.mimeType,
        metadata.mime_type,
        metadata.mimeType,
        raw.mime_type,
        raw.mimeType,
    ]
    for (const mime of mimes) {
        const inferred = mediaTypeFromMime(mime)
        if (inferred) return inferred
    }

    const names = [
        row.file_name,
        row.fileName,
        metadata.file_name,
        metadata.fileName,
        raw.file_name,
        raw.fileName,
        row.title,
        row.original_title,
        row.url,
        metadata.url,
    ]
    for (const name of names) {
        const inferred = mediaTypeFromName(name)
        if (inferred) return inferred
    }

    return validType(row.type) ||
        validType(row.media_type) ||
        validType(row.mediaType) ||
        validType(metadata.media_type) ||
        validType(metadata.mediaType) ||
        validType(raw.type) ||
        validType(raw.mediaKind) ||
        validType(raw.media_type) ||
        fallback
}

function updateCourseTotals(courseIds) {
    for (const courseId of courseIds) {
        if (!courseId) continue
        runInTransaction(`
            UPDATE courses
            SET total_duration = (
                    SELECT COALESCE(SUM(CASE WHEN type = 'video' THEN duration ELSE 0 END), 0)
                    FROM videos WHERE course_id = ?
                ),
                total_videos = (
                    SELECT COUNT(*) FROM videos WHERE course_id = ? AND type = 'video'
                ),
                completed_videos = (
                    SELECT COUNT(*) FROM videos WHERE course_id = ? AND type = 'video' AND is_completed = 1
                ),
                completion_percentage = CASE
                    WHEN (SELECT COUNT(*) FROM videos WHERE course_id = ? AND type = 'video') > 0 THEN
                        (SELECT COUNT(*) * 100.0 FROM videos WHERE course_id = ? AND type = 'video' AND is_completed = 1) /
                        (SELECT COUNT(*) FROM videos WHERE course_id = ? AND type = 'video')
                    ELSE 0
                END,
                date_modified = ?
            WHERE id = ?
        `, [courseId, courseId, courseId, courseId, courseId, courseId, new Date().toISOString(), courseId])
    }
}

function updateModuleTotals(moduleIds) {
    for (const moduleId of moduleIds) {
        if (!moduleId) continue
        runInTransaction(`
            UPDATE modules
            SET total_duration = (
                    SELECT COALESCE(SUM(CASE WHEN type = 'video' THEN duration ELSE 0 END), 0)
                    FROM videos WHERE module_id = ?
                ),
                total_videos = (
                    SELECT COUNT(*) FROM videos WHERE module_id = ? AND type = 'video'
                )
            WHERE id = ?
        `, [moduleId, moduleId, moduleId])
    }
}

export function repairRestoredMediaTypes() {
    const rows = getAll(`
        SELECT id, course_id, module_id, title, original_title, file_name, url, type, source_metadata
        FROM videos
    `)

    const changed = []
    const byType = {}
    const courseIds = new Set()
    const moduleIds = new Set()

    transaction(() => {
        for (const row of rows) {
            const nextType = inferMediaType(row, row.type || 'video')
            if (!nextType || nextType === row.type) continue

            runInTransaction('UPDATE videos SET type = ? WHERE id = ?', [nextType, row.id])
            runInTransaction('UPDATE imported_items SET media_type = ?, updated_at = ? WHERE video_id = ?', [
                nextType,
                new Date().toISOString(),
                row.id,
            ])
            runInTransaction('UPDATE metadata_store SET media_type = ?, updated_at = ? WHERE video_id = ?', [
                nextType,
                new Date().toISOString(),
                row.id,
            ])
            runInTransaction('UPDATE search_index SET media_type = ?, indexed_at = ? WHERE imported_item_id IN (SELECT id FROM imported_items WHERE video_id = ?)', [
                nextType,
                new Date().toISOString(),
                row.id,
            ])

            changed.push(row.id)
            byType[nextType] = (byType[nextType] || 0) + 1
            courseIds.add(row.course_id)
            moduleIds.add(row.module_id)
        }

        updateCourseTotals(courseIds)
        updateModuleTotals(moduleIds)
    })

    return { updated: changed.length, byType }
}
