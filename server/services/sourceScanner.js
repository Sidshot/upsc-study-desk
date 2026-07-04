import * as telegramAdapter from './adapters/telegramSourceAdapter.js'
import { upsertDiscoveries } from './sourceDiscovery.js'
import { emitSourceEvent } from './sourceEventBus.js'
import { getSourceJob, updateSourceJob } from './sourceJobs.js'
import { getSource, updateSourceScanState } from './sourceManager.js'
import { nowIso } from './sourceUtils.js'

function adapterFor(source) {
    if (source.type === 'telegram') return telegramAdapter
    throw new Error(`No source adapter registered for ${source.type}`)
}

export function startSourceScanJob(jobId) {
    queueMicrotask(() => {
        runSourceScanJob(jobId).catch(() => {
            // runSourceScanJob persists errors; keep this microtask quiet.
        })
    })
}

export async function runSourceScanJob(jobId) {
    const job = getSourceJob(jobId)
    if (!job) throw new Error('Source job not found')
    const source = getSource(job.sourceId)
    if (!source) throw new Error('Source not found')
    const adapter = adapterFor(source)

    try {
        updateSourceJob(jobId, { status: 'running', progress: 1, startedAt: nowIso() })
        updateSourceScanState(source.id, { status: 'scanning', healthState: 'scanning', lastError: {} })
        emitSourceEvent('source.scan.started', { sourceId: source.id, jobId })

        const result = job.jobType === 'sync'
            ? await adapter.sync(source, job.rulesSnapshot, source.syncCursor)
            : await adapter.scan(source, job.rulesSnapshot, source.discoveryCursor)

        const cache = upsertDiscoveries(source.id, result.discoveries)
        const nextCursor = result.cursor || source.discoveryCursor
        updateSourceScanState(source.id, {
            status: 'preview_ready',
            healthState: 'connected',
            discoveryCursor: job.jobType === 'scan' ? nextCursor : source.discoveryCursor,
            syncCursor: {
                ...source.syncCursor,
                ...(job.jobType === 'sync' ? nextCursor : {}),
                lastMessageId: Math.max(Number(source.syncCursor?.lastMessageId || 0), Number(result.counters?.lastMessageId || 0)),
            },
            lastScannedAt: nowIso(),
            lastError: {},
        })
        const completed = updateSourceJob(jobId, {
            status: 'completed',
            progress: 100,
            counters: { ...(result.counters || {}), cached: cache.upserted },
            cursor: nextCursor,
            finishedAt: nowIso(),
        })
        emitSourceEvent('source.scan.completed', {
            sourceId: source.id,
            jobId,
            payload: { discovered: result.discoveries.length, cached: cache.upserted },
        })
        emitSourceEvent('job.completed', { sourceId: source.id, jobId })
        return completed
    } catch (err) {
        const error = { message: err.message || 'Source scan failed' }
        updateSourceScanState(source.id, { status: 'failed', healthState: 'error', lastError: error })
        const failed = updateSourceJob(jobId, {
            status: 'failed',
            progress: 100,
            error,
            finishedAt: nowIso(),
        })
        emitSourceEvent('source.scan.failed', { sourceId: source.id, jobId, payload: error })
        emitSourceEvent('job.failed', { sourceId: source.id, jobId, payload: error })
        return failed
    }
}
