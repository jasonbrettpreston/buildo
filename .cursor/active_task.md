# Active Task: WF3-13 — link-massing PostGIS column guard
**Status:** Done
**Domain Mode:** Backend/Pipeline
**Workflow:** WF3 (Bug Fix)
**Rollback Anchor:** `efc1043`

## Context
* **Goal:** Fix `link-massing.js` crash: `column bf.geom does not exist` (PG error 42703). Chain step 11 fails every run; steps 12–24 never execute.
* **Target Spec:** `docs/specs/pipeline/56_source_massing.md`
* **Key Files:**
  - `scripts/link-massing.js` (primary fix — line 157-159)
  - `migrations/098_building_footprints_geom_repair.sql` (new — restore geom column)
  - `src/tests/massing.logic.test.ts` (add regression test)

## Root Cause

Migration 065 adds `building_footprints.geom` conditionally: if PostGIS was NOT installed when 065 ran, the column was silently skipped with `RAISE NOTICE`. PostGIS was later installed (migrations 039/065 sequence). The script detects PostGIS extension presence via `pg_extension` (line 158) but never checks whether `building_footprints.geom` was actually created. When `hasPostGIS = true` but the column doesn't exist, the JOIN at line 213–214 crashes immediately.

## Technical Implementation

### Fix 1 — `scripts/link-massing.js` (defensive detection)

Replace the single-table `hasPostGIS` check with a two-predicate query that verifies BOTH the PostGIS extension AND the `geom` column exist before choosing the fast path. If extension is present but column is missing, emit a warning and fall back to the JS path gracefully.

**Before (line 157–159):**
```js
const pgisCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
const hasPostGIS = pgisCheck.rows.length > 0;
```

**After:**
```js
const pgisCheck = await pool.query(`
  SELECT
    EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS has_ext,
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'building_footprints' AND column_name = 'geom'
    ) AS has_geom_col
`);
const { has_ext, has_geom_col } = pgisCheck.rows[0];
const hasPostGIS = has_ext === true && has_geom_col === true;
if (has_ext && !has_geom_col) {
  pipeline.log.warn('[link-massing]',
    'PostGIS installed but building_footprints.geom missing — ' +
    'falling back to JS path. Apply migration 098 to restore fast path.');
}
```

### Fix 2 — `migrations/098_building_footprints_geom_repair.sql` (restore fast path)

Idempotent migration: adds `geom` column + populates from existing `geometry` JSONB + creates GiST index. Uses `ADD COLUMN IF NOT EXISTS` so safe to run even if column already exists (e.g. if future env had 065 succeed). DOWN block mirrors migration 065 DOWN.

```sql
-- Migration 098: Repair building_footprints.geom if missed by migration 065
-- Spec: docs/specs/pipeline/56_source_massing.md

-- UP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE 'ALTER TABLE building_footprints ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326)';
    EXECUTE 'UPDATE building_footprints SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326) WHERE geometry IS NOT NULL AND geom IS NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_building_footprints_geom_gist ON building_footprints USING GiST (geom)';
    RAISE NOTICE 'building_footprints.geom column repaired (migration 098)';
  ELSE
    RAISE NOTICE 'PostGIS not installed — skipping (migration 098)';
  END IF;
END
$$;

-- DOWN
-- DROP INDEX IF EXISTS idx_building_footprints_geom_gist;
-- ALTER TABLE building_footprints DROP COLUMN IF EXISTS geom;
```

### Fix 3 — `src/tests/massing.logic.test.ts` (regression guard)

Add source-inspection test (parallel to parity tests in `control-panel.logic.test.ts`) that reads `scripts/link-massing.js` as text and asserts:
1. The `hasPostGIS` check includes `information_schema.columns` (not just `pg_extension`)
2. The `has_geom_col` predicate is present (guards against the column-blind detection regressing)

## Standards Compliance

* **Try-Catch Boundary:** Script fix is additive — no new async path, all pool.query calls already in the pipeline.run wrapper which catches and surfaces errors via `logError`.
* **Unhappy Path Tests:** Test covers the column-absent case via source inspection.
* **logError Mandate:** N/A — no new API routes. Script uses `pipeline.log.warn` (correct for non-fatal fast-path demotion).
* **Mobile-First:** N/A — backend only.
* **Migration Safety:** `ADD COLUMN IF NOT EXISTS` + `UPDATE ... WHERE geom IS NULL` — fully idempotent. DOWN block provided. No DROP, no full-table replace, no index without IF NOT EXISTS.
* **Dual Code Path:** N/A — `link-massing.js` has no TypeScript counterpart (pure pipeline script).

## Execution Plan
- [ ] **Rollback Anchor:** `efc1043`
- [ ] **State Verification:** `building_footprints.geom` column absent; PostGIS extension present; migration 065 silently skipped at install time.
- [ ] **Spec Review:** `docs/specs/pipeline/56_source_massing.md` §3 Behavioral Contract — PostGIS fast path optional; JS fallback is the stable baseline.
- [ ] **Reproduction:** Add failing test to `massing.logic.test.ts` asserting `information_schema.columns` check is present in `link-massing.js`.
- [ ] **Red Light:** `npx vitest run src/tests/massing.logic.test.ts` — new test MUST fail (script currently only checks `pg_extension`).
- [ ] **Fix:** Apply Fix 1 to `scripts/link-massing.js` + write `migrations/098_building_footprints_geom_repair.sql`.
- [ ] **Pre-Review Self-Checklist:** 3–5 sibling bugs checked (see below).
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.

## Sibling Bug Check (WF3 Pre-Review)
| Sibling | Root cause shared? | Status |
|---------|-------------------|--------|
| `link-parcels.js` uses PostGIS path — same blind detection? | No — `parcels.geom` was added by migration 039 which ran before PostGIS was conditional; verified in migration 039 | Not affected |
| `link-neighbourhoods.js` same issue? | Same — `neighbourhoods.geom` from migration 039 (unconditional); not affected | Not affected |
| `load-massing.js` uses `geometry` JSONB (not `geom`) — would 098 UPDATE break anything? | No — 098 sets `geom` only WHERE `geom IS NULL`; existing rows with valid `geom` are untouched | Safe |
| Other scripts referencing `building_footprints` — do any expect `geom` absent? | Grep: only `link-massing.js` references `bf.geom` | Not affected |
