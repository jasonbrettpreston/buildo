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

### 4.3 Frontend Security
- **Rule:** Never place API keys, admin SDK credentials, or database connection strings in `use client` components. Firebase client config (public keys) is the only exception.
- **Rule:** Never use `dangerouslySetInnerHTML` without explicit sanitization. Prefer React JSX which escapes by default.
- **Rule:** API routes must return only the fields the UI needs. Never `SELECT *` — always project specific columns. This limits exposure if an API route is accessed directly.
- **Rule:** All authorization must be enforced server-side in API routes or middleware. Client-side route hiding (e.g., hiding an admin link) is cosmetic, not security. Both must exist.
- **Rule:** User-provided input displayed in the UI (search terms, company names, addresses) must be treated as untrusted. Watch for reflected XSS in query params rendered into page content.

### 4.4 API Design for Multi-App Consumption
- **Rule:** API routes are the **contract boundary** between frontend and backend. They must be designed as stable, versioned interfaces that could serve multiple client apps.
- **Response shape:** All API routes must return a consistent envelope: `{ data, error, meta }`. Never return raw arrays or ad-hoc shapes.
- **No client assumptions:** API routes must not assume which frontend is calling. Do not embed UI-specific logic (pagination styles, component-shaped responses) in the API layer. Return normalized data; let each client transform it.
- **Auth via tokens, not cookies (future):** Current cookie-based auth works for the Next.js app. When a second client app is added, migrate to Bearer token auth (Firebase ID tokens in `Authorization` header) so non-browser clients can authenticate.
- **Rate limiting:** Public-facing API routes must include rate limiting before a second app is connected. Use middleware-level throttling, not per-route logic.
- **CORS:** When a second app is added, configure explicit CORS origins in `next.config.js`. Never use `Access-Control-Allow-Origin: *` in production.

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

### 9.4 Pipeline SDK Mandate
- **Rule:** All pipeline scripts (`scripts/*.js`) MUST use the shared Pipeline SDK (`scripts/lib/pipeline.js`) for infrastructure concerns. No inline `new Pool({...})` instantiation, no bare `console.error()` for error handling.
- **Execution:** Every script must:
  1. `const pipeline = require('./lib/pipeline');`
  2. Wrap its main logic in `pipeline.run('script-name', async (pool) => { ... })`
  3. Use `pipeline.createPool()` (handled by `run()`) — never instantiate `Pool` directly
  4. Use `pipeline.log.{info,warn,error}()` for structured JSON logging
  5. Use `pipeline.withTransaction(pool, fn)` for all multi-row write operations
  6. Call `pipeline.emitSummary({ records_total, records_new, records_updated })` before exit
  7. Call `pipeline.emitMeta(reads, writes, external?)` to declare I/O schema
- **SDK exports:** `createPool`, `run`, `log`, `withTransaction`, `emitSummary`, `emitMeta`, `progress`, `BATCH_SIZE`, `maxRowsPerInsert`, `isFullMode`

### 9.5 Streaming Ingestion
- **Rule:** Data loaders that fetch from external APIs (CKAN, etc.) MUST NOT accumulate all records in memory before processing. Use async generator (yield-per-page) streaming to keep peak memory at O(batch_size) rather than O(total_records).
- **Execution:** Replace array-accumulation fetch patterns with `async function*` generators that `yield` each page of results. Consumers process each batch immediately via `for await...of`.

### 9.6 Pipeline Manifest
- **Rule:** Pipeline metadata (chain definitions, script paths, table reads/writes, feature flags) MUST be declared in `scripts/manifest.json` as the single source of truth.
- **Execution:** The chain orchestrator (`scripts/run-chain.js`) reads chain definitions from the manifest rather than hardcoding them. The UI (`FreshnessTimeline.tsx`) exports chain/registry data that must stay consistent with the manifest. Test coverage validates that every manifest entry points to an existing script file and that chain definitions match the UI registry.

