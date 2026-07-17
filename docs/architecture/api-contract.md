# API Contract

Dual APIs share one response envelope and the same Use Cases / Communication SDK. They do **not** share route trees.

---

## Surfaces

| API | Base | Auth | Audience |
|-----|------|------|----------|
| **Developer** | `/api/v1` | `x-api-key: cp_live_…` | Integrations |
| **Admin** | `/admin/v1` | `Authorization: Bearer <JWT>` | Dashboard / operators |
| **Webhooks** | `/api/v1/webhooks/:channel/:accountId` | Provider verify + signature | Channel providers |

Auth (login/refresh/password) lives under **Admin** only. Developer auth is API key only.

---

## Response envelope

Every JSON response:

```json
{
  "success": true,
  "message": "Message queued successfully",
  "data": {},
  "meta": {
    "requestId": "uuid",
    "correlationId": "uuid",
    "timestamp": "2026-07-15T10:00:00.000Z",
    "page": 1,
    "limit": 20,
    "total": 100
  },
  "errors": null
}
```

On failure: `success: false`, `data: null`, `errors: [{ code, message, field? }]`.

---

## Primary send — Developer API

```
POST /api/v1/messages
```

**Headers**

| Header | Required |
|--------|----------|
| `x-api-key` | Yes |
| `Idempotency-Key` | Yes (send and other listed writes) |

**Body**

```json
{
  "channel": "whatsapp",
  "type": "text",
  "to": "+919876543210",
  "content": { "body": "Hello" },
  "metadata": {
    "accountId": "optional-uuid",
    "clientRef": "optional"
  }
}
```

| Field | Notes |
|-------|-------|
| `channel` | Channel code (`whatsapp` first) |
| `type` | Message type (`text`, `template`, `image`, …) gated by capabilities |
| `to` | Destination (E.164 for WhatsApp) |
| `content` | Provider-agnostic structured content |
| `metadata` | Optional account pin, client refs — not a substitute for Idempotency-Key |

**Behavior:** Idempotency key + organization + request hash. If prior status is `COMPLETED`, return stored envelope (no second send). Same key + different hash → `409` conflict. Message persists as `QUEUED`; API returns quickly; worker calls SDK/provider.

**Related routes**

- `GET /api/v1/messages`
- `GET /api/v1/messages/:id`
- `POST /api/v1/messages/:id/retry`
- `POST /api/v1/messages/:id/read`
- Optional thin wrappers (text/template/image) that map to the same Command

**Other Developer surfaces (minimal):** contacts upsert/read, media upload/download, templates read/send context, webhook ingress.

---

## Idempotency-Key

Required for: Send Message, Create Contact, Create Conversation, Upload Media, Create API Key, Create Organization.

Stored in `idempotency_records` (`organizationId`, `idempotencyKey`, `requestHash`, `responseBody`, `status`, `expiresAt`). TTL typically 24–72h.

`metadata.clientRef` is client bookkeeping only — **not** a substitute for the header.

---

## Admin API

Full CRUD & ops under `/admin/v1`:

| Area | Paths |
|------|-------|
| Auth | `/auth/*` |
| IAM | `/organizations`, `/users`, `/roles`, `/permissions`, `/api-keys` |
| Channels | `/accounts` (connect / disconnect / verify / sync / status) |
| Comm | `/contacts`, `/conversations`, `/templates`, `/media` |
| Ops | `/audit`, `/logs`, `/settings`, `/dashboard`, `/analytics` |
| Platform | `/health`, `/feature-flags` |

Admin inbox send uses the **same** SendMessage Command / SDK — never a parallel Meta path.

---

## Webhooks

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/webhooks/:channel/:accountId` | Provider verify challenge |
| `POST` | `/api/v1/webhooks/:channel/:accountId` | Inbound events (signature validated) |

Channel = `whatsapp` initially — **not** `meta`.

---

## Error code prefixes

| Prefix | Domain |
|--------|--------|
| `AUTH` / `AUTHZ` | Authentication / authorization |
| `ORG` / `USER` | Tenancy |
| `MSG` / `TPL` / `MEDIA` | Messaging |
| `PROVIDER001` | Channel provider failures (internal vendor mapped) |
| `WH` / `CACHE` / `SECRET` / `QUEUE` | Infra |
| `DB001` | Persistence |

Prefer `PROVIDER001` over vendor-specific public codes (`META001`).

---

## Rate limits (defaults)

| Tier | Limit |
|------|-------|
| Auth (admin) | 10/min/IP |
| Developer API key | 100/min/key (configurable) |
| Webhook ingress | Unlimited (provider-controlled) |
| Admin JWT | 300/min/user |

See: [ADR 0008](../adr/0008-idempotency-keys.md), [ADR 0010](../adr/0010-dual-public-admin-api.md).
