/**
 * UPSC Study Desk - Drop Zone Component
 * Handles drag-and-drop file ingestion
 */

const DropZone = {
    /**
     * Render drop zone for a course
     * @param {string} courseId
     * @param {HTMLElement} container
     */
    render(courseId, container) {
        const dropZone = Utils.createElement('div', {
            className: 'drop-zone',
            dataset: { courseId: courseId }
        }, [
            Utils.createElement('div', { className: 'drop-zone-icon' }, [
                Utils.createElement('i', { className: 'ph-duotone ph-folder-arrow-down' })
            ]),
            Utils.createElement('div', { className: 'drop-zone-title' },
                'Drop files here'
            ),
            Utils.createElement('div', { className: 'drop-zone-text' },
                'Drag & drop .mp4, .mkv, .webm, or .pdf files'
            ),
            Utils.createElement('div', { className: 'drop-zone-or' }, '— or —'),
            Utils.createElement('button', {
                className: 'btn btn-primary',
                onClick: () => this.handleBrowseClick(courseId)
            }, 'Browse Files')
        ]);

        // Setup drag and drop handlers
        this.setupDragDrop(dropZone, courseId);

        container.appendChild(dropZone);
    },

    /**
     * Setup drag and drop event handlers
     */
    setupDragDrop(dropZone, courseId) {
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            // Only remove class if leaving the drop zone itself
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove('drag-over');
            }
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            await this.handleDrop(e, courseId);
        });
    },

    /**
     * Handle file drop
     */
    async handleDrop(event, courseId) {
        const items = event.dataTransfer.items;
        const files = [];

        // Process dropped items
        for (const item of items) {
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry?.() || item.getAsEntry?.();

                if (entry) {
                    await this.processEntry(entry, files);
                } else {
                    // Fallback for browsers without entry API
                    const file = item.getAsFile();
                    if (file && FileSystem.classifyFile(file.name)) {
                        files.push(file);
                    }
                }
            }
        }

        if (files.length > 0) {
            await this.importFiles(files, courseId);
        }
    },

    /**
     * Process a file system entry (file or directory)
     */
    async processEntry(entry, files) {
        if (entry.isFile) {
            const file = await this.getFileFromEntry(entry);
            if (file && FileSystem.classifyFile(file.name)) {
                files.push(file);
            }
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await this.readDirectory(reader);

            for (const childEntry of entries) {
                await this.processEntry(childEntry, files);
            }
        }
    },

    /**
     * Get File object from FileEntry
     */
    getFileFromEntry(entry) {
        return new Promise((resolve) => {
            entry.file(resolve, () => resolve(null));
        });
    },

    /**
     * Read all entries from a directory
     */
    readDirectory(reader) {
        return new Promise((resolve) => {
            reader.readEntries(resolve, () => resolve([]));
        });
    },

    /**
     * Handle browse button click
     */
    async handleBrowseClick(courseId) {
        try {
            // Use File System Access API if available
            if ('showOpenFilePicker' in window) {
                const handles = await window.showOpenFilePicker({
                    multiple: true,
                    types: [
                        {
                            description: 'Video files',
                            accept: { 'video/*': ['.mp4', '.mkv', '.webm'] }
                        },
                        {
                            description: 'PDF files',
                            accept: { 'application/pdf': ['.pdf'] }
                        }
                    ]
                });

                const files = await Promise.all(handles.map(h => h.getFile()));
                await this.importFiles(files, courseId);
            } else {
                // Fallback to input element
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = '.mp4,.mkv,.webm,.pdf';

                input.onchange = async () => {
                    const files = Array.from(input.files);
                    await this.importFiles(files, courseId);
                };

                input.click();
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('File picker error:', err);
            }
        }
    },

    /**
     * Import files as lectures
     */
    async importFiles(files, courseId) {
        if (files.length === 0) return;

        // Show importing state
        const container = Utils.$('content-area');
        const importingMsg = Utils.createElement('div', {
            className: 'importing-message'
        }, `Importing ${files.length} file(s)...`);
        container.appendChild(importingMsg);

        let imported = 0;

        try {
            // Get current course to build folder path
            const course = await AppState.getCourse(courseId);
            const provider = await AppState.getProvider(course.providerId);
            const paper = AppState.getPaper(provider.paperId);

            // If master folder is configured, move files there
            if (FileSystem.hasMasterFolder()) {
                const folderPath = `${paper.name}/${provider.name}/${course.name}`;
                const folder = await FileSystem.getOrCreateFolder(folderPath);

                for (const file of files) {
                    const type = FileSystem.classifyFile(file.name);
                    if (type) {
                        // Write file to folder
                        await FileSystem.writeFile(folder, file);

                        // Create lecture record
                        await AppState.addLecture(courseId, {
                            title: FileSystem.getTitleFromFilename(file.name),
                            fileName: file.name,
                            type: type
                        });

                        imported++;
                    }
                }
            } else {
                // No master folder - just create lecture records
                // (files stay where user dropped from)
                for (const file of files) {
                    const type = FileSystem.classifyFile(file.name);
                    if (type) {
                        await AppState.addLecture(courseId, {
                            title: FileSystem.getTitleFromFilename(file.name),
                            fileName: file.name,
                            type: type
                        });

                        imported++;
                    }
                }
            }
        } catch (err) {
            console.error('Import error:', err);
            alert('Failed to import some files: ' + err.message);
        }

        // Remove importing message
        importingMsg.remove();

        // Refresh lecture list
        if (imported > 0) {
            await LectureList.render();
        }
    }
};

// Make DropZone globally available
window.DropZone = DropZone;
