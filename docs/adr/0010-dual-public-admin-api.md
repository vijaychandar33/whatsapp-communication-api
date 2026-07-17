# ADR 0010 — Dual Public / Admin API

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

Integrations need a stable, minimal, API-key-authenticated surface. Operators need JWT + RBAC for org/user/account management and inbox ops. Mixing both on one route tree creates auth confusion and accidental privilege bleed.

## Decision

Two versioned trees:

| Surface | Base | Auth |
|---------|------|------|
| **Developer (public)** | `/api/v1` | `x-api-key` (+ Idempotency-Key on writes) |
| **Admin** | `/admin/v1` | JWT access/refresh |

Same response envelope. Same Application Commands/Queries / Communication SDK for shared operations (including Admin send).  

Webhooks stay under Developer API: `/api/v1/webhooks/:channel/:accountId`.  

React Admin consumes **`/admin/v1` only**.

## Consequences

- **Positive:** Clear security boundaries; Swagger can split; rate limits per surface; no “admin send to Meta” side door.
- **Negative:** Some DTO duplication at Presentation; auth middleware must never cross trees.
- **Follow-up:** [api-contract.md](../architecture/api-contract.md); Auth endpoints under Admin only.
