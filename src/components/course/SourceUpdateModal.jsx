import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Image, Loader2, RefreshCw, Video, X } from 'lucide-react'
import { buildSourcePreview, flattenPreviewItems, getSourceJob, importSourceDiscoveries, scanSource } from '../../utils/sources'

function formatFileSize(bytes) {
    if (!bytes) return '-'
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} B`
}

function mediaIcon(kind) {
    if (kind === 'video') return Video
    if (kind === 'image') return Image
    return FileText
}

async function waitForJob(jobId, onProgress) {
    let lastJob = null
    for (let attempt = 0; attempt < 240; attempt += 1) {
        const data = await getSourceJob(jobId)
        lastJob = data.job
        onProgress?.(lastJob)
        if (lastJob.status === 'completed') return lastJob
        if (lastJob.status === 'failed' || lastJob.status === 'cancelled') {
            throw new Error(lastJob.error?.message || `Job ${lastJob.status}`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error('Timed out waiting for source job')
}

function SourceUpdateModal({ isOpen, source, course, onClose, onImported }) {
    const [status, setStatus] = useState('idle')
    const [job, setJob] = useState(null)
    const [preview, setPreview] = useState(null)
    const [selectedIds, setSelectedIds] = useState(new Set())
    const [error, setError] = useState('')
    const [mediaFilter, setMediaFilter] = useState('all')

    const items = useMemo(() => flattenPreviewItems(preview), [preview])
    const visibleItems = useMemo(() => {
        if (mediaFilter === 'all') return items
        if (mediaFilter === 'other') {
            return items.filter(item => !['video', 'pdf', 'image', 'audio', 'document'].includes(item.mediaKind))
        }
        return items.filter(item => item.mediaKind === mediaFilter)
    }, [items, mediaFilter])
    const selectedCount = selectedIds.size

    useEffect(() => {
        if (!isOpen) return
        setStatus('idle')
        setJob(null)
        setPreview(null)
        setSelectedIds(new Set())
        setError('')
        setMediaFilter('all')
    }, [isOpen, source?.id])

    if (!isOpen || !source) return null

    async function handleScan() {
        try {
            setStatus('scanning')
            setError('')
            setPreview(null)
            const { job: scanJob } = await scanSource(source.id, {
                mode: 'sync',
                rulesOverride: { newOnly: true },
            })
            await waitForJob(scanJob.id, setJob)
            const nextPreview = await buildSourcePreview(source.id, { limit: 300 })
            setPreview(nextPreview)
            setSelectedIds(new Set(flattenPreviewItems(nextPreview).map(item => item.id)))
            setStatus('preview')
        } catch (err) {
            setError(err.message)
            setStatus('error')
        }
    }

    async function handleImport() {
        if (selectedIds.size === 0) return
        try {
            setStatus('importing')
            setError('')
            const { job: importJob } = await importSourceDiscoveries(source.id, {
                selectedDiscoveryIds: [...selectedIds],
                target: { courseId: course.id, courseTitle: course.title },
            })
            await waitForJob(importJob.id, setJob)
            setStatus('done')
            onImported?.()
        } catch (err) {
            setError(err.message)
            setStatus('error')
        }
    }

    function toggleItem(itemId) {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(itemId)) next.delete(itemId)
            else next.add(itemId)
            return next
        })
    }

    function toggleAll() {
        const visibleIds = visibleItems.map(item => item.id)
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (allVisibleSelected) {
                visibleIds.forEach(id => next.delete(id))
            } else {
                visibleIds.forEach(id => next.add(id))
            }
            return next
        })
    }

    const isBusy = status === 'scanning' || status === 'importing'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-3xl border border-amber-200/70 dark:border-white/10 bg-[#f8f0d8] dark:bg-neutral-950 shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-amber-200/80 dark:border-white/10 p-5">
                    <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Telegram source update</div>
                        <h2 className="mt-1 text-2xl font-bold text-stone-950 dark:text-white">{course?.title}</h2>
                        <p className="mt-1 text-sm text-stone-600 dark:text-neutral-400">{source.name} • metadata-only scan</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-stone-600 hover:bg-amber-100 dark:text-neutral-400 dark:hover:bg-white/10">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="max-h-[62vh] overflow-y-auto p-5">
                    {error && (
                        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {status === 'idle' && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-stone-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
                            <p className="mb-4">Check Telegram for material added after the last scan. Omni will only discover metadata first; files are imported only after you select them.</p>
                            <button onClick={handleScan} className="inline-flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 dark:bg-white dark:text-neutral-950">
                                <RefreshCw className="h-4 w-4" />
                                Check for updates
                            </button>
                        </div>
                    )}

                    {isBusy && (
                        <div className="flex min-h-48 flex-col items-center justify-center text-center text-stone-700 dark:text-neutral-300">
                            <Loader2 className="mb-4 h-9 w-9 animate-spin text-amber-700 dark:text-amber-300" />
                            <h3 className="text-lg font-semibold">{status === 'scanning' ? 'Scanning Telegram metadata' : 'Importing selected items'}</h3>
                            <p className="mt-1 text-sm text-stone-500 dark:text-neutral-500">{job?.progress || 0}% complete</p>
                        </div>
                    )}

                    {status === 'preview' && (
                        <>
                            <div className="mb-4 grid gap-3 sm:grid-cols-4">
                                {['video', 'pdf', 'image', 'document'].map(kind => (
                                    <div key={kind} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 dark:border-white/10 dark:bg-white/5">
                                        <div className="text-xs uppercase text-stone-500 dark:text-neutral-500">{kind}</div>
                                        <div className="text-2xl font-bold text-stone-950 dark:text-white">{preview?.counts?.[kind] || 0}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="mb-4 flex flex-wrap gap-2">
                                {[
                                    ['all', 'All'],
                                    ['video', 'Videos'],
                                    ['pdf', 'PDFs'],
                                    ['image', 'Images'],
                                    ['document', 'Docs'],
                                    ['audio', 'Audio'],
                                    ['other', 'Others'],
                                ].map(([value, label]) => (
                                    <button
                                        key={value}
                                        onClick={() => setMediaFilter(value)}
                                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                            mediaFilter === value
                                                ? 'bg-stone-950 text-white dark:bg-white dark:text-neutral-950'
                                                : 'bg-amber-100 text-stone-700 hover:bg-amber-200 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            <div className="mb-3 flex items-center justify-between">
                                <button onClick={toggleAll} className="text-sm font-semibold text-amber-800 hover:underline dark:text-amber-300">
                                    {visibleItems.length > 0 && visibleItems.every(item => selectedIds.has(item.id)) ? 'Clear visible' : 'Select visible'}
                                </button>
                                <div className="text-sm text-stone-600 dark:text-neutral-400">
                                    {selectedCount} selected • {formatFileSize(preview?.estimatedSize)}
                                </div>
                            </div>

                            <div className="space-y-3">
                                {visibleItems.length === 0 ? (
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-center text-stone-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400">
                                        No items match this filter.
                                    </div>
                                ) : visibleItems.map(item => {
                                    const Icon = mediaIcon(item.mediaKind)
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => toggleItem(item.id)}
                                            className="flex w-full items-start gap-3 rounded-2xl border border-amber-200 bg-[#fff8e5] p-3 text-left transition hover:border-amber-400 dark:border-white/10 dark:bg-white/5 dark:hover:border-amber-300/50"
                                        >
                                            <span className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${selectedIds.has(item.id) ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-300 dark:border-neutral-600'}`}>
                                                {selectedIds.has(item.id) ? '✓' : ''}
                                            </span>
                                            <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-300" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-semibold text-stone-950 dark:text-white">{item.title || item.fileName}</span>
                                                <span className="mt-1 line-clamp-2 block text-sm text-stone-600 dark:text-neutral-400">{item.description || item.fileName || 'No caption available'}</span>
                                            </span>
                                            <span className="text-xs text-stone-500 dark:text-neutral-500">{formatFileSize(item.fileSize)}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {status === 'done' && (
                        <div className="flex min-h-48 flex-col items-center justify-center text-center text-stone-700 dark:text-neutral-300">
                            <CheckCircle2 className="mb-4 h-10 w-10 text-green-600 dark:text-green-400" />
                            <h3 className="text-lg font-semibold">Update imported</h3>
                            <p className="mt-1 text-sm text-stone-500 dark:text-neutral-500">The course now includes the selected Telegram items.</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-amber-200/80 p-5 dark:border-white/10">
                    <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-amber-100 dark:text-neutral-300 dark:hover:bg-white/10">
                        Close
                    </button>
                    {status === 'preview' && (
                        <button
                            onClick={handleImport}
                            disabled={selectedCount === 0}
                            className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950"
                        >
                            Import selected
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default SourceUpdateModal
