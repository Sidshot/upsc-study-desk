# Omni Universal Source Import Architecture v1.0

Status: Frozen

## Summary

Omni's import system is a universal source pipeline. Telegram is the first fully implemented adapter, but the core architecture is source-agnostic and prepared for local folders, Google Drive, Dropbox, OneDrive, web downloads, and future sources.

The system separates metadata-only discovery, cached previewing, canonical domain mapping, durable import, metadata storage, search, and future AI enrichment.

## Core Pipeline

1. Source Manager owns source configuration, health, capabilities, import rules, cursors, sync status, and errors.
2. Source Adapter handles external communication for one source type.
3. Source Scanner discovers metadata-only items and must never download original content.
4. Discovery Cache stores scan results so filtering and preview changes do not rescan.
5. Preview Builder builds selectable previews from cached discoveries.
6. Domain Mapper converts source-specific discoveries into canonical `OmniImportItem` records.
7. Universal Import Engine persists selected `OmniImportItem` records into Omni.
8. Background Job Manager runs scan, preview, import, sync, and indexing jobs with priority.
9. Event Bus emits standard events for UI, notifications, logs, indexing, analytics, and automation.
10. Metadata Store keeps durable normalized metadata derived from imported items.
11. Search Index keeps optimized query data derived from the Metadata Store.
12. Search Services provide internal query execution.
13. AI Index is future optional enrichment for OCR, transcription, embeddings, summaries, thumbnails, and semantic concepts.
14. Omni Knowledge Library is the user-facing library experience built on imported items, metadata, and search services.

## Canonical Models

- `Source`: id, type, name, status, health state, capabilities, rules, discovery cursor, sync cursor, timestamps, last error.
- `SourceDiscovery`: temporary and cacheable source metadata found by a scan.
- `OmniImportItem`: canonical pre-import item emitted by the Domain Mapper.
- `ImportedItem`: permanent source-of-truth record for imported content.
- `MetadataStoreRecord`: durable searchable metadata derived from imported content.
- `SearchIndexRecord`: rebuildable optimized search record.
- `SourceJob`: background job with type, priority, rule snapshot, progress, counters, cursor, error, timestamps.
- `Event`: standard envelope with name, timestamp, sourceId, jobId, itemId, and payload.

## Data Model Targets

- Add `sources`.
- Add `source_discoveries`.
- Add `imported_items`.
- Add `metadata_store`.
- Add `search_index`.
- Add `source_jobs`.
- Extend existing `videos` with `source_metadata TEXT DEFAULT '{}'`.
- Keep existing course, module, and video tables working during framework introduction.
- Continue using `type` as generic media kind: `video`, `pdf`, `image`, `audio`, `document`, `other`.

## OmniImportItem Shape

