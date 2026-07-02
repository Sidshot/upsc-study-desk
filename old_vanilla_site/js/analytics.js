/**
 * UPSC Pro - Analytics Module
 * Tracks study progress, streaks, and completion statistics
 * 
 * Data stored in localStorage (simple, survives page refreshes)
 */

const Analytics = {
    STORAGE_KEY: 'upsc-pro-analytics',

    // Default data structure
    defaultData: {
        currentStreak: 0,
        longestStreak: 0,
        lastVisitDate: null,
        totalDaysStudied: 0,
        visitHistory: {}, // { '2026-01-07': true, '2026-01-06': true }
        lecturesCompleted: 0
    },

    /**
     * Get today's date as string (YYYY-MM-DD)
     */
    today() {
        return new Date().toISOString().split('T')[0];
    },

    /**
     * Get yesterday's date as string
     */
    yesterday() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    },

    /**
     * Load analytics data from storage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                return { ...this.defaultData, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.error('[Analytics] Load error:', e);
        }
        return { ...this.defaultData };
    },

    /**
     * Save analytics data to storage
     */
    save(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('[Analytics] Save error:', e);
        }
    },

    /**
     * Record today's visit (called on app init)
     */
    recordVisit() {
        const data = this.load();
        const today = this.today();
        const yesterday = this.yesterday();

        // Already visited today? Don't count again
        if (data.visitHistory[today]) {
            console.log('[Analytics] Already recorded visit today');
            return data;
        }

        // Mark today as visited
        data.visitHistory[today] = true;
        data.totalDaysStudied++;

        // Calculate streak
        if (data.lastVisitDate === yesterday) {
            // Consecutive day - increase streak
            data.currentStreak++;
        } else if (data.lastVisitDate === today) {
            // Same day, no change
        } else {
            // Streak broken - reset to 1
            data.currentStreak = 1;
        }

        // Update longest streak
        if (data.currentStreak > data.longestStreak) {
            data.longestStreak = data.currentStreak;
        }

        data.lastVisitDate = today;

        this.save(data);
        console.log('[Analytics] Visit recorded. Streak:', data.currentStreak);
        return data;
    },

    /**
     * Record lecture completion
     */
    recordCompletion() {
        const data = this.load();
        data.lecturesCompleted++;
        this.save(data);
        console.log('[Analytics] Lecture completed. Total:', data.lecturesCompleted);
        return data;
    },

    /**
     * Get current stats for display
     */
    getStats() {
        const data = this.load();
        return {
            currentStreak: data.currentStreak,
            longestStreak: data.longestStreak,
            totalDays: data.totalDaysStudied,
            lecturesCompleted: data.lecturesCompleted,
            visitHistory: data.visitHistory
        };
    },

    /**
     * Get visit history for last N days (for calendar)
     */
    getRecentHistory(days = 30) {
        const data = this.load();
        const history = [];
        const today = new Date();

        for (let i = 0; i < days; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            history.push({
                date: dateStr,
                visited: !!data.visitHistory[dateStr]
            });
        }

        return history.reverse(); // Oldest first
    },

    /**
     * Get stats for display on home page
     */
    async getTotalCompletedFromDB() {
        try {
            const lectures = await DB.getAll('lectures');
            return lectures.filter(l => l.completed).length;
        } catch (e) {
            return 0;
        }
    }
};

// Make globally available
window.Analytics = Analytics;
