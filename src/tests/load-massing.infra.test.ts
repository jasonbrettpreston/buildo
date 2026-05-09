// 🔗 SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md
//
// SQL-shape regression-lock for scripts/load-massing.js.
//
// Why this test exists (WF2 #C 2026-05-09):
//   The previous version of load-massing.js detected the shapefile's
//   Web Mercator (EPSG:3857) projection and explicitly NULLED the area:
//     const isProjected = ring[0] && (Math.abs(ring[0][0]) > 180 || ...);
//     const areaSqm = isProjected ? null : shoelaceArea(ring);   // ← bug
//   Result: all 427,077 rows shipped with NULL footprint_area_sqm. The
//   Spec 83 §3 cost model fell back to lot-size for every permit.
//
//   The fix (this commit): remove the JS-side area calculation entirely
//   from the INSERT body; rely on a post-INSERT PostGIS UPDATE pass that
//   handles BOTH WGS84 and Web Mercator inputs uniformly via
//   ST_Transform(... 3857 → 4326)::geography.
//
// This test catches regressions at the file-text level. The semantic
// regression-lock lives at src/tests/db/building-footprints-area.db.test.ts.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/load-massing.js — Web Mercator area pipeline (WF2 #C 2026-05-09)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/load-massing.js'),
      'utf-8',
    );
  });

  it('does NOT use the `isProjected ? null : shoelaceArea(ring)` shortcut (the WF2 #C bug class)', () => {
    // The previous code nulled the area whenever the input was projected.
    // Forbid that exact pattern; loosen the regex to catch reformatted
    // variants by allowing any whitespace and either ternary direction.
    expect(src).not.toMatch(/isProjected\s*\?\s*null\s*:\s*shoelaceArea/);
    expect(src).not.toMatch(/areaSqm\s*=\s*isProjected\s*\?\s*null/);
  });

  it('uses a PostGIS post-INSERT UPDATE pass to compute area (DB-side, projection-aware)', () => {
    // The fix: a single UPDATE statement after the batch loop that handles
    // BOTH WGS84 and Web Mercator uniformly via ST_Transform(... 3857 → 4326).
    expect(src).toMatch(/UPDATE\s+building_footprints[\s\S]*?ST_Area\([\s\S]*?ST_Transform\([\s\S]*?ST_SetSRID\([\s\S]*?,\s*3857\s*\)\s*,\s*4326\s*\)\s*::geography/i);
  });

  it('post-INSERT UPDATE is idempotent — WHERE footprint_area_sqm IS NULL', () => {
    // Re-running load-massing must not re-compute area for already-populated rows.
    expect(src).toMatch(/UPDATE\s+building_footprints[\s\S]*?WHERE\s+footprint_area_sqm\s+IS\s+NULL/i);
  });

  it('emitMeta declares writes for footprint_area_sqm + footprint_area_sqft', () => {
    // Per Spec 47 §R11 — the post-INSERT UPDATE writes new columns; emit-meta
    // must reflect this so the pipeline observability layer attributes the
    // write correctly.
    expect(src).toMatch(/footprint_area_sqm/);
    expect(src).toMatch(/footprint_area_sqft/);
  });

  it('ON CONFLICT DO UPDATE SET clause does NOT touch footprint_area_sqm/sqft (worktree BUG-2 regression-lock)', () => {
    // WF2 #C 2026-05-09 — worktree review found that
    //   ON CONFLICT DO UPDATE SET footprint_area_sqm = EXCLUDED.footprint_area_sqm
    // would NULL-overwrite every existing row on every quarterly re-load
    // (since EXCLUDED carries NULL post-WF2-#C). compute-cost-estimates.js
    // (advisory lock 83 — independent of this lock 56) could then read
    // NULL areas in the window before the post-INSERT UPDATE recomputes,
    // silently falling back to lot-size GFA for every permit. The fix:
    // OMIT both columns from the SET clause entirely.
    //
    // Match the SET block specifically (between `ON CONFLICT ... DO UPDATE SET`
    // and the next `WHERE` keyword) and assert neither column appears as a
    // SET target.
    const setBlock = src.match(/ON\s+CONFLICT\s*\(\s*source_id\s*\)\s+DO\s+UPDATE\s+SET([\s\S]*?)WHERE/i)?.[1] ?? '';
    expect(setBlock, 'ON CONFLICT SET block not found').toBeTruthy();
    expect(setBlock).not.toMatch(/footprint_area_sqm\s*=\s*EXCLUDED/i);
    expect(setBlock).not.toMatch(/footprint_area_sqft\s*=\s*EXCLUDED/i);
  });

  it('ON CONFLICT WHERE guard does NOT include footprint_area_sqm IS DISTINCT FROM EXCLUDED (avoids spurious updates)', () => {
    // The WHERE guard's job is to skip no-op updates. Including
    // footprint_area_sqm IS DISTINCT FROM EXCLUDED.footprint_area_sqm would
    // ALWAYS evaluate true (existing != NULL) and trigger every row to
    // bypass the no-op skip. Worktree BUG-2 secondary impact.
    const whereBlock = src.match(/ON\s+CONFLICT[\s\S]*?WHERE([\s\S]*?)RETURNING/i)?.[1] ?? '';
    expect(whereBlock, 'ON CONFLICT WHERE block not found').toBeTruthy();
    expect(whereBlock).not.toMatch(/footprint_area_sqm\s+IS\s+DISTINCT\s+FROM\s+EXCLUDED/i);
  });
});
