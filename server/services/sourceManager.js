import { getAll, getOne, run } from '../database.js'
import { asJson, createId, nowIso, safeJsonParse } from './sourceUtils.js'

function mapSource(row) {
    if (!row) return null
    return {
        id: row.id,
        type: row.type,
        name: row.name,
        status: row.status,
        healthState: row.health_state,
        capabilities: safeJsonParse(row.capabilities_json, {}),
        rules: safeJsonParse(row.rules_json, {}),
        discoveryCursor: safeJsonParse(row.discovery_cursor_json, {}),
        syncCursor: safeJsonParse(row.sync_cursor_json, {}),
        lastScannedAt: row.last_scanned_at,
        lastImportedAt: row.last_imported_at,
        lastError: safeJsonParse(row.last_error_json, {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function listSources({ type } = {}) {
    const rows = type
        ? getAll('SELECT * FROM sources WHERE type = ? ORDER BY updated_at DESC', [type])
        : getAll('SELECT * FROM sources ORDER BY updated_at DESC')
    return rows.map(mapSource)
}

export function listSourcesByCourse(courseId = null) {
    const params = []
    const where = []
    if (courseId) {
        where.push('ii.course_id = ?')
        params.push(courseId)
    }

    const rows = getAll(`
        SELECT
            s.*,
            ii.course_id AS linked_course_id,
            COUNT(ii.id) AS imported_count,
            MAX(ii.updated_at) AS last_imported_item_at
        FROM sources s
        JOIN imported_items ii ON ii.source_id = s.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY s.id, ii.course_id
        ORDER BY s.updated_at DESC
    `, params)

    return rows.map((row) => ({
        ...mapSource(row),
        courseId: row.linked_course_id,
        importedCount: row.imported_count,
        lastImportedItemAt: row.last_imported_item_at,
    }))
}

export function getSource(sourceId) {
    return mapSource(getOne('SELECT * FROM sources WHERE id = ?', [sourceId]))
}

export function upsertSource(data) {
    const now = nowIso()
    const id = data.id || createId(`source_${data.type || 'generic'}`)
    run(`
        INSERT INTO sources (
            id, type, name, status, health_state, capabilities_json, rules_json,
            discovery_cursor_json, sync_cursor_json, last_scanned_at,
            last_imported_at, last_error_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            name = excluded.name,
            status = excluded.status,
            health_state = excluded.health_state,
            capabilities_json = excluded.capabilities_json,
            rules_json = excluded.rules_json,
            discovery_cursor_json = excluded.discovery_cursor_json,
            sync_cursor_json = excluded.sync_cursor_json,
            last_scanned_at = excluded.last_scanned_at,
            last_imported_at = excluded.last_imported_at,
            last_error_json = excluded.last_error_json,
            updated_at = excluded.updated_at
    `, [
        id,
        data.type || 'generic',
        data.name || 'Untitled Source',
        data.status || 'created',
        data.healthState || data.health_state || 'disconnected',
        asJson(data.capabilities, {}),
        asJson(data.rules, {}),
        asJson(data.discoveryCursor, {}),
        asJson(data.syncCursor, {}),
        data.lastScannedAt || null,
        data.lastImportedAt || null,
        asJson(data.lastError, {}),
        data.createdAt || now,
        now,
    ])
    return getSource(id)
}

export function saveSourceRules(sourceId, rules) {
    run('UPDATE sources SET rules_json = ?, updated_at = ? WHERE id = ?', [
        asJson(rules, {}),
        nowIso(),
        sourceId,
    ])
    return getSource(sourceId)
}

export function updateSourceHealth(sourceId, healthState, lastError = null) {
    const fields = ['health_state = ?', 'updated_at = ?']
    const params = [healthState, nowIso()]
    if (lastError) {
        fields.push('last_error_json = ?')
        params.push(asJson(lastError, {}))
    }
    params.push(sourceId)
    run(`UPDATE sources SET ${fields.join(', ')} WHERE id = ?`, params)
    return getSource(sourceId)
}

export function updateSourceScanState(sourceId, updates = {}) {
    const fields = ['updated_at = ?']
    const params = [nowIso()]
    if (updates.status !== undefined) {
        fields.push('status = ?')
        params.push(updates.status)
    }
    if (updates.healthState !== undefined) {
        fields.push('health_state = ?')
        params.push(updates.healthState)
    }
    if (updates.discoveryCursor !== undefined) {
        fields.push('discovery_cursor_json = ?')
        params.push(asJson(updates.discoveryCursor, {}))
    }
    if (updates.syncCursor !== undefined) {
        fields.push('sync_cursor_json = ?')
        params.push(asJson(updates.syncCursor, {}))
    }
    if (updates.lastScannedAt !== undefined) {
        fields.push('last_scanned_at = ?')
        params.push(updates.lastScannedAt)
    }
    if (updates.lastImportedAt !== undefined) {
        fields.push('last_imported_at = ?')
        params.push(updates.lastImportedAt)
    }
    if (updates.lastError !== undefined) {
        fields.push('last_error_json = ?')
        params.push(asJson(updates.lastError, {}))
    }
    params.push(sourceId)
    run(`UPDATE sources SET ${fields.join(', ')} WHERE id = ?`, params)
    return getSource(sourceId)
}

export function createTelegramSource({ chatId, chatTitle, topics = [], accessHash = '' }) {
    const id = `source_telegram_${chatId}`
    return upsertSource({
        id,
        type: 'telegram',
        name: chatTitle || 'Telegram Source',
        status: 'connected',
        healthState: 'connected',
        capabilities: {
            adapterInterfaceVersion: 1,
            incrementalSync: true,
            topics: true,
            captions: true,
            mediaStreaming: true,
            deleteDetection: false,
            versionHistory: false,
        },
        rules: {
            fileTypes: ['video', 'pdf', 'image'],
            topicIds: topics.map(topic => String(topic.id)),
            groupBy: 'auto',
            newOnly: true,
        },
        discoveryCursor: { chatId: String(chatId), topics },
        syncCursor: { chatId: String(chatId), lastMessageIds: {} },
        lastError: {},
        accessHash,
    })
}
