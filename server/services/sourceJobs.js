import { getAll, getOne, run } from '../database.js'
import { asJson, createId, nowIso, safeJsonParse } from './sourceUtils.js'

function mapJob(row) {
    if (!row) return null
    return {
        id: row.id,
        sourceId: row.source_id,
        jobType: row.job_type,
        priority: row.priority,
        status: row.status,
        progress: row.progress,
        rulesSnapshot: safeJsonParse(row.rules_snapshot_json, {}),
        counters: safeJsonParse(row.counters_json, {}),
        cursor: safeJsonParse(row.cursor_json, {}),
        error: safeJsonParse(row.error_json, {}),
        createdAt: row.created_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
    }
}

export function createSourceJob({ sourceId = null, jobType, priority = 'medium', rulesSnapshot = {}, cursor = {} }) {
    const id = createId('job')
    run(`
        INSERT INTO source_jobs (
            id, source_id, job_type, priority, status, progress,
            rules_snapshot_json, counters_json, cursor_json, error_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        sourceId,
        jobType,
        priority,
        'queued',
        0,
        asJson(rulesSnapshot, {}),
        '{}',
        asJson(cursor, {}),
        '{}',
        nowIso(),
    ])
    return getSourceJob(id)
}

export function getSourceJob(jobId) {
    return mapJob(getOne('SELECT * FROM source_jobs WHERE id = ?', [jobId]))
}

export function listSourceJobs({ sourceId, status } = {}) {
    const where = []
    const params = []
    if (sourceId) {
        where.push('source_id = ?')
        params.push(sourceId)
    }
    if (status) {
        where.push('status = ?')
        params.push(status)
    }
    const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    return getAll(`SELECT * FROM source_jobs ${sql} ORDER BY created_at DESC`, params).map(mapJob)
}

export function updateSourceJob(jobId, updates = {}) {
    const fields = []
    const params = []
    const fieldMap = {
        status: 'status',
        progress: 'progress',
        startedAt: 'started_at',
        finishedAt: 'finished_at',
    }
    for (const [key, column] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
            fields.push(`${column} = ?`)
            params.push(updates[key])
        }
    }
    if (updates.counters !== undefined) {
        fields.push('counters_json = ?')
        params.push(asJson(updates.counters, {}))
    }
    if (updates.cursor !== undefined) {
        fields.push('cursor_json = ?')
        params.push(asJson(updates.cursor, {}))
    }
    if (updates.error !== undefined) {
        fields.push('error_json = ?')
        params.push(asJson(updates.error, {}))
    }
    if (fields.length === 0) return getSourceJob(jobId)
    params.push(jobId)
    run(`UPDATE source_jobs SET ${fields.join(', ')} WHERE id = ?`, params)
    return getSourceJob(jobId)
}

export function cancelSourceJob(jobId) {
    const job = getSourceJob(jobId)
    if (!job) return null
    if (['queued', 'running'].includes(job.status)) {
        return updateSourceJob(jobId, {
            status: job.status === 'queued' ? 'cancelled' : 'cancelling',
            finishedAt: job.status === 'queued' ? nowIso() : undefined,
        })
    }
    return job
}
