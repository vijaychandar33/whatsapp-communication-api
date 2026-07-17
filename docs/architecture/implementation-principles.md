# Implementation Principles

**Non-negotiable.** Violations are architecture bugs, not style preferences. Enforced in review; prefer lint/module boundaries where feasible.

---

## 1. Never bypass the Communication SDK

All messaging (send, media, mark-read, template sync entry points used by application flows) goes through the **Communication SDK**.

Handlers must not call `ChannelProvider` (or vendor SDKs) directly for product flows. The SDK owns account resolution, capability checks orchestration, and provider selection.

---

## 2. Never bypass ChannelProvider

Infrastructure adapters implement `ChannelProvider`. Application code depends on the interface only.

No Axios/fetch to Meta/Graph (or future vendors) from Application, Domain, or Presentation.

---

## 3. Never access Redis except via CacheService

No `ioredis` / Redis clients outside `CacheService`. Application uses cache abstractions (`get` / `set` / `del` / tags). Backing store can change without rewriting handlers.

---

## 4. Never decrypt outside SecretService

Provider credentials, webhook secrets, and other ciphertext are decrypted **only** by `SecretService`.

Handlers ask SecretService for plaintext at the last moment for a provider call; plaintext never returns to API consumers and never lives in logs.

---

## 5. Never access storage except via ObjectStorageProvider

Uploads/downloads go through `ObjectStorageProvider`. No direct S3/R2/local FS usage from Application or Domain.

---

## 6. Never bypass repositories

No Prisma / SQL in Application or Domain. Persistence through Write/Read repository interfaces; Infrastructure implements them.

Tenant scoping (`organizationId`) and soft-delete filters live in repository implementations.

---

## 7. Never publish events directly — Outbox only

After a business write, enroll domain events in `outbox_events` in the **same transaction**. Outbox Worker publishes to listeners/queues.

No `EventEmitter.emit` / queue `add` of domain events inside the request path as a substitute for Outbox (job enqueue for message-send after persist is separate; domain side-effects still ride Outbox).

---

## 8. Never expose provider payloads outside Infrastructure

Meta Graph bodies, webhook raw shapes, vendor error objects stay inside `infrastructure/providers/*`.

API responses and Domain events use provider-agnostic DTOs / normalized models. `rawProviderPayload` on messages is infrastructure/debug, not a public contract.

---

## 9. Never gate on provider name — capabilities only

Forbidden in business logic:

```ts
if (channel === 'whatsapp') { /* special case */ }
```

Required:

```ts
if (!provider.capabilities().supportsInteractive) {
  throw new CapabilityNotSupported(...)
}
```

New channels must not require Application `switch`/`if` trees on channel codes for feature support.

---

## 10. Always preserve provider independence

The platform is a **Communication API Platform**, not a Meta product.

- Domain terminology: `providerMessageId`, `channel`, `account` — not WABA/phone_number_id in Domain
- Webhook paths: `/api/v1/webhooks/whatsapp/...` not `/webhooks/meta`
- Public errors: `PROVIDER001`, not `META001`
- WhatsApp is the first provider, not the only designed-for provider

---

## Quick checklist (PR)

- [ ] Messaging via Communication SDK
- [ ] Provider HTTP only behind ChannelProvider impl
- [ ] Redis / secrets / blob via dedicated services
- [ ] No Prisma in Application/Domain
- [ ] Events via Outbox
- [ ] No raw provider payloads in API/Domain
- [ ] Feature gates = capabilities
- [ ] No Meta leakage in Domain names or public contracts

See ADRs [0004](../adr/0004-provider-pattern.md)–[0009](../adr/0009-provider-capabilities.md).
