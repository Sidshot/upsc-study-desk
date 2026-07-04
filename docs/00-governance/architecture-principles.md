# Omni Architecture Principles

These principles govern the frozen Omni Universal Source Import Architecture v1.0. Implementation choices may vary inside a module, but they must not violate these rules.

1. Source adapters never perform importing.
2. Scanners never download original source content.
3. Discovery and preview are separate stages.
4. Discovery Cache prevents repeated rescans for filter, sort, and preview changes.
5. Domain Mapper is the only layer allowed to convert source-specific objects into Omni canonical objects.
6. Import Engine never communicates directly with external sources.
7. `ImportedItem` is the permanent source of truth.
8. Metadata Store is derived from imported items.
9. Search Index is disposable and rebuildable.
10. AI Index is optional, future-facing, and disabled until explicitly implemented.
11. Background jobs must be resumable where practical.
12. UI must never block on long-running jobs.
13. Every new source must implement Adapter Contract v1.
14. Event Bus is the communication mechanism between independent subsystems.
15. New adapters must not require changes to the Import Engine.

## Dependency Rule

Dependencies must flow downward only.

```text
UI -> Search Services -> Metadata Store -> Import Engine -> Domain Mapper
   -> Preview Builder -> Discovery Cache -> Scanner -> Adapter -> External Source
```

Lower layers must never import, call, or assume higher-layer behavior.
