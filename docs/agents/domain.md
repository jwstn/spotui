# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area being explored.

If a file or directory does not exist, proceed silently. The `/domain-modeling` skill creates domain documentation lazily when terms or decisions are resolved.

## File structure

This is a single-context repository:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Use the glossary vocabulary from `CONTEXT.md`. If a needed concept is not defined there, note the gap for `/domain-modeling`.

Flag any ADR conflict explicitly rather than silently overriding it.
