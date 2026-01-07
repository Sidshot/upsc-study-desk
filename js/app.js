/**
 * UPSC Study Desk - Main Application Controller
 * Initializes app and orchestrates rendering (async)
 */

const App = {
    /**
     * Initialize the application
     */
    async init() {
        try {
            // Show loading state
            this.showLoading();

            // Initialize database and state
            await AppState.init();

            // Initialize file system (try to restore saved folder)
            if (FileSystem.isSupported()) {
                const restored = await FileSystem.init();

                // Auto-sync if master folder is configured
                // This keeps DB in sync with file system (source of truth)
                if (restored && FileSystem.hasMasterFolder()) {
                    console.log('Starting background sync...');
                    // Optimized: Backup sync
                    FileSystem.syncToDatabase().then(result => {
                        console.log('Background sync complete');
                        // Refresh to show any new/deleted files
                        App.render();
                    });
                }
            }

            // Initialize components
            Sidebar.init();
            Modal.init();
            this.setupFullScreenToggle();

            // Initial render
            await this.render();

            console.log('UPSC Study Desk initialized');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to initialize application. Please refresh the page.');
        }
    },

    /**
     * Setup full screen toggle
     */
    setupFullScreenToggle() {
        const btn = document.getElementById('fullscreen-toggle');
        if (btn) {
            btn.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(e => {
                        console.error('Error enabling full-screen:', e);
                    });
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    }
                }
            });
        }
    },

    /**
     * Show loading state
     */
    showLoading() {
        const container = Utils.$('content-area');
        if (!container) return;

        Utils.clearElement(container);

        const loading = Utils.createElement('div', { className: 'empty-state' }, [
            Utils.createElement('div', { className: 'empty-state-icon' }, '⏳'),
            Utils.createElement('div', { className: 'empty-state-title' }, 'Loading...'),
            Utils.createElement('div', { className: 'empty-state-text' }, 'Preparing your study desk')
        ]);

        container.appendChild(loading);
    },

    /**
     * Show error state
     */
    showError(message) {
        const container = Utils.$('content-area');
        if (!container) return;

        Utils.clearElement(container);

        const error = Utils.createElement('div', { className: 'empty-state' }, [
            Utils.createElement('div', { className: 'empty-state-icon' }, '⚠️'),
            Utils.createElement('div', { className: 'empty-state-title' }, 'Error'),
            Utils.createElement('div', { className: 'empty-state-text' }, message)
        ]);

        container.appendChild(error);
    },

    /**
     * Main render function - determines what to show based on state
     */
    async render() {
        // Update sidebar
        Sidebar.render();

        // Update breadcrumb
        await Breadcrumb.render();

        // Render appropriate content based on navigation state
        const { paper, provider, course } = AppState.currentView;

        if (course) {
            await LectureList.render();
        } else if (provider) {
            await CourseList.render();
        } else if (paper) {
            await ProviderList.render();
        } else {
            await this.renderHome();
        }
    },

    /**
     * Render setup banner for master folder
     */
    renderSetupBanner(container) {
        if (!FileSystem.isSupported()) {
            // Show browser compatibility notice
            const notice = Utils.createElement('div', { className: 'setup-banner' }, [
                Utils.createElement('div', { className: 'setup-banner-content' }, [
                    Utils.createElement('div', { className: 'setup-banner-title' },
                        '⚠️ Limited Browser Support'
                    ),
                    Utils.createElement('div', { className: 'setup-banner-text' },
                        'Use Chrome or Edge for full functionality including file management.'
                    )
                ])
            ]);
            container.appendChild(notice);
            return;
        }

        if (FileSystem.hasMasterFolder()) {
            // Show current folder
            const banner = Utils.createElement('div', { className: 'setup-banner' }, [
                Utils.createElement('div', { className: 'setup-banner-content' }, [
                    Utils.createElement('div', { className: 'setup-banner-title' },
                        '📁 Master Folder Connected'
                    ),
                    Utils.createElement('div', { className: 'setup-banner-folder' },
                        FileSystem.getMasterFolderName()
                    )
                ]),
                Utils.createElement('button', {
                    className: 'btn btn-secondary',
                    onClick: async () => {
                        await FileSystem.syncToDatabase();
                        await this.render();
                    }
                }, 'Sync Now')
            ]);
            container.appendChild(banner);
        } else {
            // Show setup prompt
            const banner = Utils.createElement('div', { className: 'setup-banner' }, [
                Utils.createElement('div', { className: 'setup-banner-content' }, [
                    Utils.createElement('div', { className: 'setup-banner-title' },
                        '📂 Set Up Your Study Folder'
                    ),
                    Utils.createElement('div', { className: 'setup-banner-text' },
                        'Select a master folder where all your study materials will be organized. ' +
                        'Structure: Paper → Provider → Course → Files'
                    )
                ]),
                Utils.createElement('button', {
                    className: 'btn btn-primary',
                    onClick: async () => {
                        const handle = await FileSystem.selectMasterFolder();
                        if (handle) {
                            await FileSystem.syncToDatabase();
                            await this.render();
                        }
                    }
                }, 'Select Folder')
            ]);
            container.appendChild(banner);
        }
    },

    /**
     * Render home screen
     */
    async renderHome() {
        // Prepare UI in a fragment to prevent race conditions/duplication
        const fragment = document.createDocumentFragment();

        // Setup banner
        // Note: renderSetupBanner appends to container. We pass fragment.
        this.renderSetupBanner(fragment);

        // Recently Played section
        const hasRecent = await this.renderRecentlyPlayed(fragment);

        if (hasRecent) {
            const separator = Utils.createElement('hr', {
                className: 'section-separator'
            });
            fragment.appendChild(separator);
        }

        // Paper cards
        const stats = Utils.createElement('div', {
            className: 'cards-grid'
        });

        const papers = AppState.getPapers();

        for (const paper of papers) {
            const providerCount = await AppState.getProviderCount(paper.id);

            const card = Utils.createElement('div', {
                className: 'card',
                onClick: async () => {
                    AppState.navigateTo(paper.id, null, null);
                    await this.render();
                }
            }, [
                Utils.createElement('div', { className: 'card-title' }, [
                    Utils.createElement('span', {}, paper.icon + ' '),
                    Utils.createElement('span', {}, paper.name)
                ]),
                Utils.createElement('div', { className: 'card-subtitle' },
                    providerCount === 0 ? 'No providers yet' :
                        providerCount === 1 ? '1 provider' :
                            `${providerCount} providers`
                )
            ]);

            stats.appendChild(card);
        }

        fragment.appendChild(stats);

        // Export section
        const exportSection = Utils.createElement('div', {
            className: 'export-section',
            style: 'margin-top: 2rem;'
        });
        Export.renderExportPanel(exportSection);
        fragment.appendChild(exportSection);

        // Atomic Update
        const container = Utils.$('content-area');
        if (!container) return;

        Utils.clearElement(container);
        container.appendChild(fragment);
    },

    /**
     * Render recently played section
     * @param {HTMLElement} container
     * @param {string} paperId - Optional: filter by paper
     */
    async renderRecentlyPlayed(container, paperId = null) {
        const recent = await AppState.getRecentLectures(3, paperId);

        if (recent.length === 0) return false;

        const section = Utils.createElement('div', { className: 'recent-section' });

        const header = Utils.createElement('h3', { className: 'section-title' },
            '🕐 Recently Played'
        );
        section.appendChild(header);

        const grid = Utils.createElement('div', { className: 'recent-grid' });

        for (const lecture of recent) {
            const tile = Utils.createElement('div', {
                className: 'recent-tile',
                onClick: async () => await StudyMode.enter(lecture.id)
            }, [
                Utils.createElement('div', { className: 'recent-tile-icon' },
                    lecture.type === 'video' ? '🎬' : '📄'
                ),
                Utils.createElement('div', { className: 'recent-tile-content' }, [
                    Utils.createElement('div', { className: 'recent-tile-title' }, lecture.title),
                    Utils.createElement('div', { className: 'recent-tile-meta' },
                        paperId
                            ? `${lecture.providerName} › ${lecture.courseName}`
                            : `${lecture.paperIcon} ${lecture.paperName} › ${lecture.courseName}`
                    )
                ])
            ]);
            grid.appendChild(tile);
        }

        section.appendChild(grid);
        container.appendChild(section);
        return true;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Make App globally available
window.App = App;
