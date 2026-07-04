const subscribers = new Set()
const recentEvents = []
const MAX_RECENT_EVENTS = 200

export function emitSourceEvent(name, { sourceId = null, jobId = null, itemId = null, payload = {} } = {}) {
    const event = {
        name,
        timestamp: new Date().toISOString(),
        sourceId,
        jobId,
        itemId,
        payload,
    }
    recentEvents.unshift(event)
    recentEvents.splice(MAX_RECENT_EVENTS)
    for (const subscriber of subscribers) {
        try {
            subscriber(event)
        } catch {
            // Subscribers must not break source workflows.
        }
    }
    return event
}

export function subscribeToSourceEvents(subscriber) {
    subscribers.add(subscriber)
    return () => subscribers.delete(subscriber)
}

export function listRecentSourceEvents(limit = 50) {
    return recentEvents.slice(0, Math.min(Math.max(Number(limit) || 50, 1), MAX_RECENT_EVENTS))
}
