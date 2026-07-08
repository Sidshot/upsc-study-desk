/**
 * MyStudy Server — Database Layer
 * 
 * SQLite database using sql.js (pure JavaScript, no native deps).
 * Auto-saves to disk after write operations.
 * 
 * Data directory: %APPDATA%/MyStudy/ (Windows) or ~/.config/MyStudy/ (Linux/Mac)
 */

import initSqlJs from 'sql.js'
import path from 'path'
import fs from 'fs'
import os from 'os'

let db = null
let dbPath = null
let saveTimer = null

/**
 * Get the application data directory
 */
export function getDataDir() {
    const platform = os.platform()
    let baseDir

    if (platform === 'win32') {
        baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    } else if (platform === 'darwin') {
        baseDir = path.join(os.homedir(), 'Library', 'Application Support')
    } else {
        baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    }

    const myStudyDir = path.join(baseDir, 'MyStudy')
    const tutInDir = path.join(baseDir, 'TutIn')

    // Data migration: rename old TutIn folder to MyStudy if it exists
    if (!fs.existsSync(myStudyDir) && fs.existsSync(tutInDir)) {
        try {
            fs.renameSync(tutInDir, myStudyDir)
            console.log(`[Migration] Moved existing database folder from TutIn to MyStudy`)
        } catch (e) {
            console.error(`[Migration Error] Failed to rename ${tutInDir} to ${myStudyDir}:`, e)
        }
    }

    return myStudyDir
}

/**
 * Ensure all data directories exist
 */
function ensureDirectories() {
    const dataDir = getDataDir()
    const dirs = [
        dataDir,
        path.join(dataDir, 'transcripts'),
        path.join(dataDir, 'summaries'),
        path.join(dataDir, 'backups', 'auto'),
        path.join(dataDir, 'backups', 'manual'),
    ]

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
    }

    return dataDir
}

/**
 * Write the in-memory database to disk
 */
function writeToDisk() {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
}

/**
 * Save database to disk (debounced)
 */
export function saveDatabase() {
    if (!db || !dbPath) return

    // Debounce: save after 100ms of no writes
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        try {
            writeToDisk()
        } catch (err) {
            console.error('[Database] Save failed:', err.message)
        }
    }, 100)
}

/**
 * Force save database to disk immediately
 */
export function saveDatabaseSync() {
    if (!db || !dbPath) return
    if (saveTimer) clearTimeout(saveTimer)
    try {
        writeToDisk()
    } catch (err) {
        console.error('[Database] Save failed:', err.message)
    }
}

/**
 * Initialize the database and run migrations
 */
export async function initDatabase() {
    if (db) return db

    const dataDir = ensureDirectories()
    dbPath = path.join(dataDir, 'tutin.db')

    console.log(`[Database] Opening: ${dbPath}`)

    const SQL = await initSqlJs()

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath)
        db = new SQL.Database(fileBuffer)
        console.log('[Database] Loaded existing database')
    } else {
        db = new SQL.Database()
        console.log('[Database] Created new database')
    }

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON')

    // Run schema migration
    runMigrations()

    // Save after migration
    saveDatabaseSync()

    console.log('[Database] Ready')
    return db
}

/**
 * Get the database instance
 */
export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.')
    }
    return db
}

/**
 * Close the database connection and save
 */
