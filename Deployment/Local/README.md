# Local Deployment

Run the full stack locally with Docker Compose, or run services natively for development.

## Full stack (Docker)

From the repo root:

```bash
docker compose -f Deployment/Local/docker-compose.yml up --build -d
```

| Service | URL |
|---------|-----|
| Admin UI | http://localhost:5173 |
| API / Swagger | http://localhost:3000 / http://localhost:3000/docs |
| Postgres (host) | `localhost:5433` |
| Redis (host) | `localhost:6380` |
| Login | `admin@local` / `Admin123!` |

Compose runs `prisma migrate deploy` + seed on API start. Host DB/Redis ports are **5433 / 6380** so they do not clash with Homebrew Postgres/Redis on 5432/6379.

Stop:

```bash
docker compose -f Deployment/Local/docker-compose.yml down
```

Reset volumes (wipes DB):

```bash
docker compose -f Deployment/Local/docker-compose.yml down -v
```

## Infrastructure only

Use when running backend/frontend natively with hot reload:

```bash
docker compose -f Deployment/Local/docker-compose.yml up -d postgres redis
```

Point native `.env` at:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/communication_platform?schema=public
REDIS_URL=redis://localhost:6380
```

## Native development

### Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run seed
npm run start:dev
```

- API: http://localhost:3000
- Swagger: http://localhost:3000/docs

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

- Admin UI: http://localhost:5173

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local full-stack compose (postgres, redis, api, worker, frontend) |
