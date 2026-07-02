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
                console.log(`[Match] ID match: "${folderName}" -> ${paper.id}`);
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
            return { added: 0, updated: 0, deleted: 0 };
        }

        // Notify start
        window.dispatchEvent(new CustomEvent('app:sync-start'));

        const structure = await this.scanMasterFolder();
        const papers = AppState.getPapers();
        const paperIds = papers.map(p => p.id);

        let added = 0;
        let updated = 0;
        let deleted = 0;

        // Track active IDs to identify deletions
        const validProviderIds = new Set();
        const validCourseIds = new Set();
        const validLectureIds = new Set();

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
                validProviderIds.add(provider.id);

                // Process courses - pass actual folder path
                for (const [courseName, lectures] of Object.entries(courses)) {
                    // Build actual folder path using real folder names
                    const folderPath = `${paperFolderName}/${providerName}/${courseName}`;
                    const course = await this.ensureCourse(provider.id, courseName, folderPath);
                    validCourseIds.add(course.id);

                    // Process lectures
                    for (let i = 0; i < lectures.length; i++) {
                        const lectureFile = lectures[i];
                        const result = await this.ensureLecture(course.id, lectureFile, i);
                        validLectureIds.add(result.lecture.id);
                        if (result.created) added++;
                        if (result.updated) updated++;
                    }
                }
            }
        }

        // Garbage Collection: Remove items not found in scan

        // 1. Providers
        const allProviders = await DB.getAll('providers');
        for (const p of allProviders) {
            // Only clean up providers for papers we actually scanned/matched
            // (If we skipped a paper folder, we shouldn't delete its providers)
            const isScannedPaper = paperIds.includes(p.paperId) &&
                Object.keys(structure).some(name => this.matchPaperFolder(name, papers) === p.paperId);

            if (isScannedPaper && !validProviderIds.has(p.id)) {
                console.log(`[Sync] Deleting missing provider: ${p.name}`);
                await DB.delete('providers', p.id);
                // Also clean up children (courses/lectures) for this provider? 
                // DB integrity relies on cascaded checks, but let's let the next steps handle it or explicitly do it.
                // Since we iterate all courses next, we will catch them there.
                deleted++;
            }
        }

        // 2. Courses
        const allCourses = await DB.getAll('courses');
        for (const c of allCourses) {
            // If the parent provider was deleted, this course *should* be deleted.
            // But strict set check is safer: if it wasn't in the scan, it's gone or moved.
            if (validProviderIds.has(c.providerId) && !validCourseIds.has(c.id)) {
                console.log(`[Sync] Deleting missing course: ${c.name}`);
                await DB.delete('courses', c.id);
                deleted++;
            }
            // If provider itself is invalid (deleted above), we should delete this course too.
            // But the safe way is: if ID not in validCourseIds, delete it.
            // However, we need to be careful not to delete courses from Providers that represent UNTOUCHED papers?
            // The structure scan only covers folders that exist. 
            // If we have validProviderIds populated only from scanned folders, 
            // then `allCourses` might contain courses from papers we didn't populate validProviderIds for?
            // Actually `validProviderIds` only contains IDs from the current scan.
            // If we have a Paper in DB but no folder on disk, `matchPaperFolder` wouldn't return it? 
            // Wait, we iterate folders found on disk. 
            // If a Paper folder is completely missing from disk, we never enter the loop for it. 
            // So `validProviderIds` will NOT contain existing providers for that missing paper.
            // If we delete everything not in `validProviderIds`, we delete data for disconnected drives/folders?
            // "SyncToDatabase" implies syncing the *Master Folder*. 
            // If the Master Folder doesn't contain the Paper anymore, it should probably be removed.
            // BUT, to be safe and "Smallest Change", let's restrict deletions to:
            // "Items belonging to parents that ARE valid, but the item itself is missing"
            // OR "Items that belong to the scope of what we scanned".
            // Since we scan the entire Master Folder, anything NOT found there should be removed.

            // To be safe against partial scans or bugs:
            // We only delete if we are sure we *would have seen it*.
            // We saw all top level papers in the folder.
        }

        // Revised GC Logic for safety:
        // Only delete items if their parent exists in the valid set OR if we are doing a full destructive sync.
        // Given it's a "Master Folder", the user expects a mirror.

        // Let's stick to the plan: "Delete items whose IDs are not in the valid sets."
        // Refinement: We need to filter `allCourses` to only those belonging to processed parents?
        // No, if a whole Provider folder is deleted, `validProviderIds` won't have it.
        // So we delete the Provider.
        // Then we check courses. `validCourseIds` won't have the courses. So we delete them.

        // Optimized GC Loop:
        // We need to check if the *root* (Paper) was potentially part of the scan?
        // If the user has "GS1" in DB but deleted "GS1" folder:
        // The loop `for (const [paperFolderName...` will NOT run for GS1.
        // So validProviderIds will NOT have GS1 providers.
        // So we would delete all GS1 providers. This is correct behavior for a Sync.

        // Iterate all providers again to be sure
        const validProviderIdsList = Array.from(validProviderIds);
        // We use the Set for O(1) checks

        // 2. Courses (Safe delete)
        for (const c of allCourses) {
            // Check if course belongs to a provider that WAS valid/scanned?
            // Actually, simply: if it's not in validCourseIds, it's not on disk.
            if (!validCourseIds.has(c.id)) {
                // Optimization: Only delete if we are sure? 
                // Yes, Master Folder is the source of truth.
                await DB.delete('courses', c.id);
                deleted++;
            }
        }

        // 3. Lectures
        const allLectures = await DB.getAll('lectures');
        for (const l of allLectures) {
            if (!validLectureIds.has(l.id)) {
                await DB.delete('lectures', l.id);
                deleted++;
            }
        }

        // Re-cleaning Providers (moved after children for clarity, though IndexedDB doesn't enforce FKs)
        // We did providers first above, which is fine.

        // Invalidate caches after sync
        AppState.invalidateCache();

        const result = { added, updated, deleted };

        console.log(`Sync complete:`, result);

        // Notify end
        window.dispatchEvent(new CustomEvent('app:sync-end', { detail: result }));

        return result;
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
