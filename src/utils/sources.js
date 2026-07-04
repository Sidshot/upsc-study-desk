import * as api from './api.js'

export async function getSourceCourseMap() {
    return api.get('/api/sources/course-map')
}

export async function getSourcesByCourse(courseId) {
    return api.get(`/api/sources/by-course/${encodeURIComponent(courseId)}`)
}

export async function scanSource(sourceId, { mode = 'sync', rulesOverride = {} } = {}) {
    return api.post(`/api/sources/${encodeURIComponent(sourceId)}/scan`, { mode, rulesOverride })
}

export async function buildSourcePreview(sourceId, { filters = {}, limit = 200, offset = 0 } = {}) {
    return api.post(`/api/sources/${encodeURIComponent(sourceId)}/preview`, { filters, limit, offset })
}

export async function importSourceDiscoveries(sourceId, { selectedDiscoveryIds, target = {} }) {
    return api.post(`/api/sources/${encodeURIComponent(sourceId)}/import`, { selectedDiscoveryIds, target })
}

export async function getSourceJob(jobId) {
    return api.get(`/api/sources/jobs/${encodeURIComponent(jobId)}`)
}

export function flattenPreviewItems(preview) {
    return (preview?.groups || []).flatMap((group) => group.items || [])
}
