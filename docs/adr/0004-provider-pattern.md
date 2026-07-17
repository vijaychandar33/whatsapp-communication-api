# ADR 0004 — Provider Pattern

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

The platform’s first channel is WhatsApp via Meta Cloud API, but the product is **not** a Meta wrapper. Hard-coding Meta in Application code would block SMS/Email/Telegram and leak vendor jargon into the Domain.

## Decision

Introduce a Domain **`ChannelProvider`** interface (connect, webhook verify/parse, send, media, templates, mark-read, capabilities).  

**WhatsAppChannelProvider** is the first Infrastructure implementation and the **only** place Meta Graph payloads / versions / phone number IDs exist.

Application talks to providers via Communication SDK → ChannelProvider.

## Consequences

- **Positive:** New channels = new adapters; business logic stays stable; public API stays channel-code based (`whatsapp`, not `meta`).
- **Negative:** Normalization cost for webhooks/send DTOs; capability differences must be explicit.
- **Follow-up:** ADR 0005 (SDK), ADR 0009 (capabilities).
