import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon, Settings, Menu, Search, X } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useSidebar } from '../../contexts/SidebarContext'

import { useState, useEffect } from 'react'
import SettingsModal from '../settings/SettingsModal'
import CommandPalette from '../common/CommandPalette'

function Header() {
    const { toggleTheme, isDark } = useTheme()
    const { toggleSidebar } = useSidebar()
    const [showSettings, setShowSettings] = useState(false)
    const [showCommandPalette, setShowCommandPalette] = useState(false)

    // Handle Cmd+K / Ctrl+K to open
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setShowCommandPalette(true)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    return (
        <>
            <header className="h-16 sticky top-0 z-50 bg-white/40 dark:bg-black/40 backdrop-blur-3xl border-b border-amber-200/50 dark:border-white/5 transition-all duration-300">
                <div className="h-full px-4 flex items-center">
                    {/* Left: Hamburger + Logo */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Hamburger Menu */}
                        <button
                            onClick={toggleSidebar}
                            className="omni-action !rounded-full !p-2 text-gray-700 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10"
                            aria-label="Toggle sidebar"
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        {/* Logo */}
                        <Link
                            to="/"
                            className="flex items-center gap-3 group"
                        >
                            <img src="/logo.png" alt="Omni Logo" className="w-8 h-8 rounded-lg object-contain transition-transform group-hover:scale-105" />
                            <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight group-hover:text-gray-600 dark:group-hover:text-neutral-300 transition-colors">
                                Omni
                            </span>
                        </Link>
                    </div>

                    {/* Spacer - Left */}
                    <div className="flex-1" />

                    {/* Center: Global Search Trigger */}
                    <div className="hidden sm:flex items-center">
                        <button
                            onClick={() => setShowCommandPalette(true)}
                            className="flex items-center gap-3 px-4 py-1.5 w-64 rounded-full border border-amber-200/50 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/10 transition-all group"
                        >
                            <Search className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                            <span className="text-sm font-medium flex-1 text-left">Search courses...</span>
                            <div className="flex items-center gap-1">
                                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded">⌘</kbd>
                                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded">K</kbd>
                            </div>
                        </button>
                    </div>

                    {/* Spacer - Right */}
                    <div className="flex-1" />

                    {/* Right: Theme + Settings */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Mobile Search Icon */}
                        <button
                            onClick={() => setShowCommandPalette(true)}
                            className="sm:hidden omni-action !rounded-full !p-2 text-gray-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"
                            aria-label="Search"
                        >
                            <Search className="w-5 h-5" />
                        </button>

                        {/* Theme Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="omni-action !rounded-full !p-2 text-gray-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {isDark ? (
                                <Sun className="w-5 h-5" />
                            ) : (
                                <Moon className="w-5 h-5" />
                            )}
                        </button>

                        {/* Settings */}
                        <button
                            onClick={() => setShowSettings(true)}
                            className="omni-action !rounded-full !p-2 text-gray-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                            aria-label="Open settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
            />

            <CommandPalette 
                isOpen={showCommandPalette} 
                onClose={() => setShowCommandPalette(false)} 
                onOpenSettings={() => setShowSettings(true)}
            />
        </>
    )
}

export default Header
