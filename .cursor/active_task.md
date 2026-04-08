# Active Task: WF1 — Backend Phase 0 Foundation
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis (foundation infrastructure)
**Rollback Anchor:** `ad85dcb`

## Domain Mode
**Backend/Pipeline Mode** — DB migrations, pipeline scripts, API auth helpers. Per CLAUDE.md Backend rules: §2/§3/§6/§7/§9 of `00_engineering_standards.md`, Pipeline SDK only, `src/lib/db/client.ts` pool only, dual code path discipline.

## Context
* **Goal:** Land the database + auth + safety-net foundation that the Lead Feed feature depends on. Sibling to the already-shipped Frontend Phase 0 (`f4fc527`). After this lands, the lead feed query layer (Phase 1) can build on real spatial indexes, the API layer can verify Firebase tokens for real (not just cookie shape), and pipeline scripts get a SQL safety net.
* **Target Spec:** `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 0 (backend portions: Day 6 SQLFluff, Day 7 PostGIS + permit columns, Day 10 auth + rate limit). `docs/specs/00_engineering_standards.md` §3 Database, §9 Pipeline Safety, §4 Auth.
* **Key Files:** new — `migrations/067_permits_location_geom.sql`, `migrations/068_permits_photo_url.sql`, `migrations/069_lead_views.sql`, `scripts/validate-migration.js`, `scripts/backfill-permits-location.js`, `src/lib/auth/get-user.ts`, `src/lib/auth/rate-limit.ts`, `.sqlfluff`. Modified — `scripts/hooks/validate-migrations.sh`, `package.json`, `src/middleware.ts` (comment only), `.env.example`.

## Technical Implementation

### New Migrations
- **`067_permits_location_geom.sql`** — Add `permits.location geometry(Point, 4326)`, GIST index `CONCURRENTLY`, `BEFORE INSERT/UPDATE` trigger setting `location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)` when both non-null. Trigger uses `IS DISTINCT FROM` to no-op on unchanged updates. Backfill is a separate script.
- **`068_permits_photo_url.sql`** — `ALTER TABLE permits ADD COLUMN photo_url TEXT NULL`. Pure column add.
- **`069_lead_views.sql`** — `lead_views (user_id TEXT, permit_num TEXT, revision_num INT, viewed_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(user_id, permit_num, revision_num))` + `idx_lead_views_user_viewed (user_id, viewed_at DESC)`. Drives the "3 plumbers have seen this lead" competition signal.

### New Scripts
- **`scripts/validate-migration.js`** — Pre-commit validator extending the existing `validate-migrations.sh`. New rules: detect `DROP TABLE` / `DROP COLUMN` (require explicit `-- ALLOW-DESTRUCTIVE` marker), detect `CREATE INDEX` without `CONCURRENTLY` on known-large tables (`permits`, `permit_trades`, `permit_parcels`, `wsib_registry`, `entities`), detect `ALTER TABLE ... ADD COLUMN ... NOT NULL` without `DEFAULT`. Wired into `validate-migrations.sh` via `node` exec.
- **`scripts/backfill-permits-location.js`** — Pipeline SDK script. Streams permits with `location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL` in 5K batches via `pipeline.streamQuery`. Uses `withTransaction` per batch. Idempotent. Emits `PIPELINE_SUMMARY`.

### New Auth Helpers
- **`src/lib/auth/get-user.ts`** — `getUserIdFromSession(request: NextRequest): Promise<string | null>`. Reads `__session` cookie, calls Firebase Admin `verifyIdToken()`. Returns uid on success, null on any failure (with `logWarn` for expired tokens, `logError` for unexpected). Used by API route handlers (Node runtime). Middleware stays edge-runtime fast and only does the cookie shape pre-check.
- **`src/lib/auth/rate-limit.ts`** — Wrapper around `@upstash/ratelimit` + `@upstash/redis`. Exports `withRateLimit(request, opts)` returning `{ allowed, remaining }`. In-memory fallback when Upstash env vars missing (dev mode). Fail-closed on Redis errors in production, fail-open in development.

### Modified
- **`scripts/hooks/validate-migrations.sh`** — At the end, `node scripts/validate-migration.js "$STAGED_MIGRATIONS"` for the new safety checks.
- **`package.json`** — Add `@upstash/ratelimit`, `@upstash/redis`. Add `sql:lint` script (`sqlfluff lint --dialect postgres migrations/`). SQLFluff itself is a Python tool — install via pip, documented in `.env.example`.
- **`.sqlfluff`** — Postgres dialect, max line 120, indent 2 spaces. Boy Scout Rule: only NEW migrations enforced via include patterns.
- **`src/middleware.ts`** — Add comment block explaining edge-runtime cookie pre-check vs node-runtime full verify split. No behavior change.
- **`.env.example`** — Add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Add SQLFluff install note.

### Database Impact
**YES.** Three new migrations on the `permits` table (237K rows) and one new table.
- 067 (location geom + trigger + index): column add is instant; GIST index uses `CONCURRENTLY` (no lock); trigger fires on subsequent writes. Backfill is a separate idempotent script.
- 068 (photo_url): instant pure column add.
- 069 (lead_views): new empty table, zero risk.

UPDATE strategy for 237K existing rows: `backfill-permits-location.js` runs in 5K batches inside one transaction per batch with `IS DISTINCT FROM` guards. Re-runnable. Estimated wall time ~30 seconds locally.

## Standards Compliance

* **Try-Catch Boundary:** New auth helpers wrap firebase-admin and Upstash calls in try/catch with safe fallbacks. No new API routes in this WF — Phase 1 will add them.
* **Unhappy Path Tests:**
  - `getUserIdFromSession`: missing cookie → null; malformed cookie → null; expired token → null + `logWarn`; firebase-admin not initialized → null + `logError`
  - `withRateLimit`: env missing → in-memory fallback; over limit → denied; Redis throws in prod → fail-closed; Redis throws in dev → fail-open
  - `validate-migration.js`: DROP TABLE without marker → fail; CREATE INDEX without CONCURRENTLY on permits → fail; ADD NOT NULL without DEFAULT → fail; clean migration → pass
  - `backfill-permits-location.js`: empty result → no-op; second run → 0 updates (idempotent)
  - Migration 067 trigger: lat+lng → location set; null lat → location null; UPDATE clearing lat → location nulled
* **logError Mandate:** All new auth helpers and rate-limit wrapper use `logError`/`logWarn` from `src/lib/logger.ts`. Rate-limit allow/deny telemetry uses `logInfo` (`[auth/ratelimit]` tag).
* **Mobile-First:** N/A — backend-only.

## What's IN Scope (this WF)

| Day | Deliverable |
|-----|-------------|
| **1** | `validate-migration.js` + `.sqlfluff` + pre-commit wiring + `sql:lint` script |
| **2** | Migration 067 (permits.location + GIST + trigger) + trigger semantics tests |
| **3** | `backfill-permits-location.js` + dry-run + idempotency verification |
| **4** | Migration 068 (photo_url) + Migration 069 (lead_views) + factories update |
| **5** | `getUserIdFromSession` helper + tests + middleware comment |
| **6** | `@upstash/ratelimit` install + `withRateLimit` wrapper + tests |

## What's OUT of Scope

- The lead feed feature itself (specs 70-75 implementation) — Phase 1+
- Wiring `getUserIdFromSession` and `withRateLimit` into actual API routes — Phase 2
- Migrations 070+ (cost_estimates, lead_claims, etc.) — Phase 2
- Production deployment — separate operational task

## Execution Plan

```
- [ ] Contract Definition: getUserIdFromSession signature locked at
      `(request: NextRequest) => Promise<string | null>`. withRateLimit
      signature locked at `(request, opts) => Promise<{allowed, remaining}>`.
      No HTTP routes touched in this WF.

