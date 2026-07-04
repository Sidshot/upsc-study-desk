# Omni Architecture Governance Freeze Plan

## Summary

Omni Universal Source Import Architecture v1.0 is frozen. The architecture is stable and future structural changes must be proposed through Architecture Decision Records instead of direct edits to the frozen architecture document.

## Freeze Status

- Status: Frozen
- Architecture version: v1.0
- Next phase: engineering specifications, then implementation
- Breaking architectural changes: not permitted without an accepted ADR
- First implementation target: Telegram adapter, scanner, and update flow on the universal source pipeline

## Governance Documents

- [Architecture Principles](./architecture-principles.md)
- [ADR Template](./adr-template.md)
- [Versioning Policy](./versioning-policy.md)
- [Universal Source Import Architecture v1.0](../01-architecture/universal-source-import-architecture-v1.md)

## ADR Policy

ADRs are required for:

- Adding, removing, or reordering core layers.
- Changing Adapter Contract v1.
- Changing canonical models.
- Changing source, job, or content lifecycle states.
- Changing source-of-truth ownership.
- Replacing Event Bus, Background Job Manager, Metadata Store, Search Services, or Source Manager.

An ADR is accepted only when it:

- Preserves backwards compatibility or includes a documented migration strategy.
- Identifies affected modules.
- Updates Architecture Principles if the decision changes architectural rules.
- Includes status, context, decision, consequences, alternatives considered, and migration or compatibility notes.

## Dependency Rule

Dependencies must flow downward only.

```text
UI
 |
 v
Search Services
 |
 v
Metadata Store
 |
 v
Import Engine
 |
 v
Domain Mapper
 |
 v
Preview Builder
 |
 v
Discovery Cache
 |
 v
Scanner
 |
 v
Adapter
 |
 v
External Source
```

Lower layers must never depend on higher layers.

## Documentation Stack

```text
docs/
  00-governance/
    architecture-freeze-plan.md
    architecture-principles.md
    adr-template.md
    versioning-policy.md
  01-architecture/
    universal-source-import-architecture-v1.md
  02-engineering/
    README.md
  03-implementation/
    README.md
```

## Next Deliverables

- Database Specification with schemas, indexes, migrations, and compatibility strategy.
- API Specification with REST endpoints, request/response shapes, job polling, and event contracts.
- State Machines for source, job, and content lifecycles.
- Module Specifications for each frozen layer.
- Workflow diagrams for initial import, update, sync, error recovery, rate limits, and interrupted import.
- Implementation roadmap for phased Telegram-first rollout.

## Assumptions

- The frozen architecture remains the source of truth.
- Governance documents define how the architecture can change.
- Implementation details can evolve inside modules if they do not violate the frozen architecture, principles, or dependency rule.
