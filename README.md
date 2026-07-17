# Communication API Platform

Enterprise communication platform that abstracts channel providers (WhatsApp/Meta first) behind a simple Developer REST API and Admin dashboard.

## Architecture

- **Modular NestJS monolith** with Clean Architecture (Presentation / Application CQRS / Domain / Infrastructure)
- **Provider pattern** — `ChannelProvider` + capabilities; Meta lives only in `WhatsAppChannelProvider`
- **Communication SDK** — all messaging goes through the SDK
- **Queue-first send** + **transactional Outbox** for domain events
- **Dual APIs** — Developer `/api/v1` (API keys) vs Admin `/admin/v1` (JWT)
- Docs: [`docs/architecture/`](docs/architecture/) · ADRs: [`docs/adr/`](docs/adr/)

## Stack

| Layer | Tech |
|-------|------|
| Backend | NestJS, Prisma, PostgreSQL, Redis/BullMQ, Passport JWT, Swagger |
| Frontend | React, Vite, TanStack Query, Tailwind, React Hook Form + Zod |
| Deploy | [`Deployment/Production/`](Deployment/Production/) (Coolify) · [`Deployment/Local/`](Deployment/Local/) (Docker) |

## Quick start (local)

### 1. Infrastructure

```bash
docker compose -f Deployment/Local/docker-compose.yml up -d postgres redis
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run seed
npm run start:dev
```

- API: http://localhost:3000  
- Swagger: http://localhost:3000/docs  
- Seed admin: `admin@local` / `Admin123!`

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

- Admin UI: http://localhost:5173

### Full stack via Docker Desktop

```bash
docker compose -f Deployment/Local/docker-compose.yml up --build -d
```

| Service | URL |
|---------|-----|
| Admin UI | http://localhost:5173 |
| API / Swagger | http://localhost:3000 / http://localhost:3000/docs |
| Postgres (host) | localhost:5433 |
| Redis (host) | localhost:6380 |
| Login | `admin@local` / `Admin123!` |

Compose runs migrations + seed on API start. Stack: postgres, redis, api, worker, frontend. Host DB/Redis use **5433/6380** to avoid clashing with local Homebrew services.
## API surfaces

| Audience | Base | Auth |
|----------|------|------|
| Developers | `/api/v1` | `x-api-key` + `Idempotency-Key` on writes |
| Admins | `/admin/v1` | `Authorization: Bearer <jwt>` |
| Webhooks | `/api/v1/webhooks/whatsapp/:accountId` | Provider verify/signature |
| Realtime | `/ws` | JWT query `?token=` |

### Send a message (Developer)

```http
POST /api/v1/messages
x-api-key: cp_live_xxx
Idempotency-Key: unique-client-key

{
  "channel": "whatsapp",
  "type": "text",
  "to": "+919876543210",
  "content": { "body": "Hello" },
  "metadata": { "accountId": "<communication-account-uuid>" }
}
```

## Project layout

```
docs/                Architecture + ADRs
backend/             NestJS Clean Architecture API + worker
frontend/            React Admin Dashboard
Deployment/
  Production/        Coolify + Azure production deploy
  Local/             Local Docker Compose stack
```

## Implementation principles

See [docs/architecture/implementation-principles.md](docs/architecture/implementation-principles.md) — never bypass SDK/provider/outbox/repositories; never leak Meta types outside WhatsApp infrastructure.
