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
     */
    render() {
        const container = Utils.$('paper-nav');
        if (!container) return;

        Utils.clearElement(container);

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
