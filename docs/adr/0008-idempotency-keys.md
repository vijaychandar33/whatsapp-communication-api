# ADR 0008 — Idempotency Keys

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

Clients and proxies retry HTTP requests. Without server-side idempotency, queue-first send can create duplicate messages. Provider-side `providerMessageId` uniqueness covers inbound; outbound Developer writes need an application-level key.

## Decision

Require **`Idempotency-Key`** on Developer write endpoints (Send Message, Create Contact/Conversation, Upload Media, Create API Key, Create Organization).

Store in `idempotency_records`: `(organizationId, idempotencyKey)` unique + `requestHash` + stored response envelope + status TTL.

- Same key + same hash + COMPLETED → return stored response  
- Same key + different hash → `409` conflict  

Inbound messages remain idempotent on `providerMessageId`; webhooks on event fingerprint.

## Consequences

- **Positive:** Exactly-once from the application’s perspective for client retries; safe with queue-first.
- **Negative:** Clients must send stable keys; storage/TTL management required.
- **Follow-up:** Interceptor in Presentation; see [api-contract.md](../architecture/api-contract.md).
