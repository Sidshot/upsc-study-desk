import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Home, Users, Settings, Moon, Sun, MonitorPlay, X } from 'lucide-react'
import { useSearch } from '../../contexts/SearchContext'
import { useTheme } from '../../contexts/ThemeContext'

function CommandPalette({ isOpen, onClose, onOpenSettings }) {
    const [localQuery, setLocalQuery] = useState('')
    const { setSearchQuery } = useSearch()
    const { isDark, toggleTheme } = useTheme()
    const navigate = useNavigate()
    const location = useLocation()
    const inputRef = useRef(null)

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current.focus(), 100)
            setLocalQuery('') // Reset query on open
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleSearchSubmit = (e) => {
        e.preventDefault()
        if (localQuery.trim()) {
            setSearchQuery(localQuery)
            if (location.pathname !== '/') {
                navigate('/')
            }
            onClose()
        }
    }

    const actions = [
        { id: 'home', title: 'Go to Home', icon: Home, action: () => { navigate('/'); onClose() } },
        { id: 'instructors', title: 'Go to Instructors', icon: Users, action: () => { navigate('/instructors'); onClose() } },
        { id: 'theme', title: `Switch to ${isDark ? 'Light' : 'Dark'} Mode`, icon: isDark ? Sun : Moon, action: () => { toggleTheme(); onClose() } },
        { id: 'settings', title: 'Open Settings', icon: Settings, action: () => { onClose(); onOpenSettings && onOpenSettings(); } }
    ]

    const filteredActions = actions.filter(action => 
        action.title.toLowerCase().includes(localQuery.toLowerCase())
    )

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            
            {/* Modal */}
            <div className="relative w-full max-w-2xl bg-white/90 dark:bg-neutral-900/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-200">
                <form onSubmit={handleSearchSubmit} className="flex items-center px-4 py-4 border-b border-gray-200 dark:border-white/10">
                    <Search className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={localQuery}
                        onChange={(e) => setLocalQuery(e.target.value)}
                        placeholder="Search courses or commands..."
                        className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-lg"
                    />
                    <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </form>

                <div className="max-h-[60vh] overflow-y-auto py-2">
                    {localQuery.trim() && (
                        <div className="px-2 mb-4">
                            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Search Courses</h3>
                            <button
                                onClick={handleSearchSubmit}
                                className="w-full flex items-center px-3 py-3 rounded-lg hover:bg-primary/10 text-left transition-colors"
                            >
                                <div className="bg-primary/20 p-2 rounded-md mr-3">
                                    <MonitorPlay className="w-4 h-4 text-primary" />
                                </div>
                                <span className="text-gray-900 dark:text-white font-medium">
                                    Search for &quot;{localQuery}&quot;
                                </span>
                            </button>
                        </div>
                    )}

                    <div className="px-2">
                        <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Suggestions</h3>
                        {filteredActions.length > 0 ? (
                            filteredActions.map(action => {
                                const Icon = action.icon
                                return (
                                    <button
                                        key={action.id}
                                        onClick={action.action}
                                        className="w-full flex items-center px-3 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-left transition-colors group"
                                    >
                                        <div className="text-gray-500 dark:text-gray-400 group-hover:text-primary transition-colors p-2 mr-3">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <span className="text-gray-700 dark:text-gray-300 font-medium">{action.title}</span>
                                    </button>
                                )
                            })
                        ) : (
                            <p className="px-5 py-3 text-gray-500 text-sm">No actions found</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CommandPalette
