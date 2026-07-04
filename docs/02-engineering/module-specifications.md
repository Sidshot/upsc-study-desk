# Omni Source Import Module Specifications

Status: Draft for implementation

## Source Manager

Owns source configuration, rules, capabilities, cursors, health, and errors.

Responsibilities:

- Create, update, and read sources.
- Persist rules and cursor state.
- Expose source health and last error.
- Never scan or import directly.

## Source Adapter

Owns external communication for one source type.

Adapter Contract v1:

- `adapterInterfaceVersion: 1`
- `connect(source)`
- `disconnect(source)`
- `scan(source, rulesSnapshot, discoveryCursor)`
- `sync(source, rulesSnapshot, syncCursor)`
- `health(source)`
- `capabilities(source)`
- `resolveMedia(sourceItem)`

Rules:

- Must not build previews.
- Must not import into Omni.
- Must not download original content during scan.

## Source Scanner

Runs metadata-only discovery through an adapter.

Responsibilities:

- Snapshot source rules at job start.
- Call adapter scan/sync.
- Write `source_discoveries`.
- Update discovery/sync cursors.
- Emit scan events.

## Discovery Cache

Stores source discoveries for repeated preview filtering.

Responsibilities:

- Upsert discoveries by `(source_id, source_item_key)`.
- Query discoveries with filters and pagination.
- Preserve raw source metadata.
- Never write imported content.

## Preview Builder

Builds user-facing previews from Discovery Cache.

Responsibilities:

- Apply filters, sorting, grouping, and limits.
- Calculate counts and estimated size.
- Surface low-confidence and duplicate hints.
- Never rescan.
- Never import.

## Domain Mapper

Converts source-specific discoveries into `OmniImportItem`.

Responsibilities:

- Normalize title, description, media type, MIME type, size, duration, and metadata.
- Preserve source identity and source item key.
- Enforce `schemaVersion`.
- Keep source-specific fields inside `metadata`.

## Universal Import Engine

Persists selected `OmniImportItem` records.

Responsibilities:

- Create or append to courses/modules/videos.
- Create `imported_items`.
- Write `videos.source_metadata`.
- Skip duplicate exact source keys.
- Emit import events.
- Never communicate with external sources.

## Background Job Manager

Runs long jobs without blocking UI.

Responsibilities:

- Persist jobs in `source_jobs`.
- Support priorities: high, medium, low.
- Support cancellation.
- Preserve error and partial progress.
- Avoid low-priority future workers blocking import/sync/search.

## Event Bus

Publishes architecture events.

Responsibilities:

- Emit standard event envelope.
- Support in-process subscribers.
- Preserve enough event data for logs and polling responses.
- Avoid tight coupling between UI, jobs, import, and indexing.

## Metadata Store

Stores durable normalized metadata derived from imported items.

Responsibilities:

- Build/update metadata records from `imported_items`.
- Preserve title, description, caption, filename, source, topic, media type, and dates.
- Provide source data for Search Index.

## Search Index

Stores disposable optimized query data.

Responsibilities:

- Build from Metadata Store.
- Be safely rebuildable.
- Support metadata search under 1 second for typical queries.

## Search Services

Internal query layer.

Responsibilities:

- Query Search Index and Metadata Store.
- Hide implementation details from UI.
- Keep interface stable for future full-text and semantic search.

## AI Index

Future optional enrichment layer.

Responsibilities:

- Represent future OCR, transcription, embeddings, summaries, thumbnails, and semantic concepts.
- Remain disabled until explicitly implemented.
