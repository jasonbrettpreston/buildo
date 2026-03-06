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

### 3.2 Migration Rollback Safety
- **Rule:** Every migration file in `migrations/` MUST contain both `UP` and `DOWN` blocks so any schema change can be reversed with a single rollback.
- **Execution:** Write `-- UP` (create/alter/add) and `-- DOWN` (drop/revert) SQL in the same `NNN_[feature].sql` file. If Database Impact is YES in the Active Task, the migration file is a mandatory deliverable — never skip it.

### 3.3 Pagination Enforcement
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

### 5.3 Red-Green Test Cycle (Golden Rule)
- **Rule:** You MUST write and run a **failing test** (Red Light) BEFORE writing any feature or fix code. Code may not be written until the test demonstrably fails.
- **Execution:** For new API routes and database mutations, the failing test MUST be an `.infra.test.ts` that exercises the **unhappy path** (error responses, invalid input, missing auth). For pure logic, use `.logic.test.ts`. Run the test and confirm it fails — only then implement the code to make it pass (Green Light). This is the single strongest defense against hallucinated or untested code.

### 5.4 Test Data Seeding
- **Rule:** To set up specific DB scenarios for testing or demos, create `scripts/seed-[scenario].js`. Define a JSON state object, insert it, and verify DB contents.

---

## 📡 6. Centralized Logging

### 6.1 logError Mandate
- **Rule:** All server-side error logging MUST use `logError()` from `src/lib/logger.ts` — never bare `console.error()` in API routes or lib modules. Client-side components (React `'use client'`) may use `console.error` since `logError` imports server-only modules.
- **Execution:** `logError(tag, err, context)` writes to `console.error` locally and reports to Sentry when `SENTRY_DSN` is configured in production. The guardrail tests in `api.infra.test.ts` enforce that critical paths import `logError`.

---

## 🔀 7. Dual Code Path Safety

### 7.1 Classification Sync Rule
- **Rule:** Trade classification logic exists in two parallel implementations that MUST stay in sync:
  - `src/lib/classification/classifier.ts` — TypeScript API used by the web app
  - `scripts/classify-permits.js` — standalone Node.js script for batch DB processing
- **Execution:** When modifying classification rules (tag-trade matrix, tier rules, narrow-scope codes, confidence thresholds), you MUST update **both** files. Before committing, verify both paths produce identical output for the same input by running the classification test suite: `npx vitest run src/tests/classification.logic.test.ts`.

### 7.2 Scope Classification Sync
- **Rule:** The same dual-path constraint applies to scope classification:
  - `src/lib/classification/scope.ts` — TypeScript API
  - `scripts/classify-scope.js` — standalone batch script
- **Execution:** Changes to scope tags, project types, or the `classifyScope()` algorithm must be mirrored in both files.

---

## ⚙️ 8. Next.js & TypeScript Constraints

### 8.1 API Route Export Rule
- **Rule:** Next.js App Router `route.ts` files may ONLY export HTTP handler functions (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`). Exporting any other function, constant, or type from a `route.ts` file will cause a build error or silent runtime failure.
- **Execution:** If a route file needs shared helper logic, extract it to a module under `src/lib/` and import it. Never `export function` or `export const` from route files unless it is a named HTTP handler.

### 8.2 TypeScript Target Gotchas
- **Rule:** The project `tsconfig.json` targets **ES2017**. Be aware of these constraints:
  - Regex `s` flag (dotAll) requires ES2018+ — use `[\s\S]` instead.
  - `process.env.NODE_ENV = 'test'` fails due to literal type narrowing — use `(process.env as Record<string, string>).NODE_ENV = 'test'`.
  - `typeof globalThis.google` breaks in Next.js client bundles — use `(window as any).google`.
  - The `functions/` directory (Cloud Functions) has its own `tsconfig.json` and MUST be excluded from the root config.

---

## 🛢️ 9. Pipeline & Script Safety

### 9.1 Transaction Boundaries
- **Rule:** Pipeline scripts (`scripts/*.js`) that write to the database MUST wrap multi-row mutations in explicit transactions (`BEGIN` / `COMMIT`). The `ROLLBACK` in the catch block MUST itself be wrapped in a nested try-catch to prevent crash-on-rollback-failure.

### 9.2 PostgreSQL Parameter Limit
- **Rule:** PostgreSQL has a hard limit of **65,535 parameters** per prepared statement. Batch `INSERT` statements in pipeline scripts MUST use sub-batch chunking (e.g., `MAX_ROWS_PER_INSERT = 4000` for a table with 16 columns: 4000 x 16 = 64,000 params).
- **Execution:** When adding columns to a table that has a batch insert script, recalculate `MAX_ROWS_PER_INSERT` to stay under 65,535. The formula is: `Math.floor(65535 / number_of_columns)`.

### 9.3 Idempotent Scripts
- **Rule:** All pipeline scripts MUST be safe to re-run. Use `INSERT ... ON CONFLICT DO UPDATE` (upsert) or `DELETE + INSERT` within a transaction rather than bare `INSERT` which fails on duplicate keys.
