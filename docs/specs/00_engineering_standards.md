# Spec 00 -- Engineering Standards

## 1. Goal & User Story
This is the foundational engineering standards document for the Buildo project. All workflows (WF1, WF2, WF3) MUST comply with these rules. The AI is required to read this file before generating any Active Task plan, and must explicitly state compliance in the `## Standards Compliance` section of the plan.

---

## 2. Error Handling & Stability Rules

### Rule 1: Unhappy Path Mandate (WF1 / WF2)
When writing integration tests (`.infra.test.ts`), you MUST include tests for **error paths and silent failures** — not just Loading, Success, and Error states. Force errors in the deepest layer (e.g., database ROLLBACK failure, network timeout) and assert that the top layer recovers gracefully or returns a safe HTTP 500 without leaking `.message`.

### Rule 2: Try-Catch Boundary Rule (WF1 / WF2)
Every newly created `export async function GET/POST/PUT/DELETE/PATCH` inside `src/app/api/` MUST have an overarching `try-catch` block wrapping the entire handler body. The catch block MUST:
- Return `{ error: 'Human-readable message' }` with status 500
- Log the raw error server-side only via `logError()` from `src/lib/logger.ts`
- Never expose `err.message` to clients

The guardrail test in `api.infra.test.ts` scans all route files to enforce this.

### Rule 3: Assumption Documentation (WF2 / WF3)
Before accessing nested properties, check for `null` or `undefined` first. Use Optional Chaining (`?.`) or explicit guards — not non-null assertion (`!`) — unless the value is guaranteed by a prior validation step. If using `!`, document why in a comment.

### Rule 4: Zero-Downtime Migration Rule (WF1 / WF2)
When altering existing columns in a database table larger than 100,000 rows, do NOT use `ALTER TABLE ... ALTER COLUMN` directly. Use the **Add-Backfill-Drop** pattern (add new column -> backfill data -> swap references -> drop old column) to avoid table-locking. `CREATE INDEX` on large tables should use `CONCURRENTLY` when possible.

---

## 3. Testing Standards

**Rule:** Never write untyped inline mocks (e.g., `const permit = {id: 1}`). You MUST always import typed factories from `src/tests/factories.ts`.

### Test File Pattern
| Pattern | Tests | Example |
|---------|-------|---------|
| `*.logic.test.ts` | Pure functions, scoring, classification | `scoring.logic.test.ts` |
| `*.ui.test.tsx` | React component rendering, interactions | `admin.ui.test.tsx` |
| `*.infra.test.ts` | API routes, DB queries, external calls | `api.infra.test.ts` |
| `*.security.test.ts` | Negative/abuse — blocks malicious payloads and unauthorized users | `auth.security.test.ts` |

### Test Data Seeding
To set up specific DB scenarios for testing or demos, create `scripts/seed-[scenario].js`. Define a JSON state object, insert it, and verify DB contents.

---

## 4. Mobile-First UI Rules

### Rule 5: Mobile-First Tailwind (WF1 / WF2)
All Tailwind styling MUST be written mobile-first:
- **Base classes** (unprefixed) = mobile layout
- **`md:` prefix** = tablet/desktop overrides
- **`lg:` prefix** = wide desktop overrides

Never write desktop-first classes that require `sm:` overrides to fix mobile. Start from the smallest screen and add complexity upward.

### Rule 6: Touch Target Minimum (WF1 / WF2)
All interactive elements (buttons, links, toggles, icons) MUST have a minimum tappable area of **44px x 44px** to meet mobile accessibility standards. Use `min-h-[44px] min-w-[44px]` or equivalent padding to achieve this.

### Rule 7: Responsive Layout Pattern (WF1 / WF2)
Card and row layouts MUST stack vertically on mobile and flow horizontally on desktop:
- Use `flex flex-col md:flex-row` (not `flex` alone)
- Dense metadata rows MUST use `flex-wrap` to gracefully reflow on narrow screens
- Tooltips and popovers MUST be capped at `max-w-[calc(100vw-2rem)]` on mobile

---

## 5. Centralized Logging

All server-side error logging MUST use `logError()` from `src/lib/logger.ts` — never bare `console.error()` in API routes or lib modules. Client-side components (React `'use client'`) may use `console.error` since `logError` imports server-only modules.

`logError(tag, err, context)` writes to `console.error` locally and reports to Sentry when `SENTRY_DSN` is configured in production.
