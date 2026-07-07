const DESKTOP_SESSION_HEADER = 'x-omni-session'

function getExpectedDesktopToken() {
    return process.env.OMNI_LOCAL_API_TOKEN || ''
}

export function hasTrustedDesktopSession(req) {
    const expectedToken = getExpectedDesktopToken()
    if (!expectedToken) return true

    const providedToken = req.get(DESKTOP_SESSION_HEADER) || ''
    return providedToken === expectedToken
}

export function requireTrustedDesktopSession(req, res, next) {
    if (hasTrustedDesktopSession(req)) {
        return next()
    }

    res.status(403).json({
        error: 'This action is only available to the installed Omni desktop app.',
    })
}
