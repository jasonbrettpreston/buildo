# Active Task: WF1 — Lead Feed Phase 1a: Data Schema
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `0a9d4c3`

## Domain Mode
**Backend/Pipeline Mode** — pure database + pipeline work. No API routes, no UI, no client code. Per CLAUDE.md Backend rules: §2/§3/§6/§9 of `00_engineering_standards.md`, Pipeline SDK only, `src/lib/db/client.ts` pool only, dual code path discipline where applicable.

## Context
* **Goal:** Land the four new database tables + the `entities.photo_url` column that the Phase 1b "Data Layer Code" WF depends on, AND correct a schema drift in `lead_views` (migration 069 shipped in Backend Phase 0 does not match spec 70's contract). After this WF lands, Phase 1b can write `get-lead-feed.ts`, `timing.ts`, `cost-model.ts`, `builder-query.ts`, and `distance.ts` against real schemas.
* **Target Spec:**
  - `docs/specs/product/future/70_lead_feed.md` §Database Schema (`lead_views` corrected shape)
  - `docs/specs/product/future/71_lead_timing_engine.md` §Database Schema (`inspection_stage_map`, `timing_calibration`, seed data)
  - `docs/specs/product/future/72_lead_cost_model.md` §Database Schema (`cost_estimates`)
  - `docs/specs/product/future/73_builder_leads.md` §Migration needed (`entities.photo_url`)
  - `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 1 (preconditions)
  - `docs/specs/00_engineering_standards.md` §3 Database, §9 Pipeline Safety
* **Key Files:** new — `migrations/070_lead_views_corrected.sql`, `migrations/071_cost_estimates.sql`, `migrations/072_inspection_stage_map.sql`, `migrations/073_timing_calibration.sql`, `migrations/074_entities_photo_url.sql`, `scripts/seed-inspection-stage-map.js` (if seed is script-driven not inline), `src/tests/lead-views-schema.infra.test.ts` (or extend existing), `src/tests/cost-estimates-schema.infra.test.ts`, `src/tests/inspection-stage-map.logic.test.ts`, `src/tests/timing-calibration-schema.infra.test.ts`, `src/tests/entities-photo-schema.infra.test.ts`. Modified — `src/tests/factories.ts`, `src/lib/permits/types.ts` (+ related if needed).

## Technical Implementation

### Schema Drift Fix: Migration 070 — lead_views corrected

Backend Phase 0 migration 069 created `lead_views` with `(user_id, permit_num, revision_num, viewed_at)` + composite PK. Spec 70 requires a richer schema with `lead_key`, `lead_type`, `trade_slug`, `entity_id`, `saved`, plus FK CASCADE and different indexing. Because the table is brand-new and has zero production writers, the cleanest correction is to DROP and re-CREATE with the correct shape inside a single migration.

Migration 070 UP:
```sql
-- UP
-- ALLOW-DESTRUCTIVE (lead_views is brand-new from 069, no data to preserve)
DROP TABLE IF EXISTS lead_views CASCADE;

CREATE TABLE lead_views (
  id           SERIAL       PRIMARY KEY,
  user_id      VARCHAR(100) NOT NULL,
  lead_key     VARCHAR(100) NOT NULL,
  lead_type    VARCHAR(20)  NOT NULL CHECK (lead_type IN ('permit', 'builder')),
  permit_num   VARCHAR(30),
  revision_num VARCHAR(10),
  entity_id    INTEGER,
  trade_slug   VARCHAR(50)  NOT NULL,
  viewed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  saved        BOOLEAN      NOT NULL DEFAULT false,
  UNIQUE (user_id, lead_key, trade_slug),
  FOREIGN KEY (permit_num, revision_num)
    REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  -- Ensure XOR: permit leads have permit cols, builder leads have entity_id
  CHECK (
    (lead_type = 'permit' AND permit_num IS NOT NULL AND revision_num IS NOT NULL AND entity_id IS NULL)
    OR
    (lead_type = 'builder' AND entity_id IS NOT NULL AND permit_num IS NULL AND revision_num IS NULL)
  )
);

-- Covering index for the hot competition-count path
CREATE INDEX idx_lead_views_lead_trade_viewed ON lead_views (lead_key, trade_slug, viewed_at);
-- User history
CREATE INDEX idx_lead_views_user_viewed ON lead_views (user_id, viewed_at DESC);
-- BRIN for retention sweep (insert-ordered timestamps)
CREATE INDEX idx_lead_views_viewed_brin ON lead_views USING BRIN (viewed_at);
```

Migration 070 DOWN:
```sql
-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP INDEX IF EXISTS idx_lead_views_viewed_brin;
-- DROP INDEX IF EXISTS idx_lead_views_user_viewed;
-- DROP INDEX IF EXISTS idx_lead_views_lead_trade_viewed;
-- DROP TABLE IF EXISTS lead_views CASCADE;
-- -- Note: recreating the 069 shape is not automatic; forward-only recovery.
```

Note: the DOWN block deliberately does NOT recreate the 069 shape. It just drops the 070 version. If a rollback is ever needed, the migration system applies the 070 DOWN then the 069 DOWN, which leaves the table gone — correct because the table is new and has no pre-069 state.

### Migration 071 — cost_estimates

Per spec 72:
```sql
-- UP
CREATE TABLE cost_estimates (
  permit_num       VARCHAR(30)   NOT NULL,
  revision_num     VARCHAR(10)   NOT NULL,
  estimated_cost   DECIMAL(15,2),
  cost_source      VARCHAR(20)   NOT NULL CHECK (cost_source IN ('permit', 'model')),
  cost_tier        VARCHAR(20)   CHECK (cost_tier IN ('small', 'medium', 'large', 'major', 'mega')),
  cost_range_low   DECIMAL(15,2),
  cost_range_high  DECIMAL(15,2),
  premium_factor   DECIMAL(3,2),
  complexity_score INTEGER       CHECK (complexity_score >= 0 AND complexity_score <= 100),
  model_version    INTEGER       NOT NULL DEFAULT 1,
  computed_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_num, revision_num),
  FOREIGN KEY (permit_num, revision_num)
    REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE
);
CREATE INDEX idx_cost_estimates_tier ON cost_estimates (cost_tier);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP INDEX IF EXISTS idx_cost_estimates_tier;
-- DROP TABLE IF EXISTS cost_estimates CASCADE;
```

### Migration 072 — inspection_stage_map + seed data

Per spec 71. 21 seed rows from the spec table. Seed is inline in the migration (not a script) because it's reference data, small, and deterministic.

```sql
-- UP
CREATE TABLE inspection_stage_map (
  id             SERIAL PRIMARY KEY,
  stage_name     TEXT        NOT NULL,
  stage_sequence INTEGER     NOT NULL,
  trade_slug     VARCHAR(50) NOT NULL,
  relationship   VARCHAR(20) NOT NULL CHECK (relationship IN ('follows', 'concurrent')),
  min_lag_days   INTEGER     NOT NULL,
  max_lag_days   INTEGER     NOT NULL,
  precedence     INTEGER     NOT NULL DEFAULT 100
);
CREATE UNIQUE INDEX idx_inspection_stage_map_stage_trade_prec
  ON inspection_stage_map (stage_name, trade_slug, precedence);
