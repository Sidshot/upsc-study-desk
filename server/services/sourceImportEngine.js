import { getAll, getOne, runInTransaction, transaction } from '../database.js'
import { emitSourceEvent } from './sourceEventBus.js'
import { getDiscovery } from './sourceDiscovery.js'
import { getSourceJob, updateSourceJob } from './sourceJobs.js'
import { getSource, updateSourceScanState } from './sourceManager.js'
import { rebuildSearchIndex, upsertMetadataForImportedItem } from './sourceMetadata.js'
import { discoveriesToOmniImportItems } from './sourceDomainMapper.js'
import { asJson, createId, nowIso } from './sourceUtils.js'

function titleForGroup(mediaType) {
    if (mediaType === 'video') return 'Lectures'
    if (mediaType === 'pdf') return 'Notes & PDFs'
    return 'Others'
}

function getOrCreateCourse(source, target = {}, writer = runInTransaction) {
    if (target.courseId) {
        const existing = getOne('SELECT * FROM courses WHERE id = ?', [target.courseId])
        if (existing) return existing.id
    }

    const now = nowIso()
    const courseId = createId('course')
    writer(`
        INSERT INTO courses (
            id, title, original_title, description, instructor, tags,
            thumbnail_data, folder_path, source_type, course_url,
            date_added, date_modified, last_accessed, last_accessed_click_time,
            total_duration, total_videos, completed_videos, completion_percentage,
            custom_metadata, "order"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        courseId,
        target.courseTitle || source.name || 'Imported Source',
        source.name || target.courseTitle || 'Imported Source',
        target.description || `Imported from ${source.name}`,
        target.instructor || '',
        asJson(target.tags || [source.type], []),
        target.thumbnailData || null,
        null,
        source.type,
        null,
        now,
        now,
        now,
        now,
        0,
        0,
        0,
        0,
        asJson({ sourceId: source.id, sourceType: source.type }, {}),
        target.order || 0,
    ])
    return courseId
}

function getOrCreateModule(courseId, title, order, writer = runInTransaction) {
    const existing = getOne('SELECT id FROM modules WHERE course_id = ? AND title = ?', [courseId, title])
    if (existing?.id) return existing.id

    const moduleId = createId('module')
    writer(`
        INSERT INTO modules (
            id, course_id, parent_module_id, title, original_title,
            description, thumbnail_data, folder_path, "order",
            total_duration, total_videos, completed_videos, date_added
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        moduleId,
        courseId,
        null,
        title,
        title,
        '',
        null,
        null,
        order,
        0,
        0,
        0,
        nowIso(),
    ])
    return moduleId
}

function nextVideoOrder(moduleId) {
    const row = getOne('SELECT COALESCE(MAX("order"), -1) AS max_order FROM videos WHERE module_id = ?', [moduleId])
    return Number(row?.max_order ?? -1) + 1
}

function insertVideo(courseId, moduleId, item, order, writer = runInTransaction) {
    const videoId = createId('video')
    writer(`
        INSERT INTO videos (
            id, course_id, module_id, title, original_title, description,
            file_name, file_path, file_size, duration, thumbnail_data,
            "order", is_required, is_completed, is_favorite, watch_progress,
            last_watched_position, tags, bookmarks, youtube_id, url, type,
            source_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        videoId,
        courseId,
        moduleId,
        item.title,
        item.title,
        item.description || '',
        item.fileName || '',
        null,
        item.size || 0,
        item.duration || 0,
        item.thumbnail || null,
        order,
        1,
        0,
        0,
        0,
        0,
        asJson([], []),
        asJson([], []),
        null,
        item.metadata?.url || null,
        item.mediaType || 'other',
        asJson(item.metadata || {}, {}),
    ])
    return videoId
}

function insertImportedItem(courseId, moduleId, videoId, item, writer = runInTransaction) {
    const now = nowIso()
    writer(`
        INSERT INTO imported_items (
            id, source_id, source_item_key, course_id, module_id, video_id,
            schema_version, title, description, media_type, mime_type,
            file_name, file_size, duration, thumbnail_data, metadata_json,
            lifecycle_state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        item.id,
        item.sourceId,
        item.sourceItemKey,
        courseId,
        moduleId,
        videoId,
        item.schemaVersion || 1,
        item.title,
        item.description || '',
        item.mediaType || 'other',
        item.mimeType || '',
        item.fileName || '',
        item.size || 0,
        item.duration || 0,
        item.thumbnail || null,
        asJson(item.metadata || {}, {}),
        'available',
        item.createdAt || now,
        now,
    ])
}

