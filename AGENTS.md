# Codex Development Rules

## Required Reading

Before each development task, read:

1. `README.md`
2. `AGENTS.md`
3. `docs/product/01-project-brief.md`

## Production Server Access

For this project, Codex can deploy finished local changes to the existing VPS after local validation.

- SSH target: `root@24.199.87.181`
- SSH key: `~/.ssh/wms_scan_do`
- Server project directory: `/opt/wms-scan`
- Public web URL: `http://24.199.87.181/`
- Public health check: `http://24.199.87.181/api/v1/health`

Use this SSH form:

```bash
ssh -i ~/.ssh/wms_scan_do -o IdentitiesOnly=yes root@24.199.87.181
```

Deployment workflow after local changes are complete:

1. Validate locally with the relevant tests or type checks.
2. Commit and push the finished change to GitHub `main` when appropriate.
3. Sync the local checkout to `/opt/wms-scan` with `rsync`, preserving server-only files.
4. Run a production database backup before replacing containers.
5. Run the production deploy script on the server. Use `infra/scripts/deploy.sh web` for web-only changes and `infra/scripts/deploy.sh api` for API/database changes when the scope allows it.
6. Verify container status and `http://24.199.87.181/api/v1/health`.

For GHCR prebuilt-image deployments, configure `WEB_IMAGE` and `API_IMAGE` in the server-only `.env.production`, then run:

```bash
USE_PREBUILT_IMAGES=true COMPOSE_FILE=docker-compose.prod.images.yml PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh
```

Never copy or overwrite server-only secrets. Exclude at least `.env`, `.env.production`, `node_modules`, `.git`, `dist`, `build`, `coverage`, and `backups` during server sync.

## Scope Control

- Do not implement all features at once.
- Keep changes small, reviewable, and aligned with the requested task.
- Do not delete `docs/ui-prototype/original-html`.
- Treat the original HTML prototype as product and UI reference material.

## Code Ownership Boundaries

- Frontend code must live under `apps/web`.
- Backend code must live under `apps/api`.
- Shared types, enums, and validation rules must live under `packages/shared`.
- Product, architecture, database, and API documentation must live under `docs`.
- Infrastructure files must live under `infra` unless they are root-level project files.

## Documentation

- Update `docs/changelog` after each important modification.
- For every code or delivery change, update the current date file in `docs/changelog/YYYY-MM-DD.md`.
- The current date changelog file must be overwritten for repeated changes on the same date, not duplicated.
- Each changelog file must explain what changed, where to modify related code later, each touched module's purpose, and the usage logic.
- Keep product rules in `docs/product`.
- Keep architecture decisions in `docs/architecture`.
- Keep database design notes in `docs/database`.
- Keep API contracts in `docs/api`.

## Safety Rules

- Do not commit `.env`.
- Do not commit `node_modules`.
- Do not commit real customer data.
- Do not hard-code secrets, passwords, API keys, or production credentials.
- Do not delete user files or rewrite the original prototype unless explicitly requested.

## Style Expectations

- Prefer TypeScript for application and shared package code.
- Keep frontend, backend, and shared code separated by workspace.
- Use clear names for business concepts such as customer, UPC, IMEI, Serial, inbound, outbound, box, inventory, exception, and audit log.
- Add tests with business-critical logic, especially scanning validation, inventory state changes, and permission checks.
