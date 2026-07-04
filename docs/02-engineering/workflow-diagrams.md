# Omni Source Import Workflow Diagrams

Status: Draft for implementation

## Initial Telegram Import

```mermaid
sequenceDiagram
    participant UI
    participant SM as Source Manager
    participant J as Job Manager
    participant S as Scanner
    participant A as Telegram Adapter
    participant DC as Discovery Cache
    participant PB as Preview Builder
    participant DM as Domain Mapper
    participant IE as Import Engine
    participant MS as Metadata Store
    participant SS as Search Services

    UI->>SM: create/resolve Telegram source
    UI->>J: start scan job
    J->>S: run scan with rules snapshot
    S->>A: scan metadata only
    A-->>S: source discoveries
    S->>DC: upsert discoveries
    UI->>PB: build preview from cache
    PB->>DC: query discoveries
    DC-->>PB: filtered discoveries
    PB-->>UI: preview groups
    UI->>J: start import job with selected ids
    J->>DM: map selected discoveries
    DM-->>IE: OmniImportItems
    IE->>IE: create course/module/video/imported_items
    IE->>MS: write metadata records
    MS->>SS: queue/rebuild search index
```

## Telegram Update

```mermaid
sequenceDiagram
    participant UI
    participant SM as Source Manager
    participant J as Job Manager
    participant S as Scanner
    participant A as Telegram Adapter
    participant DC as Discovery Cache
    participant PB as Preview Builder
    participant IE as Import Engine

    UI->>SM: load source from course
    UI->>J: start incremental scan
    J->>S: scan with sync/discovery cursor
    S->>A: fetch newer metadata only
    A-->>S: new or changed discoveries
    S->>DC: upsert cache
    UI->>PB: preview new items
    PB-->>UI: selectable update preview
    UI->>J: import selected update items
    J->>IE: append and skip duplicate source keys
    IE-->>UI: import completed
```

## Error Recovery

```mermaid
flowchart TD
    A[Job Running] --> B{Failure Type}
    B -->|Rate limit| C[Set source health rate_limited]
    C --> D[Persist cursor and partial counters]
    D --> E[Retry after delay or user action]
    B -->|Auth expired| F[Set source health auth_expired]
    F --> G[Prompt reconnect]
    B -->|Network| H[Set job failed with retry option]
    H --> D
    B -->|Unexpected data| I[Store error_json]
    I --> J[Allow cached preview/import if safe]
```

## Preview Filtering

```mermaid
flowchart LR
    A[User changes filters] --> B[Preview Builder]
    B --> C[Discovery Cache query]
    C --> D[Paginated results]
    D --> E[Counts and groups]
    E --> F[UI update]
```

Preview filtering must not trigger a new scan.
