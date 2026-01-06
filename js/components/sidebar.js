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

        papers.forEach(paper => {
            const isActive = AppState.currentView.paper === paper.id;

            const item = Utils.createElement('div', {
                className: `paper-item${isActive ? ' active' : ''}`,
                dataset: { paperId: paper.id },
                onClick: async () => await this.handlePaperClick(paper.id)
            }, [
                Utils.createElement('span', { className: 'paper-item-icon' }, paper.icon),
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
