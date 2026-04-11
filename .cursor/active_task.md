# Active Task: PostGIS drift repair — migration 083
**Status:** Planning
**Workflow:** WF3 — Bug Fix (schema drift repair)
**Rollback Anchor:** `ae10e2ef` (feat(75_lead_feed_implementation): Phase 7 polish)
**Domain Mode:** Backend/Pipeline (migration + backfill + Drizzle regen — no UI or route code)

## Context

User has installed PostGIS 3.6.2 at the OS level (confirmed: `pg_available_extensions` now shows `postgis 3.6.2`). This executes the drift-repair plan that was deferred per commit `53dcb29` ("defer PostGIS drift repair — cost exceeds benefit") back when the OS-level install was the bigger blocker.

**Why it's back in scope now:**
- PostGIS is installed and available (`pg_available_extensions` row present)
- The `/api/leads/feed` pre-flight will now pass (isPostgisAvailable returns true)
- But the feed query will fail with a DIFFERENT error (`column "location" does not exist`) because migrations 039/067/078 silently no-op'd their PostGIS-dependent content due to defensive guards
- Without this migration, the user sees "Can't reach the server" in the dashboard (worse than the prior DEV_ENV_MISSING_POSTGIS message)

## State Verification (completed)

```
psql SELECT ... pg_extension WHERE extname LIKE 'postgis%'
  → (0 rows)  [extension NOT yet created in buildo db]

psql SELECT name FROM pg_available_extensions WHERE name LIKE 'postgis%'
  → postgis 3.6.2, postgis_raster, postgis_sfcgal, postgis_tiger_geocoder, postgis_topology
  [5 rows — OS-level package IS installed]

psql \d permits (columns IN ('location','latitude','longitude'))
  → latitude, longitude  [location column MISSING]

psql SELECT COUNT(*) FROM permits WHERE location IS NOT NULL
  → ERROR: column "location" does not exist
```

Confirmed: Step 1 (OS install) done by user. Steps 2 (CREATE EXTENSION) and 3 (schema drift repair) pending.

