/**
 * UPSC Pro - Analytics Dashboard Component
 * Renders study stats on the home page
 */

const AnalyticsDashboard = {
    /**
     * Render the dashboard section
     * @param {HTMLElement} container - Parent element to append to
     */
    async render(container) {
        const stats = Analytics.getStats();
        const completedFromDB = await Analytics.getTotalCompletedFromDB();
        const history = Analytics.getRecentHistory(30);

        const dashboard = Utils.createElement('div', { className: 'analytics-dashboard' });

        // Stats Cards Row
        const statsRow = Utils.createElement('div', { className: 'analytics-stats-row' });

        // Streak Card
        const streakCard = this.createStatCard(
            'streak',
            stats.currentStreak,
            'Day Streak',
            stats.currentStreak >= 7 ? 'ph-duotone ph-fire' : 'ph-duotone ph-calendar-check'
        );

        // Lectures Completed Card
        const completedCard = this.createStatCard(
            'completed',
            completedFromDB,
            'Lectures Done',
            'ph-duotone ph-check-circle'
        );

        // Total Days Card  
        const daysCard = this.createStatCard(
            'days',
            stats.totalDays,
            'Days Studied',
            'ph-duotone ph-calendar'
        );

        // Longest Streak Card
        const longestCard = this.createStatCard(
            'longest',
            stats.longestStreak,
            'Best Streak',
            'ph-duotone ph-trophy'
        );

        statsRow.appendChild(streakCard);
        statsRow.appendChild(completedCard);
        statsRow.appendChild(daysCard);
        statsRow.appendChild(longestCard);

        dashboard.appendChild(statsRow);

        // Activity Calendar (last 30 days)
        const calendar = this.createCalendar(history);
        dashboard.appendChild(calendar);

        container.appendChild(dashboard);
    },

    /**
     * Create a stat card
     */
    createStatCard(type, value, label, icon) {
        return Utils.createElement('div', { className: `analytics-stat-card stat-${type}` }, [
            Utils.createElement('div', { className: 'stat-icon' }, [
                Utils.createElement('i', { className: icon })
            ]),
            Utils.createElement('div', { className: 'stat-content' }, [
                Utils.createElement('div', { className: 'stat-value' }, String(value)),
                Utils.createElement('div', { className: 'stat-label' }, label)
            ])
        ]);
    },

    /**
     * Create activity calendar (GitHub-style)
     */
    createCalendar(history) {
        const calendarSection = Utils.createElement('div', { className: 'analytics-calendar' });

        const title = Utils.createElement('div', { className: 'calendar-title' }, 'Activity (Last 30 Days)');
        calendarSection.appendChild(title);

        const grid = Utils.createElement('div', { className: 'calendar-grid' });

        history.forEach(day => {
            const cell = Utils.createElement('div', {
                className: `calendar-cell ${day.visited ? 'active' : ''}`,
                title: day.date
            });
            grid.appendChild(cell);
        });

        calendarSection.appendChild(grid);

        return calendarSection;
    }
};

// Make globally available
window.AnalyticsDashboard = AnalyticsDashboard;
