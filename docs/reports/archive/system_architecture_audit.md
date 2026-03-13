# System Architecture & Workflow Audit

**Date:** March 2026
**Target:** `CLAUDE.md` Workflows, System Specifications, and Infrastructure Tests

## Executive Summary
An audit of the Buildo engineering protocols (`CLAUDE.md`), API infrastructure (`api.infra.test.ts`), and authorization specifications reveals a highly mature, defensively programmed system. The codebase enforces strict operational boundaries, automated testing, and secure database interactions. 

Overall, the system is exceptionally well-positioned to scale securely. Below is the detailed rubric evaluation and recommendations for future-proofing.

---

## 🛡️ 1. Security & Authentication (Score: A)
*Rubric: Are routes protected? Is injection prevented? Are secrets isolated?*

**Strengths:**
- **Middleware Guarding:** `route-guard.ts` effectively classifies routes into `public`, `authenticated`, and `admin` tiers, returning safe `401`s for unauthorized access (verified by `api.infra.test.ts`).
- **SQL Injection Prevention:** The parameterized query builder in the API rigorously whitelists `sort_by` columns and prevents injected SQL strings. Pagination limits are strictly clamped (Max: 100).
- **Session Management:** Auth relies on secure, HTTP-only `__session` cookies mapping to Firebase JWTs, preventing XSS token theft.

**Recommendations:**
- *JWT Verification:* Spec 13 notes that full JWT verification via the Firebase Admin SDK is "planned but not yet wired." Implement this to ensure expired or forged cookies are caught dynamically rather than relying solely on surface-level shape validation.

## 📈 2. Scaling & Performance (Score: A-)
*Rubric: Can the system handle high concurrency, large data volumes, and heavy read/write loads?*

**Strengths:**
- **Paginated Read Paths:** The API automatically forces pagination and caps limits, ensuring no single request can dump the 200k+ permit database to memory.
- **Search Efficiency:** Full-text searches utilize Postgres `plainto_tsquery` backed by GIST/GIN indexes, preventing catastrophic sequential scans.
- **Queue Architecture (Scraping):** The new AIC scraping approach handles concurrency perfectly by offloading Playwright workers to a Redis-backed queue (BullMQ), scaling horizontally independent of the main app server.

**Recommendations:**
- *Rate Limiting:* As the public data API grows, implement IP-based rate limiting (via Upstash/Redis or a middleware sliding window) to prevent malicious scraping of your newly enriched entity/permit data.

## 🚨 3. Error Handling & Stability (Score: A+)
*Rubric: Does the system fail gracefully without leaking internal state or crashing?*

**Recent Hardening Efforts:**
The system recently underwent a rigorous error-handling audit, resulting in the deployment of several critical stability patches:
- **A1:** Removed `process.exit(-1)` from the database pool error handler (`db/client.ts`).
- **A2:** Wrapped SQL `ROLLBACK` commands in nested try-catch blocks during sync permit processing to safely swallow rollback failures.
- **A3:** Logged `ROLLBACK` errors in the CSV export stream instead of silently suppressing them.
- **B1:** Removed raw `err.message` exception leakage from 6 different API route error responses.
- **C1 & C2:** Added primary `try-catch` wrappers to public routes `GET /api/builders` and `GET /api/coa`.
- **D1:** Added a `.catch()` boundary to the polling `fetchData` loop in the `DataQualityDashboard` UI to prevent unhandled promise rejections from crashing the frontend.

**Strengths:**
- **Zero-Leak Policy (C8/B1 Rule):** Tests actively scan the AST to ensure no API route exposes raw `err.message` properties to the client, preventing stack trace/database schema leaks.
- **Crash Prevention (C1/A1 Rule):** The database pool error handler is explicitly tested to ensure it never takes down the Node.js server.
- **Guardrail Testing:** 4 specific guardrail tests were written into `api.infra.test.ts` to explicitly lock down these error handling boundaries and prevent future regressions.


**Recommendations:**
- *Monitoring:* Ensure failed API routes and sync rollbacks are piped to a centralized logging service (like Sentry or Datadog) so developers are alerted to silent failures.

## 🗄️ 4. Database Management & Indexing (Score: A-)
*Rubric: Are strict protocols in place for schema evolution and data integrity? Is the schema indexed for performance?*

**Strengths:**
- **Strict Protocol Workflow:** `CLAUDE.md` enforces a rigid Phase-gate (WF1/WF2). Developers *must* write `UP` and `DOWN` migrations in `migrations/NNN_[feature].sql`, run `npm run db:generate`, and immediately type-check boundaries before writing implementation code.
- **Relational Indexing:** Flawless execution. Every single traditional foreign key (e.g., `trade_mapping_rules.tradeId`, `parcel_buildings.parcelId`) has an accompanying B-Tree index. 
- **Full-Text & Array Search:** The `permits.description` field correctly uses a **GIN index with `to_tsvector`** (`idx_permits_description_fts`). This is the gold standard for full-text search in Postgres.
- **Sparse Indexes:** Excellent usage of `WHERE` clauses in Drizzle indexes (e.g. `idx_coa_upcoming_leads` only indexes Approved COA applications lacking a linked permit) keeps memory footprint light.

**Specific Bottleneck & Indexing Recommendations:**
- *Value Filter Scans:* The `permits.estConstCost` field lacks an index. High-value permit filters (e.g., `estConstCost > 1000000`) will currently trigger a sequential scan of the massive permits table.
- *Date Filter Scans:* The `permits.applicationDate` and `coa_applications.hearingDate` fields lack indexes.
- *Geospatial Queries:* Coordinates (`centroidLat`, `centroidLng`) are standard numeric columns. B-Tree composite indexes do not efficiently support spatial queries like "Find all permits within 5km". For future true map viewport bounding, you should adopt PostGIS `geometry` types and GIST indexes.
- *Migration Approvals:* When the database scales beyond 1 million rows, modifying large tables (e.g., dropping a column) can lock the database. Introduce a "Zero-Downtime Migration" rule.

