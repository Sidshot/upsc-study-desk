import { createId } from './sourceUtils.js'
import { inferMediaType } from './mediaTypeInference.js'

const SCHEMA_VERSION = 1

function mediaTypeOf(discovery) {
    return inferMediaType({
        type: discovery.mediaKind || discovery.media_type,
        mimeType: discovery.mimeType,
        fileName: discovery.fileName,
        title: discovery.title,
        metadata: { raw: discovery.raw || {} },
    }, 'other')
}

function telegramUrl(discovery) {
    const raw = discovery.raw || {}
    const chatId = raw.chatId
    const messageId = raw.id || raw.messageId
    if (!chatId || !messageId) return null
    return `/api/telegram/stream/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}`
}

function telegramMetadata(discovery) {
    const raw = discovery.raw || {}
    const chatId = raw.chatId
    const messageId = raw.id || raw.messageId
    if (!chatId || !messageId) return null
    return {
        chatId: String(chatId),
        messageId: Number(messageId),
    }
}

function sourceUrl(source, discovery) {
    if (source.type === 'telegram') return telegramUrl(discovery)
    return discovery.raw?.url || null
}

export function discoveryToOmniImportItem(source, discovery) {
    const now = new Date().toISOString()
    const mediaType = mediaTypeOf(discovery)
    const metadata = {
        sourceType: source.type,
        sourceName: source.name,
        sourceId: source.id,
        sourceItemKey: discovery.sourceItemKey,
        parentKey: discovery.parentKey,
        topicKey: discovery.topicKey,
        topicName: discovery.raw?.topicName || '',
        sourceDate: discovery.sourceDate || 0,
        sender: discovery.sender || '',
        caption: discovery.description || '',
        raw: discovery.raw || {},
        url: sourceUrl(source, discovery),
    }
    const telegram = source.type === 'telegram' ? telegramMetadata(discovery) : null
    if (telegram) metadata.telegram = telegram

    return {
        schemaVersion: SCHEMA_VERSION,
        id: createId('import_item'),
        sourceId: source.id,
        sourceItemKey: discovery.sourceItemKey,
        title: discovery.title || discovery.fileName || 'Untitled',
        description: discovery.description || '',
        mediaType,
        mimeType: discovery.mimeType || '',
        fileName: discovery.fileName || '',
        size: Number(discovery.fileSize || 0),
        duration: mediaType === 'video' ? Number(discovery.duration || 0) : 0,
        thumbnail: null,
        metadata,
        status: 'selected',
        createdAt: now,
        updatedAt: now,
    }
}

export function discoveriesToOmniImportItems(source, discoveries = []) {
    return discoveries.map(discovery => discoveryToOmniImportItem(source, discovery))
}
