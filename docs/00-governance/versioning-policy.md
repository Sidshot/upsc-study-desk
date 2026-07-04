# Omni Architecture Versioning Policy

This policy applies to the frozen Omni Universal Source Import Architecture and its governance documents.

## Major Versions

Examples: v2.0, v3.0.

Major versions are reserved for:

- Architectural redesigns.
- New or removed core layers.
- Canonical model redesigns.
- Adapter contract redesigns.
- Source-of-truth ownership redesigns.

Major versions require an accepted ADR and a migration strategy.

## Minor Versions

Examples: v1.1, v1.2.

Minor versions are reserved for:

- New optional capabilities.
- New adapters.
- New events.
- New job types.
- Additional metadata fields.
- Performance improvements.
- Backwards-compatible extension of existing contracts.

Minor versions require an ADR when they affect frozen architecture contracts.

## Patch Versions

Examples: v1.0.1, v1.0.2.

Patch versions are reserved for:

- Clarifications.
- Documentation corrections.
- Typo fixes.
- Non-behavioral improvements.

Patch versions must not change architecture behavior, ownership, or dependency direction.
