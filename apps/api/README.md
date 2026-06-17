# apps/api

Future NestJS + TypeScript backend API application.

Initial backend work should start with project bootstrap, configuration, health checks, PostgreSQL access, Redis access, authentication, and shared error handling.

Business modules should be added incrementally rather than all at once.

## Maintenance Map

- `src/config`: environment and application configuration.
- `src/common`: reusable guards, filters, interceptors, errors, pipes, logger, and utilities.
- `src/database`: Prisma database boundary.
- `src/health`: health check endpoint.
- `src/jobs`: future queues and background processors.
- `src/modules`: business modules. Add future API behavior in the matching module.
- `prisma`: schema, migrations, and seed scripts.

Controllers should handle HTTP only. Services should handle business rules. Repositories should handle persistence.
