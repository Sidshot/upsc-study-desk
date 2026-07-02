import { useState, useEffect, useCallback } from 'react'
import { X, Send, Loader, AlertTriangle, Search, ChevronLeft, Check, Users, Radio, Film, Calendar, HardDrive, Wand2 } from 'lucide-react'
import * as api from '../../utils/api'

function formatFileSize(bytes) {
    if (!bytes) return '—'
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return bytes + ' B'
}

function formatDuration(seconds) {
    if (!seconds) return '—'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(timestamp) {
    if (!timestamp) return '—'
    return new Date(timestamp * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function TelegramImportModal({ isOpen, onClose, onImport, settings }) {
    const [step, setStep] = useState('login')
    const [phone, setPhone] = useState('')
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
    const [phoneCodeHash, setPhoneCodeHash] = useState('')
    const [needsPassword, setNeedsPassword] = useState(false)
    const [codeSent, setCodeSent] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [channels, setChannels] = useState([])
    const [messages, setMessages] = useState([])
    const [selectedChannel, setSelectedChannel] = useState(null)
    const [selectedVideos, setSelectedVideos] = useState(new Set())
    const [channelFilter, setChannelFilter] = useState('')
    const [topics, setTopics] = useState([])
    const [selectedTopic, setSelectedTopic] = useState(null)
    const [topicFilter, setTopicFilter] = useState('')
    const [isSmartScanning, setIsSmartScanning] = useState(false)
    const [smartScanLimit, setSmartScanLimit] = useState(500)
    const [cacheStatus, setCacheStatus] = useState(null)
    const [parseRules, setParseRules] = useState({
        groupBy: 'auto',
        defaultScanLimit: 500,
        ignoredWords: [],
        moduleOverrides: {},
        courseTitleOverride: '',
    })
    const [ignoredWordsText, setIgnoredWordsText] = useState('')

    const apiId = settings?.telegramApiId
    const apiHash = settings?.telegramApiHash

    const loadDialogs = useCallback(async () => {
        setIsLoading(true)
        setError('')
        try {
            const data = await api.get('/api/telegram/dialogs')
            setChannels(data.dialogs || data || [])
        } catch (err) {
            setError('Failed to load channels: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Check status on open
    useEffect(() => {
        if (!isOpen) return
        // Reset all state
        setStep('login')
        setPhone('')
        setCode('')
        setPassword('')
        setPhoneCodeHash('')
        setNeedsPassword(false)
        setCodeSent(false)
        setError('')
        setChannels([])
        setMessages([])
        setSelectedChannel(null)
        setSelectedVideos(new Set())
        setChannelFilter('')
        setTopics([])
        setSelectedTopic(null)
        setTopicFilter('')
        setIsSmartScanning(false)
        setSmartScanLimit(500)
        setCacheStatus(null)
        setParseRules({
            groupBy: 'auto',
            defaultScanLimit: 500,
            ignoredWords: [],
            moduleOverrides: {},
            courseTitleOverride: '',
        })
        setIgnoredWordsText('')

        if (!apiId || !apiHash) return

        async function checkStatus() {
            try {
                const data = await api.get('/api/telegram/status')
                if (data.loggedIn) {
                    setStep('channels')
                    loadDialogs()
                }
            } catch {
                // Not logged in, stay on login step
            }
        }
        checkStatus()
    }, [isOpen, apiId, apiHash, loadDialogs])

    if (!isOpen) return null

    async function handleSendCode(e) {
        e.preventDefault()
        if (!phone.trim()) return
        setIsLoading(true)
        setError('')
        try {
            const data = await api.post('/api/telegram/send-code', {
                apiId,
                apiHash,
                phone: phone.trim()
            })
            setPhoneCodeHash(data.phoneCodeHash)
            setCodeSent(true)
        } catch (err) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleSignIn(e) {
        e.preventDefault()
        if (!code.trim()) return
        setIsLoading(true)
        setError('')
        try {
            const data = await api.post('/api/telegram/sign-in', {
                apiId,
                apiHash,
                phone: phone.trim(),
                code: code.trim(),
                phoneCodeHash
            })
            if (data.needsPassword) {
                setNeedsPassword(true)
            } else {
                setStep('channels')
                loadDialogs()
            }
        } catch (err) {
            if (err.message?.toLowerCase().includes('password') || err.message?.toLowerCase().includes('2fa')) {
                setNeedsPassword(true)
            } else {
                setError(err.message)
            }
        } finally {
            setIsLoading(false)
        }
    }

    async function handleSignIn2FA(e) {
        e.preventDefault()
        if (!password) return
        setIsLoading(true)
        setError('')
        try {
            await api.post('/api/telegram/sign-in-2fa', {
                apiId,
                apiHash,
                password
            })
            setStep('channels')
            loadDialogs()
        } catch (err) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleSelectChannel(channel) {
        setSelectedChannel(channel)
        loadCacheStatus(channel.id)
        if (channel.isForum) {
            setStep('topics')
            setIsLoading(true)
            setError('')
            setTopics([])
            try {
                const data = await api.get(`/api/telegram/topics/${encodeURIComponent(channel.id)}`)
                setTopics(data || [])
            } catch (err) {
                setError('Failed to load topics: ' + err.message)
            } finally {
                setIsLoading(false)
            }
        } else {
            setSelectedTopic(null)
            setStep('videos')
            loadVideos(channel.id, null, 0)
        }
    }

    async function handleSelectTopic(topic) {
        setSelectedTopic(topic)
        setStep('videos')
        loadVideos(selectedChannel.id, topic.id, 0)
    }

    async function loadCacheStatus(chatId) {
        try {
            const status = await api.get(`/api/telegram/cache-status/${encodeURIComponent(chatId)}`)
            setCacheStatus(status)
            if (status.rules && Object.keys(status.rules).length > 0) {
                setParseRules(prev => ({ ...prev, ...status.rules }))
                setIgnoredWordsText((status.rules.ignoredWords || []).join(', '))
                if (status.rules.defaultScanLimit) {
                    setSmartScanLimit(Number(status.rules.defaultScanLimit))
                }
            }
        } catch {
            setCacheStatus(null)
        }
    }

    async function loadVideos(chatId, topicId, offsetId = 0) {
        if (offsetId === 0) {
            setMessages([])
            setSelectedVideos(new Set())
        }
        setIsLoading(true)
        setError('')
        try {
            let url = `/api/telegram/messages/${encodeURIComponent(chatId)}?limit=100&offsetId=${offsetId}`
            if (topicId) {
                url += `&topicId=${encodeURIComponent(topicId)}`
            }
            const data = await api.get(url)
            const fetched = data.messages || data || []
            if (offsetId === 0) {
                setMessages(fetched)
            } else {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id))
                    const newMessages = fetched.filter(m => !existingIds.has(m.id))
                    return [...prev, ...newMessages]
                })
            }
        } catch (err) {
            setError('Failed to load media: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }

    function toggleVideo(msgId) {
        setSelectedVideos(prev => {
            const next = new Set(prev)
            if (next.has(msgId)) next.delete(msgId)
            else next.add(msgId)
            return next
        })
    }

    function toggleSelectAll() {
        if (selectedVideos.size === messages.length) {
            setSelectedVideos(new Set())
        } else {
            setSelectedVideos(new Set(messages.map(m => m.id)))
        }
    }

    function withServerUrls(course) {
        function normalizeModule(module) {
            return {
                ...module,
                videos: (module.videos || []).map(video => ({
                    ...video,
                    url: video.url?.startsWith('/api/') ? `${api.SERVER_URL}${video.url}` : video.url
                })),
                subModules: (module.subModules || []).map(normalizeModule)
            }
        }

        return {
            ...course,
            modules: (course.modules || []).map(normalizeModule)
        }
    }

    async function handleSmartScan(scanTopics = null) {
        if (!selectedChannel) return
        setIsSmartScanning(true)
        setError('')
        try {
            const chosenTopics = scanTopics || (selectedTopic ? [selectedTopic] : [])
            const data = await api.post('/api/telegram/scan-preview', {
                chatId: selectedChannel.id,
                chatTitle: selectedChannel.title,
                topics: chosenTopics,
                maxMessages: smartScanLimit
            })
            setCacheStatus(prev => ({ ...(prev || {}), mediaCount: data.cached || data.scanned || 0 }))
            onImport(withServerUrls(data.course))
        } catch (err) {
            setError('Smart scan failed: ' + err.message)
        } finally {
            setIsSmartScanning(false)
        }
    }

    async function handleCachedPreview(scanTopics = null) {
        if (!selectedChannel) return
        setIsSmartScanning(true)
        setError('')
        try {
            const chosenTopics = scanTopics || (selectedTopic ? [selectedTopic] : [])
            const data = await api.post('/api/telegram/cached-preview', {
                chatId: selectedChannel.id,
                chatTitle: selectedChannel.title,
                topics: chosenTopics,
                maxMessages: smartScanLimit
            })
            if (!data.cached) {
                setError('No cached Telegram media yet. Run Smart Scan once first.')
                return
            }
            onImport(withServerUrls(data.course))
        } catch (err) {
            setError('Cached preview failed: ' + err.message)
        } finally {
            setIsSmartScanning(false)
        }
    }

    async function handleSaveRules() {
        if (!selectedChannel) return
        setIsSmartScanning(true)
        setError('')
        try {
            const nextRules = {
                ...parseRules,
                defaultScanLimit: smartScanLimit,
                ignoredWords: ignoredWordsText
                    .split(',')
                    .map(word => word.trim())
                    .filter(Boolean),
            }
            const data = await api.put(`/api/telegram/rules/${encodeURIComponent(selectedChannel.id)}`, nextRules)
            setParseRules(data.rules)
            setIgnoredWordsText((data.rules.ignoredWords || []).join(', '))
            setCacheStatus(prev => ({ ...(prev || {}), rules: data.rules }))
        } catch (err) {
            setError('Failed to save rules: ' + err.message)
        } finally {
            setIsSmartScanning(false)
        }
    }

    function renderSmartControls() {
        if (!selectedChannel) return null
        return (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">Smart scan controls</div>
                        <div className="text-xs text-gray-500 dark:text-neutral-500">
                            Cached: {cacheStatus?.mediaCount || 0} files
                        </div>
                    </div>
                    <select
                        value={smartScanLimit}
                        onChange={(e) => setSmartScanLimit(Number(e.target.value))}
                        className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-sm"
                    >
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                        <option value={1000}>1000</option>
                        <option value={2000}>2000</option>
                    </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                        value={parseRules.groupBy || 'auto'}
                        onChange={(e) => setParseRules(prev => ({ ...prev, groupBy: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-sm"
                    >
                        <option value="auto">Auto grouping</option>
                        <option value="topic">Group by topics</option>
                        <option value="prefix">Group by filename prefix</option>
                        <option value="flat">Single module</option>
                    </select>
                    <input
                        value={parseRules.courseTitleOverride || ''}
                        onChange={(e) => setParseRules(prev => ({ ...prev, courseTitleOverride: e.target.value }))}
                        placeholder="Optional course title override"
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-sm"
                    />
                </div>
                <input
                    value={ignoredWordsText}
                    onChange={(e) => setIgnoredWordsText(e.target.value)}
                    placeholder="Ignored words, comma separated: join, channel, @name"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-sm"
                />
                <div className="flex gap-2">
                    <button
                        onClick={handleSaveRules}
                        disabled={isSmartScanning}
                        className="flex-1 py-2 rounded-lg bg-gray-100 dark:bg-white/10 text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/15 disabled:opacity-60"
                    >
                        Save Rules
                    </button>
                    <button
                        onClick={() => handleCachedPreview()}
                        disabled={isSmartScanning || !cacheStatus?.mediaCount}
                        className="flex-1 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-sm font-medium hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                        Use Cached Preview
                    </button>
                </div>
            </div>
        )
    }

    async function handleImportSelected() {
        const selected = messages.filter(m => selectedVideos.has(m.id))
        if (selected.length === 0) return

        setIsSmartScanning(true)
        setError('')
        try {
            const data = await api.post('/api/telegram/analyze', {
                chatId: selectedChannel.id,
                chatTitle: selectedChannel.title,
                topicId: selectedTopic?.id,
                topicTitle: selectedTopic?.title,
                messages: selected
            })
            onImport(withServerUrls(data.course))
        } catch (err) {
            setError('Smart arrange failed: ' + err.message)
        } finally {
            setIsSmartScanning(false)
        }
    }

    const filteredChannels = channels.filter(ch =>
        ch.title?.toLowerCase().includes(channelFilter.toLowerCase())
    )

    const missingCredentials = !apiId || !apiHash

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
            <div className="max-w-lg w-full mx-auto bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10">
                    <div className="flex items-center gap-3">
                        {step !== 'login' && (
                            <button
                                onClick={() => {
                                    if (step === 'videos') { 
                                        if (selectedChannel?.isForum) {
                                            setStep('topics')
                                        } else {
                                            setStep('channels')
                                        }
                                        setError('') 
                                    }
                                    else if (step === 'topics') { setStep('channels'); setError('') }
                                    else if (step === 'channels') { setStep('login'); setError('') }
                                }}
                                className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}
                        <Send className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {step === 'login' && 'Telegram Login'}
                            {step === 'channels' && 'Select Channel'}
                            {step === 'topics' && (selectedChannel?.title || 'Topics')}
                            {step === 'videos' && (selectedTopic ? selectedTopic.title : (selectedChannel?.title || 'Media'))}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Error Display */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Missing Credentials Warning */}
                    {missingCredentials && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-xl text-sm flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium">Telegram API credentials missing</p>
                                <p className="mt-1 opacity-80">
                                    Please add your Telegram API ID and API Hash in <strong>Settings → AI & API Keys</strong> first.
                                    Get them from <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="underline font-medium">my.telegram.org</a>.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* LOGIN STEP */}
                    {step === 'login' && !missingCredentials && (
                        <div className="space-y-4">
                            {!codeSent && !needsPassword && (
                                <form onSubmit={handleSendCode} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                                            Phone Number
                                        </label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="+1234567890"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm"
                                            autoFocus
                                        />
                                        <p className="mt-2 text-xs text-gray-500 dark:text-neutral-500">
                                            Include your country code (e.g. +91 for India)
                                        </p>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!phone.trim() || isLoading}
                                        className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        Send Code
                                    </button>
                                </form>
                            )}

                            {codeSent && !needsPassword && (
                                <form onSubmit={handleSignIn} className="space-y-4">
                                    <div className="p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-xl text-sm">
                                        Code sent to <strong>{phone}</strong>. Check your Telegram app.
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                                            Verification Code
                                        </label>
                                        <input
                                            type="text"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            placeholder="12345"
                                            maxLength={6}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm text-center tracking-[0.3em] font-mono text-lg"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!code.trim() || isLoading}
                                        className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Verify
                                    </button>
                                </form>
                            )}

                            {needsPassword && (
                                <form onSubmit={handleSignIn2FA} className="space-y-4">
                                    <div className="p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-xl text-sm">
                                        Two-factor authentication is enabled. Enter your cloud password.
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                                            2FA Password
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Your cloud password"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!password || isLoading}
                                        className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Sign In
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* CHANNELS STEP */}
                    {step === 'channels' && (
                        <div className="space-y-3">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500" />
                                <input
                                    type="text"
                                    value={channelFilter}
                                    onChange={(e) => setChannelFilter(e.target.value)}
                                    placeholder="Search channels & groups..."
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:border-blue-500 outline-none transition-all text-sm"
                                />
                            </div>

                            {/* Loading */}
                            {isLoading && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader className="w-6 h-6 animate-spin text-blue-500" />
                                </div>
                            )}

                            {/* Channel List */}
                            {!isLoading && (
                                <div className="max-h-80 overflow-y-auto -mx-2 px-2 space-y-1">
                                    {filteredChannels.length === 0 && (
                                        <p className="text-center text-sm text-gray-500 dark:text-neutral-500 py-8">
                                            {channels.length === 0 ? 'No channels found' : 'No results match your search'}
                                        </p>
                                    )}
                                    {filteredChannels.map((ch) => (
                                        <button
                                            key={ch.id}
                                            onClick={() => handleSelectChannel(ch)}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left group"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                                {ch.type === 'channel' ? (
                                                    <Radio className="w-5 h-5 text-blue-500" />
                                                ) : (
                                                    <Users className="w-5 h-5 text-blue-500" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                    {ch.title}
                                                </div>
                                                {ch.participantsCount && (
                                                    <div className="text-xs text-gray-500 dark:text-neutral-500">
                                                        {ch.participantsCount.toLocaleString()} members
                                                    </div>
                                                )}
                                            </div>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                                                ch.type === 'channel'
                                                    ? 'bg-blue-500/10 text-blue-500'
                                                    : 'bg-emerald-500/10 text-emerald-500'
                                            }`}>
                                                {ch.type === 'channel' ? 'Channel' : 'Group'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TOPICS STEP */}
                    {step === 'topics' && (
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500" />
                                <input
                                    type="text"
                                    value={topicFilter}
                                    onChange={(e) => setTopicFilter(e.target.value)}
                                    placeholder="Search topics..."
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:border-blue-500 outline-none transition-all text-sm"
                                />
                            </div>

                            {isLoading && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader className="w-6 h-6 animate-spin text-blue-500" />
                                </div>
                            )}

                            {!isLoading && (
                                <div className="max-h-80 overflow-y-auto -mx-2 px-2 space-y-1">
                                    {topics.length > 0 && <div className="mx-2 mb-2">{renderSmartControls()}</div>}
                                    {topics.length > 0 && (
                                        <button
                                            onClick={() => handleSmartScan(topics)}
                                            disabled={isSmartScanning}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors text-left disabled:opacity-60"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0">
                                                {isSmartScanning ? <Loader className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm text-blue-700 dark:text-blue-300">
                                                    Smart scan all topics
                                                </div>
                                                <div className="text-xs text-blue-600/80 dark:text-blue-300/80">
                                                    Build a course preview from up to {smartScanLimit} Telegram media files.
                                                </div>
                                            </div>
                                        </button>
                                    )}
                                    {topics.filter(t => t.title?.toLowerCase().includes(topicFilter.toLowerCase())).map((topic) => (
                                        <button
                                            key={topic.id}
                                            onClick={() => handleSelectTopic(topic)}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left group"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                                <Users className="w-5 h-5 text-blue-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                    {topic.title}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* VIDEOS STEP */}
                    {step === 'videos' && (
                        <div className="space-y-3">
                            {/* Loading */}
                            {isLoading && messages.length === 0 && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader className="w-6 h-6 animate-spin text-blue-500" />
                                </div>
                            )}

                            {!isLoading && messages.length === 0 && !error && (
                                <p className="text-center text-sm text-gray-500 dark:text-neutral-500 py-8">
                                    No media files found here
                                </p>
                            )}

                            {!isLoading && messages.length > 0 && (
                                <>
                                    {renderSmartControls()}
                                    <button
                                        onClick={() => handleSmartScan()}
                                        disabled={isSmartScanning}
                                        className="w-full p-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                                    >
                                        {isSmartScanning ? <Loader className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                        Smart Scan & Arrange {selectedTopic ? 'This Topic' : 'This Channel'}
                                    </button>

                                    {/* Select All */}
                                    <div className="flex items-center justify-between py-2">
                                        <button
                                            onClick={toggleSelectAll}
                                            className="flex items-center gap-2 text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors"
                                        >
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                selectedVideos.size === messages.length
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'border-gray-300 dark:border-white/20'
                                            }`}>
                                                {selectedVideos.size === messages.length && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                            Select All ({messages.length})
                                        </button>
                                        <span className="text-xs text-gray-500 dark:text-neutral-500">
                                            {selectedVideos.size} selected
                                        </span>
                                    </div>

                                    {/* Video List */}
                                    <div className="max-h-72 overflow-y-auto -mx-2 px-2 space-y-1">
                                        {messages.map((msg) => (
                                            <button
                                                key={msg.id}
                                                onClick={() => toggleVideo(msg.id)}
                                                className={`w-full flex items-start gap-3 p-3 rounded-xl transition-colors text-left ${
                                                    selectedVideos.has(msg.id)
                                                        ? 'bg-blue-50 dark:bg-blue-500/10'
                                                        : 'hover:bg-gray-50 dark:hover:bg-white/5'
                                                }`}
                                            >
                                                <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                                    selectedVideos.has(msg.id)
                                                        ? 'bg-blue-500 border-blue-500'
                                                        : 'border-gray-300 dark:border-white/20'
                                                }`}>
                                                    {selectedVideos.has(msg.id) && <Check className="w-3 h-3 text-white" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        <Film className="w-3.5 h-3.5 inline mr-1.5 opacity-50" />
                                                        {msg.fileName || `Video ${msg.id}`}
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-neutral-500">
                                                        {msg.size && (
                                                            <span className="flex items-center gap-1">
                                                                <HardDrive className="w-3 h-3" />
                                                                {formatFileSize(msg.size)}
                                                            </span>
                                                        )}
                                                        {msg.duration && (
                                                            <span>{formatDuration(msg.duration)}</span>
                                                        )}
                                                        {msg.date && (
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="w-3 h-3" />
                                                                {formatDate(msg.date)}
                                                            </span>
                                                        )}
                                                        <span className="uppercase text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-neutral-400">
                                                            {msg.type}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}

                                        {messages.length >= 100 && (
                                            <button
                                                onClick={() => loadVideos(selectedChannel.id, selectedTopic?.id, messages[messages.length - 1].id)}
                                                disabled={isLoading}
                                                className="w-full py-3 mt-2 text-sm font-medium text-blue-500 bg-blue-50 dark:bg-blue-500/10 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2"
                                            >
                                                {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Load More Media'}
                                            </button>
                                        )}
                                    </div>

                                    {/* Import Button */}
                                    <button
                                        onClick={handleImportSelected}
                                        disabled={selectedVideos.size === 0 || isSmartScanning}
                                        className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 mt-2"
                                    >
                                        {isSmartScanning ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        Arrange & Import {selectedVideos.size > 0 ? `${selectedVideos.size} File${selectedVideos.size > 1 ? 's' : ''}` : 'Selected'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default TelegramImportModal
