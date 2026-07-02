/**
 * UPSC Study Desk - Course List Component
 * Displays courses for a selected provider with real progress
 */

const CourseList = {
    /**
     * Render course cards for current provider
     */
    async render() {
        const container = Utils.$('content-area');
        if (!container) return;

        const providerId = AppState.currentView.provider;
        const provider = await AppState.getProvider(providerId);
        const courses = await AppState.getCourses(providerId);

        Utils.clearElement(container);

        // Content header
        const header = Utils.createElement('div', { className: 'content-header' }, [
            Utils.createElement('h2', { className: 'content-title' },
                `${provider.name} - Courses`
            )
        ]);
        container.appendChild(header);

        // Cards grid
        const grid = Utils.createElement('div', { className: 'cards-grid' });

        // Existing courses
        for (const course of courses) {
            // Get real progress from lectures
            const progress = await AppState.getCourseProgress(course.id);

            const card = Utils.createElement('div', {
                className: 'card',
                onClick: async () => await this.handleCourseClick(course.id)
            }, [
                Utils.createElement('div', { className: 'card-title' }, course.name),
                Utils.createElement('div', { className: 'card-subtitle' },
                    progress.total === 0 ? 'No lectures yet' :
                        progress.total === 1 ? '1 lecture' :
                            `${progress.total} lectures`
                ),
                Utils.createElement('div', { className: 'card-progress' }, [
                    Utils.createElement('div', { className: 'progress-bar' }, [
                        Utils.createElement('div', {
                            className: 'progress-fill',
                            style: `width: ${progress.percent}%`
                        })
                    ]),
                    Utils.createElement('div', { className: 'progress-text' },
                        `${progress.completed}/${progress.total} completed`
                    )
                ])
            ]);

            grid.appendChild(card);
        }

        // Add course card
        const addCard = Utils.createElement('div', {
            className: 'card add-card',
            onClick: () => this.handleAddCourse()
        }, [
            Utils.createElement('div', { className: 'add-card-icon', innerHTML: '<i class="ph ph-plus"></i>' }),
            Utils.createElement('div', { className: 'add-card-text' }, 'Add Course')
        ]);
        grid.appendChild(addCard);

        container.appendChild(grid);
    },

    /**
     * Handle course card click
     */
    async handleCourseClick(courseId) {
        try {
            console.log('Navigating to course:', courseId);
            AppState.navigateTo(
                AppState.currentView.paper,
                AppState.currentView.provider,
                courseId
            );
            await App.render();
        } catch (error) {
            console.error('Navigation error:', error);
            alert('Failed to open course: ' + error.message);
        }
    },

    /**
     * Handle add course button
     */
    handleAddCourse() {
        Modal.open({
            title: 'Add Course',
            placeholder: 'Course name (e.g., Polity, History...)',
            onConfirm: async (name) => {
                try {
                    await AppState.addCourse(AppState.currentView.provider, name);
                    await this.render();
                } catch (error) {
                    console.error('Failed to add course:', error);
                    alert('Failed to add course: ' + error.message);
                }
            }
        });
    }
};

// Make CourseList globally available
window.CourseList = CourseList;
