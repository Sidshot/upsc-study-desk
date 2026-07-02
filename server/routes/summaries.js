import express from 'express'
import fs from 'fs'
import path from 'path'
import { run, getDataDir } from '../database.js'

const router = express.Router()

function getSummariesDir() {
    const dir = path.join(getDataDir(), 'summaries')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

function getSummaryPath(videoId) {
    const safeId = path.basename(String(videoId || '')).replace(/[^a-zA-Z0-9_.-]/g, '_')
    if (!safeId) throw new Error('Invalid video id')

    const summariesDir = path.resolve(getSummariesDir())
    const filePath = path.resolve(summariesDir, `${safeId}.md`)
    if (!filePath.startsWith(`${summariesDir}${path.sep}`)) {
        throw new Error('Invalid summary path')
    }
    return filePath
}

// GET /api/summaries/:videoId
router.get('/:videoId', (req, res) => {
    try {
        const filePath = getSummaryPath(req.params.videoId)
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8')
            res.json({ content })
        } else {
            res.json({ content: '' })
        }
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/summaries/:videoId
router.put('/:videoId', (req, res) => {
    const { content } = req.body
    
    try {
        const filePath = getSummaryPath(req.params.videoId)
        fs.writeFileSync(filePath, content || '')
        
        run(`UPDATE videos SET has_summary = 1, summary_generated_at = ? WHERE id = ?`, [
            new Date().toISOString(),
            req.params.videoId
        ])
        
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/summaries/:videoId
router.delete('/:videoId', (req, res) => {
    try {
        const filePath = getSummaryPath(req.params.videoId)
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }
        
        run(`UPDATE videos SET has_summary = 0, summary_generated_at = NULL WHERE id = ?`, [
            req.params.videoId
        ])
        
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