### 9.7 Pipeline Observability (Opt-In)
- **Rule:** The Pipeline SDK (`scripts/lib/pipeline.js`) instruments `run()`, `withTransaction()`, and `progress()` with OpenTelemetry spans and events. Tracing is **opt-in** — it silently no-ops when `@opentelemetry/api` is not installed or no SDK is registered.
- **Execution:** The tracing bootstrap (`scripts/lib/tracing.js`) attempts `require('@opentelemetry/api')` with a try-catch fallback to no-op stubs. Individual pipeline scripts require zero changes — all instrumentation is SDK-internal. To enable tracing:
  1. `npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http`
  2. Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` (or Honeycomb/Datadog endpoint)
  3. Run any pipeline script — spans are exported automatically
- **Span hierarchy:** `pipeline.run.{name}` (root) → `pipeline.transaction` (per write batch) → `pipeline.progress` events (per progress tick)
- **Attributes:** `pipeline.name`, `pipeline.duration_ms`, `pipeline.status`, `db.system=postgresql`

---

## 🧱 10. Frontend/Backend Boundary

### 10.1 Data Flow Direction
- **Rule:** The data flow is strictly one-directional: `[Pipelines] → [Database] → [API Routes] → [Frontend]`. Frontend components never write to pipeline tables. Pipelines never read frontend state. API routes are the only bridge.

### 10.2 Boundary Rules During Frontend Phase
- **Rule:** Frontend WFs must NOT modify files in `scripts/`, `migrations/`, or `scripts/lib/`. If a frontend feature needs data that doesn't exist, add an API route that queries and transforms existing tables — do not change how data enters the database.
- **Rule:** Database schema is frozen during frontend work unless a feature genuinely requires a new column. Convenience columns ("I wish this was pre-computed") should be computed in the API layer instead.
- **Rule:** If a `src/lib/` module is imported by both API routes and frontend components, any modification requires `npx vitest related` to verify no API regression. Shared modules are the highest-risk cross-boundary files.

### 10.3 API Route Discipline
- **Rule:** API routes must be thin — validate input, call a lib function, return the result. Business logic belongs in `src/lib/`, not in route handlers. This keeps logic testable and reusable across future apps.
- **Rule:** New API routes must define Request/Response TypeScript interfaces in a shared types file (`src/lib/[feature]/types.ts`), not inline in the route. This enables type-safe consumption by any client.
- **Rule:** Avoid returning database column names directly. Map to a stable API field name (e.g., `est_const_cost` → `estimatedCost`). This decouples the API contract from the schema, so future DB refactors don't break clients.

---

## ✅ 11. Plan Compliance Checklist

Before presenting "PLAN LOCKED", the plan MUST address each applicable item below. These are not optional — if the condition applies, the corresponding items must appear in the plan.

### If Database Impact = YES:
- [ ] UP + DOWN migration in `migrations/NNN_[feature].sql` (§3.2)
- [ ] Backfill strategy for ALTER on 100K+ row tables (§3.1)
- [ ] `src/tests/factories.ts` updated with new fields (§5.1)
- [ ] `npm run typecheck` planned after `db:generate` (§8.2)

### If API Route Created/Modified:
- [ ] Request/Response TypeScript interface in `src/lib/[feature]/types.ts` (§10.3)
- [ ] Consistent response envelope: `{ data, error, meta }` (§4.4)
- [ ] Overarching try-catch with `logError(tag, err, context)` (§2.2, §6.1)
- [ ] Unhappy-path test cases listed: 400, 404, 500 (§2.1)
- [ ] Route guarded in `src/middleware.ts` (§4.1)
- [ ] No `.env` secrets exposed to client components (§4.3)
- [ ] Returns projected fields only, not `SELECT *` (§4.3)
- [ ] No client-specific assumptions in response shape (§4.4)

### If UI Component Created/Modified:
- [ ] Mobile-first layout: base classes = mobile, `md:`/`lg:` = desktop (§1.1)
- [ ] Touch targets ≥ 44px (§1.1)
- [ ] 375px viewport test in test plan
- [ ] No API keys or secrets in `use client` components (§4.3)
- [ ] User-provided input escaped/sanitized before display (§4.3)

### If Shared Logic Touched (classification, scoring, scope):
- [ ] All dual-code-path consumers identified (§7.1, §7.2)
- [ ] Update plan covers both TS module and JS script
- [ ] `npx vitest related` planned for cross-boundary validation (§10.2)

### If Pipeline Script Created/Modified:
- [ ] Uses Pipeline SDK: `pipeline.run`, `withTransaction`, `emitSummary` (§9.4)
- [ ] Streaming ingestion for external API data (§9.5)

### Frontend Boundary Check (all frontend WFs):
- [ ] No modifications to `scripts/`, `migrations/`, or `scripts/lib/` (§10.2)
- [ ] API route returns stable field names, not raw DB columns (§10.3)
- [ ] Business logic in `src/lib/`, not in route handlers (§10.3)

### Frontend Foundation Check (new code in `src/features/`):
- [ ] Biome check passes (§12.1)
- [ ] No `useEffect` for data fetching — TanStack Query only (§12.2)
- [ ] No `useState` for form fields — React Hook Form + Zod (§12.3)
- [ ] No React Context inside `src/features/leads/` — Zustand only (§12.4)
- [ ] All `onClick`/`onSubmit` handlers call `captureEvent()` (§13.1)
- [ ] Centered modals replaced with Shadcn `<Drawer>` on mobile (§12.5)
- [ ] Lists >50 items wrapped in TanStack Virtual (§12.6)
- [ ] Toast notifications via Sonner — no custom alert banners (§12.7)

### Pre-Review Self-Checklist (always applies, every WF):
- [ ] Before declaring Green Light, generate a 5-10 item self-skeptical checklist from the spec section that governs the change (Behavioral Contract / API Endpoints / Operating Boundaries / §4 Edge Cases). Walk each item against the ACTUAL diff. Output PASS/FAIL per item in the response BEFORE running tests. See `CLAUDE.md` WF1/WF2/WF3 execution plans for the per-workflow phrasing.
- [ ] WF3 variant: list 3-5 sibling bugs that could share the same root cause and verify the fix covers them (or document why each doesn't apply).

### Cross-Layer Contracts Check (always applies):
- [ ] Any numeric threshold that crosses spec ↔ SQL ↔ Zod ↔ migration is sourced from `docs/specs/_contracts.json`, not duplicated as a literal across files (§12.10)
- [ ] If a new threshold is introduced, a row is added to `src/tests/contracts.infra.test.ts` mapping the JSON key to its consumer file(s) so drift becomes a CI failure
- [ ] If a threshold is changed, EVERY consumer file listed in `contracts.infra.test.ts` is updated in the same commit

### Database/Migration Check:
- [ ] New migration has DOWN block (§3.2, §12.8)
- [ ] SQLFluff lint passes for new migration files (§12.8)
- [ ] `validate-migration.js` passes (no DROP without confirmation, no non-CONCURRENTLY indexes on tables >100K rows) (§12.8)
- [ ] No raw SQL string concatenation — parameterized only (§4.2)

---

## 🛠️ 12. Frontend Foundation Tooling

> **Status:** Adopted as of 2026-04-07 for the lead feed feature build (`src/features/leads/`). To be expanded to other frontend code as proven valuable.

### 12.1 Biome (React Logic Linting)
- **Rule:** Biome MUST pass on all files in `src/features/leads/` before commit. Initially scoped to leads; expand after 2-4 weeks of validation.
- **Critical rules (never disable):** `useHookAtTopLevel`, `noFloatingPromises`, `useExhaustiveDependencies`, `useExhaustiveDependencies`, `noUnusedVariables`
- **Why:** These three rules catch the React logic failures we want to prevent: hook ordering bugs, unawaited promises, stale closures
- **Note:** ESLint (`next lint`) continues to run on `scripts/` and the rest of `src/`. Do NOT replace ESLint repo-wide.

### 12.2 Server State (TanStack Query)
- **Rule:** All API data fetching uses `useQuery` / `useMutation` / `useInfiniteQuery`. NEVER use `useEffect` for data fetching.
- **Cache persistence:** Use `PersistQueryClientProvider` with IndexedDB (`idb-keyval`) for offline support. 24h `maxAge`.
- **Query key normalization:** Round geographic coordinates to 3 decimals (~110m) before including in query keys to prevent GPS jitter from creating unbounded cache entries.
- **Why:** Eliminates race conditions, automatic loading/error states, automatic background refetching, cache deduplication.

### 12.3 Form Management (React Hook Form + Zod)
- **Rule:** All forms use React Hook Form for state management and Zod for schema validation. Resolver: `@hookform/resolvers/zod`.
- **Never:** Use local `useState` for form fields. Use uncontrolled inputs registered via RHF.
- **Why:** RHF is uncontrolled, eliminating per-keystroke re-renders. Zod schemas double as TypeScript types.

### 12.4 Global State (Zustand, NOT React Context)
- **Rule (scoped):** Inside `src/features/leads/`, NEVER use `React.createContext` or `useContext` for global state. Use Zustand stores. AST-grep enforces.
- **Persistence:** Use `zustand/middleware` `persist` for filter state that should survive page reloads.
- **Allowed Context exceptions:** 3rd-party providers (`QueryClientProvider`, `ThemeProvider`, etc.) are not in scope of this rule because they are wrappers, not application state.
- **Why:** Context triggers re-renders on every consumer for any state change. Zustand subscribes per-selector, avoiding the cascade.

### 12.5 UI Primitives (Shadcn UI + Mobile-First)
- **Rule:** Use Shadcn UI for foundational primitives — Modals, Drawers, Dropdowns, Forms, Date Pickers. Run `npx shadcn@latest add [component]` to install each.
- **Mobile rule:** On mobile viewports, NEVER use centered `<Dialog>` modals. Use Shadcn `<Drawer>` (powered by Vaul) for all popups, sheets, contextual menus, and forms.
- **Why:** Shadcn provides accessible, touch-friendly primitives out of the box. Vaul provides iOS-grade gesture physics (`cubic-bezier(0.32, 0.72, 0, 1)`) that reaching the close button on a centered modal cannot match on mobile.

### 12.6 List Virtualization (TanStack Virtual)
- **Rule:** Any list/feed/grid expected to render more than 50 items MUST be wrapped in `useVirtualizer` from `@tanstack/react-virtual`.
- **Why:** Rendering thousands of DOM nodes crashes mobile browsers and tanks frame rate. Virtualization renders only visible items + a small overscan buffer.

### 12.7 Toast Notifications (Sonner)
- **Rule:** Use Shadcn's Sonner integration for all success/error/info notifications. Use `toast.success()`, `toast.error()`, `toast.info()`.
- **Never:** Build custom alert banners. Never use `alert()`, `confirm()`, or `prompt()` (they freeze the entire mobile browser).
- **Why:** Sonner stacks neatly, supports swipe-to-dismiss, and never blocks the UI thread.

### 12.8 SQL Linting & Migration Safety
- **Rule:** All NEW migration files must pass `sqlfluff lint --dialect postgres`. Existing migrations (001-069) are grandfathered.
- **Rule:** All NEW migrations must pass `scripts/validate-migration.js`, which catches:
  - `DROP TABLE` or `DROP COLUMN` without explicit user confirmation comment
  - `CREATE INDEX` (non-CONCURRENT) on tables with >100K rows
  - Missing `-- DOWN` block
  - `UPDATE` without `WHERE` clause (full-table scan risk)
- **Rule:** All migrations must include a DOWN section that reverses the UP changes.
- **Why:** Backwards compatibility, rollback safety, no production lock incidents.

### 12.10 Real-DB Integration Tests (testcontainers + CI service)
- **Status:** Adopted 2026-04-08 after the Phase 0+1+2 holistic review. Mocked-pool tests cannot catch SQL syntax errors, constraint violations, FK cascades, geography casts, or column-width truncation — that bug class accounted for ~40% of recent holistic-review findings.
- **Rule:** Every NEW migration that adds a CHECK constraint, FK with cascade, or PostGIS expression MUST land with a `*.db.test.ts` file under `src/tests/db/` that exercises the constraint against a real Postgres.
- **Local opt-in:** `BUILDO_TEST_DB=1 npm run test:db` spawns a `postgis/postgis:16-3.4-alpine` container via testcontainers, applies migrations 001..NNN via `scripts/migrate.js`, runs the suite, tears down. Requires Docker.
- **CI:** `.github/workflows/db-tests.yml` provides a Postgres service container; runs on every PR that touches migrations, db client, or db tests.
- **Skip semantics:** When neither `DATABASE_URL` nor `BUILDO_TEST_DB=1` is set, every `*.db.test.ts` self-skips via `describe.skipIf(!dbAvailable())`. The standard `npm run test` is unaffected.
- **Why:** A real DB catches the bugs that locked our team into "reading SQL by eye" for 3+ phases. The migration 030 self-heal that this section's WF shipped removes the 1a blocker that was forcing the mock-only fallback.

### 12.11 Footgun Lint Gate (AST-grep + grep)
- **Status:** Adopted 2026-04-08. Five pattern bans wired into pre-commit + manual `npm run ast-grep:leads`. Initially scoped to `src/features/leads/` and (rule-by-rule) `src/lib/`. Expand per the §12 conservative model.
- **Rules enforced** (each maps to a bug class the holistic reviews keep flagging):
  1. **silent-catch-fallback** — bans `try/catch { return [] / null / emptyResult() }`. Caught Phase 2 holistic CRIT (`getLeadFeed` swallowing DB errors as 200 empty feeds, commit 0a3e680).
  2. **env-default-in-lib** — bans `process.env.X || 'default'` inside `src/features/leads/`. A typo silently uses the default instead of failing loud. Suppressable per-line with justification.
  3. **comment-rot** — grep heuristic: any file with `// never throws` / `// always returns` AND a `throw` statement is flagged. Caught Phase 0+1+2 holistic HIGH (stale "never throws" comment in feed/route.ts, commit 449fb2a).
  4. **silent-row-drop** — grep heuristic: any file with `.filter((x): x is _ => x !== null)` AND no `logWarn` call is flagged. Caught Phase 0+1+2 holistic MED (`mapRow` silent null filter).
  5. **pool-boundary** — bans `new Pool(` instantiation outside `src/lib/db/`, `src/tests/`, `scripts/`. Per CLAUDE.md Backend Mode rule 3.
