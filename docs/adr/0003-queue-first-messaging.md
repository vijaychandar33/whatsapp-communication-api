# ADR 0003 — Queue-First Messaging

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

Synchronous send-to-Meta in the HTTP request path causes timeouts, retries that double-send, and poor UX under Meta latency or rate limits.

## Decision

**Queue-first outbound messaging:**

1. Validate + authorize  
2. Persist message as `QUEUED` (+ Outbox events)  
3. Enqueue BullMQ `message-send` job  
4. Return success envelope immediately  
5. Worker loads message → Communication SDK → ChannelProvider → vendor  

Retries/status updates happen offline relative to the client.

## Consequences

- **Positive:** Fast API; durable retries; backpressure via queues; Idempotency-Key pairs cleanly with QUEUED records.
- **Negative:** Clients see “queued” before “sent”; need status polling/webhooks/WebSocket for finality.
- **Follow-up:** ADR 0007 (Outbox), ADR 0008 (Idempotency); DLQ + retry policies per queue.
