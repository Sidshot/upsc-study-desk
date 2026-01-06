/**
 * UPSC Study Desk - File System Module
 * Manages master folder access using File System Access API
 */

const FileSystem = {
    // Root directory handle (persisted)
    rootHandle: null,

    // Supported file types
    supportedTypes: {
        video: ['.mp4', '.mkv', '.webm'],
        pdf: ['.pdf']
    },

    /**
     * Check if File System Access API is available
     */
    isSupported() {
        return 'showDirectoryPicker' in window;
    },

    /**
     * Initialize - try to restore saved directory handle
     */
    async init() {
        if (!this.isSupported()) {
            console.log('File System Access API not supported');
            return false;
        }

        // Try to restore from IndexedDB
        const savedHandle = await this.getSavedHandle();
        if (savedHandle) {
            // Verify we still have permission
            const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                this.rootHandle = savedHandle;
                console.log('Restored directory access:', savedHandle.name);
                return true;
            }
        }

        return false;
    },

    /**
     * Prompt user to select master folder
     */
    async selectMasterFolder() {
        if (!this.isSupported()) {
            throw new Error('File System Access API not supported. Please use Chrome or Edge.');
        }

        try {
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            this.rootHandle = handle;
            await this.saveHandle(handle);
            console.log('Master folder selected:', handle.name);

            return handle;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('User cancelled folder selection');
                return null;
            }
            throw err;
        }
    },

    /**
     * Save directory handle to IndexedDB for persistence
     */
    async saveHandle(handle) {
        await DB.put('config', { id: 'masterFolder', handle: handle, name: handle.name });
    },

    /**
     * Get saved directory handle from IndexedDB
     */
    async getSavedHandle() {
        const config = await DB.get('config', 'masterFolder');
        return config ? config.handle : null;
    },

    /**
     * Check if master folder is configured
     */
    hasMasterFolder() {
        return this.rootHandle !== null;
    },

    /**
     * Get master folder name
     */
    getMasterFolderName() {
        return this.rootHandle ? this.rootHandle.name : null;
    },

    /**
     * Request permission to access saved folder
     */
    async requestPermission() {
        if (!this.rootHandle) return false;

        const permission = await this.rootHandle.requestPermission({ mode: 'readwrite' });
        return permission === 'granted';
    },

    /**
     * Get or create a subfolder path
     * @param {string} path - Path like "GS1/Vision IAS/Polity"
     * @returns {FileSystemDirectoryHandle}
     */
    async getOrCreateFolder(path) {
        if (!this.rootHandle) throw new Error('No master folder configured');

        const parts = path.split('/').filter(p => p.trim());
        let current = this.rootHandle;

        for (const part of parts) {
            current = await current.getDirectoryHandle(part, { create: true });
        }

        return current;
    },

    /**
     * Write a file to a folder
     * @param {FileSystemDirectoryHandle} folderHandle
     * @param {File} file
     */
    async writeFile(folderHandle, file) {
        const fileHandle = await folderHandle.getFileHandle(file.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
        return fileHandle;
    },

    /**
     * Read a file from a handle
     * @param {FileSystemFileHandle} fileHandle
     */
    async readFile(fileHandle) {
        return await fileHandle.getFile();
    },

    /**
     * Scan the master folder and return structure
     * @returns {Object} Nested structure matching Paper/Provider/Course/Lectures
     */
    async scanMasterFolder() {
        if (!this.rootHandle) throw new Error('No master folder configured');

        const structure = {};

        // Scan papers (top-level folders)
        for await (const [name, handle] of this.rootHandle) {
            if (handle.kind === 'directory') {
                structure[name] = await this.scanPaperFolder(handle);
            }
        }

        return structure;
    },

    /**
     * Scan a paper folder for providers
     */
    async scanPaperFolder(paperHandle) {
        const providers = {};

        for await (const [name, handle] of paperHandle) {
            if (handle.kind === 'directory') {
                providers[name] = await this.scanProviderFolder(handle);
            }
        }

        return providers;
    },

    /**
     * Scan a provider folder for courses
     */
    async scanProviderFolder(providerHandle) {
        const courses = {};

        for await (const [name, handle] of providerHandle) {
            if (handle.kind === 'directory') {
                courses[name] = await this.scanCourseFolder(handle);
            }
        }

        return courses;
    },

    /**
     * Scan a course folder for lectures (files)
     */
    async scanCourseFolder(courseHandle) {
        const lectures = [];

        for await (const [name, handle] of courseHandle) {
            if (handle.kind === 'file') {
                const type = this.classifyFile(name);
                if (type) {
                    lectures.push({
                        name: name,
                        handle: handle,
                        type: type
                    });
                }
            }
        }

        // Sort by filename
        lectures.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        return lectures;
    },

    /**
     * Classify a file by its extension
     * @param {string} filename
     * @returns {string|null} 'video', 'pdf', or null
     */
    classifyFile(filename) {
        const ext = '.' + filename.split('.').pop().toLowerCase();

        if (this.supportedTypes.video.includes(ext)) return 'video';
        if (this.supportedTypes.pdf.includes(ext)) return 'pdf';

        return null;
    },

    /**
     * Get clean title from filename
     * @param {string} filename - e.g., "01_Introduction_to_Polity.mp4"
     * @returns {string} - e.g., "01 Introduction to Polity"
     */
    getTitleFromFilename(filename) {
        // Remove extension
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        // Replace underscores and hyphens with spaces
        const cleaned = nameWithoutExt.replace(/[_-]/g, ' ');
        // Trim extra spaces
        return cleaned.replace(/\s+/g, ' ').trim();
    },

    /**
     * Normalize a folder name for matching (remove spaces, special chars)
     * @param {string} name - Folder name like "GS 1" or "GS-1"
     * @returns {string} - Normalized like "gs1"
     */
    normalizeName(name) {
        return name.toLowerCase().replace(/[\s\-_]/g, '');
    },

    /**
     * Match a paper folder name to a paper ID
     * Handles variations like "GS 1", "GS-1", "GS1", "General Studies 1"
     * @param {string} folderName 
     * @param {Array} papers 
     * @returns {string|null} Paper ID or null
     */
    matchPaperFolder(folderName, papers) {
        const normalized = this.normalizeName(folderName);

        for (const paper of papers) {
            // Match against paper ID (gs1, gs2, etc.)
            if (this.normalizeName(paper.id) === normalized) {
                return paper.id;
            }

            // Match against paper name (GS1, GS2, etc.)
            if (this.normalizeName(paper.name) === normalized) {
                return paper.id;
            }

            // Match against full name (General Studies 1, etc.)
            if (this.normalizeName(paper.fullName) === normalized) {
                return paper.id;
            }

            // Special handling for "gs 1" -> "gs1", "gs 2" -> "gs2" pattern
            const numericMatch = normalized.match(/^(gs|csat|optional|extra)(\d*)$/);
            if (numericMatch) {
                const paperIdNorm = this.normalizeName(paper.id);
                if (paperIdNorm === numericMatch[0]) {
                    return paper.id;
                }
            }
        }

        return null;
    },

    /**
     * Sync folder structure to database
     * Creates/updates providers, courses, lectures based on folder scan
     */
    async syncToDatabase() {
        if (!this.rootHandle) {
            console.log('No master folder configured, skipping sync');
            return { added: 0, updated: 0 };
        }

        const structure = await this.scanMasterFolder();
        const papers = AppState.getPapers();
        const paperIds = papers.map(p => p.id);

        let added = 0;
        let updated = 0;

        // Process each paper folder
        for (const [paperFolderName, providers] of Object.entries(structure)) {
            // Match folder name to paper ID (flexible matching)
            const paperId = this.matchPaperFolder(paperFolderName, papers);

            if (!paperId) {
                console.log(`Skipping unknown paper folder: ${paperFolderName}`);
                continue;
            }

            console.log(`Matched folder "${paperFolderName}" to paper: ${paperId}`);

            // Process providers
            for (const [providerName, courses] of Object.entries(providers)) {
                const provider = await this.ensureProvider(paperId, providerName);

                // Process courses - pass actual folder path
                for (const [courseName, lectures] of Object.entries(courses)) {
                    // Build actual folder path using real folder names
                    const folderPath = `${paperFolderName}/${providerName}/${courseName}`;
                    const course = await this.ensureCourse(provider.id, courseName, folderPath);

                    // Process lectures
                    for (let i = 0; i < lectures.length; i++) {
                        const lectureFile = lectures[i];
                        const result = await this.ensureLecture(course.id, lectureFile, i);
                        if (result.created) added++;
                        if (result.updated) updated++;
                    }
                }
            }
        }

        // Invalidate caches after sync
        AppState.invalidateCache();

        console.log(`Sync complete: ${added} added, ${updated} updated`);
        return { added, updated };
    },

    /**
     * Ensure a provider exists, create if not
     */
    async ensureProvider(paperId, name) {
        const existing = await AppState.getProviders(paperId);
        let provider = existing.find(p => p.name.toLowerCase() === name.toLowerCase());

        if (!provider) {
            provider = await AppState.addProvider(paperId, name);
        }

        return provider;
    },

    /**
     * Ensure a course exists, create if not
     * @param {string} providerId
     * @param {string} name
     * @param {string} folderPath - Actual folder path like "GS 1/Provider/Course"
     */
    async ensureCourse(providerId, name, folderPath) {
        const existing = await AppState.getCourses(providerId);
        let course = existing.find(c => c.name.toLowerCase() === name.toLowerCase());

        if (!course) {
            course = await AppState.addCourse(providerId, name);
            console.log(`Created new course: ${name}`);
        }

        // ALWAYS update folderPath during sync (ensures latest path from disk)
        if (folderPath) {
            if (course.folderPath !== folderPath) {
                console.log(`Updating folderPath: "${course.folderPath}" → "${folderPath}"`);
            }
            course.folderPath = folderPath;
            await DB.put('courses', course);
            AppState.invalidateCache();
        }

        return course;
    },

    /**
     * Ensure a lecture exists, create or update
     */
    async ensureLecture(courseId, lectureFile, orderIndex) {
        const existing = await AppState.getLectures(courseId);
        const fileName = lectureFile.name;
        let lecture = existing.find(l => l.fileName === fileName);

        if (!lecture) {
            // Create new lecture
            lecture = await AppState.addLecture(courseId, {
                title: this.getTitleFromFilename(fileName),
                fileName: fileName,
                type: lectureFile.type,
                orderIndex: orderIndex,
                fileHandle: lectureFile.handle
            });
            return { created: true, updated: false, lecture };
        }

        // Update order if changed
        if (lecture.orderIndex !== orderIndex) {
            lecture.orderIndex = orderIndex;
            await DB.put('lectures', lecture);
            return { created: false, updated: true, lecture };
        }

        return { created: false, updated: false, lecture };
    },



    /**
     * Sanitize filename/foldername
     */
    sanitizeName(name) {
        // Replace illegal chars with hyphen, trim whitespace
        return name.replace(/[/\\?%*:|"<>\r\n]/g, '-').trim();
    }
};

// Make FileSystem globally available
window.FileSystem = FileSystem;