export function closeDatabase() {
    if (db) {
        saveDatabaseSync()
        db.close()
        db = null
        console.log('[Database] Closed')
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Run a query that modifies data (INSERT, UPDATE, DELETE)
 * Auto-saves after write.
 */
export function run(sql, params = []) {
    db.run(sql, params)
    saveDatabase()
}

/**
 * Run a write query without scheduling an immediate save.
 * Use only inside transaction() blocks so the final commit saves once.
 */
export function runInTransaction(sql, params = []) {
    db.run(sql, params)
}

/**
 * Get a single row
 */
export function getOne(sql, params = []) {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    let result = null
    if (stmt.step()) {
        result = stmt.getAsObject()
    }
    stmt.free()
    return result
}

/**
 * Get all rows
 */
export function getAll(sql, params = []) {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const results = []
    while (stmt.step()) {
        results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
}

/**
 * Run multiple statements in a transaction
 */
export function transaction(fn) {
    db.run('BEGIN TRANSACTION')
    try {
        fn()
        db.run('COMMIT')
        saveDatabase()
    } catch (err) {
        db.run('ROLLBACK')
        throw err
    }
}

// ============================================
// MIGRATIONS
// ============================================

function runMigrations() {
    // Create migrations tracking table
    db.run(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
    `)

    const applied = new Set(
        getAll('SELECT name FROM _migrations').map(r => r.name)
    )

    const migrations = [
        { name: '001_initial_schema', fn: migration001 },
        { name: '002_subtitles_dubbing_schema', fn: migration002 },
        { name: '003_video_types', fn: migration003 },
        { name: '004_telegram_index', fn: migration004 },
        { name: '005_universal_source_import', fn: migration005 },
        { name: '006_checkpoints_revision_queue', fn: migration006 },
    ]

    for (const migration of migrations) {
        if (!applied.has(migration.name)) {
            console.log(`[Database] Running migration: ${migration.name}`)
            migration.fn()
            run(
                'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
                [migration.name, new Date().toISOString()]
            )
            console.log(`[Database] Migration complete: ${migration.name}`)
        }
    }
}

/**
 * Migration 001: Initial schema — all tables
 */
function migration001() {
    const statements = [
        // COURSES
        `CREATE TABLE courses (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            original_title TEXT,
            description TEXT DEFAULT '',
            instructor TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            thumbnail_data TEXT,
            folder_path TEXT,
            source_type TEXT DEFAULT 'local',
            course_url TEXT,
            date_added TEXT,
            date_modified TEXT,
            last_accessed TEXT,
            last_accessed_click_time TEXT,
            total_duration REAL DEFAULT 0,
            total_videos INTEGER DEFAULT 0,
            completed_videos INTEGER DEFAULT 0,
            completion_percentage REAL DEFAULT 0,
            custom_metadata TEXT DEFAULT '{}',
            "order" INTEGER
        )`,

        // MODULES
        `CREATE TABLE modules (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            parent_module_id TEXT,
            title TEXT NOT NULL,
            original_title TEXT,
            description TEXT DEFAULT '',
            thumbnail_data TEXT,
            folder_path TEXT,
            "order" INTEGER DEFAULT 0,
            total_duration REAL DEFAULT 0,
            total_videos INTEGER DEFAULT 0,
            completed_videos INTEGER DEFAULT 0,
            date_added TEXT,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_module_id) REFERENCES modules(id) ON DELETE SET NULL
        )`,
        `CREATE INDEX idx_modules_course ON modules(course_id)`,
        `CREATE INDEX idx_modules_parent ON modules(parent_module_id)`,

        // VIDEOS
        `CREATE TABLE videos (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            module_id TEXT NOT NULL,
            title TEXT NOT NULL,
            original_title TEXT,
            description TEXT DEFAULT '',
            file_name TEXT DEFAULT '',
            file_path TEXT,
            file_size INTEGER DEFAULT 0,
            duration REAL DEFAULT 0,
            thumbnail_data TEXT,
            "order" INTEGER DEFAULT 0,
            is_required INTEGER DEFAULT 1,
            is_completed INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            watch_progress REAL DEFAULT 0,
            last_watched_position REAL DEFAULT 0,
            last_watched_at TEXT,
            completed_at TEXT,
            watch_count INTEGER DEFAULT 0,
            tags TEXT DEFAULT '[]',
            bookmarks TEXT DEFAULT '[]',
            youtube_id TEXT,
            url TEXT,
            has_transcript INTEGER DEFAULT 0,
            has_summary INTEGER DEFAULT 0,
            transcript_generated_at TEXT,
            summary_generated_at TEXT,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX idx_videos_course ON videos(course_id)`,
        `CREATE INDEX idx_videos_module ON videos(module_id)`,
        `CREATE INDEX idx_videos_last_watched ON videos(last_watched_at)`,

        // NOTES
        `CREATE TABLE notes (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            course_id TEXT NOT NULL,
            timestamp REAL DEFAULT 0,
            content TEXT DEFAULT '',
            images TEXT DEFAULT '[]',
            tags TEXT DEFAULT '[]',
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX idx_notes_video ON notes(video_id)`,
        `CREATE INDEX idx_notes_course ON notes(course_id)`,

        // ANALYTICS
        `CREATE TABLE analytics (
            id TEXT PRIMARY KEY,
            date TEXT UNIQUE NOT NULL,
            watch_time_seconds REAL DEFAULT 0,
            videos_watched INTEGER DEFAULT 0,
            videos_completed INTEGER DEFAULT 0,
            courses_accessed TEXT DEFAULT '[]',
            sessions_count INTEGER DEFAULT 0
        )`,

        // WATCH SESSIONS
        `CREATE TABLE watch_sessions (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            course_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration_seconds REAL DEFAULT 0,
            start_position REAL DEFAULT 0,
            end_position REAL DEFAULT 0,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX idx_sessions_video ON watch_sessions(video_id)`,
        `CREATE INDEX idx_sessions_date ON watch_sessions(started_at)`,

        // INSTRUCTORS
        `CREATE TABLE instructors (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            display_name TEXT,
            avatar_data TEXT,
            updated_at TEXT
        )`,

        // ROADMAPS
        `CREATE TABLE roadmaps (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            nodes TEXT DEFAULT '[]',
            connections TEXT DEFAULT '[]',
            viewport TEXT DEFAULT '{}',
            is_active INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )`,

        // SETTINGS
        `CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT
        )`,

        // Note: Full-text search will use LIKE queries for now.
        // FTS5 requires a custom sql.js build.
    ]

    for (const sql of statements) {
        db.run(sql)
    }
}

/**
 * Migration 002: Subtitles and Dubbing Schema
 */
function migration002() {
    const statements = [
        // Add subtitle_sources column to videos (SQLite doesn't support IF NOT EXISTS for columns, so we try/catch)
        // We do this by checking if the column exists first using PRAGMA
        `
        CREATE TABLE IF NOT EXISTS dub_jobs (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            language TEXT NOT NULL,
            status TEXT DEFAULT 'queued',
            step TEXT,
            progress INTEGER DEFAULT 0,
            audio_path TEXT,
            file_size INTEGER,
            error_message TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        );
        `
    ]

    for (const stmt of statements) {
        db.run(stmt)
    }

    // Add subtitle_sources to videos if it doesn't exist
    const columns = getAll("PRAGMA table_info(videos)")
    const hasSubtitleSources = columns.some(col => col.name === 'subtitle_sources')
    if (!hasSubtitleSources) {
        db.run("ALTER TABLE videos ADD COLUMN subtitle_sources TEXT DEFAULT '[]'")
    }
}

/**
 * Migration 003: Video types (video vs pdf)
 */
function migration003() {
    const columns = getAll("PRAGMA table_info(videos)")
    const hasType = columns.some(col => col.name === 'type')
    if (!hasType) {
        db.run("ALTER TABLE videos ADD COLUMN type TEXT DEFAULT 'video'")
    }
}

/**
 * Migration 004: Telegram source index and per-group parsing rules.
 */
function migration004() {
    const statements = [
        `CREATE TABLE IF NOT EXISTS telegram_sources (
            chat_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            is_forum INTEGER DEFAULT 0,
            access_hash TEXT,
            last_scanned_at TEXT,
            last_message_id INTEGER DEFAULT 0,
            media_count INTEGER DEFAULT 0,
            custom_metadata TEXT DEFAULT '{}'
        )`,
        `CREATE TABLE IF NOT EXISTS telegram_media_index (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            topic_id TEXT,
            topic_title TEXT,
            message_id INTEGER NOT NULL,
            message_date INTEGER DEFAULT 0,
            file_name TEXT DEFAULT '',
            mime_type TEXT DEFAULT '',
            media_type TEXT DEFAULT 'video',
            file_size INTEGER DEFAULT 0,
            duration REAL DEFAULT 0,
            caption TEXT DEFAULT '',
            raw_json TEXT DEFAULT '{}',
            indexed_at TEXT NOT NULL,
            UNIQUE(chat_id, topic_id, message_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_tg_media_chat ON telegram_media_index(chat_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tg_media_topic ON telegram_media_index(chat_id, topic_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tg_media_message ON telegram_media_index(chat_id, message_id)`,
        `CREATE TABLE IF NOT EXISTS telegram_parse_rules (
            chat_id TEXT PRIMARY KEY,
            rules_json TEXT DEFAULT '{}',
            updated_at TEXT NOT NULL
        )`,
    ]

    for (const stmt of statements) {
        db.run(stmt)
    }
}

/**
 * Migration 005: Universal source import foundation.
 */
function migration005() {
    const videoColumns = getAll("PRAGMA table_info(videos)")
    const hasSourceMetadata = videoColumns.some(col => col.name === 'source_metadata')
    if (!hasSourceMetadata) {
        db.run("ALTER TABLE videos ADD COLUMN source_metadata TEXT DEFAULT '{}'")
    }

    const statements = [
        `CREATE TABLE IF NOT EXISTS sources (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'created',
            health_state TEXT DEFAULT 'disconnected',
            capabilities_json TEXT DEFAULT '{}',
            rules_json TEXT DEFAULT '{}',
            discovery_cursor_json TEXT DEFAULT '{}',
            sync_cursor_json TEXT DEFAULT '{}',
            last_scanned_at TEXT,
            last_imported_at TEXT,
            last_error_json TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type)`,
        `CREATE INDEX IF NOT EXISTS idx_sources_health ON sources(health_state)`,
        `CREATE INDEX IF NOT EXISTS idx_sources_updated ON sources(updated_at)`,

        `CREATE TABLE IF NOT EXISTS source_discoveries (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            source_item_key TEXT NOT NULL,
            parent_key TEXT,
            topic_key TEXT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            file_name TEXT DEFAULT '',
            mime_type TEXT DEFAULT '',
            media_kind TEXT DEFAULT 'other',
            file_size INTEGER DEFAULT 0,
            duration REAL DEFAULT 0,
            source_date INTEGER DEFAULT 0,
            sender TEXT DEFAULT '',
            raw_json TEXT DEFAULT '{}',
            lifecycle_state TEXT DEFAULT 'discovered',
            discovered_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
            UNIQUE(source_id, source_item_key)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_discoveries_source ON source_discoveries(source_id)`,
        `CREATE INDEX IF NOT EXISTS idx_discoveries_topic ON source_discoveries(source_id, topic_key)`,
        `CREATE INDEX IF NOT EXISTS idx_discoveries_kind ON source_discoveries(source_id, media_kind)`,
        `CREATE INDEX IF NOT EXISTS idx_discoveries_date ON source_discoveries(source_id, source_date)`,
        `CREATE INDEX IF NOT EXISTS idx_discoveries_lifecycle ON source_discoveries(lifecycle_state)`,

        `CREATE TABLE IF NOT EXISTS imported_items (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            source_item_key TEXT NOT NULL,
            course_id TEXT,
            module_id TEXT,
            video_id TEXT,
            schema_version INTEGER DEFAULT 1,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            media_type TEXT DEFAULT 'other',
            mime_type TEXT DEFAULT '',
            file_name TEXT DEFAULT '',
            file_size INTEGER DEFAULT 0,
            duration REAL DEFAULT 0,
            thumbnail_data TEXT,
            metadata_json TEXT DEFAULT '{}',
            lifecycle_state TEXT DEFAULT 'imported',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
            FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
            UNIQUE(source_id, source_item_key)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_imported_source ON imported_items(source_id)`,
        `CREATE INDEX IF NOT EXISTS idx_imported_course ON imported_items(course_id)`,
        `CREATE INDEX IF NOT EXISTS idx_imported_video ON imported_items(video_id)`,
        `CREATE INDEX IF NOT EXISTS idx_imported_type ON imported_items(media_type)`,
        `CREATE INDEX IF NOT EXISTS idx_imported_lifecycle ON imported_items(lifecycle_state)`,

        `CREATE TABLE IF NOT EXISTS metadata_store (
            id TEXT PRIMARY KEY,
            imported_item_id TEXT NOT NULL,
            source_id TEXT NOT NULL,
            course_id TEXT,
            video_id TEXT,
            title TEXT DEFAULT '',
            description TEXT DEFAULT '',
            caption TEXT DEFAULT '',
            file_name TEXT DEFAULT '',
            source_name TEXT DEFAULT '',
            topic_name TEXT DEFAULT '',
            media_type TEXT DEFAULT 'other',
            source_date INTEGER DEFAULT 0,
            fields_json TEXT DEFAULT '{}',
            updated_at TEXT NOT NULL,
            FOREIGN KEY (imported_item_id) REFERENCES imported_items(id) ON DELETE CASCADE,
            UNIQUE(imported_item_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_metadata_source ON metadata_store(source_id)`,
        `CREATE INDEX IF NOT EXISTS idx_metadata_course ON metadata_store(course_id)`,
        `CREATE INDEX IF NOT EXISTS idx_metadata_type ON metadata_store(media_type)`,
        `CREATE INDEX IF NOT EXISTS idx_metadata_date ON metadata_store(source_date)`,

        `CREATE TABLE IF NOT EXISTS search_index (
            id TEXT PRIMARY KEY,
            imported_item_id TEXT NOT NULL,
            search_text TEXT NOT NULL,
            title TEXT DEFAULT '',
            media_type TEXT DEFAULT 'other',
            source_id TEXT,
            course_id TEXT,
            rank_weight REAL DEFAULT 1,
            indexed_at TEXT NOT NULL,
            FOREIGN KEY (imported_item_id) REFERENCES imported_items(id) ON DELETE CASCADE,
            UNIQUE(imported_item_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_search_source ON search_index(source_id)`,
        `CREATE INDEX IF NOT EXISTS idx_search_course ON search_index(course_id)`,
        `CREATE INDEX IF NOT EXISTS idx_search_type ON search_index(media_type)`,

        `CREATE TABLE IF NOT EXISTS source_jobs (
            id TEXT PRIMARY KEY,
            source_id TEXT,
            job_type TEXT NOT NULL,
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'queued',
            progress INTEGER DEFAULT 0,
            rules_snapshot_json TEXT DEFAULT '{}',
            counters_json TEXT DEFAULT '{}',
            cursor_json TEXT DEFAULT '{}',
            error_json TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_jobs_source ON source_jobs(source_id)`,
        `CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON source_jobs(status, priority)`,
        `CREATE INDEX IF NOT EXISTS idx_jobs_type ON source_jobs(job_type)`,
        `CREATE INDEX IF NOT EXISTS idx_jobs_created ON source_jobs(created_at)`,
    ]

    for (const stmt of statements) {
        db.run(stmt)
    }
}

/**
 * Migration 006: Checkpoints and global revision queue
 */
function migration006() {
    const statements = [
        `CREATE TABLE IF NOT EXISTS checkpoints (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            note_id TEXT,
            anchor_kind TEXT NOT NULL DEFAULT 'timestamp',
            anchor_value TEXT,
            checkpoint_type TEXT NOT NULL,
            text TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_checkpoints_video_anchor ON checkpoints(video_id, anchor_kind, created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_checkpoints_course_created ON checkpoints(course_id, created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_checkpoints_note ON checkpoints(note_id)`,
        `CREATE TABLE IF NOT EXISTS revision_queue (
            id TEXT PRIMARY KEY,
            checkpoint_id TEXT,
            course_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            note_id TEXT,
            display_title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            due_at TEXT NOT NULL,
            urgency INTEGER NOT NULL DEFAULT 1,
            origin TEXT NOT NULL DEFAULT 'checkpoint',
            anchor_kind TEXT NOT NULL DEFAULT 'timestamp',
            anchor_value TEXT,
            checkpoint_type TEXT,
            completed_at TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_revision_queue_status_due ON revision_queue(status, due_at, urgency)`,
        `CREATE INDEX IF NOT EXISTS idx_revision_queue_video ON revision_queue(video_id)`,
        `CREATE INDEX IF NOT EXISTS idx_revision_queue_checkpoint ON revision_queue(checkpoint_id)`,
        `CREATE INDEX IF NOT EXISTS idx_revision_queue_course ON revision_queue(course_id)`,
    ]

    for (const sql of statements) {
        db.run(sql)
    }
}