---

## 🏗️ 5. Accumulated Technical Debt Assessment
*Rubric: Are there hidden maintenance costs or architectural tightly-coupled dependencies causing fragility?*

While the system is highly defensive, the recent batch of error handling fixes points to an underlying pattern of **Silent Failure Debt** and **Defensive Programming Drift**.

**The Pattern:** 
As features were built rapidly, the focus shifted toward "getting data into the system" rather than "what happens when the system misbehaves." Variables were assumed to be present, and rollbacks were assumed to always succeed. When they failed, Node's default behaviors took over, leading to crashes or swallowed errors. 

### How to Guard Against Debt Accumulation (Updating `CLAUDE.md`)
To prevent these specific classes of problems from silently creeping back in, we need to enforce testing and architectural guardrails formally within the master protocol.

**Recommended `CLAUDE.md` Master Protocol Updates:**
1. **The "Unhappy Path" Mandate (Update WF1 / WF2):**
   *   *Current State:* Developers test Loading, Success, and Error states.
   *   *New Rule:* Explicitly require testing **Abusive Payloads and Silent Failures**. When writing integration tests (`.infra.test.ts`), the AI agent *must* write tests that force mocked errors in the deepest layer of the call stack (e.g., forcing a database `ROLLBACK` to throw) and asserting that the top layer recovers gracefully or throws a safe HTTP 500 without leaking the `.message`.

2. **The "Try-Catch Boundary" Rule (Update WF1 / WF2):**
   *   *New Rule:* Every newly created `export async function GET/POST/PUT/DELETE` inside `src/app/api/` MUST have an overarching `try-catch` block wrapping the entire execution logic. `api.infra.test.ts` must statically scan new route files for this wrapper.

3. **The "Assumption Documentation" Step (Update WF2 / WF3):**
   *   *Current State:* "Examine the calling context. Document what data is actually available."
   *   *New Rule:* Add a strict requirement to check for `null` or `undefined` references *before* accessing nested properties. The AI agent must use TypeScript strict mode (`!`) or Optional Chaining (`?.`) responsibly, and document in the Active Task if a value is guaranteed by a previous validation step. 

4. **The "Zero-Downtime Migration" Rule (Update WF1 / WF2):**
   *   *New Rule:* When altering existing columns in a database table larger than 100,000 rows, developers must NOT use `ALTER TABLE ... ALTER COLUMN` directly. They must use the Add-Backfill-Drop pattern to avoid table-locking.

---

## 📈 6. Ongoing Audit Strategy & Code Health Tactics

Updating specs and workflows (as you are doing with `CLAUDE.md`) is the absolute best *preventative* measure. To pair with that, here is a recommended *detective* strategy to ensure those rules are actually being followed:

### The "Continuous" Strategy (Automated)
Instead of relying on human memory to trigger audits, automate the friction:
1. **The Pre-Commit Hook Extension:** You already have Husky running `typecheck` and `test`. Consider adding `npx knip` (dead code detection) to the pre-commit hook so unused files and dead exports are literally impossible to commit.
2. **ESLint Banning:** To prevent silent failures, use ESLint rules to globally ban dangerous patterns. For example, add a rule to ban `process.exit()` entirely from the `src/` directory, or a rule that flags `catch (e) {}` blocks that are completely empty.

### The "Periodic" Schedule (Manual Validation)
Trigger the `WF5` (Audit) workflow based on these cadences:

*   **Weekly (The Micro-Audit): Dependency & Dead Code**
    *   *Goal:* Prevent "rot".
    *   *Action:* Run `npm audit` and `npm run dead-code`. Resolve high-severity warnings before starting new features.
*   **Monthly (The Structural Audit): Performance & Database**
    *   *Goal:* Ensure the architecture is surviving the data volume.
    *   *Action:* Review indexing (like we just did). Run custom SQL queries to check for slow queries (`pg_stat_statements`). Check Vercel/Next.js build times and bundle sizes.
*   **Quarterly (The Deep Dive): Security & Architecture**
    *   *Goal:* Re-align the system map with reality.
    *   *Action:* Run the full `node scripts/audit_all_specs.mjs`. Do a manual penetration test (e.g., trying to access admin routes with expired cookies, or testing SQL injection on search inputs). 

### The Golden Rule of AI Generation
When working heavily with AI generation (like we are right now), the system naturally trends towards "verbosity" and "happy path assumptions". 

**Your strongest defense** is forcing the AI to write a failing `.security.test.ts` or `.infra.test.ts` isolating the *Unhappy Path* BEFORE it writes the feature code. If the AI can't prove how the system fails safely, you shouldn't let it write the success state.

---

## 🎯 Action Plan Summary
1. **Short Term:** Implement explicit IP-based Rate Limiting on public API endpoints.
2. **Short Term:** Apply the missing B-Tree indexes to `permits.estConstCost`, `permits.applicationDate`, and `coa_applications.hearingDate` via a new Drizzle migration.
3. **Short Term:** Add the 4 new Rules detailed in the Technical Debt Assessment directly into `CLAUDE.md`.
4. **Medium Term:** Complete the Firebase Admin SDK JWT verification in `src/middleware.ts` to fully harden session security.
5. **Long Term:** Formally transition Lat/Lng storage to PostGIS `geometry` types for true spatial querying capability.
