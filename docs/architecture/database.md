# Database

PostgreSQL via Prisma. Multi-tenant. Soft delete on business tables. App-generated UUID PKs.

---

## Standards

### Universal columns (business tables)

```
id              UUID PK (app-generated)
organizationId  UUID FK  -- nullable only for global catalogs
createdAt       timestamptz NOT NULL
updatedAt       timestamptz NOT NULL
deletedAt       timestamptz NULL     -- soft delete
createdBy       UUID NULL
updatedBy       UUID NULL
deletedBy       UUID NULL
```

| Rule | Detail |
|------|--------|
| **Soft delete** | `delete()` sets `deletedAt`; reads filter `deletedAt IS NULL` |
| **UUIDs** | All PKs / FKs are UUID; generated via `IdentifierService` |
| **Tenancy** | Almost every business row carries `organizationId`; repos always filter unless Super Admin (audited) |

**Global catalogs (no `organizationId`):** `communication_channels`, `permissions`, `integration_providers`, `system_settings`, `feature_flags`.

**Append-only (no soft delete):** `audit_logs`, `system_logs`, `api_logs`, `webhook_events`, `message_status_history`, `login_history`, `security_events`, `outbox_events` (lifecycle via status, not soft delete).

---

## Key tables

### Foundation / IAM

| Table | Purpose |
|-------|---------|
| `organizations` | Tenant root (`SYSTEM` \| `TENANT`) |
| `users` | Org members |
| `roles` | RBAC roles (org-scoped or system) |
| `permissions` | Global permission catalog |
| `role_permissions` | Role ↔ permission junction |
| `api_keys` | Developer API keys (hashed + prefix) |

### Communication

| Table | Purpose |
|-------|---------|
| `communication_channels` | Channel catalog (WhatsApp first) |
| `communication_accounts` | Connected business accounts / numbers |
| `contacts` | End customers (unique per org + phone) |
| `conversations` | Threads; uniqueness `(org, account, contact)` |
| `messages` | All messages; `providerMessageId` for provider identity |
| `message_templates` | Channel templates |
| `media` | File metadata (`providerMediaId`) |
| `webhook_events` | Inbound webhooks (raw + normalized) |

### Platform / reliability

| Table | Purpose |
|-------|---------|
| `outbox_events` | Transactional outbox for domain events |
| `idempotency_records` | Developer `Idempotency-Key` store |
| `analytics_daily_stats` | Pre-aggregated daily metrics |

---

## Messages (hot path)

Designed for high volume / partition-ready:

| Concern | Design |
|---------|--------|
| Access | `(conversationId, createdAt DESC)`, `(organizationId, createdAt DESC)` |
| Provider ID | `providerMessageId` UNIQUE — **not** Meta-named columns in domain schema |
| Payload | `body`, `caption`, `content` JSONB (agnostic); `rawProviderPayload` JSONB infrastructure/debug only |
| Conversation denorm | `lastMessageId`, `lastMessageAt`, `unreadCount`, … |

Statuses flow through `message_status_history` (+ optional delivery/read/fail extension tables).

---

## Critical uniqueness

| Constraint | Scope |
|------------|-------|
| `organizations.slug` | Global |
| `users(organizationId, email)` | Per org |
| `roles(organizationId, name)` | Per org |
| `permissions.name` | Global |
| `api_keys.prefix` | Global |
| `contacts(organizationId, phoneNumber)` | Per org (active) |
| `messages.providerMessageId` | Global (provider guarantee) |
| `idempotency_records(organizationId, idempotencyKey)` | Per org |
| `message_templates(organizationId, accountId, name, language)` | Per account |

---

## Outbox & idempotency shapes

### `outbox_events`

Stores domain events written in the **same transaction** as the business write. Worker marks published / retries on failure. Fields typically include: `id`, `organizationId`, `eventType`, `payload`, `status`, `attempts`, `correlationId`, `createdAt`, `publishedAt`.

### `idempotency_records`

| Field | Notes |
|-------|-------|
| `organizationId` | Tenant |
| `idempotencyKey` | From header |
| `requestHash` | Canonical body hash |
| `responseBody` | Stored JSON envelope |
| `status` | `STARTED` / `COMPLETED` / `FAILED` |
| `expiresAt` | TTL |

### `analytics_daily_stats`

Pre-aggregated per org (and channel) by date: sent, delivered, read, failed, etc. Dashboard Queries read here — never scan live `messages` for rollups.

---

## Index patterns

| Pattern | Index |
|---------|-------|
| Tenant isolation | `(organizationId)` |
| Soft delete | `(organizationId, deletedAt)` partial WHERE `deletedAt IS NULL` |
| Messages | conversation + time; org + time; unique `providerMessageId` |
| Contacts | unique `(organizationId, phoneNumber)` WHERE active |
| Analytics | `(organizationId, date)`, `(organizationId, channelCode, date)` |

See: [system-context.md](./system-context.md), [ADR 0007](../adr/0007-outbox-pattern.md), [ADR 0008](../adr/0008-idempotency-keys.md).
