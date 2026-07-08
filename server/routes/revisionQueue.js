import express from 'express'
import { getAll, getOne, run } from '../database.js'

const router = express.Router()

function mapRevisionRow(row) {
    return {
        id: row.id,
        checkpointId: row.checkpoint_id || null,
        courseId: row.course_id,
        videoId: row.video_id,
        noteId: row.note_id || null,
        displayTitle: row.display_title,
        status: row.status,
        dueAt: row.due_at,
        urgency: row.urgency,
        origin: row.origin,
        anchorKind: row.anchor_kind,
        anchorValue: row.anchor_value,
        checkpointType: row.checkpoint_type || null,
        completedAt: row.completed_at || null,
        updatedAt: row.updated_at,
    }
}

function getDayBounds() {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start: start.toISOString(), end: end.toISOString(), now: now.toISOString() }
}

// GET /api/revision-queue
router.get('/', (req, res) => {
    try {
        const params = []
        const conditions = []

        if (req.query.status) {
            conditions.push('status = ?')
            params.push(req.query.status)
        }
        if (req.query.courseId) {
            conditions.push('course_id = ?')
            params.push(req.query.courseId)
        }
        if (req.query.videoId) {
            conditions.push('video_id = ?')
            params.push(req.query.videoId)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const rows = getAll(
            `SELECT * FROM revision_queue
             ${whereClause}
             ORDER BY
                CASE status WHEN 'pending' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END ASC,
                due_at ASC,
                urgency DESC,
                updated_at DESC`,
            params
        )
        res.json(rows.map(mapRevisionRow))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/revision-queue/today
router.get('/today', (req, res) => {
    try {
        const { end } = getDayBounds()
        const rows = getAll(
            `SELECT * FROM revision_queue
             WHERE status = 'pending' AND due_at < ?
             ORDER BY due_at ASC, urgency DESC, updated_at DESC`,
            [end]
        )
        res.json(rows.map(mapRevisionRow))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/revision-queue/summary
router.get('/summary', (req, res) => {
    try {
        const { start, end, now } = getDayBounds()
        const pendingTotal = getOne(`SELECT COUNT(*) AS count FROM revision_queue WHERE status = 'pending'`)?.count || 0
        const dueToday = getOne(
            `SELECT COUNT(*) AS count FROM revision_queue
             WHERE status = 'pending' AND due_at >= ? AND due_at < ?`,
            [start, end]
        )?.count || 0
        const overdue = getOne(
            `SELECT COUNT(*) AS count FROM revision_queue
             WHERE status = 'pending' AND due_at < ?`,
            [start]
        )?.count || 0
        const completedToday = getOne(
            `SELECT COUNT(*) AS count FROM revision_queue
             WHERE status = 'completed' AND completed_at >= ? AND completed_at < ?`,
            [start, end]
        )?.count || 0

        res.json({
            pendingTotal,
            dueToday,
            overdue,
            completedToday,
            now,
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/revision-queue/:id
router.put('/:id', (req, res) => {
    const data = req.body || {}
    try {
        const existing = getOne('SELECT * FROM revision_queue WHERE id = ?', [req.params.id])
        if (!existing) {
            return res.status(404).json({ error: 'Revision item not found' })
        }

        const updateFields = []
        const params = []

        if (data.status !== undefined) {
            updateFields.push('status = ?')
            params.push(data.status)
            updateFields.push('completed_at = ?')
            params.push(data.status === 'completed' ? new Date().toISOString() : null)
        }
        if (data.dueAt !== undefined) {
            updateFields.push('due_at = ?')
            params.push(data.dueAt)
        }
        if (data.urgency !== undefined) {
            updateFields.push('urgency = ?')
            params.push(data.urgency)
        }

        updateFields.push('updated_at = ?')
        params.push(new Date().toISOString())
        params.push(req.params.id)

        run(`UPDATE revision_queue SET ${updateFields.join(', ')} WHERE id = ?`, params)
        const updated = getOne('SELECT * FROM revision_queue WHERE id = ?', [req.params.id])
        res.json({ success: true, item: mapRevisionRow(updated) })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
