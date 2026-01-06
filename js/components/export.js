/**
 * UPSC Study Desk - Export Component
 * Exports progress and notes to files
 */

const Export = {
    /**
     * Export all progress as JSON
     */
    async exportProgressJSON() {
        const data = await this.gatherAllData();
        const json = JSON.stringify(data, null, 2);
        this.downloadFile(json, 'upsc-progress.json', 'application/json');
    },

    /**
     * Export progress as CSV
     */
    async exportProgressCSV() {
        const data = await this.gatherAllData();
        const csv = this.convertToCSV(data);
        this.downloadFile(csv, 'upsc-progress.csv', 'text/csv');
    },



    /**
     * Gather all data for export
     */
    async gatherAllData() {
        const papers = AppState.getPapers();
        const result = {
            exportedAt: new Date().toISOString(),
            papers: []
        };

        for (const paper of papers) {
            const paperData = {
                id: paper.id,
                name: paper.name,
                providers: []
            };

            const providers = await AppState.getProviders(paper.id);
            for (const provider of providers) {
                const providerData = {
                    id: provider.id,
                    name: provider.name,
                    courses: []
                };

                const courses = await AppState.getCourses(provider.id);
                for (const course of courses) {
                    const progress = await AppState.getCourseProgress(course.id);
                    const lectures = await AppState.getLectures(course.id);

                    const courseData = {
                        id: course.id,
                        name: course.name,
                        folderPath: course.folderPath,
                        progress: progress,
                        lectures: lectures.map(l => ({
                            id: l.id,
                            title: l.title,
                            type: l.type,
                            completed: l.completed,
                            lastPosition: l.lastPosition
                        }))
                    };

                    providerData.courses.push(courseData);
                }

                paperData.providers.push(providerData);
            }

            result.papers.push(paperData);
        }

        return result;
    },



    /**
     * Convert data to CSV format
     */
    convertToCSV(data) {
        const rows = [
            ['Paper', 'Provider', 'Course', 'Lecture', 'Type', 'Completed', 'Last Position']
        ];

        for (const paper of data.papers) {
            for (const provider of paper.providers) {
                for (const course of provider.courses) {
                    for (const lecture of course.lectures) {
                        rows.push([
                            paper.name,
                            provider.name,
                            course.name,
                            lecture.title,
                            lecture.type,
                            lecture.completed ? 'Yes' : 'No',
                            lecture.lastPosition || 0
                        ]);
                    }
                }
            }
        }

        return rows.map(row =>
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    },



    /**
     * Download a file
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Render export options in settings/menu
     */
    renderExportPanel(container) {
        const panel = Utils.createElement('div', { className: 'export-panel' }, [
            Utils.createElement('h3', { className: 'export-title' }, 'Export Data'),
            Utils.createElement('p', { className: 'export-description' },
                'Download your progress and notes for backup or analysis.'
            ),
            Utils.createElement('div', { className: 'export-buttons' }, [
                Utils.createElement('button', {
                    className: 'btn btn-primary',
                    onClick: async () => {
                        await this.exportProgressJSON();
                        alert('Progress exported as JSON!');
                    }
                }, '📊 Export Progress (JSON)'),
                Utils.createElement('button', {
                    className: 'btn btn-secondary',
                    onClick: async () => {
                        await this.exportProgressCSV();
                        alert('Progress exported as CSV!');
                    }
                }, '📄 Export Progress (CSV)'),

            ])
        ]);

        container.appendChild(panel);
    }
};

// Make Export globally available
window.Export = Export;
