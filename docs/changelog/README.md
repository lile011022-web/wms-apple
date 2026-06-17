# Changelog Protocol

This folder is the project modification log.

## Rule

Whenever code, structure, configuration, or delivery artifacts are changed, update:

```text
docs/changelog/YYYY-MM-DD.md
```

If multiple changes happen on the same date, overwrite and extend the same date file. Do not create multiple files for the same day.

## Required Content

Each daily changelog must include:

- What changed
- Which files or modules were touched
- Where future maintainers should modify related behavior
- What each affected module does
- How to use or run the changed area
- Any safety notes or follow-up tasks

This makes each delivery easy to locate and maintain without reading the full commit history.
