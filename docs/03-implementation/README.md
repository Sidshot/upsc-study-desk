# Omni Source Import Implementation

This folder tracks implementation planning derived from the frozen architecture and engineering specifications.

## Roadmap

Use the detailed [Telegram-First Universal Source Import Roadmap](./telegram-first-roadmap.md).

1. Database foundation and generic source/job scaffolding.
2. Telegram adapter, scanner, and Discovery Cache.
3. Preview Builder, Domain Mapper, and Universal Import Engine.
4. Update from Telegram UI and source health surfaces.
5. Image/other rendering, caption descriptions, and metadata search.
6. Light mode and Omni branding cleanup.
7. Validation, packaging, and updater release.

## Migration Plan

- Introduce new source/import tables without removing existing course, module, video, or Telegram cache tables.
- Keep existing local, YouTube, Google Drive, and external-link imports working while Telegram migrates first.
- Add compatibility bridges from new imported items into existing course/module/video views.
- Avoid renaming internal data directories in this release.

## Test Plan

- Telegram scan stores discoveries without downloading media.
- Discovery Cache supports repeated filtering without rescanning.
- Preview handles large item sets with filters and selection.
- Domain Mapper emits valid versioned `OmniImportItem` records.
- Telegram update imports only selected new items.
- Repeated update skips existing source keys.
- Captions become descriptions.
- Images import and render without video-player errors.
- Source health and lifecycle transitions are correct.
- Job priority prevents low-priority future work from blocking imports.
- Metadata search finds title, caption, filename, topic, type, and source.
- Light mode uses warm paper styling and remains readable.
- Visible branding says `Omni`.
- Run lint, build, packaged-app smoke test, and updater verification before release.
