# Omni Source Import Database Specification

Status: Draft for implementation  
Architecture: [Universal Source Import Architecture v1.0](../01-architecture/universal-source-import-architecture-v1.md)

## Goals

- Add universal source/import tables without breaking existing courses, modules, videos, notes, or Telegram cache tables.
- Preserve existing import flows while Telegram migrates first.
- Make discovery cache reusable for repeated preview filtering without rescanning.
- Keep search and metadata indexes rebuildable from permanent imported content.

## Migration Plan

Add migration `005_universal_source_import`.

Existing tables remain intact. The migration only adds tables and safe columns.

```sql
ALTER TABLE videos ADD COLUMN source_metadata TEXT DEFAULT '{}';
```

The migration must check for column existence before adding `source_metadata`, matching the existing migration style in `server/database.js`.

## Tables

### sources

Stores configured or discovered external sources.

```sql
CREATE TABLE sources (
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
);
```

Indexes:

```sql
CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_health ON sources(health_state);
CREATE INDEX idx_sources_updated ON sources(updated_at);
```

### source_discoveries

Metadata-only scan cache. Records are temporary/cacheable and safe to rebuild.

```sql
CREATE TABLE source_discoveries (
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
);
```

Indexes:

```sql
CREATE INDEX idx_discoveries_source ON source_discoveries(source_id);
CREATE INDEX idx_discoveries_topic ON source_discoveries(source_id, topic_key);
CREATE INDEX idx_discoveries_kind ON source_discoveries(source_id, media_kind);
CREATE INDEX idx_discoveries_date ON source_discoveries(source_id, source_date);
CREATE INDEX idx_discoveries_lifecycle ON source_discoveries(lifecycle_state);
```

### imported_items

Permanent source-of-truth for imported content references.

```sql
CREATE TABLE imported_items (
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
);
```

Indexes:

```sql
CREATE INDEX idx_imported_source ON imported_items(source_id);
CREATE INDEX idx_imported_course ON imported_items(course_id);
CREATE INDEX idx_imported_video ON imported_items(video_id);
CREATE INDEX idx_imported_type ON imported_items(media_type);
CREATE INDEX idx_imported_lifecycle ON imported_items(lifecycle_state);
```

### metadata_store

Durable normalized metadata derived from imported items.

```sql
CREATE TABLE metadata_store (
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
);
```

Indexes:

```sql
CREATE INDEX idx_metadata_source ON metadata_store(source_id);
CREATE INDEX idx_metadata_course ON metadata_store(course_id);
CREATE INDEX idx_metadata_type ON metadata_store(media_type);
CREATE INDEX idx_metadata_date ON metadata_store(source_date);
```

### search_index

Disposable and rebuildable optimized search data.

```sql
CREATE TABLE search_index (
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
);
```

Indexes:

```sql
CREATE INDEX idx_search_source ON search_index(source_id);
CREATE INDEX idx_search_course ON search_index(course_id);
CREATE INDEX idx_search_type ON search_index(media_type);
```

### source_jobs

Background job state for scans, previews, imports, syncs, indexing, and future workers.

```sql
CREATE TABLE source_jobs (
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
);
```

Indexes:

```sql
CREATE INDEX idx_jobs_source ON source_jobs(source_id);
CREATE INDEX idx_jobs_status_priority ON source_jobs(status, priority);
CREATE INDEX idx_jobs_type ON source_jobs(job_type);
CREATE INDEX idx_jobs_created ON source_jobs(created_at);
```

## Compatibility Rules

- Existing `telegram_sources`, `telegram_media_index`, and `telegram_parse_rules` remain during the first migration.
- Telegram v1 source rows may be backfilled lazily when a Telegram course is opened or updated.
- Existing course/module/video APIs must continue returning the same shapes.
- `videos.source_metadata` stores the bridge from existing video rows to new `imported_items`.

## Rebuild Rules

- `source_discoveries` can be refreshed by rescanning.
- `metadata_store` can be rebuilt from `imported_items`.
- `search_index` can be rebuilt from `metadata_store`.
- `imported_items` must not be rebuilt from indexes; it is the permanent source of truth.
