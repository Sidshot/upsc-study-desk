import * as tg from './telegramClient.js'
import { getCacheStatus, upsertMediaBatch } from './telegramIndex.js'

const jobs = new Map()
const MAX_FINISHED_JOBS = 20

function createJobId() {
    return `tgscan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function publicJob(job) {
    return {
        id: job.id,
        status: job.status,
        chatId: job.chatId,
        chatTitle: job.chatTitle,
        topics: job.topics,
        maxMessages: job.maxMessages,
        scanned: job.scanned,
        cached: job.cached,
        progress: job.progress,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        error: job.error,
        previewReady: job.status === 'completed' && job.cached > 0,
    }
}

function pruneFinishedJobs() {
    const finished = [...jobs.values()]
        .filter(job => ['completed', 'failed', 'cancelled'].includes(job.status))
        .sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')))

    for (const job of finished.slice(MAX_FINISHED_JOBS)) {
        jobs.delete(job.id)
    }
}

export function getScanJob(jobId) {
    const job = jobs.get(jobId)
    return job ? publicJob(job) : null
}

export function cancelScanJob(jobId) {
    const job = jobs.get(jobId)
    if (!job) return null
    if (job.status === 'running') {
        job.cancelled = true
        job.status = 'cancelling'
    }
    return publicJob(job)
}

export function startScanJob({ chatId, chatTitle, topics = [], maxMessages = 500, onlyNew = false }) {
    if (!chatId) throw new Error('chatId is required')

    const running = [...jobs.values()].find(job =>
        job.status === 'running' &&
        String(job.chatId) === String(chatId)
    )
    if (running) return publicJob(running)

    const job = {
        id: createJobId(),
        status: 'running',
        chatId: String(chatId),
        chatTitle: chatTitle || 'Telegram Source',
        topics: Array.isArray(topics) ? topics : [],
        maxMessages: Math.min(Math.max(Number(maxMessages) || 500, 1), 5000),
        onlyNew: !!onlyNew,
        scanned: 0,
        cached: getCacheStatus(chatId).mediaCount || 0,
        progress: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: '',
        cancelled: false,
    }
    jobs.set(job.id, job)

    queueMicrotask(() => runScanJob(job))
    pruneFinishedJobs()
    return publicJob(job)
}

async function runScanJob(job) {
    try {
        const topicIds = job.topics.length > 0 ? job.topics.map(topic => topic.id) : []
        const cacheStatus = getCacheStatus(job.chatId)
        const minId = job.onlyNew ? Number(cacheStatus.lastMessageId || 0) : 0

        await tg.scanMessages(job.chatId, {
            topicIds,
            maxMessages: job.maxMessages,
            minId,
            shouldCancel: () => job.cancelled,
            onProgress: ({ collected, maxMessages }) => {
                job.scanned = collected
                job.progress = Math.min(99, Math.round((collected / maxMessages) * 100))
            },
            onBatch: async ({ batch, collected }) => {
                if (batch.length === 0) return
                const cache = upsertMediaBatch({
                    chatId: job.chatId,
                    chatTitle: job.chatTitle,
                    topics: job.topics,
                    messages: batch,
                })
                job.scanned = collected
                job.cached = cache.totalCached
            },
        })

        if (job.cancelled) {
            job.status = 'cancelled'
            job.progress = Math.max(job.progress, 0)
        } else {
            job.status = 'completed'
            job.progress = 100
            job.cached = getCacheStatus(job.chatId).mediaCount || job.cached
        }
    } catch (err) {
        job.status = 'failed'
        job.error = err.message || 'Telegram scan failed'
    } finally {
        job.finishedAt = new Date().toISOString()
        pruneFinishedJobs()
    }
}
