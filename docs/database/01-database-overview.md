# Database Overview

## Local Services

The repository keeps local database infrastructure in root-level Docker Compose configuration:

```text
docker-compose.yml
```

The intended development services are:

- PostgreSQL for persistent WMS data.
- Redis for future queue, cache, or background job coordination.

Start both services from the repository root:

```bash
docker compose up -d postgres redis
```

Check service health:

```bash
docker compose ps
docker compose logs postgres
docker compose logs redis
```

Stop local services without deleting volumes:

```bash
docker compose stop postgres redis
```

Remove local service containers and volumes only when local development data can be discarded:

```bash
docker compose down -v
```

The development PostgreSQL connection string is documented in `.env.example`. Do not commit a real `.env` file.

## Prisma Boundary

Prisma files live under:

```text
apps/api/prisma
apps/api/src/database
```

Current status:

- `apps/api/prisma/schema.prisma` exists as the schema entrypoint.
- `apps/api/src/database/prisma.service.ts` owns the NestJS Prisma client boundary.
- API Prisma scripts use the explicit schema path `prisma/schema.prisma`.
- The API shell intentionally does not require a live database connection at startup until business models and migrations are ready.

Run Prisma validation and client generation from `apps/api`:

```bash
pnpm prisma:validate
pnpm prisma:generate
```

## Core Database Model Status

Phase 2 has added the core business entities described in:

```text
docs/architecture/backend-implementation-roadmap.md
```

Related database documents:

- `docs/database/02-entity-relationship.md`
- `docs/database/03-inventory-state-machine.md`
- `docs/database/04-audit-log-schema.md`

Database-backed modules should not write directly from controllers. Use the module repository layer for database reads and writes.
