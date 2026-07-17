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
| Login | `admin@local` / `Admin123!` |

Stop:

```bash
docker compose -f Deployment/Local/docker-compose.yml down
```

## Infrastructure only

Use when running backend/frontend natively with hot reload:

```bash
docker compose -f Deployment/Local/docker-compose.yml up -d postgres redis
```

## Native development

### Backend

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
