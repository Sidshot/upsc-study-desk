import express from 'express'
import { getAll, getOne, run, runInTransaction, transaction } from '../database.js'

const router = express.Router()

const AUTO_QUEUE_RULES = {
    confusing: { offsetDays: 1, urgency: 2 },
    revise: { offsetDays: 1, urgency: 1 },
    exam_worthy: { offsetDays: 3, urgency: 1 },
}

function mapCheckpointRow(row) {
    return {
        id: row.id,
        courseId: row.course_id,
        videoId: row.video_id,
        noteId: row.note_id || null,
        anchorKind: row.anchor_kind,
        anchorValue: row.anchor_value,
        checkpointType: row.checkpoint_type,
        text: row.text || '',
        createdAt: row.created_at,
    }
}

function addDaysIso(days) {
    const date = new Date()
    date.setDate(date.getDate() + days)
    return date.toISOString()
}

function buildDisplayTitle(videoTitle, checkpointType, anchorKind, anchorValue) {
    const typeLabel = {
        confusing: 'Confusing',
        revise: 'Revise',
        exam_worthy: 'Exam-worthy',
        important: 'Important',
    }[checkpointType] || 'Review'

    let anchorLabel = ''
    if (anchorKind === 'timestamp' && anchorValue != null && anchorValue !== '') {
        const totalSeconds = Math.max(0, Math.floor(Number(anchorValue) || 0))
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60
        anchorLabel = hours > 0
            ? ` at ${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            : ` at ${minutes}:${String(seconds).padStart(2, '0')}`
    } else if (anchorKind === 'page' && anchorValue != null && anchorValue !== '') {
        anchorLabel = ` on page ${anchorValue}`
    }

    return `${typeLabel}: ${videoTitle}${anchorLabel}`
}

function createRevisionItem(checkpoint) {
    const rule = AUTO_QUEUE_RULES[checkpoint.checkpointType]
    if (!rule) return null

    const video = getOne('SELECT title FROM videos WHERE id = ?', [checkpoint.videoId])
    if (!video) {
        throw new Error('Video not found for checkpoint')
    }

    const now = new Date().toISOString()
    return {
        id: checkpoint.revisionId,
        checkpointId: checkpoint.id,
        courseId: checkpoint.courseId,
        videoId: checkpoint.videoId,
        noteId: checkpoint.noteId || null,
        displayTitle: buildDisplayTitle(video.title, checkpoint.checkpointType, checkpoint.anchorKind, checkpoint.anchorValue),
        status: 'pending',
        dueAt: addDaysIso(rule.offsetDays),
        urgency: rule.urgency,
        origin: 'checkpoint',
        anchorKind: checkpoint.anchorKind,
        anchorValue: checkpoint.anchorValue ?? null,
        checkpointType: checkpoint.checkpointType,
        completedAt: null,
        updatedAt: now,
    }
}

// GET /api/checkpoints/by-video/:videoId
router.get('/by-video/:videoId', (req, res) => {
    try {
        const rows = getAll(
            `SELECT * FROM checkpoints
             WHERE video_id = ?
             ORDER BY
                CASE WHEN anchor_kind IN ('timestamp', 'page') THEN CAST(anchor_value AS REAL) ELSE NULL END ASC,
                created_at ASC`,
            [req.params.videoId]
        )
        res.json(rows.map(mapCheckpointRow))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /api/checkpoints/by-course/:courseId
router.get('/by-course/:courseId', (req, res) => {
    try {
        const rows = getAll(
            `SELECT * FROM checkpoints
             WHERE course_id = ?
             ORDER BY created_at DESC`,
            [req.params.courseId]
        )
        res.json(rows.map(mapCheckpointRow))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/checkpoints
router.post('/', (req, res) => {
    const data = req.body || {}
    if (!data.id || !data.courseId || !data.videoId || !data.anchorKind || !data.checkpointType) {
        return res.status(400).json({ error: 'Missing required checkpoint fields' })
    }

    const now = new Date().toISOString()
    const checkpoint = {
        id: data.id,
        courseId: data.courseId,
        videoId: data.videoId,
        noteId: data.noteId || null,
        anchorKind: data.anchorKind,
        anchorValue: data.anchorValue == null ? null : String(data.anchorValue),
        checkpointType: data.checkpointType,
        text: data.text || '',
        createdAt: now,
        revisionId: data.revisionId || null,
    }

    try {
        const revisionItem = checkpoint.revisionId ? createRevisionItem(checkpoint) : createRevisionItem(checkpoint)

        transaction(() => {
            runInTransaction(
                `INSERT INTO checkpoints (
                    id, course_id, video_id, note_id, anchor_kind, anchor_value,
                    checkpoint_type, text, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    checkpoint.id,
                    checkpoint.courseId,
                    checkpoint.videoId,
                    checkpoint.noteId,
                    checkpoint.anchorKind,
                    checkpoint.anchorValue,
                    checkpoint.checkpointType,
                    checkpoint.text,
                    checkpoint.createdAt,
                ]
            )

            if (revisionItem) {
                runInTransaction(
                    `INSERT INTO revision_queue (
                        id, checkpoint_id, course_id, video_id, note_id, display_title,
                        status, due_at, urgency, origin, anchor_kind, anchor_value,
                        checkpoint_type, completed_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        revisionItem.id,
                        revisionItem.checkpointId,
                        revisionItem.courseId,
                        revisionItem.videoId,
                        revisionItem.noteId,
                        revisionItem.displayTitle,
                        revisionItem.status,
                        revisionItem.dueAt,
                        revisionItem.urgency,
                        revisionItem.origin,
                        revisionItem.anchorKind,
                        revisionItem.anchorValue,
                        revisionItem.checkpointType,
                        revisionItem.completedAt,
                        revisionItem.updatedAt,
                    ]
                )
            }
        })

        res.status(201).json({
            success: true,
            checkpoint: mapCheckpointRow({
                id: checkpoint.id,
                course_id: checkpoint.courseId,
                video_id: checkpoint.videoId,
                note_id: checkpoint.noteId,
                anchor_kind: checkpoint.anchorKind,
                anchor_value: checkpoint.anchorValue,
                checkpoint_type: checkpoint.checkpointType,
                text: checkpoint.text,
                created_at: checkpoint.createdAt,
            }),
            revisionItem,
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/checkpoints/:id
router.delete('/:id', (req, res) => {
    try {
        run('DELETE FROM checkpoints WHERE id = ?', [req.params.id])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