CREATE INDEX idx_inspection_stage_map_trade ON inspection_stage_map (trade_slug);

INSERT INTO inspection_stage_map (stage_name, stage_sequence, trade_slug, relationship, min_lag_days, max_lag_days, precedence) VALUES
('Excavation/Shoring', 10, 'concrete', 'follows', 5, 14, 100),
('Excavation/Shoring', 10, 'waterproofing', 'follows', 7, 21, 100),
('Excavation/Shoring', 10, 'drain-plumbing', 'concurrent', 0, 7, 100),
('Footings/Foundations', 20, 'framing', 'follows', 7, 21, 100),
('Footings/Foundations', 20, 'structural-steel', 'follows', 7, 21, 100),
('Footings/Foundations', 20, 'masonry', 'follows', 14, 28, 100),
('Structural Framing', 30, 'plumbing', 'follows', 5, 14, 100),
('Structural Framing', 30, 'electrical', 'follows', 5, 14, 100),
('Structural Framing', 30, 'hvac', 'follows', 5, 14, 100),
('Structural Framing', 30, 'fire-protection', 'follows', 7, 21, 100),
('Structural Framing', 30, 'roofing', 'concurrent', 0, 14, 100),
('Insulation/Vapour Barrier', 40, 'drywall', 'follows', 5, 14, 100),
('Fire Separations', 50, 'painting', 'follows', 7, 21, 10),
('Fire Separations', 50, 'flooring', 'follows', 7, 21, 100),
('Fire Separations', 50, 'tiling', 'follows', 7, 21, 100),
('Fire Separations', 50, 'trim-work', 'follows', 14, 28, 100),
('Fire Separations', 50, 'millwork-cabinetry', 'follows', 14, 28, 100),
('Fire Separations', 50, 'stone-countertops', 'follows', 14, 28, 100),
('Interior Final Inspection', 60, 'landscaping', 'follows', 0, 14, 100),
('Interior Final Inspection', 60, 'decking-fences', 'follows', 0, 14, 100),
('Occupancy', 70, 'painting', 'follows', 0, 7, 20);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS inspection_stage_map;
```

Note: spec 70 uses `(stage_name, trade_slug)` UNIQUE. Spec 71 says "a single trade can appear under multiple stage_names with different precedence values" — painting appears under both Fire Separations (prec 10) and Occupancy (prec 20). So the UNIQUE cannot be just `(stage_name, trade_slug)`. Using `(stage_name, trade_slug, precedence)` as the unique index handles the painting case cleanly.

### Migration 073 — timing_calibration

Per spec 71:
```sql
-- UP
CREATE TABLE timing_calibration (
  id                              SERIAL      PRIMARY KEY,
  permit_type                     VARCHAR(100) NOT NULL,
  median_days_to_first_inspection INTEGER     NOT NULL,
  p25_days                        INTEGER     NOT NULL,
  p75_days                        INTEGER     NOT NULL,
  sample_size                     INTEGER     NOT NULL,
  computed_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (permit_type)
);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS timing_calibration;
```

### Migration 074 — entities photo columns

Per spec 73 (modified to match our V1 decision: no photo fetching yet, column pre-created for V2):
```sql
-- UP
ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);
ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_validated_at TIMESTAMPTZ;

