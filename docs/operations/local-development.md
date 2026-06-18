# Local Development

This guide starts WMS Scan from a fresh clone on a new machine.

## Prerequisites

- Node.js 22 or newer.
- pnpm 9 or newer.
- Docker Desktop, or local PostgreSQL 16 and Redis.
- Git.

## Setup

```bash
git clone https://github.com/lile011022-web/wms-apple.git
cd wms-apple
cp .env.example .env
```

Edit `.env` before running the app:

- Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to long local-only values.
- Set `SEED_ADMIN_PASSWORD` to the password you want for the local admin user.
- Keep `DATABASE_URL` and `REDIS_URL` aligned with Docker Compose or your local services.

Start infrastructure:

```bash
docker compose up -d postgres redis
```

Install dependencies and prepare the database:

```bash
pnpm install
pnpm --filter @wms-scan/api prisma:generate
pnpm --filter @wms-scan/api prisma:migrate
SEED_ADMIN_PASSWORD=<your-local-admin-password> pnpm --filter @wms-scan/api prisma:seed
```

Run the app:

```bash
pnpm dev
```

Open:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`

Seeded admin user:

- Email: `admin@wms-scan.local`
- Password: the `SEED_ADMIN_PASSWORD` value used during seed.

## Validation

Use these checks before pushing project-wide changes:

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For narrower checks:

```bash
pnpm --filter @wms-scan/api test:unit
pnpm --filter @wms-scan/api test:e2e
pnpm --filter @wms-scan/web test
pnpm --filter @wms-scan/shared test
```

## Common Issues

If `pnpm` is unavailable, install it through Corepack:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

If API startup fails because migrations are missing, run:

```bash
pnpm --filter @wms-scan/api prisma:migrate
```

If login fails after reseeding, seed again with the intended password:

```bash
SEED_ADMIN_PASSWORD=<your-local-admin-password> pnpm --filter @wms-scan/api prisma:seed
```

Do not commit `.env`, database dumps, customer data, or production credentials.
