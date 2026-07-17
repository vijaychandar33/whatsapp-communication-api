# ADR 0006 — CQRS-Ready, No Event Sourcing

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

We need clear write/read separation for future dashboard scale (analytics, conversation lists) without adopting Event Sourcing complexity (event store rebuilds, versioning, projection lag as source of truth).

## Decision

Make the Application layer **CQRS-ready**:

- **Commands** mutate via Write Repositories (+ Outbox)  
- **Queries** read via Read Repositories / views / cache / `analytics_*` tables  

**Do not** implement Event Sourcing. OLTP tables remain the source of truth. Domain events are integration/notifications, not an event store.

## Consequences

- **Positive:** Clean mental model; room for materialized views later; no ES ops burden.
- **Negative:** Dual repository surfaces; must avoid Query handlers reimplementing write policies.
- **Follow-up:** Initial read models for dashboard, analytics, conversation list; see [layers.md](../architecture/layers.md).