- [ ] Spec & Registry Sync: Specs 70-75 already exist and are hardened.
      Run `npm run system-map` AFTER implementation.

- [ ] Schema Evolution: 3 new migrations (067/068/069). All have UP + DOWN
      blocks. 067 uses `CREATE INDEX CONCURRENTLY`. After writing migrations:
      `npm run migrate`, `npm run db:generate`, update `src/tests/factories.ts`
      with `lead_views` factory + `permits.location/photo_url` defaults.
      `npm run typecheck` clean.

- [ ] Test Scaffolding: Create:
      - `src/tests/auth-get-user.logic.test.ts` (8-10 tests)
      - `src/tests/rate-limit.logic.test.ts` (6-8 tests)
      - `src/tests/migration-validator.logic.test.ts` (10-12 tests)
      - `src/tests/backfill-location.infra.test.ts` (4-6 tests)
      - `src/tests/migration-067-trigger.infra.test.ts` (6 tests)

- [ ] Red Light: `npm run test`. New test files MUST fail because helpers,
      migrations, and validator script don't exist yet.

- [ ] Implementation:
      Day 1 — Migration safety net:
        a) Create `.sqlfluff`
        b) Create `scripts/validate-migration.js`
        c) Append node validator call to `scripts/hooks/validate-migrations.sh`
        d) Add `sql:lint` script to package.json
        e) Verify with deliberately bad migration

      Day 2 — PostGIS column on permits:
        a) Write `migrations/067_permits_location_geom.sql` (UP + DOWN)
        b) `npm run migrate`
        c) `npm run db:generate`
        d) Run trigger semantics tests

      Day 3 — Backfill script:
        a) Create `scripts/backfill-permits-location.js` using Pipeline SDK
        b) Dry run, then real run on local DB
        c) Verify second run is no-op

      Day 4 — Remaining columns + lead_views:
        a) Write `migrations/068_permits_photo_url.sql`
        b) Write `migrations/069_lead_views.sql`
        c) `npm run migrate && npm run db:generate`
        d) Update `src/tests/factories.ts`

      Day 5 — Auth verification:
        a) Verify `firebase-admin` already installed (it is, package.json line 37)
        b) Create `src/lib/auth/get-user.ts`
        c) Update `src/middleware.ts` comment block
        d) Run auth tests

      Day 6 — Rate limiting:
        a) `npm install @upstash/ratelimit @upstash/redis`
        b) Add env vars to `.env.example`
        c) Create `src/lib/auth/rate-limit.ts`
        d) Run rate-limit tests

