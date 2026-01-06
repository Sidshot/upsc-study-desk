/**
 * UPSC Study Desk - State Management
 * Database-backed state with async operations
 */

const AppState = {
    // Current navigation state (in-memory, not persisted)
    currentView: {
        paper: null,
        provider: null,
        course: null
    },

    // App mode
    mode: 'browse', // 'browse' or 'study'

    // Loading state
    isLoading: false,

    // Cached data (refreshed from DB as needed)
    _cache: {
        papers: null,
        providers: {},
        courses: {},
        lectures: {}
    },

    /**
     * Initialize state (load papers from DB)
     */
    async init() {
        await DB.init();
        await DB.seed();
        await this.refreshPapers();
    },

    /**
     * Refresh papers cache from database
     */
    async refreshPapers() {
        const papers = await DB.getAll('papers');
        papers.sort((a, b) => a.orderIndex - b.orderIndex);
        this._cache.papers = papers;
        return papers;
    },

    /**
     * Get all papers
     */
    getPapers() {
        return this._cache.papers || [];
    },

    /**
     * Get paper by ID
     */
    getPaper(paperId) {
        const papers = this.getPapers();
        return papers.find(p => p.id === paperId);
    },

    /**
     * Get providers for a paper
     */
    async getProviders(paperId) {
        if (!this._cache.providers[paperId]) {
            const providers = await DB.getByIndex('providers', 'paperId', paperId);
            providers.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            this._cache.providers[paperId] = providers;
        }
        return this._cache.providers[paperId];
    },

    /**
     * Get provider by ID
     */
    async getProvider(providerId) {
        return await DB.get('providers', providerId);
    },

    /**
     * Add a new provider
     */
    async addProvider(paperId, name) {
        // Get valid paper IDs for invariant check
        const papers = this.getPapers();
        const validPaperIds = papers.map(p => p.id);

        // Get current provider count for ordering
        const existingProviders = await this.getProviders(paperId);

        const provider = {
            id: Utils.generateId(),
            name: name.trim(),
            paperId: paperId,
            orderIndex: existingProviders.length,
            createdAt: new Date().toISOString()
        };

        // Validate before saving
        await Invariants.check('provider', provider, validPaperIds);

        // Save to database
        await DB.put('providers', provider);

        // Invalidate cache
        delete this._cache.providers[paperId];

        return provider;
    },

    /**
     * Get courses for a provider
     */
    async getCourses(providerId) {
        if (!this._cache.courses[providerId]) {
            const courses = await DB.getByIndex('courses', 'providerId', providerId);
            courses.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            this._cache.courses[providerId] = courses;
        }
        return this._cache.courses[providerId];
    },

    /**
     * Get course by ID
     */
    async getCourse(courseId) {
        return await DB.get('courses', courseId);
    },

    /**
     * Add a new course
     */
    async addCourse(providerId, name) {
        // Get all providers for invariant check
        const allProviders = await DB.getAll('providers');
        const validProviderIds = allProviders.map(p => p.id);

        // Get current course count for ordering
        const existingCourses = await this.getCourses(providerId);

        const course = {
            id: Utils.generateId(),
            name: name.trim(),
            providerId: providerId,
            orderIndex: existingCourses.length,
            createdAt: new Date().toISOString()
        };

        // Validate before saving
        await Invariants.check('course', course, validProviderIds);

        // Save to database
        await DB.put('courses', course);

        // Invalidate cache
        delete this._cache.courses[providerId];

        return course;
    },

    /**
     * Get lectures for a course
     */
    async getLectures(courseId) {
        if (!this._cache.lectures[courseId]) {
            const lectures = await DB.getByIndex('lectures', 'courseId', courseId);
            lectures.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            this._cache.lectures[courseId] = lectures;
        }
        return this._cache.lectures[courseId];
    },

    /**
     * Get lecture by ID
     */
    async getLecture(lectureId) {
        return await DB.get('lectures', lectureId);
    },

    /**
     * Add a new lecture
     */
    async addLecture(courseId, lectureData) {
        // Get all courses for invariant check
        const allCourses = await DB.getAll('courses');
        const validCourseIds = allCourses.map(c => c.id);

        // Get current lecture count for ordering if not provided
        const existingLectures = await this.getLectures(courseId);
        const orderIndex = lectureData.orderIndex !== undefined
            ? lectureData.orderIndex
            : existingLectures.length;

        const lecture = {
            id: Utils.generateId(),
            title: lectureData.title,
            courseId: courseId,
            type: lectureData.type,  // 'video' or 'pdf'
            fileName: lectureData.fileName,
            orderIndex: orderIndex,
            completed: false,
            lastPosition: 0,
            createdAt: new Date().toISOString()
        };

        // Validate before saving
        await Invariants.check('lecture', lecture, validCourseIds);

        // Save to database
        await DB.put('lectures', lecture);

        // Invalidate cache
        delete this._cache.lectures[courseId];

        return lecture;
    },

    /**
     * Navigate to a specific view
     */
    navigateTo(paper = null, provider = null, course = null) {
        this.currentView = { paper, provider, course };
    },

    /**
     * Get current breadcrumb trail
     */
    async getBreadcrumb() {
        const trail = [{ label: 'Home', target: null }];

        if (this.currentView.paper) {
            const paper = this.getPaper(this.currentView.paper);
            if (paper) {
                trail.push({ label: paper.name, target: { paper: paper.id } });
            }
        }

        if (this.currentView.provider) {
            const provider = await this.getProvider(this.currentView.provider);
            if (provider) {
                trail.push({
                    label: provider.name,
                    target: { paper: this.currentView.paper, provider: provider.id }
                });
            }
        }

        if (this.currentView.course) {
            const course = await this.getCourse(this.currentView.course);
            if (course) {
                trail.push({
                    label: course.name,
                    target: {
                        paper: this.currentView.paper,
                        provider: this.currentView.provider,
                        course: course.id
                    }
                });
            }
        }

        return trail;
    },

    /**
     * Get provider count for a paper
     */
    async getProviderCount(paperId) {
        return await DB.countByIndex('providers', 'paperId', paperId);
    },

    /**
     * Get course count for a provider
     */
    async getCourseCount(providerId) {
        return await DB.countByIndex('courses', 'providerId', providerId);
    },

    /**
     * Get lecture count for a course
     */
    async getLectureCount(courseId) {
        return await DB.countByIndex('lectures', 'courseId', courseId);
    },

    /**
     * Get course progress (completed/total lectures)
     * @param {string} courseId
     * @returns {Object} { total, completed, percent }
     */
    async getCourseProgress(courseId) {
        const lectures = await this.getLectures(courseId);
        const total = lectures.length;
        const completed = lectures.filter(l => l.completed).length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        return { total, completed, percent };
    },

    /**
     * Invalidate all caches (use after bulk operations)
     */
    invalidateCache() {
        this._cache.providers = {};
        this._cache.courses = {};
        this._cache.lectures = {};
    },

    /**
     * Get recently opened lectures
     * @param {number} limit - Max number to return
     * @param {string} paperId - Optional: filter by paper
     * @returns {Promise<Array>} Recent lectures with course/provider/paper info
     */
    async getRecentLectures(limit = 3, paperId = null) {
        // Get all lectures
        const allLectures = await DB.getAll('lectures');

        // Filter those with lastOpenedAt
        let recent = allLectures.filter(l => l.lastOpenedAt);

        // Sort by lastOpenedAt descending
        recent.sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt));

        // If filtering by paper, we need to check the hierarchy
        if (paperId) {
            const filtered = [];
            for (const lecture of recent) {
                const course = await this.getCourse(lecture.courseId);
                if (!course) continue;
                const provider = await this.getProvider(course.providerId);
                if (!provider) continue;
                if (provider.paperId === paperId) {
                    filtered.push({
                        ...lecture,
                        courseName: course.name,
                        providerName: provider.name
                    });
                }
                if (filtered.length >= limit) break;
            }
            return filtered;
        }

        // No filter - just return top N with enriched info
        const result = [];
        for (const lecture of recent.slice(0, limit)) {
            const course = await this.getCourse(lecture.courseId);
            if (!course) continue;
            const provider = await this.getProvider(course.providerId);
            if (!provider) continue;
            const paper = this.getPaper(provider.paperId);

            result.push({
                ...lecture,
                courseName: course.name,
                providerName: provider.name,
                paperName: paper?.name || 'Unknown',
                paperIcon: paper?.icon || '📚'
            });
        }
        return result;
    }
};

// Make AppState globally available
window.AppState = AppState;