## Target Specs
- `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 0 (PostGIS location column was intended for Phase 0)
- `docs/specs/00_engineering_standards.md` §3 (Database), §9 (Pipeline & Script Safety)
- `docs/adr/004-manual-create-index-concurrently.md` (operator runbook pattern)
- `docs/specs/01_database_schema.md` (if location columns referenced)

## Key Files
- `migrations/083_postgis_drift_repair.sql` — NEW migration
- `migrations/039_schema_hardening.sql` — source of truth for parcels/neighbourhoods geom adds + backfills (NOT modified, migration 083 replays its content)
- `migrations/067_permits_location_geom.sql` — source of truth for permits.location + trigger (NOT modified)
- `migrations/078_permits_location_geography_index.sql` — source of truth for geography expression index (NOT modified)
- `src/features/leads/lib/get-lead-feed.ts:637` — the `pool.query(LEAD_FEED_SQL)` that fails without `permits.location`
- `src/lib/db/generated/schema.ts` — Drizzle regen output after the migration runs
- `src/tests/migration-083-drift-repair.infra.test.ts` — NEW file-shape test

## The Drift

Migrations marked applied but their content silently skipped:

| Migration | Content Supposed to Ship | Why It Didn't Run |
|---|---|---|
| 039 | `parcels.geom`, `neighbourhoods.geom` columns + jsonb→geom backfills + GiST indexes | Historical — PostGIS may have been installed once, then removed. 039 has no defensive guard so if PostGIS was absent at migration time, it would have errored; schema_migrations marker may predate a DB wipe |
| 067 | `permits.location` column + `permits_set_location()` trigger + `idx_permits_location_gist` | 067 has a defensive `IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN RETURN` guard that silently no-op'd when postgis was absent |
| 078 | `idx_permits_location_geography_gist` expression index for `(location::geography)` | Same defensive guard as 067 |

Net state: all 3 migrations marked applied, none of the PostGIS-dependent content actually exists in the schema.

## Technical Implementation

### Migration 083 — `migrations/083_postgis_drift_repair.sql`

Structure (all idempotent):

1. **Pre-flight check** — raise a descriptive `EXCEPTION` if `pg_available_extensions` doesn't show `postgis`. Gives a clearer error than the default `could not open extension control file` if the migration runs on a postgis-less env.

2. **Extension** — `CREATE EXTENSION IF NOT EXISTS postgis` (loads the extension into the buildo DB; user hasn't done this yet per state verification).

3. **Replay 039's PostGIS-dependent body:**
   - `ALTER TABLE parcels ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326)`
   - Backfill: `UPDATE parcels SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326) WHERE geometry IS NOT NULL AND geom IS NULL`
   - `CREATE INDEX IF NOT EXISTS idx_parcels_geom_gist ON parcels USING GiST (geom)`
   - Same 3 steps for `neighbourhoods`

4. **Replay 067's body:**
   - `ALTER TABLE permits ADD COLUMN IF NOT EXISTS location geometry(Point, 4326)`
   - `CREATE OR REPLACE FUNCTION permits_set_location()` (exact body from 067, no range validation — that's 077's orphan code, not in scope)
   - `DROP TRIGGER IF EXISTS trg_permits_set_location; CREATE TRIGGER ...`
   - `CREATE INDEX IF NOT EXISTS idx_permits_location_gist ON permits USING GIST (location)`

5. **Backfill `permits.location`** for existing rows (~237K+):
   - `UPDATE permits SET location = ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326) WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND location IS NULL`
   - Direct SET on `location` (not via trigger) so the backfill runs in a single pass. The trigger fires only on UPDATE OF latitude, longitude, not on SET location.
   - Range guards reject corrupted rows (location stays NULL for them); the lead feed SQL already filters `p.location IS NOT NULL`

6. **Replay 078's body:**
   - `CREATE INDEX IF NOT EXISTS idx_permits_location_geography_gist ON permits USING GIST ((location::geography))`
   - Created AFTER the backfill so index statistics reflect populated rows

7. **DOWN block** — commented-out drops in reverse order. Does NOT drop the `postgis` extension (other tables may depend on it after repair).

### Validator concerns

The prior WF3 draft of migration 083 was caught by `scripts/validate-migration.js` flagging `CREATE INDEX` on the `permits` large-table without `CONCURRENTLY`. Migrations 067 and 078 worked around this by wrapping the index creates in a `DO $mig$ EXECUTE ... END $mig$` block. I'll mirror that pattern for the large-table indexes.

### Post-migration steps

- `npm run db:generate` — regenerate Drizzle schema.ts with the new columns + indexes
- Live verification: curl `/api/leads/feed` — expect HTTP 200 with real lead data (not 503, not 500)
- Verify `permits.location IS NOT NULL` count matches the geocoded permit count

## Database Impact: YES

- `ALTER TABLE parcels/neighbourhoods/permits ADD COLUMN IF NOT EXISTS` (idempotent)
- `UPDATE permits SET location = ...` on ~237K rows (~20-60s runtime)
- `UPDATE parcels SET geom = ...` + `UPDATE neighbourhoods SET geom = ...` (much smaller tables)
- 5 `CREATE INDEX IF NOT EXISTS` operations (all on already-indexed tables; no destructive operations)
- `CREATE OR REPLACE FUNCTION permits_set_location()` + `CREATE TRIGGER trg_permits_set_location`

## Standards Compliance (§10)

- ✅ **DB §3:**
  - Migration 083 has `IF NOT EXISTS` guards on every column add + index create
  - Backfill UPDATE uses `WHERE ... IS NULL` for idempotency
  - DOWN block present (commented, per repo convention for forward-only migrations)
  - Operator runbook in migration header documents out-of-band `CREATE INDEX CONCURRENTLY` path for production
  - Validated by `scripts/validate-migration.js`
- ✅ **Pipeline §9:** N/A for migration content itself; the DB schema changes don't touch pipeline scripts. No dual code path concerns (`get-lead-feed.ts` already uses `p.location::geography` and the rest of the codebase matches).
- ⬜ **API:** N/A — no route changes
- ⬜ **UI:** N/A — no component changes
- ⬜ **Shared Logic:** N/A — `LEAD_FEED_SQL` is unchanged, it just starts succeeding
- ✅ **logError Mandate:** N/A for migration, but note the existing `internalError()` catch in `/api/leads/feed/route.ts` will log any migration-related failures

## Execution Plan

- [x] **Rollback Anchor:** `ae10e2ef`
- [x] **State Verification:** PostGIS available at OS level (3.6.2); extension not yet created in buildo; permits.location column missing
- [ ] **Spec Review:** Skim spec 75 §11 Phase 0 + existing migration 067 header for the operator runbook pattern
- [ ] **Write migration 083** with full header, pre-flight check, idempotent column/trigger/index adds, backfill, DOWN block
- [ ] **Write file-shape test** `src/tests/migration-083-drift-repair.infra.test.ts` asserting:
  - File exists
  - Pre-flight EXCEPTION with actionable message
  - `CREATE EXTENSION IF NOT EXISTS postgis`
  - `permits.location` ADD COLUMN + backfill WHERE clause with range guards
  - `parcels.geom` / `neighbourhoods.geom` ADD COLUMN + backfills
  - Function `permits_set_location()` + trigger `trg_permits_set_location`
  - `idx_permits_location_gist` + `idx_permits_location_geography_gist`
  - DOWN block present (commented)
  - Backfill UPDATE appears BEFORE the geography expression index (positional)
- [ ] **Red Light:** Run the new test (should fail because file doesn't exist yet)
- [ ] **Validate:** `node scripts/validate-migration.js migrations/083_postgis_drift_repair.sql`
- [ ] **Apply:** `npm run migrate` (runs 083 against local buildo)
- [ ] **Verify via psql:**
  - `SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis'` → 1 row
  - `SELECT column_name FROM information_schema.columns WHERE table_name='permits' AND column_name='location'` → 1 row
  - `SELECT COUNT(*) FROM permits WHERE location IS NOT NULL` → matches the geocoded count
  - `SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_permits_location_gist', 'idx_permits_location_geography_gist')` → 2 rows
