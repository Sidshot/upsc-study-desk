/**
 * UPSC Study Desk - Lecture List Component
 * Displays lectures with drag-to-reorder and inline editing
 */

const LectureList = {
    // Tab state
    activeTab: 'video', // 'video' or 'pdf'
    // Sort state
    sortOrder: 'asc', // 'asc' or 'desc'

    /**
     * Set active tab and rerender
     */
    setActiveTab(tab) {
        this.activeTab = tab;
        this.render();
    },

    /**
     * Toggle sort order
     */
    toggleSort() {
        this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        this.render();
    },

    /**
     * Sort items based on current order
     */
    sortItems(items) {
        return items.sort((a, b) => {
            const comparison = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
            return this.sortOrder === 'asc' ? comparison : -comparison;
        });
    },

    /**
     * Render lecture list for current course
     */
    async render() {
        const container = Utils.$('content-area');
        if (!container) return;

        const courseId = AppState.currentView.course;
        if (!courseId) {
            console.error('LectureList: No course ID found in state');
            return;
        }

        let course, lectures;
        try {
            course = await AppState.getCourse(courseId);
            lectures = await AppState.getLectures(courseId);
        } catch (dbError) {
            console.error('LectureList: DB Error', dbError);
            alert('Database error loading lectures: ' + dbError.message);
            return;
        }

        if (!course) {
            console.error('LectureList: Course not found for ID', courseId);
            alert('Error: Course data not found. Please try refreshing.');
            return;
        }

        Utils.clearElement(container);

        // Filter contents
        let videos = lectures.filter(l => l.type === 'video');
        let pdfs = lectures.filter(l => l.type === 'pdf');

        // Apply sorting
        videos = this.sortItems(videos);
        pdfs = this.sortItems(pdfs);

        // Smart Default: If no videos but have PDFs, switch tab (only once/initially)
        // But we want to respect user selection if they switched manually.
        // Simple logic: if activeTab is video but no videos and we have pdfs, switch.
        if (this.activeTab === 'video' && videos.length === 0 && pdfs.length > 0) {
            this.activeTab = 'pdf';
        }

        // Content header with progress
        const progress = await AppState.getCourseProgress(courseId);
        const header = Utils.createElement('div', { className: 'content-header' }, [
            Utils.createElement('h2', { className: 'content-title' },
                `${course.name}`
            ),
            Utils.createElement('div', { className: 'content-actions' }, [
                // Sort Button
                Utils.createElement('button', {
                    className: 'btn-icon',
                    title: `Sort: ${this.sortOrder === 'asc' ? 'Ascending' : 'Descending'}`,
                    style: 'margin-right: 1rem; font-size: 1.2rem; cursor: pointer; background: none; border: none; color: inherit; display: flex; align-items: center;',
                    onClick: () => this.toggleSort()
                }, [
                    Utils.createElement('span', {
                        innerHTML: this.sortOrder === 'asc'
                            ? '<i class="ph-duotone ph-sort-ascending"></i> Sort Asc'
                            : '<i class="ph-duotone ph-sort-descending"></i> Sort Desc'
                    })
                ]),

                Utils.createElement('span', { className: 'lecture-count' },
                    `${progress.completed}/${progress.total} completed (${progress.percent}%)`
                )
            ])
        ]);
        container.appendChild(header);

        // Render Tabs if we have mixed content or just to show options
        // User asked: "Add two pills... If only lectures - only lectures shows"
        // Interpretation: If we have PDFs, show the toggle.
        if (pdfs.length > 0) {
            const tabsContainer = Utils.createElement('div', { className: 'tab-pills-container' }, [
                Utils.createElement('button', {
                    className: `tab-pill ${this.activeTab === 'video' ? 'active' : ''}`,
                    onClick: () => this.setActiveTab('video')
                }, [
                    'Lectures',
                    Utils.createElement('span', { className: 'tab-pill-count' }, videos.length)
                ]),
                Utils.createElement('button', {
                    className: `tab-pill ${this.activeTab === 'pdf' ? 'active' : ''}`,
                    onClick: () => this.setActiveTab('pdf')
                }, [
                    'Documents',
                    Utils.createElement('span', { className: 'tab-pill-count' }, pdfs.length)
                ])
            ]);
            container.appendChild(tabsContainer);
        }

        const currentItems = this.activeTab === 'video' ? videos : pdfs;

        // If no items in current tab
        if (currentItems.length === 0) {
            const emptyMsg = Utils.createElement('div', { className: 'empty-state' },
                this.activeTab === 'video' ? 'No lectures found.' : 'No documents found.'
            );

            // Only show dropzone if truly empty (no items at all vs just no items in this tab)
            if (lectures.length === 0) {
                DropZone.render(courseId, container);
                return;
            }
            container.appendChild(emptyMsg);
        } else {
            // Render list
            const list = Utils.createElement('div', {
                className: 'lecture-list',
                dataset: { courseId: courseId }
            });

            currentItems.forEach((lecture, index) => {
                // We pass the ORIGINAL index from the main list to keep ID stable? 
                // Or just display index? 
                // The reorder logic relies on index. 
                // Reordering filtered lists is tricky. For now, disable drag in filtered view?
                // Or just Pass the lecture object which has 'orderIndex'.
                const item = this.createLectureItem(lecture, index, courseId);
                list.appendChild(item);
            });
            container.appendChild(list);
        }

        // Add compact drop zone for more files
        const addMore = Utils.createElement('div', { className: 'add-more-section' });
        const addMoreZone = Utils.createElement('div', {
            className: 'drop-zone drop-zone-compact',
            dataset: { courseId: courseId }
        }, [
            Utils.createElement('span', { className: 'drop-zone-compact-text' },
                '+ Drop files here or '
            ),
            Utils.createElement('button', {
                className: 'btn-link',
                onClick: () => DropZone.handleBrowseClick(courseId)
            }, 'browse')
        ]);
        DropZone.setupDragDrop(addMoreZone, courseId);
        addMore.appendChild(addMoreZone);
        container.appendChild(addMore);
    },

    /**
     * Create a lecture item element
     */
    createLectureItem(lecture, index, courseId) {
        const item = Utils.createElement('div', {
            className: `lecture-item${lecture.completed ? ' completed' : ''}`,
            dataset: { lectureId: lecture.id, index: index },
            draggable: 'true'
        });

        // Drag handle
        const dragHandle = Utils.createElement('div', {
            className: 'lecture-drag-handle',
            title: 'Drag to reorder'
        }, [Utils.createElement('i', { className: 'ph-duotone ph-dots-six-vertical' })]);
        item.appendChild(dragHandle);

        // Status checkbox
        const status = Utils.createElement('div', {
            className: `lecture-status${lecture.completed ? ' completed' : ''}`,
            title: lecture.completed ? 'Mark incomplete' : 'Mark complete',
            onClick: async (e) => {
                e.stopPropagation();
                await this.toggleComplete(lecture);
            }
        });
        item.appendChild(status);

        // Type icon
        const typeIcon = Utils.createElement('div', { className: 'lecture-type-icon' }, [
            Utils.createElement('i', { className: lecture.type === 'video' ? 'ph-duotone ph-video' : 'ph-duotone ph-file-text' })
        ]);
        item.appendChild(typeIcon);

        // Title (clickable area for opening)
        const title = Utils.createElement('div', {
            className: 'lecture-title'
        }, lecture.title);
        item.appendChild(title);

        // Action buttons container
        const actions = Utils.createElement('div', { className: 'lecture-actions' });

        // Edit button
        const editBtn = Utils.createElement('button', {
            className: 'lecture-action-btn',
            title: 'Rename',
            onClick: async (e) => {
                e.stopPropagation();
                this.showRenameModal(lecture);
            }
        }, [Utils.createElement('i', { className: 'ph-duotone ph-pencil-simple' })]);
        actions.appendChild(editBtn);

        // Delete button
        const deleteBtn = Utils.createElement('button', {
            className: 'lecture-action-btn delete',
            title: 'Delete',
            onClick: async (e) => {
                e.stopPropagation();
                await this.showDeleteGuidance(lecture, courseId);
            }
        }, [Utils.createElement('i', { className: 'ph-duotone ph-trash' })]);
        actions.appendChild(deleteBtn);

        item.appendChild(actions);

        // Type badge
        const typeBadge = Utils.createElement('div', { className: 'lecture-type-badge' },
            lecture.type.toUpperCase()
        );
        item.appendChild(typeBadge);

        // Setup drag events
        this.setupDragEvents(item, lecture, courseId);

        // Click to open Study Mode
        item.addEventListener('click', async (e) => {
            // Don't open if clicking on action buttons
            if (e.target.closest('.lecture-actions') ||
                e.target.closest('.lecture-status') ||
                e.target.closest('.lecture-drag-handle')) {
                return;
            }
            await this.handleLectureClick(lecture.id);
        });

        return item;
    },

    /**
     * Setup drag and drop for reordering
     */
    setupDragEvents(item, lecture, courseId) {
        item.addEventListener('dragstart', (e) => {
            this.draggedItem = item;
            this.draggedIndex = parseInt(item.dataset.index);
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            if (this.draggedItem) {
                this.draggedItem.classList.remove('dragging');
            }
            this.draggedItem = null;
            this.draggedIndex = null;

            // Remove all drag-over states
            document.querySelectorAll('.lecture-item.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedItem && this.draggedItem !== item) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');

            if (this.draggedItem && this.draggedItem !== item) {
                const fromIndex = this.draggedIndex;
                const toIndex = parseInt(item.dataset.index);

                if (fromIndex !== toIndex) {
                    await this.reorderLectures(courseId, fromIndex, toIndex);
                }
            }
        });
    },

    /**
     * Reorder lectures
     */
    async reorderLectures(courseId, fromIndex, toIndex) {
        const lectures = await AppState.getLectures(courseId);

        // Remove and reinsert
        const [movedLecture] = lectures.splice(fromIndex, 1);
        lectures.splice(toIndex, 0, movedLecture);

        // Update order indices
        for (let i = 0; i < lectures.length; i++) {
            if (lectures[i].orderIndex !== i) {
                lectures[i].orderIndex = i;
                await DB.put('lectures', lectures[i]);
            }
        }

        // Invalidate cache and re-render
        AppState.invalidateCache();
        await this.render();
    },

    /**
     * Start inline editing of lecture title
     */
    startInlineEdit(titleElement, lecture) {
        const currentTitle = lecture.title;

        // Create input
        const input = Utils.createElement('input', {
            type: 'text',
            className: 'lecture-title-input',
            value: currentTitle
        });

        // Replace title with input
        titleElement.textContent = '';
        titleElement.appendChild(input);
        input.focus();
        input.select();

        // Save on blur or Enter
        const save = async () => {
            const newTitle = input.value.trim();
            if (newTitle && newTitle !== currentTitle) {
                lecture.title = newTitle;
                await DB.put('lectures', lecture);
                AppState.invalidateCache();
            }
            titleElement.textContent = lecture.title;
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                titleElement.textContent = currentTitle;
            }
        });
    },

    /**
     * Toggle lecture completion status
     */
    async toggleComplete(lecture) {
        lecture.completed = !lecture.completed;
        await DB.put('lectures', lecture);
        AppState.invalidateCache();
        await this.render();
    },

    /**
     * Handle lecture click - Enter Study Mode
     */
    async handleLectureClick(lectureId) {
        await StudyMode.enter(lectureId);
    },

    /**
     * Show rename modal for lecture
     */
    showRenameModal(lecture) {
        Modal.open({
            title: 'Rename Lecture',
            placeholder: 'Enter new title...',
            value: lecture.title,
            onConfirm: async (newTitle) => {
                if (newTitle && newTitle !== lecture.title) {
                    lecture.title = newTitle;
                    await DB.put('lectures', lecture);
                    AppState.invalidateCache();
                    await this.render();
                }
            }
        });
    },

    /**
     * Show delete guidance with folder path (does NOT modify DB)
     * User must delete file manually, then sync to update
     */
    async showDeleteGuidance(lecture, courseId) {
        const course = await AppState.getCourse(courseId);
        const folderPath = course.folderPath || 'your study folder';
        const masterFolder = FileSystem.getMasterFolderName() || 'Master Folder';
        const fullPath = `${masterFolder}\\${folderPath.replace(/\//g, '\\')}`;

        const message = `📁 To delete this file:\n\n` +
            `1. Open File Explorer\n` +
            `2. Go to: ${fullPath}\n` +
            `3. Delete: ${lecture.fileName}\n` +
            `4. Return here and click "Sync Now" on home page\n\n` +
            `The file will be removed from this list automatically after sync.`;

        alert(message);
    }
};

// Make LectureList globally available
window.LectureList = LectureList;
