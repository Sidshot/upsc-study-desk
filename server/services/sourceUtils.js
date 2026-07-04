export function nowIso() {
    return new Date().toISOString()
}

export function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function safeJsonParse(value, fallback = {}) {
    if (!value) return fallback
    try {
        return JSON.parse(value)
    } catch {
        return fallback
    }
}

export function asJson(value, fallback = {}) {
    return JSON.stringify(value === undefined ? fallback : value)
}
