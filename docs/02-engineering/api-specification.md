# Omni Source Import API Specification

Status: Draft for implementation

## Conventions

- All endpoints are local server endpoints under `/api/sources`.
- Long-running work returns a job id and is polled through the jobs API.
- Source-specific APIs must not bypass the universal pipeline once migrated.
- Error responses use `{ "error": "message", "details": {} }`.

## Source Manager

### GET /api/sources

Returns known sources.

Response:

```json
[
  {
    "id": "source_tg_123",
    "type": "telegram",
    "name": "MMP 2026 FOLDER",
    "status": "synced",
    "healthState": "connected",
    "lastScannedAt": "2026-07-04T00:00:00.000Z",
    "lastImportedAt": "2026-07-04T00:00:00.000Z",
    "capabilities": {}
  }
]
```

### GET /api/sources/:sourceId

Returns one source with rules, cursors, health, and last error.

### PUT /api/sources/:sourceId/rules

Updates persistent import rules. Running jobs continue using their rule snapshot.

Request:

```json
{
  "fileTypes": ["video", "pdf", "image"],
  "topicIds": ["5"],
  "dateFrom": "2026-01-01",
  "maxFileSize": 2147483648,
  "groupBy": "auto",
  "newOnly": true,
  "ignoredWords": ["join", "@channel"]
}
```

## Jobs

### GET /api/sources/jobs/:jobId

Returns job status.

### POST /api/sources/jobs/:jobId/cancel

Requests cancellation. Jobs should stop at safe boundaries and preserve partial progress where practical.

## Discovery

### POST /api/sources/:sourceId/scan

Starts metadata-only scan. The scanner must not download source content.

Request:

```json
{
  "mode": "incremental",
  "rulesOverride": {}
}
```

Response:

```json
{
  "job": {
    "id": "job_scan_123",
    "status": "queued"
  }
}
```

### GET /api/sources/:sourceId/discoveries

Returns paginated cached discoveries.

Query params:

- `limit`
- `offset`
- `mediaType`
- `topicKey`
- `dateFrom`
- `dateTo`
- `newOnly`
- `q`

Response:

```json
{
  "items": [],
  "total": 1200,
  "limit": 100,
  "offset": 0
}
```

## Preview

### POST /api/sources/:sourceId/preview

Builds a preview from Discovery Cache. Does not rescan.

Request:

```json
{
  "filters": {
    "mediaTypes": ["video", "pdf", "image"],
    "topicKeys": [],
    "newOnly": true
  },
  "groupBy": "auto",
  "limit": 200,
  "offset": 0
}
```

Response:

```json
{
  "previewId": "preview_123",
  "groups": [
    {
      "key": "lectures",
      "title": "Lectures",
      "items": []
    }
  ],
  "counts": {
    "total": 300,
    "video": 120,
    "pdf": 80,
    "image": 100
  },
  "estimatedSize": 0
}
```

## Import

### POST /api/sources/:sourceId/import

Imports selected preview/discovery items through Domain Mapper and Universal Import Engine.

Request:

```json
{
  "courseId": "course_123",
  "previewId": "preview_123",
  "selectedDiscoveryIds": ["disc_1", "disc_2"],
  "target": {
    "mode": "append",
    "courseTitle": "MMP 2026"
  }
}
```

Response:

```json
{
  "job": {
    "id": "job_import_123",
    "status": "queued"
  }
}
```

## Telegram Compatibility Endpoints

The existing `/api/telegram/*` endpoints may remain during migration. New Telegram import/update features should route through `/api/sources` once the Telegram adapter is implemented.

### POST /api/sources/telegram/from-chat

Creates or resolves a Telegram source from a selected chat/channel.

Request:

```json
{
  "chatId": "12345",
  "chatTitle": "MMP 2026 FOLDER",
  "topics": []
}
```

## Event Contract

Event envelope:

```json
{
  "name": "source.scan.completed",
  "timestamp": "2026-07-04T00:00:00.000Z",
  "sourceId": "source_123",
  "jobId": "job_123",
  "itemId": null,
  "payload": {}
}
```

Required event names:

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