- [ ] Auth Boundary & Secrets:
      - `UPSTASH_REDIS_REST_*` are server-only secrets, documented in
        .env.example, never imported from client components.
      - Firebase Admin private key handled via existing
        `src/lib/auth/config.ts` server-only init.
      - getUserIdFromSession is server-only (uses NextRequest from API
        routes).

- [ ] Green Light:
      - `npm run test` — all 2442 + ~38 new tests passing
      - `npm run lint -- --fix` — pass
      - `npm run typecheck` — clean
      - `node scripts/validate-migration.js migrations/067*.sql migrations/068*.sql migrations/069*.sql` — pass
      - Commit pre-commit hook runs new validator
      Output visible execution summary using ✅/⬜ for every step above. → WF6.
```

## Risk Notes

1. **Migration 067 trigger may fire on no-op updates.** Mitigation: `IS DISTINCT FROM` inside the trigger function. Tests verify.
2. **Backfill of 237K rows on production.** Mitigation: 5K batches, transaction per batch, idempotent. Production rollout is a separate operational task.
3. **firebase-admin verifyIdToken latency (~5-15ms).** Mitigation: SDK caches keys after first call. Acceptable for V1.
4. **Upstash Redis adds external dependency.** Mitigation: in-memory fallback for dev; fail-closed in prod.
5. **SQLFluff is Python, not npm.** Mitigation: documented in .env.example. Hard gate is `validate-migration.js` (pure node).
