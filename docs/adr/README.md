# Architecture Decision Records

Short, dated records of architectural decisions that the team has explicitly made and does **not** want to re-litigate every code review. Each ADR captures one decision with its context, rationale, and the conditions under which it should be revisited.

## Why ADRs exist in this repo

Adversarial reviewers (Gemini, DeepSeek, Independent) and per-file holistic reviews keep flagging the same patterns across phases:

- "Dual TS/JS code path is a time bomb"
- "Polymorphic `lead_views` table is an anti-pattern"
- "ON DELETE CASCADE on permits is dangerous"
- "Manual `CREATE INDEX CONCURRENTLY` is operational debt"
- "`Retry-After: 60` is hardcoded, not derived from the rate limit window"
- "`user_id` should be a FK to a users table"

Each one consumes reviewer attention every cycle. The pattern in `docs/reports/review_followups.md` is to mark these WONTFIX with a 1-2 sentence rationale buried in a Markdown table — which the next reviewer doesn't read. ADRs surface the rationale into a 1-page document that source files link directly via `// ADR:` header comments. A future Gemini run sees the link and skips the pattern in 5 seconds instead of generating a fresh "have you considered..." paragraph.

## Format (per ADR)

Each ADR is a 1-page Markdown file following this template:

```markdown
# ADR NNN: <title>

**Status:** Accepted | Superseded by ADR-NNN | Deprecated
**Date:** YYYY-MM-DD
**Decision-makers:** <names or "core team">

## Context
What pattern do reviewers keep flagging? What's the actual code shape that triggers the concern?

## Decision
What we chose, in one sentence.

## Rationale
2-4 sentences, with file:line references and links to spec sections. Include the explicit cost/benefit calculation we did.

## Consequences
The known tradeoffs (good and bad) we accepted.

## Re-evaluation Triggers
Concrete conditions under which we should revisit this decision (e.g., "table grows past 10M rows", "second consumer of dual code path needed", "Postgres minor version supports new syntax").
```

## Index

| # | Title | Status |
|---|---|---|
| [001](001-dual-code-path.md) | Dual TS↔JS code path for classification/scoring/scope | Accepted |
| [002](002-polymorphic-lead-views.md) | Single polymorphic `lead_views` table over split tables | Accepted |
| [003](003-on-delete-cascade-on-permits-fk.md) | ON DELETE CASCADE on `lead_views.permit_num` FK | Accepted |
| [004](004-manual-create-index-concurrently.md) | Manual `CREATE INDEX CONCURRENTLY` for `permits.location` GIST | Accepted |
| [005](005-hardcoded-retry-after-60.md) | Hardcoded `Retry-After: 60` on rate-limited responses | Accepted |
| [006](006-firebase-uid-not-fk.md) | `user_id` columns store Firebase UIDs without FK | Accepted |

## How to add an ADR

1. Copy the template above into `docs/adr/00N-<short-slug>.md`.
2. Fill in all six sections.
3. Add the row to the index above.
4. Add a 1-line `// ADR: docs/adr/00N-<slug>.md — <one-line summary>` comment to the source file(s) the ADR governs.
5. Commit with `docs(00_engineering_standards):` prefix.
