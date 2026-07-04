import express from 'express'
import { buildPreview, listDiscoveries } from '../services/sourceDiscovery.js'
import { emitSourceEvent, listRecentSourceEvents } from '../services/sourceEventBus.js'
import { cancelSourceJob, createSourceJob, getSourceJob, listSourceJobs } from '../services/sourceJobs.js'
import { startSourceImportJob } from '../services/sourceImportEngine.js'
import { createTelegramSource, getSource, listSources, listSourcesByCourse, saveSourceRules, upsertSource } from '../services/sourceManager.js'
import { startSourceScanJob } from '../services/sourceScanner.js'
import { linkLegacyTelegramImports } from '../services/legacyTelegramSourceLinker.js'

const router = express.Router()

router.get('/', (req, res) => {
    try {
        res.json(listSources({ type: req.query.type }))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/', (req, res) => {
    try {
        res.status(201).json(upsertSource(req.body || {}))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/telegram/from-chat', (req, res) => {
    try {
        const { chatId, chatTitle, topics = [], accessHash = '' } = req.body || {}
        if (!chatId) return res.status(400).json({ error: 'chatId is required' })
        const source = createTelegramSource({ chatId, chatTitle, topics, accessHash })
        emitSourceEvent('source.connected', { sourceId: source.id, payload: { type: 'telegram' } })
        res.status(201).json(source)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.get('/events', (req, res) => {
    res.json(listRecentSourceEvents(req.query.limit))
})

router.get('/jobs', (req, res) => {
    try {
        res.json(listSourceJobs({ sourceId: req.query.sourceId, status: req.query.status }))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.get('/jobs/:jobId', (req, res) => {
    const job = getSourceJob(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json({ job })
})

router.get('/course-map', (req, res) => {
    try {
        linkLegacyTelegramImports()
        const rows = listSourcesByCourse()
        const byCourse = {}
        for (const source of rows) {
            if (!source.courseId) continue
            if (!byCourse[source.courseId]) byCourse[source.courseId] = []
            byCourse[source.courseId].push(source)
        }
        res.json(byCourse)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/link-legacy-telegram', (req, res) => {
    try {
        res.json(linkLegacyTelegramImports())
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.get('/by-course/:courseId', (req, res) => {
    try {
        linkLegacyTelegramImports()
        res.json(listSourcesByCourse(req.params.courseId))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/jobs/:jobId/cancel', (req, res) => {
    const job = cancelSourceJob(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    emitSourceEvent('job.cancelled', { sourceId: job.sourceId, jobId: job.id })
    res.json({ job })
})

router.get('/:sourceId', (req, res) => {
    const source = getSource(req.params.sourceId)
    if (!source) return res.status(404).json({ error: 'Source not found' })
    res.json(source)
})

router.put('/:sourceId/rules', (req, res) => {
    try {
        const source = saveSourceRules(req.params.sourceId, req.body || {})
        if (!source) return res.status(404).json({ error: 'Source not found' })
        res.json(source)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/:sourceId/scan', (req, res) => {
    const source = getSource(req.params.sourceId)
    if (!source) return res.status(404).json({ error: 'Source not found' })
    const rulesSnapshot = { ...source.rules, ...(req.body?.rulesOverride || {}) }
    const job = createSourceJob({
        sourceId: source.id,
        jobType: req.body?.mode === 'sync' ? 'sync' : 'scan',
        priority: 'high',
        rulesSnapshot,
        cursor: source.discoveryCursor,
    })
    emitSourceEvent('job.created', { sourceId: source.id, jobId: job.id, payload: { jobType: job.jobType } })
    startSourceScanJob(job.id)
    res.status(202).json({ job })
})

router.get('/:sourceId/discoveries', (req, res) => {
    try {
        res.json(listDiscoveries(req.params.sourceId, req.query))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/:sourceId/preview', (req, res) => {
    try {
        const filters = req.body?.filters || {}
        const preview = buildPreview(req.params.sourceId, {
            ...filters,
            mediaType: filters.mediaType || filters.mediaTypes?.[0],
            limit: req.body?.limit,
            offset: req.body?.offset,
        })
        emitSourceEvent('preview.created', { sourceId: req.params.sourceId, payload: { previewId: preview.previewId } })
        res.json(preview)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/:sourceId/import', (req, res) => {
    const source = getSource(req.params.sourceId)
    if (!source) return res.status(404).json({ error: 'Source not found' })

    const selectedDiscoveryIds = req.body?.selectedDiscoveryIds || []
    if (!Array.isArray(selectedDiscoveryIds) || selectedDiscoveryIds.length === 0) {
        return res.status(400).json({ error: 'selectedDiscoveryIds must be a non-empty array' })
    }

    const job = createSourceJob({
        sourceId: source.id,
        jobType: 'import',
        priority: 'high',
        rulesSnapshot: source.rules,
        cursor: source.syncCursor,
    })
    emitSourceEvent('job.created', { sourceId: source.id, jobId: job.id, payload: { jobType: job.jobType } })
    startSourceImportJob(job.id, {
        sourceId: source.id,
        discoveryIds: selectedDiscoveryIds,
        target: req.body?.target || {},
    })
    res.status(202).json({ job })
})

export default router
