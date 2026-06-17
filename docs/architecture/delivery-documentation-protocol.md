# Delivery Documentation Protocol

## Goal

Every code delivery must leave behind a small usage and maintenance note so future work can locate the right files quickly.

## Location

Use the English folder name for modification logs:

```text
docs/changelog/
```

## File Naming

Use the current date:

```text
docs/changelog/YYYY-MM-DD.md
```

If more than one delivery happens on the same day, update the same file and overwrite the previous version with the latest complete daily summary.

## Required Sections

Each daily file should include:

1. What changed
2. Files or modules touched
3. Module purpose
4. Usage logic
5. Where to modify this area later
6. Safety notes
7. Follow-up suggestions

## When To Update

Update this file whenever changing:

- Source code
- Project structure
- Dependencies
- Configuration
- Database schema
- API contracts
- Infrastructure
- Documentation that affects development behavior