- **Suppression:** `// ast-grep-disable-next-line <rule-id>` with a one-line justification. Audited in code review.
- **Files:** rule definitions live in `scripts/ast-grep-rules/*.yml`; the grep-based heuristics + runner live in `scripts/hooks/ast-grep-leads.sh`.

### 12.12 Property-Based Tests (`fast-check`)
- **Status:** Adopted 2026-04-08 after Phase 0+1+2 holistic review caught arithmetic-invariant violations (fit_score=23, buildLeadKey '0'/'00' drift) that example-based tests missed.
- **Rule:** Pure functions with arithmetic invariants — scoring formulas, key normalizers, distance/unit conversions, cursor comparators — MUST have at least one `fast-check` property test asserting the invariant. Example-based tests are still required for happy paths and explicit edge cases.
- **What counts as an invariant:** a property that holds for ALL inputs of the type. Examples: `forAll(input => relevance_score(input) <= 100)`, `forAll(input => buildLeadKey(input) === buildLeadKey(normalize(input)))`, `forAll(a < b => format(a) <= format(b))`.
- **Files:** `src/tests/property/*.property.test.ts`. Run via `npm run test:property` or as part of the standard `npm run test`.
- **Why:** A counterexample-finding test does the work that human review can't — it tries 100+ inputs and shrinks failures to a minimal reproduction. The Phase 0+1+2 buildLeadKey fix would have shipped 4 phases earlier with this in place.

