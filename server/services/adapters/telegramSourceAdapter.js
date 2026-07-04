import * as tg from '../telegramClient.js'

export const adapterInterfaceVersion = 1

const DEFAULT_CAPABILITIES = {
    adapterInterfaceVersion,
    incrementalSync: true,
    topics: true,
    captions: true,
    mediaStreaming: true,
    deleteDetection: false,
    versionHistory: false,
}

export async function connect(source) {
    return { ok: true, sourceId: source.id }
}

export async function disconnect(source) {
    return { ok: true, sourceId: source.id }
}

export async function health() {
    const status = await tg.getStatus()
    return status.loggedIn ? 'connected' : 'auth_expired'
}

export function capabilities() {
    return DEFAULT_CAPABILITIES
}

function sourceItemKey(message) {
    return `${message.chatId}:${message.topicId || 'main'}:${message.id}`
}

function topicName(source, topicId) {
    const topics = source.discoveryCursor?.topics || []
    const topic = topics.find(item => String(item.id) === String(topicId))
    return topic?.title || ''
}

function toDiscovery(source, message) {
    const key = sourceItemKey(message)
    const topicTitle = message.topicTitle || topicName(source, message.topicId)
    return {
        id: `disc_${key.replace(/[^a-z0-9_-]/gi, '_')}`,
        sourceItemKey: key,
        parentKey: String(message.chatId || source.discoveryCursor?.chatId || ''),
        topicKey: message.topicId ? String(message.topicId) : 'main',
        title: message.fileName || message.message || 'Telegram Item',
        description: message.message || '',
        fileName: message.fileName || '',
        mimeType: message.mimeType || '',
        mediaKind: message.type || 'other',
        fileSize: Number(message.size || message.fileSize || 0),
        duration: Number(message.duration || 0),
        sourceDate: Number(message.date || 0),
        sender: message.sender || '',
        raw: {
            ...message,
            sourceName: source.name,
            topicName: topicTitle,
        },
    }
}

export async function scan(source, rulesSnapshot = {}, cursor = {}) {
    const chatId = cursor.chatId || source.discoveryCursor?.chatId
    if (!chatId) throw new Error('Telegram source is missing chatId')

    const topicIds = Array.isArray(rulesSnapshot.topicIds) && rulesSnapshot.topicIds.length > 0
        ? rulesSnapshot.topicIds
        : (source.discoveryCursor?.topics || []).map(topic => topic.id)
    const maxMessages = Number(rulesSnapshot.maxMessages || rulesSnapshot.defaultScanLimit || 500)
    const mediaKinds = Array.isArray(rulesSnapshot.fileTypes) && rulesSnapshot.fileTypes.length > 0
        ? rulesSnapshot.fileTypes
        : ['video', 'pdf', 'image']
    const minId = rulesSnapshot.newOnly ? Number(source.syncCursor?.lastMessageId || 0) : 0

    const messages = await tg.scanMessages(chatId, {
        topicIds,
        maxMessages,
        minId,
        mediaKinds,
    })
    const discoveries = messages.map(message => toDiscovery(source, message))
    const lastMessageId = Math.max(0, ...messages.map(message => Number(message.id) || 0))

    return {
        discoveries,
        cursor: {
            ...cursor,
            chatId: String(chatId),
            lastMessageId,
        },
        counters: {
            discovered: discoveries.length,
            lastMessageId,
        },
    }
}

export async function sync(source, rulesSnapshot = {}, cursor = {}) {
    return scan(source, { ...rulesSnapshot, newOnly: true }, cursor)
}

export function resolveMedia(sourceItem) {
    const raw = sourceItem.raw || sourceItem.raw_json || {}
    const chatId = raw.chatId
    const messageId = raw.id || raw.messageId
    if (!chatId || !messageId) return null
    return `/api/telegram/stream/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}`
}
