# Omni Source Import Engineering Specifications

This folder tracks engineering specifications derived from the frozen architecture. These documents should define exact schemas, APIs, state machines, diagrams, and module contracts without changing the frozen architecture.

## Required Specifications

- [Database Specification](./database-specification.md): schemas, relationships, indexes, migrations, and compatibility strategy.
- [API Specification](./api-specification.md): REST endpoints, request/response contracts, job polling, and event contracts.
- [Module Specifications](./module-specifications.md): Source Manager, Adapter Contract, Scanner, Discovery Cache, Preview Builder, Domain Mapper, Import Engine, Background Job Manager, Event Bus, Metadata Store, Search Index, Search Services, and AI Index.
- [State Machines](./state-machines.md): source lifecycle, job lifecycle, and content lifecycle.
- [Workflow Diagrams](./workflow-diagrams.md): initial import, source update, filtering, error recovery, rate limits, and interrupted import.

## Constraint

Engineering specifications must follow the frozen architecture, [Architecture Principles](../00-governance/architecture-principles.md), and [Architecture Freeze Plan](../00-governance/architecture-freeze-plan.md). Any architectural change must go through an ADR.