### 12.13 Mutation Testing (Stryker)
- **Status:** Adopted 2026-04-08. Manual / weekly cadence, NOT pre-commit.
- **Rule:** The 4 high-stakes pure modules (`cost-model.ts`, `distance.ts`, `record-lead-view.ts`, `builder-query.ts`) get a Stryker mutation run weekly. Mutation score must stay ≥ 50% (script breaks below).
- **What it catches:** "snapshot-style change-detector tests" where `expect(result).toBe(20)` locks the value but doesn't exercise it in any meaningful behavior assertion. Stryker injects mutations (flip `>=` to `>`, swap constants, etc.) and watches for surviving mutants — every survivor is a test gap.
- **Usage:** `npm run test:mutation:dry` (verifies the runner setup, ~1 min) and `npm run test:mutation` (full run, ~3-5 min on 4 files / 439 mutants).
- **Triage:** For each surviving mutant, EITHER add a focused test that kills it (preferred) OR add a `// stryker disable next-line <mutator>` with justification.
- **Why not pre-commit:** Full runs take minutes. Pre-commit gates must be sub-second to avoid friction.

### 12.14 Semantic-Diff Narrator (Pre-Commit, Opt-In)
- **Status:** Adopted 2026-04-08. Opt-in via `BUILDO_DIFF_NARRATOR=1`. Default OFF.
- **Rule:** When enabled, every `git commit` runs the staged diff through Gemini and appends a 3-5 bullet summary to the commit message footer. Catches stale comments, contract drift, side effects in pure functions, and unexpected files in the diff BEFORE the commit lands.
- **Critical:** **Fails open** on any error (missing key, network timeout, parse failure, empty diff). Never blocks a commit on its own. Test coverage in `src/tests/diff-narrator.logic.test.ts` locks the fail-open contract.
- **Cost:** ~$0.0001 per commit, ~2-5s latency. Negligible for the value when enabled.
- **Enable:** `echo 'export BUILDO_DIFF_NARRATOR=1' >> ~/.bashrc` (or your shell rc).
- **Files:** `scripts/diff-narrator.js` (the Node script), `scripts/hooks/diff-narrator.sh` (the wrapper), `.husky/prepare-commit-msg` (the git hook).

