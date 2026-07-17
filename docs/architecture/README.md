# Communication API Platform — Architecture Overview

**Product:** Communication API Platform  
**Not:** CRM · chatbot builder · marketing automation · Meta wrapper

A multi-tenant platform that exposes a Stripe/Twilio-style REST API for messaging. Developers never talk to Meta (or any channel vendor) directly. WhatsApp Cloud API is the **first** `ChannelProvider`; SMS, Email, Telegram, Instagram, etc. plug in the same way later.

---

## Goals

| Goal | How |
|------|-----|
| Simple developer experience | Unified `POST /api/v1/messages` |
| Provider independence | `ChannelProvider` + Communication SDK |
| Reliable delivery | Queue-first send + transactional Outbox |
| Safe retries | `Idempotency-Key` on Developer writes |
| Scale later without rewrite | Modular monolith + Clean Architecture + CQRS-ready |

---

## Shape

**NestJS modular monolith** with four Clean Architecture layers:

```
Presentation  →  Application (CQRS)  →  Domain
                      ↓                    ↑
                Infrastructure ────────────┘
```

- **Domain** owns entities, VOs, repository interfaces, `ChannelProvider`, `ProviderCapabilities`
- **Application** owns Commands/Queries, Communication SDK, orchestration
- **Infrastructure** owns Prisma, WhatsApp provider, Outbox, Cache, Secrets, storage, queues
- **Presentation** owns `/api/v1` (Developer) and `/admin/v1` (Admin) controllers only

---

## Dual APIs

| Surface | Base | Auth | Audience |
|---------|------|------|----------|
| **Developer** | `/api/v1` | `x-api-key` + `Idempotency-Key` on writes | Integrations |
| **Admin** | `/admin/v1` | JWT Bearer | React dashboard / operators |
| **Webhooks** | `/api/v1/webhooks/:channel/:accountId` | Provider verify + signature | Channel providers |

Never mix Developer and Admin concerns on the same route tree. Admin send still goes through the same SDK / Use Cases — never a second path to Meta.

---

## Send call chain

```
REST → Command Handler → Communication SDK → ChannelProvider → WhatsAppProvider → Meta
```

Domain events are **never** published directly. Writes enroll events in `outbox_events` in the same DB transaction; an Outbox worker publishes afterward.

---

## Document index

| Doc | Contents |
|-----|----------|
| [system-context.md](./system-context.md) | Context diagram, call chain, Outbox, invariants |
| [layers.md](./layers.md) | Layer rules (may / must not) |
| [api-contract.md](./api-contract.md) | Dual API, send envelope, errors |
| [database.md](./database.md) | Key tables, soft delete, tenancy |
| [implementation-principles.md](./implementation-principles.md) | 10 non-negotiable rules |
| [../adr/](../adr/) | Architecture Decision Records 0001–0010 |

---

## Related ADRs

- [0001 Modular monolith](../adr/0001-modular-monolith.md)
- [0002 Clean Architecture](../adr/0002-clean-architecture.md)
- [0004 Provider pattern](../adr/0004-provider-pattern.md)
- [0005 Communication SDK](../adr/0005-communication-sdk.md)
- [0010 Dual public/admin API](../adr/0010-dual-public-admin-api.md)
