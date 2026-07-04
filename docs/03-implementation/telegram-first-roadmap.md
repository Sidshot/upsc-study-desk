# Telegram-First Universal Source Import Roadmap

Status: Draft for implementation

## Phase 1: Database Foundation

Deliverables:

- Add migration `005_universal_source_import`.
- Add `source_metadata` to `videos`.
- Add source/import/job/index helper functions.
- Keep existing Telegram cache tables untouched.

Validation:

- App starts with fresh and existing databases.
- Existing course/video APIs remain compatible.
- Re-running migrations is safe.

## Phase 2: Generic Source Services

Deliverables:

- Source Manager service.
- Discovery Cache service.
- Source Job service with priorities.
- Event Bus module.
- Metadata Store and Search Index scaffolding.

Validation:

- Source CRUD works.
- Jobs can queue, run, complete, fail, and cancel.
- Events emit with standard envelope.

## Phase 3: Telegram Adapter And Scanner

Deliverables:

- Telegram adapter implementing Adapter Contract v1.
- Scanner writes Telegram metadata to Discovery Cache.
- Rules snapshot support.
- Discovery cursor and sync cursor support.
- Image metadata detection.

Validation:

- Scan does not download original media.
- Video, PDF, image, document, audio, and other kinds classify correctly.
- Incremental scan uses cursor.

## Phase 4: Preview Builder And Domain Mapper

Deliverables:

- Preview filters: media type, topic, date, size, new-only, text search.
- Preview groups: lectures, notes/PDFs, others.
- Telegram Domain Mapper emits `OmniImportItem`.
- Low-confidence and duplicate hints.

Validation:

- Preview rebuilds from cache without rescanning.
- Large previews are paginated.
- Domain Mapper output is schema-versioned.

## Phase 5: Universal Import Engine

Deliverables:

- Import selected `OmniImportItem` records into courses/modules/videos.
- Create `imported_items`.
- Populate `videos.source_metadata`.
- Write Metadata Store and Search Index records.
- Skip exact source-key duplicates.

Validation:

- Initial Telegram import works.
- Repeated import skips duplicates.
- Captions become descriptions.
- Images are imported as `image` items.

## Phase 6: Update From Telegram UI

Deliverables:

- Source badge on Telegram-backed courses.
- Update from Telegram action on course card.
- Update from Telegram action inside course page.
- Source health, last scan, last import, and last error display.
- Preview modal for update selections.

Validation:

- Update scans only newer items by default.
- User can select subset before import.
- Job progress and cancellation are visible.

## Phase 7: Rendering, Search, Branding, And Light Mode

Deliverables:

- Image/other viewer path.
- Sidebar filters or grouping for lectures, notes/PDFs, and others.
- Metadata search includes title, description, caption, filename, topic, source, and type.
- Visible branding says `Omni`.
- Warm parchment light mode.
- Home page no longer shows dark hero tile in light mode.

Validation:

- Images render without video-player errors.
- Light mode remains readable.
- Search finds Telegram metadata.

## Phase 8: Release Gates

Deliverables:

- Lint.
- Build.
- Packaged-app smoke test.
- Updater release assets.
- Release notes.

Validation:

- `latest.yml`, installer, and blockmap are attached to the matching GitHub release.
- Installed app update path works.