### 12.9 Animation & Gestures (Motion for React)
- **Rule:** Use `motion` package (formerly Framer Motion) for swipe-to-delete, layout transitions, drag interactions, and button press animations.
- **Spring config standard:** `{ type: 'spring', stiffness: 400, damping: 20, mass: 1 }` for button interactions. The Motion default (stiffness 1, damping 10) is intentionally weak and feels sluggish.
- **Never:** Write custom CSS keyframes for complex interactions. Never animate layout properties (use `transform` / `opacity`).
- **Why:** Hardware-accelerated, gesture-tracking, declarative.

---

## 📊 13. Observability Standards

> **Status:** Adopted as of 2026-04-07. Building observability in from day one of the frontend rebuild — lessons learned from the painful retrofit on the backend pipeline.

### 13.1 Product Telemetry (PostHog)
- **Tool:** PostHog (self-hosted free tier covers 1M events/month)
- **Wrapper:** All event capture goes through `src/lib/observability/capture.ts` exporting `captureEvent(name, properties)`. The wrapper handles SSR safety, type-safe event names, and provider abstraction.
- **Type-safe event names:** Define a `EventName` union type. New events require adding to the union (catches typos at compile time).
- **Mandatory coverage:** Every interactive handler in `src/features/leads/` (`onClick`, `onSubmit`, `onChange` for filters) MUST call `captureEvent()`. AST-grep enforces inside the leads feature.
- **PII handling:** Never include user names, emails, addresses in event properties. Use Firebase UID (pseudonymous) for user identification.

