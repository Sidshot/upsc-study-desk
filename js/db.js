/**
 * UPSC Study Desk - Database Module
 * IndexedDB wrapper for persistent storage
 */

const DB = {
    name: 'upsc-study-desk',
    version: 2,  // Bumped for config store
    db: null,

    // Object store definitions
    stores: {
        papers: { keyPath: 'id' },
        providers: { keyPath: 'id', indexes: [{ name: 'paperId', keyPath: 'paperId' }] },
        courses: { keyPath: 'id', indexes: [{ name: 'providerId', keyPath: 'providerId' }] },
        lectures: { keyPath: 'id', indexes: [{ name: 'courseId', keyPath: 'courseId' }] },
        notes: { keyPath: 'id', indexes: [{ name: 'lectureId', keyPath: 'lectureId' }] },
        config: { keyPath: 'id' }  // For storing app config like master folder handle
    },

    /**
     * Initialize the database
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onerror = () => {
                console.error('Database error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createStores(db);
            };
        });
    },

    /**
     * Create object stores during upgrade
     * @param {IDBDatabase} db
     */
    createStores(db) {
        Object.entries(this.stores).forEach(([name, config]) => {
            if (!db.objectStoreNames.contains(name)) {
                const store = db.createObjectStore(name, { keyPath: config.keyPath });

                // Create indexes
                if (config.indexes) {
                    config.indexes.forEach(index => {
                        store.createIndex(index.name, index.keyPath, { unique: false });
                    });
                }

                console.log(`Created object store: ${name}`);
            }
        });
    },

    /**
     * Seed initial data (papers)
     */
    async seed() {
        const papers = await this.getAll('papers');

        if (papers.length === 0) {
            console.log('Seeding initial papers...');

            const initialPapers = [
                { id: 'gs1', name: 'GS1', fullName: 'General Studies 1', icon: '📚', orderIndex: 0 },
                { id: 'gs2', name: 'GS2', fullName: 'General Studies 2', icon: '📖', orderIndex: 1 },
                { id: 'gs3', name: 'GS3', fullName: 'General Studies 3', icon: '📕', orderIndex: 2 },
                { id: 'gs4', name: 'GS4', fullName: 'General Studies 4 (Ethics)', icon: '📗', orderIndex: 3 },
                { id: 'csat', name: 'CSAT', fullName: 'Civil Services Aptitude Test', icon: '📘', orderIndex: 4 },
                { id: 'optional', name: 'Optional', fullName: 'Optional Subject', icon: '📙', orderIndex: 5 },
                { id: 'extra', name: 'Extra', fullName: 'Additional Resources', icon: '📓', orderIndex: 6 }
            ];

            for (const paper of initialPapers) {
                await this.put('papers', paper);
            }

            console.log('Papers seeded successfully');
        }
    },

    /**
     * Get all records from a store
     * @param {string} storeName
     * @returns {Promise<Array>}
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get a single record by key
     * @param {string} storeName
     * @param {string} key
     * @returns {Promise<Object|undefined>}
     */
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get records by index
     * @param {string} storeName
     * @param {string} indexName
     * @param {string} value
     * @returns {Promise<Array>}
     */
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Put (insert or update) a record
     * @param {string} storeName
     * @param {Object} data
     * @returns {Promise<string>}
     */
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Delete a record
     * @param {string} storeName
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Count records in a store
     * @param {string} storeName
     * @returns {Promise<number>}
     */
    async count(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Count records by index value
     * @param {string} storeName
     * @param {string} indexName
     * @param {string} value
     * @returns {Promise<number>}
     */
    async countByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.count(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear all data from a store
     * @param {string} storeName
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// Make DB globally available
window.DB = DB;
