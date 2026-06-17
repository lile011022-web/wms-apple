# apps/web

Future React + Vite + TypeScript frontend application.

Do not migrate the original HTML prototype here yet. The prototype remains in:

```text
docs/ui-prototype/original-html/
```

Initial frontend work should start with routing, layout, authentication screens, API client setup, and shared UI foundations.

## Maintenance Map

- `src/app`: router and app-level providers.
- `src/api`: API client and query client.
- `src/layouts`: route layouts.
- `src/pages`: route-level pages.
- `src/features`: business feature logic.
- `src/components`: reusable UI and workflow components.
- `src/styles`: global styles and design tokens.

Do not put backend logic or database rules in this app. Shared business contracts belong in `packages/shared`.
