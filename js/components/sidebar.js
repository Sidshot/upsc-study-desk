/**
 * UPSC Study Desk - Sidebar Component
 * Renders paper navigation in the left sidebar
 */

const Sidebar = {
    /**
     * Initialize the sidebar
     */
    init() {
        this.render();
        this.setupToggle();
        this.enforceVisibility();
    },

    /**
     * Enforce sidebar visibility (prevent other components from hiding it)
     */
    enforceVisibility() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        // Watch for class changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (sidebar.classList.contains('hidden')) {
                        console.log('[Sidebar] Removing enforced hidden state');
                        sidebar.classList.remove('hidden');
                    }
                }
            });
        });

        observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });

        // Listen for sync events
        window.addEventListener('app:sync-start', () => this.setSyncing(true));
        window.addEventListener('app:sync-end', () => this.setSyncing(false));
    },

    /**
     * Set syncing state UI
     */
    setSyncing(isSyncing) {
        const spinner = document.getElementById('sidebar-sync-spinner');
        if (spinner) {
            spinner.style.display = isSyncing ? 'inline-block' : 'none';
            // Animation
            if (isSyncing) {
                spinner.animate([
                    { transform: 'rotate(0deg)' },
                    { transform: 'rotate(360deg)' }
                ], {
                    duration: 1000,
                    iterations: Infinity
                });
            } else {
                spinner.getAnimations().forEach(anim => anim.cancel());
            }
        }
    },

    /**
     * Setup sidebar toggle
     */
    setupToggle() {
        const btn = document.getElementById('sidebar-toggle');
        if (btn) {
            btn.addEventListener('click', () => {
                document.body.classList.toggle('sidebar-closed');
            });
        }
    },

    /**
     * Render the paper list
     * Guaranteed to render GS pills in both Home and Study modes
     */
    render() {
        const container = Utils.$('paper-nav');
        if (!container) return;

        Utils.clearElement(container);

        // Guaranteed to render GS pills in both Home and Study modes
        const papers = AppState.getPapers();

        // Icon Mapping Helper
        const getIcon = (id, name) => {
            const lowerId = id.toLowerCase();
            const lowerName = name.toLowerCase();

            if (lowerId.includes('gs') || lowerName.includes('general')) return '<i class="ph ph-globe-hemisphere-west"></i>'; // GS
            if (lowerId.includes('essay')) return '<i class="ph ph-scroll"></i>'; // Essay
            if (lowerId.includes('opt') || lowerName.includes('optional')) return '<i class="ph ph-flask"></i>'; // Optional (Science/flask generic)
            if (lowerName.includes('ethics')) return '<i class="ph ph-scales"></i>';
            if (lowerName.includes('history')) return '<i class="ph ph-hourglass"></i>';
            if (lowerName.includes('geography')) return '<i class="ph ph-map-trifold"></i>';
            if (lowerName.includes('polity')) return '<i class="ph ph-bank"></i>';

            return '<i class="ph ph-book-open"></i>'; // Default
        };

        papers.forEach(paper => {
            const isActive = AppState.currentView.paper === paper.id;
            const iconHtml = getIcon(paper.id, paper.name);

            const item = Utils.createElement('div', {
                className: `paper-item${isActive ? ' active' : ''}`,
                dataset: { paperId: paper.id },
                onClick: async () => await this.handlePaperClick(paper.id)
            }, [
                Utils.createElement('span', {
                    className: 'paper-item-icon',
                    innerHTML: iconHtml // Use innerHTML for <i> tag
                }),
                Utils.createElement('span', { className: 'paper-item-name' }, paper.name)
            ]);

            container.appendChild(item);
        });
    },

    /**
     * Handle paper click
     */
    async handlePaperClick(paperId) {
        AppState.navigateTo(paperId, null, null);
        await App.render();
    },

    /**
     * Update active state without full re-render
     */
    updateActiveState() {
        const items = document.querySelectorAll('.paper-item');
        items.forEach(item => {
            const isActive = item.dataset.paperId === AppState.currentView.paper;
            item.classList.toggle('active', isActive);
        });
    }
};

// Make Sidebar globally available
window.Sidebar = Sidebar;
