/**
 * UPSC Study Desk - Study Mode Component
 * Isolated, focused study environment for video/PDF content
 * 
 * KEY DESIGN: File system is the source of truth.
 * Files are scanned LIVE from disk, not from stored filenames.
 */

const StudyMode = {
    // Current lecture being studied
    currentLecture: null,

    // Actual file from disk (refreshed on each open)
    currentFile: null,



    // Session tracking to prevent race conditions
    activeSessionId: 0,

    // Current media object URL (for cleanup)
    currentObjectURL: null,

    /**
     * Enter Study Mode for a lecture
     * @param {string} lectureId
     */
    async enter(lectureId) {
        // 1. Start new session
        const thisSessionId = ++this.activeSessionId;
        console.log(`[StudyMode] Starting session ${thisSessionId} for lecture ${lectureId}`);

        // 2. Save position if switching from another lecture
        if (this.currentLecture) {
            await this.savePosition();
        }

        // 3. Immediate cleanup
        this.cleanup();

        const lecture = await AppState.getLecture(lectureId);

        // Race check (if another enter was called during await)
        if (this.activeSessionId !== thisSessionId) {
            console.log(`[StudyMode] Session ${thisSessionId} aborted (stale).`);
            return;
        }

        if (!lecture) {
            console.error('Lecture not found:', lectureId);
            return;
        }

        this.currentLecture = lecture;
        AppState.mode = 'study';

        // Track last opened time
        this.currentLecture.lastOpenedAt = new Date().toISOString();
        await DB.put('lectures', this.currentLecture);
        AppState.invalidateCache();

        // 3. Live Scan
        await this.refreshFileFromDisk();

        // Race check
        if (this.activeSessionId !== thisSessionId) return;

        // 4. Update UI Mode
        const modeBadge = document.querySelector('.mode-badge');
        if (modeBadge) {
            modeBadge.textContent = 'Study Mode';
            modeBadge.className = 'mode-badge study-mode';
        }

        const sidebar = Utils.$('sidebar');
        if (sidebar) sidebar.classList.add('hidden');

        // 5. Render (Pass ID to enforce valid render)
        await this.render(thisSessionId);
    },

    /**
     * Refresh current file from disk (live scan)
     */
    async refreshFileFromDisk() {
        this.currentFile = null;

        if (!FileSystem.hasMasterFolder()) {
            console.log('No master folder configured');
            return;
        }

        try {
            const course = await AppState.getCourse(this.currentLecture.courseId);
            if (!course.folderPath) return;

            const folder = await FileSystem.getOrCreateFolder(course.folderPath);
            const files = [];

            for await (const [name, handle] of folder) {
                if (handle.kind === 'file') {
                    const type = FileSystem.classifyFile(name);
                    if (type) files.push({ name, handle, type });
                }
            }

            files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

            // Match by order index
            const orderIndex = this.currentLecture.orderIndex || 0;
            if (orderIndex < files.length) {
                this.currentFile = files[orderIndex];

                // Sync filename if changed (renamed on disk)
                if (this.currentLecture.fileName !== this.currentFile.name) {
                    this.currentLecture.fileName = this.currentFile.name;
                    this.currentLecture.title = FileSystem.getTitleFromFilename(this.currentFile.name);
                    await DB.put('lectures', this.currentLecture);
                    AppState.invalidateCache();
                }
            }
        } catch (err) {
            console.error('Error refreshing file from disk:', err);
        }
    },

    /**
     * Exit Study Mode
     */
    async exit() {
        // Increment session ID to invalidate any pending loads
        this.activeSessionId++;

        await this.savePosition();
        this.cleanup();

        this.currentLecture = null;
        this.currentFile = null;
        AppState.mode = 'browse';

        const modeBadge = document.querySelector('.mode-badge');
        if (modeBadge) {
            modeBadge.textContent = 'Browse Mode';
            modeBadge.className = 'mode-badge browse-mode';
        }

        const sidebar = Utils.$('sidebar');
        if (sidebar) sidebar.classList.remove('hidden');

        await App.render();
    },

    /**
     * Render the study mode interface
     */
    async render(sessionId) {
        // Race check
        if (sessionId && this.activeSessionId !== sessionId) return;

        const container = Utils.$('content-area');
        if (!container) return;

        Utils.clearElement(container);
        container.className = 'content-area study-mode-active';

        // Header
        const header = Utils.createElement('div', { className: 'study-header' }, [
            Utils.createElement('button', {
                className: 'btn btn-secondary study-back-btn',
                onClick: async () => await this.exit()
            }, '← Back'),
            Utils.createElement('h2', { className: 'study-title' }, this.currentLecture.title),
            Utils.createElement('div', { className: 'study-actions' }, [
                Utils.createElement('button', {
                    className: `btn ${this.currentLecture.completed ? 'btn-success' : 'btn-secondary'}`,
                    onClick: async () => await this.toggleComplete()
                }, this.currentLecture.completed ? '✓ Completed' : 'Mark Complete'),

            ])
        ]);
        container.appendChild(header);

        // Main Content
        const mainArea = Utils.createElement('div', { className: 'study-main' });

        if (this.currentLecture.type === 'video') {
            await this.renderVideoPlayer(mainArea, sessionId);
        } else if (this.currentLecture.type === 'pdf') {
            await this.renderPdfViewer(mainArea);
        }

        container.appendChild(mainArea);

    },

    /**
     * Render video player with Plyr integration
     */
    async renderVideoPlayer(container, sessionId) {
        const videoWrapper = Utils.createElement('div', { className: 'video-wrapper' });

        // Fallback or Loading
        if (!this.currentFile) {
            videoWrapper.innerHTML = '<div class="study-fallback">Video file not found in folder.</div>';
            container.appendChild(videoWrapper);
            return;
        }

        try {
            // Create Blob URL
            const file = await this.currentFile.handle.getFile();

            // Race check: If session changed while reading file
            if (sessionId && this.activeSessionId !== sessionId) return;

            this.currentObjectURL = URL.createObjectURL(file);

            const video = Utils.createElement('video', {
                className: 'study-video',
                controls: 'true',
                playsinline: 'true',
                preload: 'metadata'
            });
            video.src = this.currentObjectURL;

            // Append FIRST (Plyr needs it in DOM)
            videoWrapper.appendChild(video);
            container.appendChild(videoWrapper);

            // Initialize Plyr
            if (window.Plyr) {
                this.player = new Plyr(video, {
                    controls: [
                        'play-large', 'play', 'progress', 'current-time', 'duration',
                        'mute', 'volume', 'captions', 'settings', 'pip', 'fullscreen'
                    ],
                    speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
                    keyboard: { focused: true, global: true },
                    tooltips: { controls: true, seek: true },
                    // Fix blank screen issues
                    ratio: '16:9',
                    resetOnEnd: true
                });

                // Restore logic helper
                const restorePosition = () => {
                    if (this.currentLecture && this.currentLecture.lastPosition > 0) {
                        console.log(`[StudyMode] Restoring position: ${this.currentLecture.lastPosition}s`);
                        // Try immediately
                        this.player.currentTime = this.currentLecture.lastPosition;
                        // And safe check
                        setTimeout(() => {
                            if (this.player && Math.abs(this.player.currentTime - this.currentLecture.lastPosition) > 1) {
                                this.player.currentTime = this.currentLecture.lastPosition;
                            }
                        }, 100);
                    }
                };

                // Attach Events via Plyr API
                this.player.on('ready', restorePosition);
                this.player.on('loadedmetadata', restorePosition);

                this.player.on('timeupdate', () => {
                    // Throttle save
                    if (this.currentLecture && Math.random() < 0.1) {
                        this.currentLecture.lastPosition = Math.floor(this.player.currentTime);
                        DB.put('lectures', this.currentLecture);
                    }
                });

                this.player.on('pause', () => {
                    if (this.currentLecture) {
                        const time = Math.floor(this.player.currentTime);
                        console.log(`[StudyMode] Paused. Saving position: ${time}s`);
                        this.currentLecture.lastPosition = time;
                        DB.put('lectures', this.currentLecture);
                    }
                });

                this.player.on('ended', () => {
                    this.savePosition();
                    if (!this.currentLecture.completed) {
                        this.showCompletionPrompt();
                        this.currentLecture.completed = true;
                        DB.put('lectures', this.currentLecture);
                    }
                });
            } else {
                // Fallback to native events
                video.addEventListener('loadedmetadata', () => {
                    if (this.currentLecture.lastPosition > 0) video.currentTime = this.currentLecture.lastPosition;
                });
                video.addEventListener('pause', () => {
                    this.currentLecture.lastPosition = Math.floor(video.currentTime);
                    DB.put('lectures', this.currentLecture);
                });
            }

        } catch (err) {
            console.error('Video Load Error:', err);
            videoWrapper.innerHTML = `<div class="study-fallback">Error loading video: ${err.message}</div>`;
            container.appendChild(videoWrapper);
        }
    },

    /**
     * Render PDF viewer using the Industry Standard PDF.js Viewer (Robust & Full Featured)
     */
    async renderPdfViewer(container) {
        // Clear container
        container.innerHTML = '';
        container.classList.add('pdf-viewer-mode');

        if (!this.currentFile) {
            container.textContent = 'PDF not found.';
            return;
        }

        try {
            // 1. Create a Blob URL (Standard Web Method)
            // On GitHub Pages (HTTPS), this works perfectly.
            const file = await this.currentFile.handle.getFile();
            this.currentObjectURL = URL.createObjectURL(file);

            // 2. Construct the Standard Viewer URL
            const viewerPath = 'js/vendor/pdfjs/web/viewer.html';
            const initialPage = this.currentLecture.lastPosition || 1;

            // Pass the Blob URL to the viewer
            // NOTE: On 'file://' protocol this might fail, but on 'https://' (GitHub Pages) it is robust.
            const viewerUrl = `${viewerPath}?file=${encodeURIComponent(this.currentObjectURL)}#page=${initialPage}`;

            const iframe = Utils.createElement('iframe', {
                className: 'pdf-viewer-frame',
                src: viewerUrl,
                allowfullscreen: 'true',
                width: '100%',
                height: '100%'
            });

            container.appendChild(iframe);

            // 3. Persistence via Hash Listener
            // The viewer updates the hash (#page=2) as you scroll.
            // We can poll this safely without cross-origin hacks if same-origin.

            let lastSavedPage = initialPage;

            // Poll for page changes via URL hash (Robust & Simple)
            this.pdfPollInterval = setInterval(() => {
                try {
                    if (iframe.contentWindow && iframe.contentWindow.location) {
                        const hash = iframe.contentWindow.location.hash; // e.g. "#page=5&zoom=auto,-13,770"
                        const match = hash.match(/page=(\d+)/);
                        if (match) {
                            const pageNum = parseInt(match[1]);
                            if (pageNum !== lastSavedPage && this.currentLecture) {
                                lastSavedPage = pageNum;
                                this.currentLecture.lastPosition = pageNum;
                                DB.put('lectures', this.currentLecture);
                            }
                        }
                    }
                } catch (e) {
                    // Security/Cross-origin block if somehow origin differs
                }
            }, 1000); // Check every second

            // Cleanup interval on removal (handled by mutation observer ideally, causing minor leak if not)
            // For now, we attach it to the container for cleanup if we had a comprehensive cleanup system.

        } catch (err) {
            console.error('PDF Load Error:', err);
            container.innerHTML = `<div class="study-fallback">Error loading PDF: ${err.message}</div>`;
        }
    },



    /**
     * Save current position
     */
    async savePosition() {
        if (!this.currentLecture) return;

        if (this.currentLecture.type === 'video' && this.player) {
            this.currentLecture.lastPosition = Math.floor(this.player.currentTime);
            console.log(`[StudyMode] savePosition called. Saving: ${this.currentLecture.lastPosition}s`);
        }
        // If no player active, rely on the last periodic save

        await DB.put('lectures', this.currentLecture);
    },

    toggleComplete() {
        // ... simple toggle logic ...
        // For brevity reusing existing pattern but ensure it calls DB put
        this.currentLecture.completed = !this.currentLecture.completed;
        DB.put('lectures', this.currentLecture);
        this.render(this.activeSessionId);
    },

    showCompletionPrompt() {
        const container = Utils.$('content-area');
        const prompt = Utils.createElement('div', { className: 'completion-prompt' }, [
            Utils.createElement('div', { className: 'completion-icon' }, '🎉'),
            Utils.createElement('div', { className: 'completion-title' }, 'Lecture Completed!'),
            Utils.createElement('div', { className: 'completion-actions' }, [
                Utils.createElement('button', {
                    className: 'btn btn-primary',
                    onClick: async () => await this.goToNextLecture()
                }, 'Next Lecture →'),
                Utils.createElement('button', {
                    className: 'btn btn-secondary',
                    onClick: async () => await this.exit()
                }, 'Back to List'),
                Utils.createElement('button', {
                    className: 'btn btn-secondary',
                    onClick: () => prompt.remove()
                }, 'Stay Here')
            ])
        ]);
        container.appendChild(prompt);
    },

    /**
     * Robust Cleanup
     */
    cleanup() {
        // 1. Destroy Plyr
        if (this.player) {
            try {
                this.player.destroy(); // This also pauses video
            } catch (e) {
                console.warn('Plyr destroy failed', e);
            }
            this.player = null;
        }

        // 2. Kill Object URL (Critical for memory)
        if (this.currentObjectURL) {
            URL.revokeObjectURL(this.currentObjectURL);
            this.currentObjectURL = null;
        }

        // 3. Aggressive Media Cleanup (for native elements if Plyr failed)
        document.querySelectorAll('video, audio').forEach(el => {
            el.pause();
            el.src = '';
            el.load();
        });

        // 4. Reset State
        this.currentLecture = null;
        this.currentFile = null;

        // 5. Clear Intervals
        if (this.pdfPollInterval) {
            clearInterval(this.pdfPollInterval);
            this.pdfPollInterval = null;
        }
    },

    async goToNextLecture() {
        const lectures = await AppState.getLectures(this.currentLecture.courseId);
        const idx = lectures.findIndex(l => l.id === this.currentLecture.id);
        for (let i = idx + 1; i < lectures.length; i++) {
            if (!lectures[i].completed) {
                await this.enter(lectures[i].id);
                return;
            }
        }
        await this.exit();
    }
};

window.StudyMode = StudyMode;
