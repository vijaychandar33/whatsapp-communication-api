# ADR 0005 — Communication SDK

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

If every Command Handler calls ChannelProviders directly, account resolution, capability checks, secret loading, and media orchestration get duplicated and drift between Admin and Developer APIs.

## Decision

Provide an internal **Communication SDK** in the Application layer as the **only** messaging facade for product flows:

- Resolve account / credentials (via SecretService)  
- Select ChannelProvider by channel code  
- Enforce capabilities before send  
- Delegate send/media/template/mark-read to the provider  

Handlers orchestrate persistence and Outbox; they call the SDK for channel I/O.

## Consequences

- **Positive:** One place for messaging policy; Admin and Developer share behavior; easier mocks in tests.
- **Negative:** SDK must stay thin — not become a second Domain.
- **Follow-up:** Principle #1 in [implementation-principles.md](../architecture/implementation-principles.md).