ALTER TABLE entities ADD CONSTRAINT entities_photo_url_https
  CHECK (photo_url IS NULL OR photo_url LIKE 'https://%');

-- DOWN
-- ALLOW-DESTRUCTIVE
-- ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_photo_url_https;
-- ALTER TABLE entities DROP COLUMN IF EXISTS photo_validated_at;
-- ALTER TABLE entities DROP COLUMN IF EXISTS photo_url;
```

Note: V1 does not fetch builder photos. The columns are added now so Phase 1b types can reference them without null-weirdness, and V2 can wire the SSRF-safe pipeline fetcher later without another migration.

### Types & Factories

- `src/lib/permits/types.ts`: update `LeadView` interface to the new shape. Add `CostEstimate`, `InspectionStageMapRow`, `TimingCalibrationRow` interfaces (referenced from here, not from a new file, since they're all permit-adjacent).
- `src/tests/factories.ts`: rewrite `createMockLeadView` to match new shape; add `createMockCostEstimate`, `createMockInspectionStageMapRow`, `createMockTimingCalibrationRow`. Update existing `createMockEntity` (if present) to include the new `photo_url`/`photo_validated_at` fields as nullable defaults.

### Database Impact
**YES.** Five new migrations. One is destructive-but-safe (070 drops and recreates brand-new 069 table). Others are pure column/table additions.

- **070** (lead_views rebuild): destructive but zero-data (brand-new table from 069). Marked `ALLOW-DESTRUCTIVE` for the new validator.
- **071** (cost_estimates): new empty table, zero risk.
- **072** (inspection_stage_map + 21 seed rows): new table + small seed, zero risk.
- **073** (timing_calibration): new empty table, zero risk.
- **074** (entities.photo_url + photo_validated_at): 2 nullable columns on the existing `entities` table (~46K rows). Instant ADD COLUMN NULL, zero lock risk. CHECK constraint on photo_url is trivially satisfied on add (all rows are NULL).

UPDATE strategy for the 237K permits row count: N/A — no permits changes in this WF.

## Standards Compliance (§10)

### DB (§3)
- ✅ **UP + DOWN blocks on every migration** (all 5)
- ✅ **ALLOW-DESTRUCTIVE markers** on 070 (drop table) and on the commented DOWN blocks where DROP appears — per the validator convention established in commit `64c19e0`
- ✅ **CONCURRENTLY** on indexes over large tables: N/A (no new indexes on permits or other >100K row tables; `entities` is ~46K so no CONCURRENTLY required per the validator rule, but the migration only ADDs columns, no indexes)
- ✅ **CHECK constraints** protecting `cost_tier`, `complexity_score`, `lead_type`, `cost_source`, `relationship`, `photo_url` format
- ✅ **FK + ON DELETE CASCADE** on lead_views → permits and lead_views → entities; cost_estimates → permits
- ✅ **Composite PKs** preserved where spec requires them (cost_estimates uses `(permit_num, revision_num)`)
- ✅ **UNIQUE constraints** on `lead_views (user_id, lead_key, trade_slug)`, `inspection_stage_map (stage_name, trade_slug, precedence)`, `timing_calibration (permit_type)`
- ✅ **Pipeline SDK / db client discipline:** N/A for migrations themselves; Phase 1b will use the shared pool
- ✅ **`src/tests/factories.ts` updated** for every new/modified table
- ✅ **`npm run db:generate`** run after migrate to refresh Drizzle types
- ✅ **`npm run typecheck`** must pass after types regenerate

### API
- ⬜ N/A — no API routes created in this WF (Phase 2 creates them)

### UI
- ⬜ N/A — no UI changes

### Shared Logic
- ✅ **Type definitions** in `src/lib/permits/types.ts` consumed by Phase 1b lib files
- ✅ **No dual code path changes** — classification/scoring logic untouched
- ✅ **Factories updated** so existing tests that reference `createMockLeadView` don't break

### Pipeline
- ✅ **Seed data is inline in migration 072** (not a separate script) because it's reference data; fits the existing migration pattern in the codebase
- ✅ **No new pipeline scripts in this WF** — compute-cost-estimates.js and compute-timing-calibration.js ship in Phase 1b with the library code they populate
- ✅ **`validate-migration.js`** will run against all 5 new files via the pre-commit hook (the validator we just shipped in commit `64c19e0`)

## What's IN Scope
| Deliverable | Why |
|---|---|
| Migration 070 (lead_views corrected) | Closes spec 70 drift from Backend Phase 0 |
| Migration 071 (cost_estimates) | Prereq for Phase 1b `cost-model.ts` + pipeline caching |
| Migration 072 (inspection_stage_map + seed) | Prereq for Phase 1b `timing.ts` Tier 1 stage-based logic |
| Migration 073 (timing_calibration) | Prereq for Phase 1b `timing.ts` Tier 2 heuristic |
| Migration 074 (entities photo cols) | Allows Phase 1b `builder-query.ts` to reference photo_url fields cleanly |
| Types + factories updates | Keeps typecheck + existing tests green |
| Schema infra tests | Locks the schemas against drift |

## What's OUT of Scope
- `src/features/leads/lib/*` — Phase 1b
- API routes — Phase 2
- Pipeline scripts `compute-cost-estimates.js`, `compute-timing-calibration.js` — Phase 1b
- Backfill of cost_estimates / timing_calibration — Phase 1b (because the scripts that compute them live there)
- UI — Phase 4+
- Photo fetching / SSRF-safe pipeline — V2 (per spec 73 decision)

## Execution Plan

```
- [ ] Contract Definition: N/A — no API routes. LeadView TypeScript
      interface updated in src/lib/permits/types.ts to match spec 70
      as the "internal contract" for Phase 1b.

- [ ] Spec & Registry Sync: Specs 70-75 already hardened. Run
      `npm run system-map` AFTER implementation to capture the new
      migrations + types.

- [ ] Schema Evolution: Write all 5 migrations (070-074) with UP+DOWN
      + ALLOW-DESTRUCTIVE markers. Run `npm run migrate` (verify all
      apply clean locally; PostGIS-conditional check not needed here
      since none of these use geometry). Run `npm run db:generate` to
      refresh Drizzle types. Update `src/lib/permits/types.ts`. Update
      `src/tests/factories.ts`. Run `npm run typecheck` — must be
      clean.

- [ ] Test Scaffolding: Create 5 new test files:
      - `src/tests/lead-views-schema.infra.test.ts` (8-10 tests) —
        verifies migration 070 file structure: columns present,
        CHECK constraints, indexes, unique constraints, FKs.
      - `src/tests/cost-estimates-schema.infra.test.ts` (6-8 tests) —
        same approach for migration 071.
      - `src/tests/inspection-stage-map.logic.test.ts` (8-10 tests) —
        verifies migration 072 structure AND the 21 seed rows match
        spec 71's table (including painting precedence 10/20 dual entry).
      - `src/tests/timing-calibration-schema.infra.test.ts` (5-6 tests) —
        migration 073 structure.
      - `src/tests/entities-photo-schema.infra.test.ts` (5-6 tests) —
        migration 074 structure + HTTPS CHECK constraint.
      These mirror the existing migration-067-trigger.infra.test.ts
      "file-shape" test pattern (no real DB connection).

- [ ] Red Light: Run `npm run test`. New test files MUST fail because
      the migrations don't exist yet.

- [ ] Implementation:
      Day 1 — Migrations:
        a) Write migrations/070_lead_views_corrected.sql
        b) Write migrations/071_cost_estimates.sql
        c) Write migrations/072_inspection_stage_map.sql (with seed)
        d) Write migrations/073_timing_calibration.sql
        e) Write migrations/074_entities_photo_url.sql
        f) `npm run migrate` — verify all apply clean
        g) `npm run db:generate` — refresh Drizzle types
      Day 2 — Types + factories:
        a) Update `src/lib/permits/types.ts` LeadView interface
        b) Add CostEstimate, InspectionStageMapRow, TimingCalibrationRow
           interfaces to types.ts
        c) Update entities type (wherever it lives) for photo_url/photo_validated_at
        d) Update `src/tests/factories.ts`:
           - Rewrite createMockLeadView to new shape
           - Add createMockCostEstimate, createMockInspectionStageMapRow,
             createMockTimingCalibrationRow
           - Update createMockEntity with photo_url/photo_validated_at defaults
        e) `npm run typecheck` — clean

- [ ] Auth Boundary & Secrets: N/A — no new routes, no new secrets.

- [ ] Green Light:
      - `npm run test` — all passing (2502 existing + ~37 new ≈ 2539+)
      - `npm run lint -- --fix` — clean
      - `npm run typecheck` — clean
      - `node scripts/validate-migration.js migrations/070*.sql
        migrations/071*.sql migrations/072*.sql migrations/073*.sql
        migrations/074*.sql` — pass (validator now enforces ALLOW-
        DESTRUCTIVE marker on 070 DROP TABLE)
      - `git commit` via pre-commit gauntlet
      Output visible execution summary using ✅/⬜ for every step. → WF6.
```

## Risk Notes

1. **Migration 070 destructive rebuild of lead_views.** Zero-data risk (table is 1 commit old, never populated). Mitigation: the destructive operation is gated by the `ALLOW-DESTRUCTIVE` marker our new validator enforces, and the migration explicitly documents WHY (spec drift, safe to rebuild). If somehow production was populated between 069 landing and this WF running, we'd lose that data — but production hasn't been deployed since Backend Phase 0.

2. **Migration 069 rows in the existing local DB.** Running `npm run migrate` now applies 070, which drops the table. Any rows a developer put there manually are lost. Acceptable — no real data in there.

3. **Validator will flag 070's DROP TABLE.** The marker is in place. If the marker regex somehow fails against the particular formatting, the pre-commit hook will fail loudly — caught before commit.

4. **inspection_stage_map seed drift.** If spec 71 ever changes a lag value, the seed data in migration 072 becomes stale. Mitigation: the `inspection-stage-map.logic.test.ts` test asserts exact values against the spec table, so any drift fails tests until the seed is updated.

5. **factories.ts churn may break unrelated tests.** The existing `createMockLeadView` has consumers from the Backend Phase 0 work. Rewriting its shape requires updating every test that uses it. Mitigation: `npm run typecheck` will surface every consumer; fix iteratively before running the test suite.

6. **photo_url CHECK constraint on entities.** The `LIKE 'https://%'` check is trivially satisfied on add (all rows NULL), but any future code inserting a non-HTTPS URL will fail the constraint at write time. This is desired behavior (defense in depth) but worth knowing for Phase 2 builder-query consumers.
