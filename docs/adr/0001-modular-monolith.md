# ADR 0001 — Modular Monolith

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

We need a production Communication API Platform that can grow into Twilio/WATI-class reliability without starting as a distributed system. Microservices would add ops cost, distributed transactions, and premature boundaries before product-market fit.

## Decision

Ship a **NestJS modular monolith**: one deployable API (+ worker process from the same image) with clear module boundaries (Auth, Orgs, Messaging, Providers, Analytics, etc.) and Clean Architecture layers inside.

Modules may later extract (e.g. provider workers) without rewriting domain models.

## Consequences

- **Positive:** Single DB transaction, simple local DX, shared types, fast iteration; Outbox/CQRS leave extraction doors open.
- **Negative:** Discipline required so modules do not become a ball of mud; CI/module lint must enforce boundaries.
- **Follow-up:** Separate `api` and `worker` containers; extract providers only when load or team ownership demands it.