### 13.2 Error Tracking (Sentry)
- **Tool:** Sentry (free tier covers 5K events/month)
- **Wiring:** All `app/[...]/error.tsx` route boundaries call `Sentry.captureException(error, { extra: { digest: error.digest } })` in their `useEffect`.
- **Source maps:** Uploaded to Sentry on every production build via `@sentry/nextjs` plugin.
- **Local dev:** Errors logged to console only (Sentry disabled in dev to preserve free tier).

### 13.3 Backend Structured Logging (`logInfo` / `logWarn` / `logError`)
- **Tool:** `src/lib/logger.ts` exports `logError`, `logWarn`, `logInfo`. Each emits a structured JSON line: `{ level, tag, event, timestamp, ...context }`.
- **Rule:** API routes MUST emit at least one `logInfo` per successful request with `{user_id, duration_ms, ...key_params}` for observability.
- **Rule:** All catch blocks use `logError(tag, err, context)`. NEVER bare `console.error`. ESLint enforces.
- **Rule:** Pipeline scripts use `pipeline.log.info/warn/error` from the SDK, which routes to the same underlying logger.

### 13.4 Performance Monitoring (Lighthouse CI)
- **Tool:** Lighthouse CI in GitHub Actions, runs on every PR.
- **Hard budgets (CI fails below these):**
  - Performance: ≥90 mobile (Moto G4 emulation)
  - Accessibility: ≥95
  - Best Practices: ≥90
  - LCP: <2.5s
  - CLS: <0.1
  - TBT: <200ms
- **Why:** Catches performance regressions before merge. Enforces the "right foundation" goal.

### 13.5 Feature Flags (PostHog Flags)
- **Tool:** PostHog feature flags (included in free tier, integrated with telemetry)
- **Rule:** Any new user-facing feature MUST be wrapped in a feature flag check at the route level. The lead feed launches behind `feature_lead_feed_v1`.
- **Rollout pattern:** 0% → 10% (internal testing) → 25% → 50% → 100%. Each step gated on no-error-rate-spike in Sentry.
- **Why:** Decouples deploy from release. Enables instant rollback without redeploy.
