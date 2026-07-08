import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid, List, SortAsc, ChevronDown, FolderOpen, Search, PlayCircle, BookOpen, Trophy, CircleCheck, Clock3, ListTodo, XCircle } from 'lucide-react'
import { getAllCourses, addCourse, addModule, addVideo, setInstructorAvatar, recalculateAllCoursesProgress, getTodaysRevisionQueue, getRevisionSummary, updateRevisionQueueItem } from '../utils/db'
import { useSettings } from '../contexts/SettingsContext'
import { useSearch } from '../contexts/SearchContext'
import { useNotification } from '../contexts/NotificationContext'
import { useImport } from '../contexts/ImportContext'
import CourseCard from '../components/course/CourseCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ImportPreviewModal from '../components/course/ImportPreviewModal'
import EditCourseModal from '../components/course/EditCourseModal'
import SyncPreviewModal from '../components/course/SyncPreviewModal'
import SourceUpdateModal from '../components/course/SourceUpdateModal'
import { getDriveVideoUrl } from '../utils/googleDrive'
import { getSourceCourseMap } from '../utils/sources'
import { 
    syncCoursePreview, applySyncChanges, pickFolder, scanCourseFolder 
} from '../utils/fileSystem'
import * as api from '../utils/api'

function HomePage() {
    const navigate = useNavigate()
    const [courses, setCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [importData, setImportData] = useState(null)
    const [editingCourse, setEditingCourse] = useState(null)
    const [syncPreview, setSyncPreview] = useState(null)
    const [isApplyingSync, setIsApplyingSync] = useState(false)
    const [sourceMap, setSourceMap] = useState({})
    const [sourceUpdateTarget, setSourceUpdateTarget] = useState(null)
    const [revisionItems, setRevisionItems] = useState([])
    const [revisionSummary, setRevisionSummary] = useState({ pendingTotal: 0, dueToday: 0, overdue: 0, completedToday: 0 })
    const { settings, updateSettings } = useSettings()
    const { searchQuery, setSearchQuery } = useSearch()
    const { showNotification } = useNotification()
    const viewMode = settings.viewMode || 'grid'

    // Sort state
    const [sortBy, setSortBy] = useState(() => {
        return localStorage.getItem('mystudy_sort') || 'lastAccessed'
    })
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [activeFilter, setActiveFilter] = useState('all')

    // Debounced search
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Load courses on mount
    useEffect(() => {
        loadCourses()
    }, [])

    useEffect(() => {
        loadRevisionData()
    }, [])

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Save sort preference
    useEffect(() => {
        localStorage.setItem('mystudy_sort', sortBy)
    }, [sortBy])

    async function loadCourses() {
        try {
            setIsLoading(true)
            const [allCourses, linkedSources] = await Promise.all([
                getAllCourses(),
                getSourceCourseMap().catch(() => ({})),
            ])
            setCourses(allCourses)
            setSourceMap(linkedSources || {})
        } catch (err) {
            console.error('Failed to load courses:', err)
        } finally {
            setIsLoading(false)
        }
    }

    async function loadRevisionData() {
        try {
            const [items, summary] = await Promise.all([
                getTodaysRevisionQueue(),
                getRevisionSummary(),
            ])
            setRevisionItems(items || [])
            setRevisionSummary(summary || { pendingTotal: 0, dueToday: 0, overdue: 0, completedToday: 0 })
        } catch (err) {
            console.error('Failed to load revision queue:', err)
        }
    }

    // Search and sort courses
    const filteredCourses = useMemo(() => {
        let result = [...courses]

        // Search filter
        if (debouncedSearch) {
            const query = debouncedSearch.toLowerCase()
            result = result.filter(course =>
                course.title?.toLowerCase().includes(query) ||
                course.instructor?.toLowerCase().includes(query) ||
                course.tags?.some(tag => tag.toLowerCase().includes(query))
            )
        }

        // Sort
        result.sort((a, b) => {
            switch (sortBy) {
                case 'title':
                    return (a.title || '').localeCompare(b.title || '')
                case 'progress':
                    return (b.completionPercentage || 0) - (a.completionPercentage || 0)
                case 'dateAdded':
                    return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0)
                case 'lastAccessed':
                default:
                    return new Date(b.lastAccessed || 0) - new Date(a.lastAccessed || 0)
            }
        })

        return result
    }, [courses, debouncedSearch, sortBy])

    // Get all unique tags from courses
    const allTags = useMemo(() => {
        const tagSet = new Set()
        courses.forEach(course => {
            course.tags?.forEach(tag => tagSet.add(tag))
        })
        return Array.from(tagSet).sort()
    }, [courses])

    // Apply filter tabs
    const displayedCourses = useMemo(() => {
        let result = [...filteredCourses]

        if (activeFilter === 'completed') {
            result = result.filter(c => c.completionPercentage === 100)
        } else if (activeFilter === 'in-progress') {
            result = result.filter(c => c.completionPercentage > 0 && c.completionPercentage < 100)
        } else if (activeFilter === 'not-started') {
            result = result.filter(c => !c.completionPercentage || c.completionPercentage === 0)
        } else if (activeFilter !== 'all') {
            result = result.filter(c => c.tags?.includes(activeFilter))
        }

        return result
    }, [filteredCourses, activeFilter])

    function toggleViewMode() {
        updateSettings({ viewMode: viewMode === 'grid' ? 'list' : 'grid' })
    }

    function openRevisionItem(item) {
        const params = new URLSearchParams({
            videoId: item.videoId,
            anchorKind: item.anchorKind,
        })
        if (item.anchorValue !== undefined && item.anchorValue !== null) {
            params.set('anchorValue', item.anchorValue)
        }
        navigate(`/course/${item.courseId}?${params.toString()}`)
    }

    async function handleRevisionStatus(itemId, status) {
        try {
            await updateRevisionQueueItem(itemId, { status })
            await loadRevisionData()
        } catch (err) {
            console.error('Failed to update revision item:', err)
            showNotification('Failed to update revision item: ' + err.message, 'error')
        }
    }

    // Handle import confirmation - save course to database
    async function handleImportConfirm(editedData) {
        try {
            console.log('Saving course to database:', editedData)

            const courseData = {
                ...importData,
                title: editedData.title,
                instructor: editedData.instructor,
                thumbnailData: editedData.thumbnailData,
                folderPath: importData.folderPath || importData.path // Support both scanner and pick-folder results
            }

            const savedCourse = await addCourse(courseData)
            console.log('Course saved:', savedCourse.id)

            // Recursively save modules and their sub-modules
            async function saveModulesRecursive(modules, parentModuleId = null) {
                for (let i = 0; i < modules.length; i++) {
                    const module = modules[i]
                    const savedModule = await addModule({
                        courseId: savedCourse.id,
                        parentModuleId,
                        title: module.title,
                        originalTitle: module.originalTitle,
                        order: i,
                        totalDuration: module.totalDuration,
                        totalVideos: module.totalVideos || module.videos?.length || 0,
                        folderPath: module.folderPath
                    })

                    // Save videos for this module
                    const videos = module.videos || []
                    for (let j = 0; j < videos.length; j++) {
                        const video = videos[j]
                        await addVideo({
                            courseId: savedCourse.id,
                            moduleId: savedModule.id,
                            title: video.title,
                            originalTitle: video.originalTitle,
                            description: video.description,
                            fileName: video.fileName,
                            relativePath: video.relativePath,
                            filePath: video.filePath,
                            fileSize: video.fileSize,
                            url: video.url,
                            duration: video.duration,
                            type: video.type || 'video',
                            order: j,
                            fileHandle: video.fileHandle,
                            sourceMetadata: video.telegram ? {
                                sourceType: 'telegram',
                                telegram: video.telegram,
                            } : video.sourceMetadata
                        })
                    }

                    // Recursively save sub-modules
                    if (module.subModules && module.subModules.length > 0) {
                        await saveModulesRecursive(module.subModules, savedModule.id)
                    }
                }
            }

            await saveModulesRecursive(editedData.modules)

            console.log('Import complete!')
            setImportData(null)
            loadCourses()
        } catch (err) {
            console.error('Failed to save course:', err)
            showNotification('Failed to save course: ' + err.message, 'error')
        }
    }

    // Course sync handlers
    async function handleSyncCourse(course) {
        try {
            const folderPath = course.folderPath || course.folder_path
            let scannedData = null

            if (folderPath) {
                try {
                    scannedData = await scanCourseFolder(folderPath, settings.autoDetectThumbnails)
                } catch (e) {
                    console.log('Failed to scan stored path, asking user to re-locate:', e)
                    if (confirm('Course folder not found at: ' + folderPath + '\n\nWould you like to re-locate it?')) {
                        const newHandle = await pickFolder()
                        if (newHandle) {
                            scannedData = await scanCourseFolder(newHandle, settings.autoDetectThumbnails)
                        }
                    }
                }
            } else {
                // No path stored
                if (confirm('No folder path stored for this course. Please select its folder to sync.')) {
                    const handle = await pickFolder()
                    if (handle) {
                        scannedData = await scanCourseFolder(handle, settings.autoDetectThumbnails)
                    }
                }
            }

            if (!scannedData) return

            // 2. Generate and show preview
            const preview = await syncCoursePreview(course.id, scannedData)
            setSyncPreview(preview)
        } catch (err) {
            console.error('Sync failed:', err)
            showNotification('Sync failed: ' + err.message, 'error')
        }
    }

    async function handleConfirmSync() {
        if (!syncPreview) return

        try {
            setIsApplyingSync(true)
            const result = await applySyncChanges(syncPreview.course.id, syncPreview)
            console.log('Sync applied:', result)
            
            await recalculateAllCoursesProgress(settings.progressCalculationMode)
            setSyncPreview(null)
            loadCourses() // Refresh the UI
        } catch (err) {
            console.error('Failed to apply sync:', err)
            showNotification('Failed to apply changes: ' + err.message, 'error')
        } finally {
            setIsApplyingSync(false)
        }
    }

    // ─── Import handlers via ImportContext (replaces window.__homePageHandlers) ───
    const {
        pendingImport, clearImport,
        pendingYouTube, clearYouTube,
        pendingGoogleDrive, clearGoogleDrive,
        pendingExternalLink, clearExternalLink,
        registerLoadCourses,
    } = useImport()

    // Register loadCourses so other components can trigger a refresh
    useEffect(() => { registerLoadCourses(loadCourses) }, [registerLoadCourses])

    // Handle local folder import
    useEffect(() => {
        if (!pendingImport) return
        const data = pendingImport
        clearImport()
        const dupe = courses.find(c => c.title === data.title || c.originalTitle === data.title)
        if (dupe) {
            if (!confirm(`A course named "${data.title}" already exists. Import anyway?`)) return
        }
        setImportData(data)
    }, [pendingImport, clearImport, courses])

    // Handle YouTube import
    useEffect(() => {
        if (!pendingYouTube) return
        const courseData = pendingYouTube
        clearYouTube()
        ;(async () => {
            try {
                const dupe = courses.find(c => c.title === courseData.title)
                if (dupe) {
                    if (!confirm(`A course named "${courseData.title}" already exists. Import anyway?`)) return
                }

                if (courseData.instructor && courseData.channelAvatar) {
                    let finalAvatar = courseData.channelAvatar
                    try {
                        const { base64 } = await api.post('/api/data/download-image', { url: courseData.channelAvatar })
                        if (base64) finalAvatar = base64
                    } catch (e) {
                        console.warn('Failed to download channel avatar for offline use', e)
                    }
                    await setInstructorAvatar(courseData.instructor, finalAvatar)
                }

                let finalThumbnail = courseData.thumbnailData
                if (finalThumbnail && finalThumbnail.startsWith('http')) {
                    try {
                        const { base64 } = await api.post('/api/data/download-image', { url: finalThumbnail })
                        if (base64) finalThumbnail = base64
                    } catch (e) {
                        console.warn('Failed to download course thumbnail for offline use', e)
                    }
                }

                let totalDuration = 0
                let totalVideos = 0
                if (courseData.modules?.[0]) {
                    const videos = courseData.modules[0].videos || []
                    totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0)
                    totalVideos = videos.length
                }

                const savedCourse = await addCourse({
                    ...courseData,
                    thumbnailData: finalThumbnail,
                    totalDuration,
                    totalVideos
                })

                if (courseData.modules?.[0]) {
                    const module = courseData.modules[0]
                    const moduleDuration = module.videos.reduce((sum, v) => sum + (v.duration || 0), 0)

                    const savedModule = await addModule({
                        courseId: savedCourse.id,
                        title: module.title,
                        originalTitle: module.title,
                        order: 0,
                        totalDuration: moduleDuration,
                        totalVideos: module.videos.length
                    })

                    for (let i = 0; i < module.videos.length; i++) {
                        const video = module.videos[i]
                        await addVideo({
                            courseId: savedCourse.id,
                            moduleId: savedModule.id,
                            title: video.title,
                            originalTitle: video.title,
                            youtubeId: video.youtubeId,
                            url: video.url,
                            duration: video.duration || 0,
                            order: i
                        })
                    }
                }

                loadCourses()
            } catch (err) {
                console.error('Failed to save YouTube course:', err)
                showNotification('Failed to save: ' + err.message, 'error')
            }
        })()
    }, [pendingYouTube, clearYouTube, courses, showNotification])

    // Handle Google Drive import
    useEffect(() => {
        if (!pendingGoogleDrive) return
        const courseData = pendingGoogleDrive
        clearGoogleDrive()
        ;(async () => {
            try {
                const dupe = courses.find(c => c.title === courseData.title)
                if (dupe) {
                    if (!confirm(`A course named "${courseData.title}" already exists. Import anyway?`)) return
                }

                let finalThumbnail = courseData.thumbnailData
                if (finalThumbnail && finalThumbnail.startsWith('http')) {
                    try {
                        const { base64 } = await api.post('/api/data/download-image', { url: finalThumbnail })
                        if (base64) finalThumbnail = base64
                    } catch (e) {
                        console.warn('Failed to download drive course thumbnail for offline use', e)
                    }
                }

                const savedCourse = await addCourse({
                    title: courseData.title,
                    instructor: courseData.instructor || '',
                    description: courseData.description || 'Imported from Google Drive',
                    thumbnailData: finalThumbnail,
                    totalDuration: courseData.totalDuration,
                    totalVideos: courseData.totalVideos
                })

                for (let i = 0; i < courseData.modules.length; i++) {
                    const module = courseData.modules[i]
                    const savedModule = await addModule({
                        courseId: savedCourse.id,
                        title: module.title,
                        originalTitle: module.originalTitle,
                        order: i,
                        totalDuration: module.totalDuration,
                        totalVideos: module.totalVideos
                    })

                    for (let j = 0; j < module.videos.length; j++) {
                        const video = module.videos[j]
                        await addVideo({
                            courseId: savedCourse.id,
                            moduleId: savedModule.id,
                            title: video.title,
                            originalTitle: video.originalTitle,
                            driveFileId: video.driveFileId,
                            url: getDriveVideoUrl(video.driveFileId),
                            duration: video.duration || 0,
                            order: j
                        })
                    }
                }

                loadCourses()
            } catch (err) {
                console.error('Failed to save Google Drive course:', err)
                showNotification('Failed to save: ' + err.message, 'error')
            }
        })()
    }, [pendingGoogleDrive, clearGoogleDrive, courses, showNotification])

    // Handle External Link import
    useEffect(() => {
        if (!pendingExternalLink) return
        const courseData = pendingExternalLink
        clearExternalLink()
        ;(async () => {
            try {
                const dupe = courses.find(c => c.title === courseData.title)
                if (dupe) {
                    if (!confirm(`A course named "${courseData.title}" already exists. Import anyway?`)) return
                }

                await addCourse(courseData)
                loadCourses()
            } catch (err) {
                console.error('Failed to save External Link course:', err)
                showNotification('Failed to save: ' + err.message, 'error')
            }
        })()
    }, [pendingExternalLink, clearExternalLink, courses, showNotification])

    const sortOptions = [
        { value: 'lastAccessed', label: 'Recently Accessed' },
        { value: 'title', label: 'Title (A-Z)' },
        { value: 'progress', label: 'Progress' },
        { value: 'dateAdded', label: 'Date Added' }
    ]

    // Quick Stats Calculation
    const totalCourses = courses.length
    const completedCourses = courses.filter(c => c.completionPercentage === 100).length
    const lastAccessedCourse = [...courses].sort((a, b) => new Date(b.lastAccessed || 0) - new Date(a.lastAccessed || 0))[0]
    
    const hour = new Date().getHours()
    let greeting = 'Good evening'
    if (hour < 12) greeting = 'Good morning'
    else if (hour < 18) greeting = 'Good afternoon'

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <LoadingSpinner message="Loading your courses..." />
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Premium Welcome Banner & Dashboard */}
            <div className="mb-10 flex flex-col gap-6">
                <div className="p-8 sm:p-10 rounded-3xl bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-white/20 dark:border-white/5 text-stone-950 dark:text-white shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-amber-300 dark:bg-blue-600 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] opacity-20 dark:opacity-10 -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-700"></div>
                    <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-200 dark:bg-purple-600 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] opacity-20 dark:opacity-10 translate-y-1/2 -translate-x-1/4 group-hover:scale-110 transition-transform duration-700"></div>
                    <div className="relative z-10">
                        <h1 className="text-4xl sm:text-5xl font-bold mb-3 tracking-tight text-stone-950 dark:text-white">{greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-stone-900 dark:from-blue-400 dark:to-purple-400">Scholar</span></h1>
                        <p className="text-stone-600 dark:text-neutral-400 text-lg max-w-xl font-light">Your academic workspace is ready. Pick up right where you left off.</p>
                    </div>
                </div>

                {/* Dashboard Widgets */}
                {courses.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Quick Stats */}
                        <div className="p-5 rounded-2xl bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-white/40 dark:border-white/5 flex items-center gap-4 hover:-translate-y-1 transition-transform duration-300">
                            <div className="p-3 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl">
                                <BookOpen className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Courses</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCourses}</p>
                            </div>
                        </div>
                        
                        <div className="p-5 rounded-2xl bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-white/40 dark:border-white/5 flex items-center gap-4 hover:-translate-y-1 transition-transform duration-300">
                            <div className="p-3 bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-xl">
                                <Trophy className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Completed</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">{completedCourses}</p>
                            </div>
                        </div>

                        {/* Continue Learning */}
                        {lastAccessedCourse && (
                            <div className="p-5 rounded-2xl bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-white/40 dark:border-white/5 flex items-center gap-4 hover:-translate-y-1 transition-transform duration-300 cursor-pointer" onClick={() => navigate(`/course/${lastAccessedCourse.id}`)}>
                                <div className="p-3 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl">
                                    <PlayCircle className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Continue Learning</p>
                                    <p className="text-lg font-bold text-gray-900 dark:text-white truncate">{lastAccessedCourse.title}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {(revisionSummary.pendingTotal > 0 || revisionItems.length > 0) && (
                    <div className="mt-5 rounded-3xl border border-white/40 bg-white/55 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-bold text-stone-950 dark:text-white">Today&apos;s Revision</h2>
                                <p className="text-sm text-stone-600 dark:text-neutral-400">Due items across all courses, ready to reopen at the exact anchor.</p>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">
                                <ListTodo className="h-3.5 w-3.5" />
                                {revisionSummary.pendingTotal} pending
                            </div>
                        </div>

                        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-300/15 dark:bg-amber-400/10">
                                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">Due today</div>
                                <div className="mt-1 text-2xl font-bold text-amber-900 dark:text-white">{revisionSummary.dueToday}</div>
                            </div>
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-300/15 dark:bg-rose-400/10">
                                <div className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-200">Overdue</div>
                                <div className="mt-1 text-2xl font-bold text-rose-900 dark:text-white">{revisionSummary.overdue}</div>
                            </div>
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-300/15 dark:bg-emerald-400/10">
                                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">Done today</div>
                                <div className="mt-1 text-2xl font-bold text-emerald-900 dark:text-white">{revisionSummary.completedToday}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-neutral-400">Visible now</div>
                                <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{revisionItems.length}</div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {revisionItems.slice(0, 6).map(item => (
                                <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-white/40 bg-white/70 p-4 dark:border-white/10 dark:bg-black/10 md:flex-row md:items-center md:justify-between">
                                    <button className="min-w-0 text-left" onClick={() => openRevisionItem(item)}>
                                        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-neutral-500">
                                            <Clock3 className="h-3.5 w-3.5" />
                                            {item.checkpointType?.replace('_', ' ') || 'Revision'}
                                        </div>
                                        <div className="truncate text-sm font-semibold text-stone-950 dark:text-white">{item.displayTitle}</div>
                                        <div className="mt-1 text-xs text-stone-500 dark:text-neutral-400">
                                            Due {new Date(item.dueAt).toLocaleString()}
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleRevisionStatus(item.id, 'completed')}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                                        >
                                            <CircleCheck className="h-3.5 w-3.5" />
                                            Done
                                        </button>
                                        <button
                                            onClick={() => handleRevisionStatus(item.id, 'dismissed')}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300"
                                        >
                                            <XCircle className="h-3.5 w-3.5" />
                                            Dismiss
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {revisionItems.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-white/20 bg-white/40 p-4 text-sm text-stone-600 dark:border-white/10 dark:bg-black/10 dark:text-neutral-400">
                                    Nothing is due right now. Upcoming revision items will appear here as their due time arrives.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Filter Tabs + Sort/View Controls */}
            {courses.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    {/* Filter Tabs */}
                    <div className="overflow-x-auto scrollbar-hide flex-1">
                        <div className="flex gap-2">
                            {['all', 'completed', 'in-progress', 'not-started'].map(filter => (
                                <button
                                    key={filter}
                                    onClick={() => setActiveFilter(filter)}
                                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === filter
                                        ? 'bg-primary dark:bg-primary-fg/15 text-primary-content dark:text-primary-fg hover:bg-primary-hover'
                                        : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                >
                                    {filter === 'all' ? 'All' :
                                        filter === 'completed' ? 'Completed' :
                                            filter === 'in-progress' ? 'In Progress' :
                                                'Not Started'}
                                </button>
                            ))}
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setActiveFilter(tag)}
                                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === tag
                                        ? 'bg-primary dark:bg-primary-fg/15 text-primary-content dark:text-primary-fg hover:bg-primary-hover'
                                        : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sort + View Toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Sort Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowSortMenu(!showSortMenu)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors text-sm"
                            >
                                <SortAsc className="w-4 h-4" />
                                <span className="hidden sm:inline">{sortOptions.find(o => o.value === sortBy)?.label}</span>
                                <ChevronDown className="w-3 h-3" />
                            </button>
                            {showSortMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                                    <div className="absolute right-0 mt-2 w-48 py-2 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-light-border dark:border-dark-border z-20">
                                        {sortOptions.map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => {
                                                    setSortBy(option.value)
                                                    setShowSortMenu(false)
                                                }}
                                                className={`w-full px-4 py-2 text-left text-sm hover:bg-light-surface dark:hover:bg-dark-bg ${sortBy === option.value ? 'text-primary-fg font-medium' : ''}`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* View Toggle */}
                        <button
                            onClick={toggleViewMode}
                            className="p-1.5 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            aria-label="Toggle view mode"
                        >
                            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            )}

            {/* Course Grid/List */}
            {displayedCourses.length > 0 ? (
                <div className={viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                    : 'space-y-4'
                }>
                    {displayedCourses.map(course => (
                        <CourseCard
                            key={course.id}
                            course={course}
                            sources={sourceMap[course.id] || []}
                            viewMode={viewMode}
                            onRefresh={loadCourses}
                            onEdit={() => setEditingCourse(course)}
                            onSync={handleSyncCourse}
                            onSourceUpdate={(source) => setSourceUpdateTarget({ course, source })}
                        />
                    ))}
                </div>
            ) : courses.length === 0 ? (
                <div className="text-center py-16">
                    <FolderOpen className="w-16 h-16 mx-auto mb-4 text-neutral-500 opacity-50" />
                    <h2 className="text-xl font-semibold mb-2 text-stone-900 dark:text-white">No courses yet</h2>
                    <p className="text-stone-600 dark:text-neutral-400 mb-6">
                        Click &quot;Add Paper&quot; in the header to get started
                    </p>
                </div>
            ) : (
                <div className="text-center py-16">
                    <Search className="w-16 h-16 mx-auto mb-4 text-neutral-500 opacity-50" />
                    <h2 className="text-xl font-semibold mb-2 text-stone-900 dark:text-white">No results found</h2>
                    <p className="text-stone-600 dark:text-neutral-400 mb-6">
                        Try adjusting your search or filters
                    </p>
                    <button
                        onClick={() => {
                            setSearchQuery('')
                            setActiveFilter('all')
                        }}
                        className="text-primary-fg hover:underline"
                    >
                        Clear search and filters
                    </button>
                </div>
            )}

            {/* Import Preview Modal */}
            <ImportPreviewModal
                courseStructure={importData}
                onConfirm={handleImportConfirm}
                onCancel={() => setImportData(null)}
                existingCourseNames={courses.map(c => c.title)}
            />

            {/* Edit Course Modal */}
            <EditCourseModal
                course={editingCourse}
                isOpen={!!editingCourse}
                onClose={() => setEditingCourse(null)}
                onSave={loadCourses}
            />

            {/* Sync Preview Modal */}
            <SyncPreviewModal
                preview={syncPreview}
                isOpen={!!syncPreview}
                onConfirm={handleConfirmSync}
                onCancel={() => setSyncPreview(null)}
                isApplying={isApplyingSync}
            />

            <SourceUpdateModal
                isOpen={!!sourceUpdateTarget}
                source={sourceUpdateTarget?.source}
                course={sourceUpdateTarget?.course}
                onClose={() => setSourceUpdateTarget(null)}
                onImported={loadCourses}
            />
        </div>
    )
}

export default HomePage
