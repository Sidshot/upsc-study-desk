const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.ts'])
const PDF_EXTENSIONS = new Set(['.pdf'])

const LECTURE_PATTERNS = [
    /\b(?:lecture|lect|lec|class|video|vid|session|sess|day|part|episode|ep)\s*[-_.:#]?\s*(\d{1,4})(?:\s*(?:[a-z]))?\b/i,
    /\b(?:l|c|v|d|p)\s*[-_.:#]?\s*(\d{1,4})(?:\s*(?:[a-z]))?\b/i,
    /^\s*(\d{1,4})(?:\s*[-_.:)]|\s+)/,
]

const RESOURCE_HINTS = [
    { kind: 'notes', pattern: /\b(?:notes?|pdf|handouts?|slides?|ppt|material|booklet)\b/i },
    { kind: 'assignment', pattern: /\b(?:assignment|homework|practice|worksheet)\b/i },
    { kind: 'test', pattern: /\b(?:test|quiz|mock|question|pyq|mcq)\b/i },
]

function stripExtension(name = '') {
    return name.replace(/\.[^.]+$/, '')
}

function extensionOf(name = '') {
    const match = name.toLowerCase().match(/(\.[a-z0-9]+)$/)
    return match?.[1] || ''
}

function normalizeSpaces(value = '') {
    return String(value)
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[()[\]{}]/g, ' ')
        .replace(/[_|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function titleCaseFallback(value = '') {
    const cleaned = normalizeSpaces(value)
        .replace(/^[\s.\-:#\d]+/, '')
        .replace(/\s+-\s+$/g, '')
        .trim()
    return cleaned || 'Untitled'
}

function removeIgnoredWords(value, ignoredWords = []) {
    let result = value
    for (const word of ignoredWords) {
        const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (!escaped) continue
        result = result.replace(new RegExp(`\\b${escaped}\\b`, 'ig'), ' ')
    }
    return normalizeSpaces(result)
}

function cleanLectureTitle(fileName = '', message = '', rules = {}) {
    let base = normalizeSpaces(stripExtension(fileName || message || 'Untitled'))
    base = removeIgnoredWords(base, rules.ignoredWords || [])
    for (const pattern of LECTURE_PATTERNS) {
        base = base.replace(pattern, '').trim()
    }
    base = base
        .replace(/^\s*[-.:#]+\s*/, '')
        .replace(/\b(?:video|lecture|class|notes?|pdf)\b\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
    return base || titleCaseFallback(stripExtension(fileName)) || 'Untitled'
}

function extractLectureNumber(text = '') {
    for (const pattern of LECTURE_PATTERNS) {
        const match = normalizeSpaces(text).match(pattern)
        if (match?.[1]) return Number(match[1])
    }
    return null
}

function detectResourceKind(item) {
    const name = `${item.fileName || ''} ${item.message || ''}`
    const ext = extensionOf(item.fileName)
    if (item.type === 'pdf' || item.mimeType === 'application/pdf' || PDF_EXTENSIONS.has(ext)) {
        const hint = RESOURCE_HINTS.find(entry => entry.pattern.test(name))
        return hint?.kind || 'notes'
    }
    if (item.type === 'video' || item.mimeType?.startsWith?.('video/') || VIDEO_EXTENSIONS.has(ext)) {
        return 'lecture'
    }
    const hint = RESOURCE_HINTS.find(entry => entry.pattern.test(name))
    return hint?.kind || 'resource'
}

function extractPrefix(text = '', lectureNumber = null) {
    const normalized = normalizeSpaces(stripExtension(text))
    if (!lectureNumber) return ''
    for (const pattern of LECTURE_PATTERNS) {
        const match = normalized.match(pattern)
        if (match?.index > 0) {
            return titleCaseFallback(normalized.slice(0, match.index))
        }
    }
    return ''
}

function naturalSort(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function compareAnalyzedItems(a, b) {
    if (a.lectureNumber !== null && b.lectureNumber !== null && a.lectureNumber !== b.lectureNumber) {
        return a.lectureNumber - b.lectureNumber
    }
    if (a.lectureNumber !== null && b.lectureNumber === null) return -1
    if (a.lectureNumber === null && b.lectureNumber !== null) return 1
    const dateDiff = (a.date || 0) - (b.date || 0)
    if (dateDiff !== 0) return dateDiff
    return naturalSort(a.fileName, b.fileName)
}

function analyzeItem(item, source, rules = {}) {
    const fileName = item.fileName || `Telegram_${item.id}`
    const combinedText = `${fileName} ${item.message || ''}`
    const lectureNumber = extractLectureNumber(combinedText)
    const kind = detectResourceKind(item)
    const prefix = extractPrefix(fileName, lectureNumber)
    const title = cleanLectureTitle(fileName, item.message, rules)
    const confidence = Math.min(1, 0.35 + (lectureNumber ? 0.35 : 0) + (prefix ? 0.15 : 0) + (kind !== 'resource' ? 0.15 : 0))

    return {
        ...item,
        fileName,
        title,
        originalTitle: fileName,
        lectureNumber,
        resourceKind: kind,
        inferredPrefix: prefix,
        confidence: Number(confidence.toFixed(2)),
        url: item.url || source?.streamUrlFor?.(item),
        fileSize: Number(item.size || item.fileSize || 0),
        duration: Number(item.duration || 0),
        type: kind === 'lecture' ? 'video' : 'pdf',
    }
}

function buildVideoTitle(item) {
    if (item.lectureNumber) {
        return `Lecture ${String(item.lectureNumber).padStart(2, '0')} - ${item.title}`
    }
    return item.title
}

function toImportVideo(item, order) {
    const isPdf = item.type === 'pdf'
    return {
        title: isPdf ? item.title : buildVideoTitle(item),
        originalTitle: item.originalTitle,
        fileName: item.fileName,
        fileSize: item.fileSize,
        url: item.url,
        duration: isPdf ? 0 : item.duration,
        order,
        type: item.type,
        telegram: {
            chatId: item.chatId,
            topicId: item.topicId,
            messageId: item.id,
            confidence: item.confidence,
            resourceKind: item.resourceKind,
        },
    }
}

function applyModuleOverride(title, rules = {}) {
    const overrides = rules.moduleOverrides || {}
    return overrides[title] || overrides[title?.toLowerCase?.()] || title
}

function buildModule(title, items, order, rules = {}) {
    const sorted = [...items].sort(compareAnalyzedItems)
    const videos = sorted.map((item, index) => toImportVideo(item, index))
    const totalDuration = videos.reduce((sum, video) => sum + (video.type === 'video' ? Number(video.duration || 0) : 0), 0)
    const totalVideos = videos.filter(video => video.type !== 'pdf').length

    return {
        title: titleCaseFallback(applyModuleOverride(title, rules)),
        originalTitle: title,
        order,
        videos,
        subModules: [],
        totalDuration,
        totalVideos,
        telegramStats: {
            totalItems: videos.length,
            notes: videos.filter(video => video.type === 'pdf').length,
            lowConfidence: sorted.filter(item => item.confidence < 0.65).length,
        },
    }
}

function splitIntoPrefixModules(items, fallbackTitle, rules = {}) {
    const prefixCounts = new Map()
    for (const item of items) {
        if (!item.inferredPrefix) continue
        prefixCounts.set(item.inferredPrefix, (prefixCounts.get(item.inferredPrefix) || 0) + 1)
    }

    const strongPrefixes = [...prefixCounts.entries()]
        .filter(([, count]) => count >= 3)
        .map(([prefix]) => prefix)

    if (rules.groupBy === 'flat' || strongPrefixes.length < 2) {
        return [buildModule(fallbackTitle, items, 0, rules)]
    }

    const modules = []
    const used = new Set()
    strongPrefixes.sort(naturalSort).forEach((prefix, index) => {
        const group = items.filter(item => item.inferredPrefix === prefix)
        group.forEach(item => used.add(item.id))
        modules.push(buildModule(prefix, group, index, rules))
    })

    const remaining = items.filter(item => !used.has(item.id))
    if (remaining.length > 0) {
        modules.push(buildModule('Unsorted Telegram Media', remaining, modules.length, rules))
    }

    return modules
}

export function buildTelegramCourseStructure({ chatTitle, topicTitle, topics = [], messages = [], chatId, rules = {} }) {
    const source = {
        streamUrlFor: (item) => `/api/telegram/stream/${encodeURIComponent(item.chatId || chatId)}/${encodeURIComponent(item.id)}`,
    }

    const enriched = messages
        .map(item => analyzeItem({ ...item, chatId: item.chatId || chatId }, source, rules))
        .filter(item => item.url)

    const byTopic = new Map()
    for (const item of enriched) {
        const key = item.topicId ? String(item.topicId) : 'main'
        if (!byTopic.has(key)) byTopic.set(key, [])
        byTopic.get(key).push(item)
    }

    let modules = []
    if (rules.groupBy === 'flat') {
        modules = [buildModule(topicTitle || chatTitle || 'Telegram Import', enriched, 0, rules)]
    } else if (byTopic.size <= 1 || rules.groupBy === 'prefix') {
        modules = splitIntoPrefixModules(enriched, topicTitle || chatTitle || 'Telegram Import', rules)
    } else {
        let order = 0
        for (const [topicId, items] of byTopic.entries()) {
            const topic = topics.find(t => String(t.id) === String(topicId))
            modules.push(buildModule(topic?.title || items[0]?.topicTitle || `Topic ${topicId}`, items, order++, rules))
        }
    }

    const totalDuration = modules.reduce((sum, module) => sum + (module.totalDuration || 0), 0)
    const totalVideos = modules.reduce((sum, module) => sum + (module.totalVideos || 0), 0)
    const totalItems = enriched.length
    const notes = enriched.filter(item => item.type === 'pdf').length
    const lowConfidence = enriched.filter(item => item.confidence < 0.65).length

    return {
        title: titleCaseFallback(rules.courseTitleOverride || topicTitle || chatTitle || 'Telegram Course'),
        originalTitle: topicTitle || chatTitle || 'Telegram Course',
        source: 'telegram',
        sourceType: 'telegram',
        totalDuration,
        totalVideos,
        modules,
        telegramStats: {
            totalItems,
            videos: totalVideos,
            notes,
            lowConfidence,
        },
    }
}
