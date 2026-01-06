/**
 * UPSC Study Desk - Provider List Component
 * Displays providers for a selected paper
 */

const ProviderList = {
    /**
     * Render provider cards for current paper
     */
    async render() {
        const container = Utils.$('content-area');
        if (!container) return;

        const paperId = AppState.currentView.paper;
        const paper = AppState.getPaper(paperId);
        const providers = await AppState.getProviders(paperId);

        Utils.clearElement(container);

        // Content header
        const header = Utils.createElement('div', { className: 'content-header' }, [
            Utils.createElement('h2', { className: 'content-title' },
                `${paper.fullName} - Providers`
            )
        ]);
        container.appendChild(header);

        // Cards grid
        const grid = Utils.createElement('div', { className: 'cards-grid' });

        // Existing providers
        for (const provider of providers) {
            const courseCount = await AppState.getCourseCount(provider.id);

            const card = Utils.createElement('div', {
                className: 'card',
                onClick: async () => await this.handleProviderClick(provider.id)
            }, [
                Utils.createElement('div', { className: 'card-title' }, provider.name),
                Utils.createElement('div', { className: 'card-subtitle' },
                    courseCount === 0 ? 'No courses yet' :
                        courseCount === 1 ? '1 course' :
                            `${courseCount} courses`
                )
            ]);

            grid.appendChild(card);
        }

        // Add provider card
        const addCard = Utils.createElement('div', {
            className: 'card add-card',
            onClick: () => this.handleAddProvider()
        }, [
            Utils.createElement('div', { className: 'add-card-icon' }, '+'),
            Utils.createElement('div', { className: 'add-card-text' }, 'Add Provider')
        ]);
        grid.appendChild(addCard);

        container.appendChild(grid);

        // Recently Played for this paper
        await App.renderRecentlyPlayed(container, paperId);
    },

    /**
     * Handle provider card click
     */
    async handleProviderClick(providerId) {
        AppState.navigateTo(AppState.currentView.paper, providerId, null);
        await App.render();
    },

    /**
     * Handle add provider button
     */
    handleAddProvider() {
        Modal.open({
            title: 'Add Provider',
            placeholder: 'Provider name (e.g., Vision IAS, Forum...)',
            onConfirm: async (name) => {
                try {
                    await AppState.addProvider(AppState.currentView.paper, name);
                    await this.render();
                } catch (error) {
                    console.error('Failed to add provider:', error);
                    alert('Failed to add provider: ' + error.message);
                }
            }
        });
    }
};

// Make ProviderList globally available
window.ProviderList = ProviderList;
