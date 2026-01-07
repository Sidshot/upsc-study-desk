/**
 * UPSC Study Desk - Breadcrumb Component
 * Shows navigation path and allows clicking to navigate
 */

const Breadcrumb = {
    /**
     * Render the breadcrumb navigation
     */
    async render() {
        const container = Utils.$('breadcrumb');
        if (!container) return;

        Utils.clearElement(container);

        // 1. Add Permanent Home Pill
        const homePill = Utils.createElement('div', {
            className: 'home-pill',
            onClick: async () => await this.handleClick(null), // Navigate Home
            innerHTML: '<i class="ph ph-house"></i> Home'
        });

        container.appendChild(homePill);

        // 2. Render Trail
        const trail = await AppState.getBreadcrumb();

        // If we have a trail, add separator after Home
        if (trail.length > 0) {
            const separator = Utils.createElement('span', {
                className: 'breadcrumb-separator'
            }, '›');
            container.appendChild(separator);
        }

        trail.forEach((item, index) => {
            const isLast = index === trail.length - 1;

            // Add breadcrumb item
            const breadcrumbItem = Utils.createElement('span', {
                className: `breadcrumb-item${isLast ? ' current' : ''}`,
                onClick: isLast ? null : async () => await this.handleClick(item.target)
            }, item.label);

            container.appendChild(breadcrumbItem);

            // Add separator if not last
            if (!isLast) {
                const separator = Utils.createElement('span', {
                    className: 'breadcrumb-separator'
                }, '›');
                container.appendChild(separator);
            }
        });
    },

    /**
     * Handle breadcrumb click
     */
    async handleClick(target) {
        if (!target) {
            // Navigate to home
            AppState.navigateTo(null, null, null);
        } else {
            AppState.navigateTo(
                target.paper || null,
                target.provider || null,
                target.course || null
            );
        }
        await App.render();
    }
};

// Make Breadcrumb globally available
window.Breadcrumb = Breadcrumb;