function recalculateCourse(courseId, writer = runInTransaction) {
    const rows = getAll('SELECT module_id, type, duration, is_completed FROM videos WHERE course_id = ?', [courseId])
    const totalDuration = rows.reduce((sum, row) => sum + (row.type === 'video' ? Number(row.duration || 0) : 0), 0)
    const totalVideos = rows.filter(row => row.type === 'video').length
    const completedVideos = rows.filter(row => row.type === 'video' && row.is_completed === 1).length
    const completionPercentage = totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0
    writer(`
        UPDATE courses
        SET total_duration = ?, total_videos = ?, completed_videos = ?,
            completion_percentage = ?, date_modified = ?
        WHERE id = ?
    `, [totalDuration, totalVideos, completedVideos, completionPercentage, nowIso(), courseId])

    const moduleIds = [...new Set(rows.map(row => row.module_id))]
    for (const moduleId of moduleIds) {
        const moduleRows = rows.filter(row => row.module_id === moduleId)
        const moduleDuration = moduleRows.reduce((sum, row) => sum + (row.type === 'video' ? Number(row.duration || 0) : 0), 0)
        const moduleVideos = moduleRows.filter(row => row.type === 'video').length
        writer('UPDATE modules SET total_duration = ?, total_videos = ? WHERE id = ?', [
            moduleDuration,
            moduleVideos,
            moduleId,
        ])
    }
}

export function importOmniItems(source, items, target = {}) {
    const result = {
        courseId: target.courseId || null,
        imported: 0,
        skipped: 0,
        importedItemIds: [],
        videoIds: [],
    }

    transaction(() => {
        const courseId = getOrCreateCourse(source, target)
        result.courseId = courseId
        const moduleCache = new Map()

        for (const item of items) {
            const duplicate = getOne(
                'SELECT id FROM imported_items WHERE source_id = ? AND source_item_key = ?',
                [item.sourceId, item.sourceItemKey]
            )
            if (duplicate) {
                result.skipped += 1
                continue
            }

            const moduleTitle = titleForGroup(item.mediaType)
            if (!moduleCache.has(moduleTitle)) {
                moduleCache.set(moduleTitle, getOrCreateModule(courseId, moduleTitle, moduleCache.size))
            }
            const moduleId = moduleCache.get(moduleTitle)
            const order = nextVideoOrder(moduleId)
            const videoId = insertVideo(courseId, moduleId, item, order)
            insertImportedItem(courseId, moduleId, videoId, item)
            result.imported += 1
            result.importedItemIds.push(item.id)
            result.videoIds.push(videoId)
        }

        recalculateCourse(courseId)
    })

    for (const importedItemId of result.importedItemIds) {
        const row = getOne('SELECT * FROM imported_items WHERE id = ?', [importedItemId])
        upsertMetadataForImportedItem(row, source)
    }
    rebuildSearchIndex()
    return result
}

export function startSourceImportJob(jobId, { sourceId, discoveryIds = [], target = {} }) {
    queueMicrotask(() => {
        runSourceImportJob(jobId, { sourceId, discoveryIds, target }).catch(() => {
            // runSourceImportJob persists errors.
        })
    })
}

export async function runSourceImportJob(jobId, { sourceId, discoveryIds = [], target = {} }) {
    const job = getSourceJob(jobId)
    const source = getSource(sourceId)
    if (!job) throw new Error('Import job not found')
    if (!source) throw new Error('Source not found')

    try {
        updateSourceJob(jobId, { status: 'running', progress: 1, startedAt: nowIso() })
        updateSourceScanState(source.id, { status: 'importing', healthState: 'importing' })
        emitSourceEvent('import.started', { sourceId: source.id, jobId })

        const discoveries = discoveryIds.map(getDiscovery).filter(Boolean)
        const items = discoveriesToOmniImportItems(source, discoveries)
        const result = importOmniItems(source, items, target)

        updateSourceScanState(source.id, {
            status: 'indexed',
            healthState: 'connected',
            lastImportedAt: nowIso(),
            lastError: {},
        })
        const completed = updateSourceJob(jobId, {
            status: 'completed',
            progress: 100,
            counters: result,
            finishedAt: nowIso(),
        })
        emitSourceEvent('import.completed', { sourceId: source.id, jobId, payload: result })
        emitSourceEvent('job.completed', { sourceId: source.id, jobId })
        return completed
    } catch (err) {
        const error = { message: err.message || 'Source import failed' }
        updateSourceScanState(source.id, { status: 'failed', healthState: 'error', lastError: error })
        const failed = updateSourceJob(jobId, {
            status: 'failed',
            progress: 100,
            error,
            finishedAt: nowIso(),
        })
        emitSourceEvent('import.failed', { sourceId: source.id, jobId, payload: error })
        emitSourceEvent('job.failed', { sourceId: source.id, jobId, payload: error })
        return failed
    }
}