```json
{
  "schemaVersion": 1,
  "id": "string",
  "sourceId": "string",
  "sourceItemKey": "string",
  "title": "string",
  "description": "string",
  "mediaType": "video | pdf | image | audio | document | other",
  "mimeType": "string",
  "fileName": "string",
  "size": 0,
  "duration": 0,
  "thumbnail": null,
  "metadata": {},
  "status": "discovered",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

## Adapter Contract v1

- `adapterInterfaceVersion: 1`
- `connect(source)`
- `disconnect(source)`
- `scan(source, rulesSnapshot, discoveryCursor)`
- `sync(source, rulesSnapshot, syncCursor)`
- `health(source)`
- `capabilities(source)`
- `resolveMedia(sourceItem)`

Adapters must not own preview building or importing. Adapters return source-specific discoveries; the Domain Mapper produces `OmniImportItem`.

## Rules, Cursors, And Lifecycles

- Import rules persist per source and are snapshotted when a job starts.
- Import rules include file types, topics/folders, date range, max file size, ignored words, grouping mode, new-only, skip deleted messages, and parser preferences.
- Sources use separate `discoveryCursor` and `syncCursor`.
- Source health states: `connected`, `scanning`, `importing`, `rate_limited`, `auth_expired`, `disconnected`, `partially_synced`, `error`, `maintenance`.
- Source lifecycle: `created`, `connected`, `scanning`, `preview_ready`, `importing`, `imported`, `indexed`, `synced`, with `retry`, `paused`, and `failed` branches.
- Content lifecycle: `discovered`, `selected`, `imported`, `stored`, `indexed`, `available`, `updated`, `archived`, `deleted`.

## Ownership Boundaries

| Layer | Owns |
| --- | --- |
| Source Manager | Source configuration |
| Adapter | External communication |
| Scanner | Discovery |
| Discovery Cache | Temporary discoveries |
| Preview Builder | User preview |
| Domain Mapper | Canonical conversion |
| Import Engine | Persistence |
| Metadata Store | Imported metadata |
| Search Index | Optimized lookup data |
| Search Services | Query execution |
| AI Index | Future enrichment |

## Telegram Release Scope

- Refactor current Telegram import into the first adapter/scanner.
- Telegram scanner discovers channels, forum topics, messages, captions, filenames, MIME types, sizes, durations, dates, sender where available, and stable source keys.
- Telegram scanner writes to Discovery Cache without downloading media.
- Telegram Domain Mapper converts discoveries into `OmniImportItem`.
- Telegram captions/message text become imported item descriptions.
- Images import as `image` items grouped under `Others` with filtering.
- Add filters for videos, PDFs, images, documents, audio, others, topics, date range, size, and new-only.
- Add `Update from Telegram` on Telegram-backed course cards and inside course pages.
- Update flow: scan newer items, cache discoveries, build preview, user selects, import engine appends, duplicates skipped.

## Events, Jobs, And Duplicate Strategy

Event envelope: `name`, `timestamp`, `sourceId`, `jobId`, `itemId`, `payload`.

Event names:

- `source.connected`
- `source.health.changed`
- `source.scan.started`
- `source.scan.progress`
- `source.scan.completed`
- `source.scan.failed`
- `preview.created`
- `preview.updated`
- `import.started`
- `import.progress`
- `import.completed`
- `import.failed`
- `index.started`
- `index.completed`
- `job.created`
- `job.started`
- `job.completed`
- `job.failed`
- `job.cancelled`

Job priorities:

- High: import, sync, search index.
- Medium: thumbnail.
- Low: OCR, embeddings, AI summary, duplicate scan.

Duplicate strategy:

- Level 1: exact source key.
- Level 2: checksum/hash when content is available later.
- Level 3: metadata similarity.
- Level 4: semantic similarity through future AI index.

This release implements Level 1 and stores fields needed for later levels.

## UI, Branding, And Non-Functional Requirements

- Add minimal Source Manager surfaces: source badge, health, last scan/import, update action, last error.
- Replace visible old names with `Omni`.
- Do not rename internal app data folders in this release.
- Rework light mode to warm parchment/off-white/yellow paper tones.
- Fix the home page dark hero tile in light mode.
- New adapters must not require Import Engine changes.
- UI must never block on long-running jobs.
- Layers should be independently testable with dependency injection or mocking.
- Metadata-only scanning must avoid downloading source content.

## Performance And Observability

- Scan: incremental and metadata-only.
- Preview: 10,000+ items with virtualization/lazy loading.
- Import: resumable where practical.
- Search: under 1 second for typical metadata queries.
- Sync: incremental by default; full rescan only when requested.
- Memory: never load all discovered files into the UI at once.
- Track active jobs, queue depth, average scan time, average preview time, average import time, failed imports, duplicate rate, search indexing latency, and source error rate.

## Assumptions

- Telegram is the only fully migrated adapter in this release.
- Existing local, YouTube, and Google Drive flows continue working while the framework is introduced.
- Event Bus starts as an in-process event system plus polling-friendly APIs, not an external broker.
- OCR, transcription, embeddings, AI summaries, thumbnails, and advanced duplicate detection are represented as future job/index stages but disabled in this release.
