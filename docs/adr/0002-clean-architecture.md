# ADR 0002 — Clean Architecture

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

Flat Controller → Service → Repository mixes HTTP, business rules, Prisma, and Meta HTTP. That blocks provider swaps, testing, and admin/developer API reuse.

## Decision

Adopt four layers:

1. **Presentation** — HTTP/WS only  
2. **Application** — Commands/Queries, Communication SDK  
3. **Domain** — entities, VOs, ports (`ChannelProvider`, repos)  
4. **Infrastructure** — Prisma, WhatsApp provider, Outbox, Cache, Secrets, queues  

Dependency rule: Domain has **zero** framework imports. Infrastructure implements Domain interfaces.

## Consequences

- **Positive:** Testable core; Meta types confined; dual APIs share Use Cases.
- **Negative:** More files/boilerplate early; Nest wiring must map ports carefully.
- **Follow-up:** See [layers.md](../architecture/layers.md); enforce via folder structure + review checklist.
