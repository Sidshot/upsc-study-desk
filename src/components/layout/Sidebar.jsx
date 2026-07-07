import { NavLink, useLocation } from 'react-router-dom'
import {
    Home,
    Users,
    History,
    BarChart3,
    Map,
    ChevronLeft,
    ChevronRight,
    Plus,
    FolderOpen,
    Youtube,
    HardDrive,
    Link2,
    Send
} from 'lucide-react'
import { useSidebar } from '../../contexts/SidebarContext'
import { useState, useEffect, useRef } from 'react'
import { getAllCourses, getInstructorAvatarAsync } from '../../utils/db'

import YouTubeImportModal from '../course/YouTubeImportModal'
import GoogleDriveImportModal from '../course/GoogleDriveImportModal'
import ExternalLinkImportModal from '../course/ExternalLinkImportModal'
import TelegramImportModal from '../course/TelegramImportModal'
import { scanCourseFolder, pickFolder } from '../../utils/fileSystem'
import { useSettings } from '../../contexts/SettingsContext'
import { useNotification } from '../../contexts/NotificationContext'
import { useImport } from '../../contexts/ImportContext'

function Sidebar() {
    const { isExpanded, isMobileOpen, closeMobileSidebar, setIsExpanded, toggleSidebar } = useSidebar()
    const location = useLocation()
    const [instructors, setInstructors] = useState([])

    // Import Modals State
    const [showAddMenu, setShowAddMenu] = useState(false)
    const [showYouTubeModal, setShowYouTubeModal] = useState(false)
    const [showGoogleDriveModal, setShowGoogleDriveModal] = useState(false)
    const [showExternalLinkModal, setShowExternalLinkModal] = useState(false)
    const [showTelegramModal, setShowTelegramModal] = useState(false)

    const { settings } = useSettings()
    const { dispatchImport, dispatchYouTube, dispatchGoogleDrive, dispatchExternalLink } = useImport()
    const { showNotification } = useNotification()
    const addMenuRef = useRef(null)

    // Load unique instructors for the sidebar
    useEffect(() => {
        async function loadInstructors() {
            try {
                const courses = await getAllCourses()
                const uniqueInstructors = [...new Set(courses.map(c => c.instructor).filter(Boolean))]

                const instructorData = await Promise.all(
                    uniqueInstructors.slice(0, 5).map(async (name) => {
                        const avatar = await getInstructorAvatarAsync(name)
                        return {
                            name,
                            avatar: avatar || null,
                            courseCount: courses.filter(c => c.instructor === name).length
                        }
                    })
                )
                setInstructors(instructorData)
            } catch (err) {
                console.error('Failed to load instructors:', err)
            }
        }
        loadInstructors()
    }, [location.pathname]) 

    // Click outside to close add menu
    useEffect(() => {
        function handleClickOutside(event) {
            if (addMenuRef.current && !addMenuRef.current.contains(event.target)) {
                setShowAddMenu(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [addMenuRef])

    const navItems = [
        { path: '/', icon: Home, label: 'Home' },
        { path: '/instructors', icon: Users, label: 'Instructors' },
        { path: '/history', icon: History, label: 'History' },
        { path: '/statistics', icon: BarChart3, label: 'Statistics' },
        { path: '/roadmap', icon: Map, label: 'Roadmap' },
    ]

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/'
        return location.pathname.startsWith(path)
    }

    const handleNavClick = () => {
        if (isMobileOpen) {
            closeMobileSidebar()
        }
    }

    async function handleLocalImportClick() {
        try {
            const handle = await pickFolder()
            if (handle) {
                const courseData = await scanCourseFolder(handle, settings.autoDetectThumbnails)
                if (courseData) {
                    dispatchImport(courseData)
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Import failed:', err)
                showNotification('Import failed: ' + err.message, 'error')
            }
        }
        setShowAddMenu(false)
        if (isMobileOpen) closeMobileSidebar()
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
                    onClick={closeMobileSidebar}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed top-16 left-0 h-[calc(100vh-4rem)] z-50
                    bg-white/60 dark:bg-black/40 backdrop-blur-3xl
                    border-r border-amber-200/50 dark:border-white/5
                    transition-all duration-300 ease-in-out
                    flex flex-col
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    ${isExpanded ? 'w-64' : 'w-20'}
                `}
            >
                {/* Top Action Section: Add Course */}
                <div className="p-3 relative" ref={addMenuRef}>
                    <button
                        onClick={() => setShowAddMenu(!showAddMenu)}
                        className={`
                            flex items-center justify-center gap-3 w-full py-3 rounded-xl font-medium shadow-md shadow-primary/20
                            bg-primary text-primary-content hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]
                            transition-all duration-300
                            ${!isExpanded ? 'px-0' : 'px-4'}
                        `}
                        title="Add Course"
                    >
                        <Plus className="w-5 h-5 flex-shrink-0" />
                        {isExpanded && <span>New Course</span>}
                    </button>

                    {showAddMenu && (
                        <div className={`absolute top-full mt-2 w-56 py-2 bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-gray-100 dark:border-white/10 z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 ${isExpanded ? 'left-3' : 'left-3'}`}>
                            <button
                                onClick={handleLocalImportClick}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-3 transition-colors"
                            >
                                <FolderOpen className="w-4 h-4 text-gray-400" />
                                Local Folder
                            </button>
                            <button
                                onClick={() => { setShowYouTubeModal(true); setShowAddMenu(false); }}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-3 transition-colors"
                            >
                                <Youtube className="w-4 h-4 text-red-500" />
                                From YouTube
                            </button>
                            <button
                                onClick={() => { setShowGoogleDriveModal(true); setShowAddMenu(false); }}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-3 transition-colors"
                            >
                                <HardDrive className="w-4 h-4 text-primary" />
                                From Google Drive
                            </button>
                            <button
                                onClick={() => { setShowExternalLinkModal(true); setShowAddMenu(false); }}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-3 transition-colors"
                            >
                                <Link2 className="w-4 h-4 text-blue-500" />
                                From External Link
                            </button>
                            <button
                                onClick={() => { setShowTelegramModal(true); setShowAddMenu(false); }}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-3 transition-colors"
                            >
                                <Send className="w-4 h-4 text-blue-500" />
                                From Telegram
                            </button>
                        </div>
                    )}
                </div>

                {/* Navigation Items */}
                <nav className="flex-1 py-2 overflow-y-auto scrollbar-hide px-3">
                    <ul className="space-y-1">
                        {navItems.map(({ path, icon: Icon, label }) => (
                            <li key={path}>
                                <NavLink
                                    to={path}
                                    onClick={handleNavClick}
                                    className={`
                                        flex items-center gap-4 px-3 py-3 rounded-xl
                                        transition-all duration-300 group
                                        ${isActive(path)
                                            ? 'bg-primary/10 dark:bg-primary-fg/10 text-primary-fg font-medium'
                                            : 'text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-white/5'
                                        }
                                        ${!isExpanded ? 'justify-center' : ''}
                                    `}
                                    title={!isExpanded ? label : undefined}
                                >
                                    <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${isActive(path) ? 'scale-110' : 'group-hover:scale-110'}`} />
                                    {isExpanded && (
                                        <span className="truncate tracking-wide">{label}</span>
                                    )}
                                </NavLink>
                            </li>
                        ))}
                    </ul>

                    {/* Instructors Section */}
                    {isExpanded && instructors.length > 0 && (
                        <div className="mt-8">
                            <h3 className="px-3 mb-3 text-[10px] font-bold text-gray-400 dark:text-neutral-500 uppercase tracking-[0.2em]">
                                Top Instructors
                            </h3>
                            <ul className="space-y-1">
                                {instructors.map((instructor) => (
                                    <li key={instructor.name}>
                                        <NavLink
                                            to={`/instructors?filter=${encodeURIComponent(instructor.name)}`}
                                            onClick={handleNavClick}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                                                text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white
                                                hover:bg-gray-100/50 dark:hover:bg-white/5
                                                transition-all duration-200 group"
                                        >
                                            {instructor.avatar ? (
                                                <img
                                                    src={instructor.avatar}
                                                    alt={instructor.name}
                                                    className="w-6 h-6 rounded-full object-cover ring-2 ring-transparent group-hover:ring-primary/30 transition-all"
                                                />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center ring-2 ring-transparent group-hover:ring-primary/30 transition-all">
                                                    <span className="text-[10px] font-bold text-gray-600 dark:text-white">
                                                        {instructor.name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <span className="truncate font-medium group-hover:translate-x-1 transition-transform">{instructor.name}</span>
                                        </NavLink>
                                    </li>
                                ))}
                                {instructors.length >= 5 && (
                                    <li>
                                        <NavLink
                                            to="/instructors"
                                            onClick={handleNavClick}
                                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm
                                                text-primary/70 hover:text-primary font-medium
                                                transition-colors duration-200 mt-2"
                                        >
                                            <span className="text-xs">View all instructors →</span>
                                        </NavLink>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </nav>

                {/* Bottom Section - Collapse Toggle */}
                <div className="p-3 border-t border-amber-200/50 dark:border-white/5">
                    <button
                        onClick={() => setIsExpanded(prev => !prev)}
                        className={`
                            hidden md:flex items-center gap-4 px-3 py-3 rounded-xl w-full
                            text-gray-500 dark:text-neutral-500 hover:text-gray-900 dark:hover:text-white
                            hover:bg-gray-100/50 dark:hover:bg-white/5
                            transition-all duration-200
                            ${!isExpanded ? 'justify-center' : ''}
                        `}
                        title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                    >
                        {isExpanded ? (
                            <>
                                <ChevronLeft className="w-5 h-5" />
                                <span className="font-medium text-sm">Collapse</span>
                            </>
                        ) : (
                            <ChevronRight className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </aside>

            {/* Modals */}
            <YouTubeImportModal
                isOpen={showYouTubeModal}
                onClose={() => setShowYouTubeModal(false)}
                onImport={(data) => {
                    setShowYouTubeModal(false)
                    dispatchYouTube(data)
                }}
            />
            <GoogleDriveImportModal
                isOpen={showGoogleDriveModal}
                onClose={() => setShowGoogleDriveModal(false)}
                onImport={(data) => {
                    setShowGoogleDriveModal(false)
                    dispatchGoogleDrive(data)
                }}
            />
            <ExternalLinkImportModal
                isOpen={showExternalLinkModal}
                onClose={() => setShowExternalLinkModal(false)}
                onImport={(data) => {
                    setShowExternalLinkModal(false)
                    dispatchExternalLink(data)
                }}
            />
            <TelegramImportModal
                isOpen={showTelegramModal}
                onClose={() => setShowTelegramModal(false)}
                onImport={(data) => {
                    dispatchImport(data)
                    setShowTelegramModal(false)
                }}
                settings={settings}
            />

            {/* Mobile FAB */}
            <button 
                className="md:hidden fixed bottom-6 right-6 z-40 p-4 bg-primary text-primary-content rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all shadow-primary/30"
                onClick={() => {
                    if (!isMobileOpen) {
                        toggleSidebar()
                        setTimeout(() => setShowAddMenu(true), 100)
                    } else {
                        setShowAddMenu(prev => !prev)
                    }
                }}
            >
                <Plus className="w-6 h-6" />
            </button>
        </>
    )
}

export default Sidebar
