# ADR 0009 — Provider Capabilities

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

Channels differ (interactive messages, reactions, templates, read receipts). Gating with `if (channel === 'whatsapp')` embeds vendor knowledge in business logic and breaks when adding SMS/Email.

## Decision

Every `ChannelProvider` exposes **`ProviderCapabilities`** (e.g. `supportsTemplates`, `supportsInteractive`, `supportsReactions`, `supportsMarkRead`, …).

Command handlers **must** check capabilities before feature use and throw typed Domain errors (`CapabilityNotSupported`) when unsupported.

**Forbidden:** feature switches on provider/channel name strings in Application/Domain.

## Consequences

- **Positive:** Provider-agnostic Application code; honest API errors; easy capability discovery later.
- **Negative:** Capabilities matrix must stay accurate per adapter; over-broad flags hide gaps.
- **Follow-up:** Principle #9; WhatsAppCapability map in WhatsAppChannelProvider.
