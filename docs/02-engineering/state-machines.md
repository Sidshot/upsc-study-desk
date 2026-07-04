# Omni Source Import State Machines

Status: Draft for implementation

## Source Lifecycle

```mermaid
stateDiagram-v2
    [*] --> created
    created --> connected
    connected --> scanning
    scanning --> preview_ready
    preview_ready --> importing
    importing --> imported
    imported --> indexed
    indexed --> synced
    scanning --> failed
    importing --> failed
    indexed --> failed
    failed --> retry
    retry --> scanning
    failed --> paused
    paused --> retry
```

## Source Health States

- `connected`
- `scanning`
- `importing`
- `rate_limited`
- `auth_expired`
- `disconnected`
- `partially_synced`
- `error`
- `maintenance`

Health state describes operational condition. Lifecycle describes workflow position.

## Job Lifecycle

```mermaid
stateDiagram-v2
    [*] --> queued
    queued --> running
    running --> completed
    running --> failed
    running --> cancelling
    cancelling --> cancelled
    failed --> retrying
    retrying --> queued
    failed --> paused
    paused --> queued
```

Job statuses:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelling`
- `cancelled`
- `retrying`
- `paused`

## Content Lifecycle

```mermaid
stateDiagram-v2
    [*] --> discovered
    discovered --> selected
    selected --> imported
    imported --> stored
    stored --> indexed
    indexed --> available
    available --> updated
    updated --> indexed
    available --> archived
    archived --> available
    available --> deleted
    deleted --> [*]
```

Content states:

- `discovered`
- `selected`
- `imported`
- `stored`
- `indexed`
- `available`
- `updated`
- `archived`
- `deleted`

## Transition Rules

- A source may not enter `importing` unless a preview exists or selected discovery ids are provided.
- A job may be cancelled only from `queued` or `running`.
- Imported content may not skip directly from `discovered` to `available`.
- `deleted` content must not remain in Search Index after the next indexing pass.
- Health `rate_limited` should pause scan/sync jobs and preserve cursor state.
