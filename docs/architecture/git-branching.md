# Git Branching

WMS Scan uses a simple enterprise-friendly branch model.

## Long-Lived Branches

- `main`: stable branch. A fresh clone from this branch should be able to install, migrate, seed, and run from the documented quick start.
- `develop`: integration branch for completed feature and phase work before it is promoted to `main`.

## Short-Lived Branches

- `codex/*`: Codex implementation branches.
- `feature/*`: human-authored feature branches.
- `fix/*`: bug-fix branches.
- `release/*`: release candidates and stabilization work.

## Promotion Flow

1. Build phase or feature work on `codex/*`, `feature/*`, or `fix/*`.
2. Keep changes scoped and update matching docs plus `docs/changelog/YYYY-MM-DD.md`.
3. Run the relevant validation commands.
4. Merge into `develop`.
5. Promote `develop` to `main` when the project is stable and the quick start works.

## Commit Expectations

- Use concise commit messages that describe the delivered behavior.
- Keep code, docs, and changelog together for each meaningful delivery.
- Do not commit `.env`, `node_modules`, real customer data, production credentials, or generated local artifacts.
- Preserve `docs/ui-prototype/original-html` as product and UI reference material.

## Current Repository Layout

The completed project should live on:

- `main`: stable complete project.
- `develop`: same integration head after final promotion.
- historical `codex/*` branches: phase-by-phase development history.