- [ ] **Drizzle regen:** `npm run db:generate` (picks up permits.location + friends)
- [ ] **Typecheck + full test suite** (file-shape tests pass; all existing tests still pass)
- [ ] **Live verification:** curl `/api/leads/feed?trade_slug=plumbing&lat=43.65&lng=-79.38&radius_km=10&limit=15 --cookie __session=dev.buildo.local` → expect HTTP 200 with real lead data
- [ ] **Pre-Review Self-Checklist (5 sibling-bug items):**
  1. Does the backfill UPDATE trigger the `trg_permits_set_location` trigger and cause double-processing? (Answer: NO — trigger only fires on UPDATE OF latitude, longitude; we SET location directly.)
  2. Are range guards (`latitude BETWEEN -90 AND 90`, `longitude BETWEEN -180 AND 180`) in the backfill correct for WGS84? (Answer: yes — matches the existing range check in 077's orphan function.)
  3. Is the geography expression index created BEFORE the backfill runs? (Answer: NO — created AFTER so index stats reflect populated rows. Order matters for query planner.)
  4. Does the migration work safely in production if re-run? (Answer: every step is idempotent via `IF NOT EXISTS` / `IS NULL` clauses. Safe.)
  5. Does the migration break the existing `get-lead-feed.ts` query that already references `::geography` casts? (Answer: NO — the query was already correct; the schema just hadn't caught up. Adding the column and the geography expression index makes the query start succeeding, not failing.)
- [ ] **Independent Review Agent** (worktree NOT used — changes uncommitted)
- [ ] **Adversarial Review Agent** — attack vectors: backfill correctness, trigger semantics, concurrent DDL, production no-op behavior, corrupted lat/lng data, Drizzle regen drift
- [ ] **Triage + Apply Fixes** — fix real findings inline, defer minor items to `review_followups.md`
- [ ] **Full Test Suite Re-Run**
- [ ] **Atomic Commit:** `fix(01_database): migration 083 repairs PostGIS drift from 039/067/078`
- [ ] **Update `review_followups.md`:**
  - CLOSE the prior "WF3 2026-04-11 Value-check (deferred)" row with `closed-in-(this commit)`
  - CLOSE any related follow-ups that this migration unblocks
  - DEFER any new findings from the reviews

## Why WF3 Not WF1

This is a BUG FIX — the drift is a pre-existing defect where migrations 039/067/078 were marked applied without running their PostGIS content. Not new feature work. The fix repairs pre-existing schema state rather than introducing new capabilities.

## Scope Discipline — EXPLICITLY OUT

- ❌ Fixing migration 077's orphan `sync_permit_location` function (separate pre-existing bug, defer)
- ❌ Adding range validation to the trigger (077's original intent, wrong function name, defer)
- ❌ Dropping legacy jsonb `parcels.geometry` / `neighbourhoods.geometry` columns (may have consumers)
- ❌ Adding perf marks to the feed route's error paths (prior WF1 Phase 7 deferred item)
- ❌ Threading the dev-env 503 message through `EmptyLeadState` UI (prior WF3 deferred)
- ❌ Any frontend changes — this migration unblocks the existing frontend, no React work needed
