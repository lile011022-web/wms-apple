# Codex Development Rules

## Required Reading

Before each development task, read:

1. `README.md`
2. `AGENTS.md`
3. `docs/product/01-project-brief.md`

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
