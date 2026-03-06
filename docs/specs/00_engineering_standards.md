# Engineering Standards & Stability Guardrails

This document outlines the strict engineering standards, stability rules, and defensive programming patterns that all AI agents and human developers must adhere to when contributing to the Buildo codebase.

---

## 🏗️ 1. Architecture & UI Standards

### 1.1 Mobile-First UI Mandate
- **Rule:** All Tailwind CSS styling MUST be written mobile-first.
- **Execution:** The base (unprefixed) utility classes must dictate the layout for mobile screens (<=640px). You may only use `sm:`, `md:`, and `lg:` prefixes to enhance or reflow the layout for larger viewports. Do not start with a desktop view and attempt to retrofit mobile breakpoints.
- **Touch Targets:** All interactive elements (buttons, links, toggles, icons) MUST have a minimum tappable area of **44px x 44px**. Use `min-h-[44px] min-w-[44px]` or equivalent padding.
- **Responsive Layout:** Card and row layouts MUST stack vertically on mobile and flow horizontally on desktop. Use `flex flex-col md:flex-row` (not `flex` alone). Dense metadata rows MUST use `flex-wrap`. Tooltips and popovers MUST be capped at `max-w-[calc(100vw-2rem)]` on mobile.

### 1.2 Component Isolation
- **Rule:** Shared UI components (`src/components/ui/`) must remain pure and stateless where possible. They should not directly fetch data via API calls or rely on global context unless explicitly engineered to do so.

---

## 🚨 2. Error Handling & Stability

### 2.1 The "Unhappy Path" Test Mandate
- **Rule:** When writing integration tests (`.infra.test.ts`), you MUST include tests for **error paths and silent failures**.
- **Execution:** Do not merely test "Loading," "Success," and "Error" states. Force errors in the deepest layer of the call stack (e.g., forcing a database `ROLLBACK` to throw, or simulating a network timeout) and explicitly assert that the top layer recovers gracefully or returns a safe HTTP 500 without leaking the raw `.message`.

### 2.2 The Try-Catch Boundary Rule
- **Rule:** Every newly created API route (`export async function GET/POST/PUT/DELETE/PATCH` inside `src/app/api/`) MUST have an overarching `try-catch` block wrapping the entire handler body.
- **Execution:** The catch block MUST return `{ error: 'Human-readable message' }` with an appropriate HTTP status (e.g., 500) and log the raw error server-side only. **Never expose `err.message` to clients.** The guardrail tests in `api.infra.test.ts` scan route files to enforce this.

### 2.3 Assumption Documentation
- **Rule:** Before accessing nested object properties, explicitly check for `null` or `undefined`.
- **Execution:** Use TypeScript Optional Chaining (`?.`) or explicit type guards. Do NOT use the non-null assertion operator (`!`) unless the value's existence is mathematically guaranteed by a prior validation step. If using `!`, you must document why in an inline comment.

---

## 🗄️ 3. Database Management & Scaling

### 3.1 Zero-Downtime Migration Pattern
- **Rule:** When altering existing columns in a database table larger than 100,000 rows, do NOT use `ALTER TABLE ... ALTER COLUMN` directly.
- **Execution:** Use the **Add-Backfill-Drop** pattern to avoid table-locking:
  1. Add the new column.
  2. Backfill data into the new column.
  3. Swap application references to the new column.
  4. Drop the old column in a subsequent deployment.
- **Execution:** `CREATE INDEX` on large tables should use the `CONCURRENTLY` keyword when applicable.

### 3.2 Pagination Enforcement
- **Rule:** Any API route that reads from growing database tables (`permits`, `coa_applications`) MUST enforce pagination boundaries. Unbounded `SELECT *` without `LIMIT` is strictly forbidden.

---

## 🔐 4. Security & API Contracts

### 4.1 Route Guarding
- **Rule:** All endpoints within `src/app/api/` must be analyzed for protection via the `src/middleware.ts` configuration. Never leave administrative routes unprotected.

### 4.2 Parameterization
- **Rule:** Raw SQL statements must utilize Drizzle parameterized queries to prevent SQL injection. String concatenation for dynamic queries (especially via `order by` or search terms) is forbidden unless rigorously validated against a static whitelist.

---

## 🧪 5. Testing Standards

### 5.1 Typed Factories Only
- **Rule:** Never write untyped inline mocks (e.g., `const permit = {id: 1}`). You MUST always import typed factories from `src/tests/factories.ts`.

### 5.2 Test File Pattern
| Pattern | Tests | Example |
|---------|-------|---------|
| `*.logic.test.ts` | Pure functions, scoring, classification | `scoring.logic.test.ts` |
| `*.ui.test.tsx` | React component rendering, interactions | `admin.ui.test.tsx` |
| `*.infra.test.ts` | API routes, DB queries, external calls | `api.infra.test.ts` |
| `*.security.test.ts` | Negative/abuse — blocks malicious payloads and unauthorized users | `auth.security.test.ts` |

### 5.3 Test Data Seeding
- **Rule:** To set up specific DB scenarios for testing or demos, create `scripts/seed-[scenario].js`. Define a JSON state object, insert it, and verify DB contents.

---

## 📡 6. Centralized Logging

### 6.1 logError Mandate
- **Rule:** All server-side error logging MUST use `logError()` from `src/lib/logger.ts` — never bare `console.error()` in API routes or lib modules. Client-side components (React `'use client'`) may use `console.error` since `logError` imports server-only modules.
- **Execution:** `logError(tag, err, context)` writes to `console.error` locally and reports to Sentry when `SENTRY_DSN` is configured in production. The guardrail tests in `api.infra.test.ts` enforce that critical paths import `logError`.
