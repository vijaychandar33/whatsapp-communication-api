# ADR 0007 — Outbox Pattern

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

Emitting domain events (or queue jobs that represent domain facts) **after** a DB commit is racey: process crash → lost events. Emitting before commit risks phantom events. In-process EventEmitter is not crash-safe or replayable.

## Decision

Use a **transactional Outbox**:

1. Business write + insert `outbox_events` in **one** DB transaction  
2. Commit  
3. Outbox Worker publishes PENDING events to listeners / queues  
4. Mark published; retry with backoff on failure  

Application must **never** publish Domain events directly as a substitute for Outbox.

## Consequences

- **Positive:** At-least-once delivery with crash safety; microservice-ready later; auditable event log.
- **Negative:** Eventual side effects; workers must be idempotent; slightly higher write volume.
- **Follow-up:** Table in [database.md](../architecture/database.md); listeners for Realtime, Audit, Analytics.
