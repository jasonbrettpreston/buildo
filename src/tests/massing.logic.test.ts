// Logic Layer Tests — Building Massing geometry and classification
// SPEC LINK: docs/specs/31_building_massing.md
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  estimateStories,
  classifyStructure,
  pointInPolygon,
  computeFootprintArea,
  formatHeight,
  formatArea,
  formatStories,
  formatCoverage,
  computeBuildingCoverage,
  resolveStories,
  inferMassingUseType,
  STORY_HEIGHT_M,
  STORY_HEIGHT_BY_USE_TYPE,
  SHED_THRESHOLD_SQM,
  GARAGE_MAX_SQM,
} from '@/lib/massing/geometry';

describe('estimateStories', () => {
  it('returns 1 for 3m height (single story)', () => {
    expect(estimateStories(3.0)).toBe(1);
  });

  it('returns 2 for 6m height', () => {
    expect(estimateStories(6.0)).toBe(2);
  });

  it('returns 3 for 9.5m height (rounds to nearest)', () => {
    expect(estimateStories(9.5)).toBe(3);
  });

  it('returns 1 for 2.5m height (minimum 1 story)', () => {
    expect(estimateStories(2.5)).toBe(1);
  });

  it('returns null for null height', () => {
    expect(estimateStories(null)).toBeNull();
  });

  it('returns null for 0 height', () => {
    expect(estimateStories(0)).toBeNull();
  });

  it('returns null for negative height', () => {
    expect(estimateStories(-5)).toBeNull();
  });

  it('returns null for undefined height', () => {
    expect(estimateStories(undefined)).toBeNull();
  });

  it('uses STORY_HEIGHT_M constant of 3.0', () => {
    expect(STORY_HEIGHT_M).toBe(3.0);
  });
});

describe('classifyStructure', () => {
  it('classifies largest area as primary', () => {
    expect(classifyStructure(150, [150, 30, 10])).toBe('primary');
  });

  it('classifies 20-60 sqm accessory as garage', () => {
    expect(classifyStructure(35, [150, 35])).toBe('garage');
  });

  it('classifies < 20 sqm accessory as shed', () => {
    expect(classifyStructure(15, [150, 15])).toBe('shed');
  });

  it('classifies solo building as primary regardless of area', () => {
    expect(classifyStructure(10, [10])).toBe('primary');
  });

  it('classifies > 60 sqm non-largest as other', () => {
    expect(classifyStructure(80, [150, 80])).toBe('other');
  });

  it('classifies both as primary when two buildings have equal area', () => {
    expect(classifyStructure(100, [100, 100])).toBe('primary');
  });

  it('uses threshold constants correctly', () => {
    expect(SHED_THRESHOLD_SQM).toBe(20);
    expect(GARAGE_MAX_SQM).toBe(60);
  });
});

describe('pointInPolygon', () => {
  // A simple square polygon: 0,0 -> 1,0 -> 1,1 -> 0,1 -> 0,0
  const square: [number, number][] = [
    [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
  ];

  it('returns true for point inside polygon', () => {
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true);
  });

  it('returns false for point outside polygon', () => {
    expect(pointInPolygon([2, 2], square)).toBe(false);
  });

  it('returns false for point far from polygon', () => {
    expect(pointInPolygon([100, 100], square)).toBe(false);
  });

  it('returns false for null point', () => {
    expect(pointInPolygon(null, square)).toBe(false);
  });

  it('returns false for null polygon', () => {
    expect(pointInPolygon([0.5, 0.5], null)).toBe(false);
  });

  it('returns false for polygon with fewer than 4 points', () => {
    expect(pointInPolygon([0.5, 0.5], [[0, 0], [1, 0], [1, 1]])).toBe(false);
  });
});

describe('computeFootprintArea', () => {
  it('computes area for a known rectangle', () => {
    // ~10m x ~10m rectangle at Toronto lat
    const lng = -79.5;
    const lat = 43.75;
    const dLng = 0.00012; // ~10m at Toronto latitude
    const dLat = 0.00009; // ~10m
    const ring: [number, number][] = [
      [lng, lat],
      [lng + dLng, lat],
      [lng + dLng, lat + dLat],
      [lng, lat + dLat],
      [lng, lat],
    ];
    const area = computeFootprintArea(ring);
    expect(area).not.toBeNull();
    // Should be roughly 100 sqm (10m x 10m) — allow ±20% for projection
    expect(area!).toBeGreaterThan(70);
    expect(area!).toBeLessThan(130);
  });

  it('returns null for invalid ring (< 4 points)', () => {
    expect(computeFootprintArea([[0, 0], [1, 0], [1, 1]])).toBeNull();
  });

  it('returns null for null ring', () => {
    expect(computeFootprintArea(null as unknown as [number, number][])).toBeNull();
  });

  it('returns null for empty ring', () => {
    expect(computeFootprintArea([])).toBeNull();
  });

  it('returns 0 for degenerate polygon (collinear points)', () => {
    const line: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 0]];
    expect(computeFootprintArea(line)).toBe(0);
  });
});

describe('formatHeight', () => {
  it('formats height with metric and imperial', () => {
    expect(formatHeight(9.5)).toBe('9.5 m (31.2 ft)');
  });

  it('formats zero-point height', () => {
    expect(formatHeight(3.0)).toBe('3.0 m (9.8 ft)');
  });

  it('returns N/A for null', () => {
    expect(formatHeight(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatHeight(undefined)).toBe('N/A');
  });
});

describe('formatArea', () => {
  it('formats area with comma grouping', () => {
    expect(formatArea(1500)).toBe('1,500 sq ft');
  });

  it('formats small area', () => {
    expect(formatArea(250)).toBe('250 sq ft');
  });

  it('returns N/A for null', () => {
    expect(formatArea(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatArea(undefined)).toBe('N/A');
  });
});

describe('formatStories', () => {
  it('formats single storey', () => {
    expect(formatStories(1)).toBe('1 storey');
  });

  it('formats multiple storeys', () => {
    expect(formatStories(3)).toBe('3 storeys');
  });

  it('returns N/A for null', () => {
    expect(formatStories(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatStories(undefined)).toBe('N/A');
  });
});

describe('formatCoverage', () => {
  it('formats percentage', () => {
    expect(formatCoverage(34.2)).toBe('34.2%');
  });

  it('returns N/A for null', () => {
    expect(formatCoverage(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatCoverage(undefined)).toBe('N/A');
  });
});

describe('computeBuildingCoverage', () => {
  it('computes 50% coverage correctly', () => {
    expect(computeBuildingCoverage(500, 1000)).toBe(50);
  });

  it('returns null for null lot size', () => {
    expect(computeBuildingCoverage(500, null)).toBeNull();
  });

  it('returns null for null building area', () => {
    expect(computeBuildingCoverage(null, 1000)).toBeNull();
  });

  it('returns null for zero lot size', () => {
    expect(computeBuildingCoverage(500, 0)).toBeNull();
  });

  it('returns null for zero building area', () => {
    expect(computeBuildingCoverage(0, 1000)).toBeNull();
  });

  it('caps at 100% for building larger than lot', () => {
    expect(computeBuildingCoverage(1500, 1000)).toBe(100);
  });

  it('returns null for negative building area', () => {
    expect(computeBuildingCoverage(-100, 1000)).toBeNull();
  });

  it('returns null for negative lot size', () => {
    expect(computeBuildingCoverage(500, -1000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveStories — 3-tier cascade
// ---------------------------------------------------------------------------

describe('resolveStories', () => {
  it('returns permit storeys when available (tier 1)', () => {
    const result = resolveStories(3, 9.5, 'residential');
    expect(result).toEqual({ stories: 3, source: 'permit' });
  });

  it('permit storeys take priority over height calculation', () => {
    // Height would give ~3 stories (9.5/2.9=3.28), but permit says 2
    const result = resolveStories(2, 9.5, 'residential');
    expect(result).toEqual({ stories: 2, source: 'permit' });
  });

  it('uses residential coefficient (2.9m) for tier 2', () => {
    const result = resolveStories(null, 8.7, 'residential');
    expect(result.stories).toBe(3); // 8.7/2.9 = 3.0
    expect(result.source).toBe('height_typed');
  });

  it('uses commercial coefficient (4.0m) for tier 2', () => {
    const result = resolveStories(null, 12.0, 'commercial');
    expect(result.stories).toBe(3); // 12.0/4.0 = 3.0
    expect(result.source).toBe('height_typed');
  });

  it('uses industrial coefficient (4.5m) for tier 2', () => {
    const result = resolveStories(null, 9.0, 'industrial');
    expect(result.stories).toBe(2); // 9.0/4.5 = 2.0
    expect(result.source).toBe('height_typed');
  });

  it('uses mixed-use coefficient (3.5m) for tier 2', () => {
    const result = resolveStories(null, 10.5, 'mixed-use');
    expect(result.stories).toBe(3); // 10.5/3.5 = 3.0
    expect(result.source).toBe('height_typed');
  });

  it('falls back to generic 3.0m when no use-type (tier 3)', () => {
    const result = resolveStories(null, 9.0, null);
    expect(result.stories).toBe(3); // 9.0/3.0 = 3.0
    expect(result.source).toBe('height_default');
  });

  it('falls back to generic 3.0m when use-type is undefined', () => {
    const result = resolveStories(null, 6.0);
    expect(result.stories).toBe(2);
    expect(result.source).toBe('height_default');
  });

  it('returns minimum 1 story for low heights', () => {
    const result = resolveStories(null, 1.5, 'commercial');
    expect(result.stories).toBe(1);
    expect(result.source).toBe('height_typed');
  });

  it('returns null when no data available', () => {
    const result = resolveStories(null, null, null);
    expect(result).toEqual({ stories: null, source: null });
  });

  it('returns null for zero permit storeys and no height', () => {
    const result = resolveStories(0, null, 'residential');
    expect(result).toEqual({ stories: null, source: null });
  });

  it('ignores zero permit storeys (falls through to height)', () => {
    const result = resolveStories(0, 9.0, 'residential');
    expect(result.stories).toBe(3); // 9.0/2.9 ≈ 3.1 → 3
    expect(result.source).toBe('height_typed');
  });
});

// ---------------------------------------------------------------------------
// STORY_HEIGHT_BY_USE_TYPE constants
// ---------------------------------------------------------------------------

describe('STORY_HEIGHT_BY_USE_TYPE', () => {
  it('has correct residential height', () => {
    expect(STORY_HEIGHT_BY_USE_TYPE.residential).toBe(2.9);
  });

  it('has correct commercial height', () => {
    expect(STORY_HEIGHT_BY_USE_TYPE.commercial).toBe(4.0);
  });

  it('has correct industrial height', () => {
    expect(STORY_HEIGHT_BY_USE_TYPE.industrial).toBe(4.5);
  });

  it('has correct mixed-use height', () => {
    expect(STORY_HEIGHT_BY_USE_TYPE['mixed-use']).toBe(3.5);
  });
});

// ---------------------------------------------------------------------------
// inferMassingUseType — industrial detection
// ---------------------------------------------------------------------------

describe('inferMassingUseType', () => {
  it('detects industrial from building_type', () => {
    expect(inferMassingUseType({ building_type: 'Warehouse', structure_type: null, proposed_use: null })).toBe('industrial');
  });

  it('detects industrial from structure_type', () => {
    expect(inferMassingUseType({ building_type: null, structure_type: 'Industrial Building', proposed_use: null })).toBe('industrial');
  });

  it('detects industrial from proposed_use', () => {
    expect(inferMassingUseType({ building_type: null, structure_type: null, proposed_use: 'Manufacturing facility' })).toBe('industrial');
  });

  it('detects factory keyword', () => {
    expect(inferMassingUseType({ building_type: 'Factory', structure_type: null, proposed_use: null })).toBe('industrial');
  });

  it('returns null for residential permit', () => {
    expect(inferMassingUseType({ building_type: 'Row House', structure_type: 'Small Residential', proposed_use: 'Residential' })).toBeNull();
  });

  it('returns null for commercial permit', () => {
    expect(inferMassingUseType({ building_type: 'Office', structure_type: 'Commercial', proposed_use: 'Commercial' })).toBeNull();
  });

  it('returns null for null fields', () => {
    expect(inferMassingUseType({ building_type: null, structure_type: null, proposed_use: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// link-massing.js performance (B13)
// ---------------------------------------------------------------------------

// ── RE-HOMED at the Spec 122 §5.1 conversion (pilot 3, commit 7) ─────────────
//
// B13 was the incident where a per-parcel DB query inside the batch loop made a full
// relink take 48+ minutes; the fix was an in-memory grid. THAT FIX HAS BEEN SUPERSEDED,
// not lost: the PostGIS path replaced the grid with a GiST-indexed spatial join and the
// grid became dead code on every recorded run. The A-8 override retires it outright.
//
// So the lock changes SUBJECT rather than disappearing. What B13 actually guaranteed is
// "no per-parcel query inside the loop, and the classifier/fallback survive" — both are
// re-asserted below against the compute and the generated SQL, plus a new half the old
// lock could not state: the retired grid must not come BACK.
const LM_COMPUTE = () =>
  fs.readFileSync(path.resolve(__dirname, '../../scripts/lib/compute/link-massing.js'), 'utf-8');
const LM_DESCRIPTOR = () =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/link-massing.descriptor.json'), 'utf-8'));
/** The statements the compute builds, joined — what the runner actually issues. */
function lmSql(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute
  const compute = require('../../scripts/lib/compute/link-massing.js');
  const plan = compute.buildMatchSql(LM_DESCRIPTOR(), null, 'full');
  return Object.values(plan).filter((v) => typeof v === 'string').join('\n');
}

describe('link_massing query shape — the B13 guarantee, re-homed to the compute', () => {
  it('B13: the per-batch work is ONE indexed spatial join, never a query per parcel', () => {
    const sql = lmSql();
    // The batch is bound as an array in ONE statement — the shape that made the N+1 loop
    // impossible to reintroduce accidentally.
    expect(sql).toMatch(/p\.id = ANY\(\$1::int\[\]\)/);
    expect(sql).toMatch(/FROM parcels p[\s\S]*JOIN building_footprints bf/);
    // And the compute cannot issue a query at all — it holds SQL TEXT and nothing else.
    expect(LM_COMPUTE()).not.toMatch(/\.query\s*\(|streamQuery\s*\(|withTransaction\s*\(/);
  });

  it('B13: classifyStructure and the nearest fallback survive the conversion', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute
    const compute = require('../../scripts/lib/compute/link-massing.js');
    expect(typeof compute.classifyStructure).toBe('function');
    expect(compute.classifyStructure(300, [300, 40], 20, 60)).toBe('primary');
    expect(compute.classifyStructure(15, [300, 15], 20, 60)).toBe('shed');
    expect(compute.classifyStructure(45, [300, 45], 20, 60)).toBe('garage');
    expect(lmSql(), 'the nearest fallback is still a declared pass').toMatch(/ST_DWithin/);
  });

  it('B13: the in-memory grid and its haversine are KNOWINGLY RETIRED and may not return (A-8 override)', () => {
    // The old lock asserted `haversineDistance` was PRESENT. It is now asserted ABSENT,
    // deliberately and with the reason on the record: the grid path was a complete second
    // implementation of this step's contract that never executed (every recorded run
    // reports buildings_indexed = 0 and grid_cells = "N/A (PostGIS)"), and it carried a
    // silent swallow — an invalid geometry in its point-in-polygon test was caught, logged
    // and the parcel reclassified as no-match with NO counter. Its replacement is a
    // fail-loud precondition, asserted in the same breath so this can never read as a
    // capability simply going missing.
    // CODE, not prose: the compute's header NAMES the retired identifiers in order to
    // record why they are gone, and a lock that could be tripped by its own explanation
    // would push the explanation out of the file.
    const src = LM_COMPUTE().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const token of ['haversine', 'gridKey', 'GRID_SIZE', 'booleanPointInPolygon', '@turf/', 'mercatorToWgs84']) {
      expect(src, `retired JS-path identifier "${token}" is back in the compute`).not.toContain(token);
    }
    const requires = (LM_DESCRIPTOR() as { guards: { requires: Array<{ kind: string; name: string; on_missing: string }> } }).guards.requires;
    const postgis = requires.find((r) => r.kind === 'extension' && r.name === 'postgis');
    expect(postgis, 'the retirement is only safe because the extension is a hard precondition').toBeDefined();
    expect(postgis!.on_missing, 'no degraded algorithm survives').toBe('fail');
  });

  it('B13: the run still emits a summary and a meta block — now DERIVED from the descriptor', () => {
    // emitSummary/emitMeta left the step file with everything else; the library calls
    // both, and their CONTENT is derived rather than hand-maintained. The property that
    // matters is that the writes block still names the junction and its seven columns.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS library
    const { deriveMeta } = require('../../scripts/lib/step/index.js');
    const meta = deriveMeta(LM_DESCRIPTOR()) as { reads: Record<string, string[]>; writes: Record<string, string[]> };
    expect(Object.keys(meta.writes)).toEqual(['parcel_buildings']);
    expect(meta.writes.parcel_buildings!.sort()).toEqual(
      ['building_id', 'confidence', 'is_primary', 'linked_at', 'match_type', 'parcel_id', 'structure_type'],
    );
    expect(Object.keys(meta.reads).sort()).toEqual(['building_footprints', 'parcel_buildings', 'parcels']);
  });
});

// ---------------------------------------------------------------------------
// link-massing.js PostGIS detection guard (WF3-13)
// Regression guard: hasPostGIS must check geom column existence, not just
// the pg_extension row — otherwise crashes if 065 migration silently skipped.
// ---------------------------------------------------------------------------

// ── RE-HOMED at the Spec 122 §5.1 conversion (pilot 3, commit 7) ─────────────
//
// The original lock (WF3-13) existed because PostGIS DETECTION was an ALGORITHM
// SELECTOR: a compound `has_ext AND has_geom_col` probe chose between the spatial join
// and a JS grid, and a column-blind probe crashed the run. Under the A-8 override there
// is no second algorithm to select, so detection stops being a branch and becomes a
// PRECONDITION — which is strictly stronger: the compound probe answered "which code
// path", this answers "may this step run at all", and it fails loud instead of degrading.
//
// The three properties are re-asserted on the new mechanism: the extension is required,
// the geom columns it needs are required (the `has_geom_col` half, now declared rather
// than probed inline), and the absence of any degrade arm is asserted explicitly.
describe('link_massing PostGIS precondition — the detection guard, re-homed to guards.requires', () => {
  const requires = () =>
    (LM_DESCRIPTOR() as { guards: { requires: Array<{ kind: string; name: string; on_missing: string; algorithm?: string }> } }).guards.requires;

  it('the extension is a declared PRECONDITION, not a probe that selects an algorithm', () => {
    const postgis = requires().find((r) => r.kind === 'extension' && r.name === 'postgis');
    expect(postgis, 'guards.requires must name the postgis extension').toBeDefined();
    expect(postgis!.on_missing).toBe('fail');
    expect(postgis!.algorithm, 'a degrade arm would re-introduce the second code path').toBeUndefined();
    // And the runner really probes pg_extension for it — the check is executable, not decorative.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS library
    const { REQUIREMENT_PROBES } = require('../../scripts/lib/step/index.js');
    expect(REQUIREMENT_PROBES.extension.sql).toMatch(/FROM pg_extension WHERE extname = \$1/);
  });

  it('the geom columns the join needs are covered by required GiST indexes (was: has_geom_col)', () => {
    // A GiST index cannot exist without its column, so requiring the index requires the
    // column — and it also catches the case the old probe could not: the column present
    // but UNINDEXED, which turns the join into a 486K-row sequential scan (B-4).
    const names = requires().map((r) => r.name);
    expect(names).toContain('idx_parcels_geom_gist');
    expect(names).toContain('idx_building_footprints_geom_gist');
    for (const n of ['idx_parcels_geom_gist', 'idx_building_footprints_geom_gist']) {
      expect(requires().find((r) => r.name === n)!.on_missing, `${n} must HALT, not warn`).toBe('fail');
    }
  });

  it('NO requirement degrades — the compound-guard-selects-a-fallback shape is gone entirely', () => {
    const degraded = requires().filter((r) => r.on_missing !== 'fail');
    expect(degraded, 'a degrading precondition is a second code path wearing a declaration').toEqual([]);
    // And the compute carries no detection at all: nothing to branch on.
    expect(LM_COMPUTE()).not.toMatch(/hasPostGIS|has_geom_col|pg_extension|information_schema/);
  });
});

// ---------------------------------------------------------------------------
// link-massing.js PostGIS predicate flip (WF3 2026-06-22, Spec 56)
// The PostGIS fast path must test BUILDING-centroid-inside-PARCEL (not the old
// backwards parcel-centroid-inside-building), matching the already-correct JS
// fallback. Regression-locks the fix + its mandatory companions.
// ---------------------------------------------------------------------------

// ── RE-HOMED at the Spec 122 §5.1 conversion (pilot 3, commit 7) ─────────────
//
// Fence b16c036d, verbatim. Every property below held over the step's SOURCE TEXT before
// the conversion and holds over the GENERATED ARTIFACTS after it: the SQL the compute
// builds, the write plan write.js generates from the descriptor, and the descriptor's own
// declarations. The subject moved; the guarantee did not, and neither did the count.
describe('link_massing building-centroid-in-parcel (WF3 fix, re-homed)', () => {
  it('the match SQL tests building-centroid-in-parcel, NOT the old parcel-centroid-in-building', () => {
    const sql = lmSql();
    // New (correct): the building centroid is tested inside the parcel polygon.
    expect(sql).toMatch(/ST_Contains\(\s*p\.geom,\s*ST_SetSRID\(ST_MakePoint\(bf\.centroid_lng,\s*bf\.centroid_lat\)/);
    // Old (backwards) must be gone — parcel centroid tested inside the building polygon.
    expect(sql).not.toMatch(/ST_Contains\(bf\.geom,\s*ST_SetSRID\(ST_MakePoint\(p\.centroid_lng/);
    expect(sql).not.toMatch(/ST_Contains\(bf\.geom,\s*ST_SetSRID\(ST_MakePoint\(v\.lng,\s*v\.lat\)/);
    // bbox prefilter on the GiST index.
    expect(sql).toMatch(/bf\.geom\s*&&\s*p\.geom/);
  });

  it('the written confidences come from ONE declared source each — no 0.95 / 0.60 literal survives in the SQL or the compute', () => {
    // The pre-conversion file carried each confidence at TWO sites across two code paths
    // that had to agree by hand; the old lock could only assert the value was 0.95 and not
    // 0.90. Now the value is a registered variable, so the stronger statement is that
    // there is no literal left to disagree with.
    const sql = lmSql();
    expect(sql, 'a confidence literal is back in the generated SQL').not.toMatch(/0\.95|0\.60?\b/);
    const declared = (LM_DESCRIPTOR() as { config: { logic_variables: Array<{ name: string }> } }).config.logic_variables.map((v) => v.name);
    expect(declared).toContain('link_massing_centroid_confidence');
    expect(declared).toContain('link_massing_nearest_confidence');
    expect(LM_COMPUTE()).toMatch(/config\.link_massing_centroid_confidence/);
    expect(LM_COMPUTE()).toMatch(/config\.link_massing_nearest_confidence/);
    const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')) as Record<string, { default: number }>;
    expect(seed.link_massing_centroid_confidence!.default, 'the seed default is the pre-externalization literal').toBe(0.95);
    expect(seed.link_massing_nearest_confidence!.default).toBe(0.6);
  });

  it('a GiST index on parcels.geom is asserted BEFORE the join (precondition HALT)', () => {
    const requires = (LM_DESCRIPTOR() as { guards: { requires: Array<{ kind: string; name: string; on_missing: string }> } }).guards.requires;
    const gist = requires.find((r) => r.name === 'idx_parcels_geom_gist');
    expect(gist, 'the index the join seeks must be a declared precondition').toBeDefined();
    expect(gist!.kind).toBe('index');
    expect(gist!.on_missing, 'without it the join seq-scans 486K parcels — a HALT, not a warning').toBe('fail');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS library
    const { REQUIREMENT_PROBES } = require('../../scripts/lib/step/index.js');
    expect(REQUIREMENT_PROBES.index.sql).toMatch(/FROM pg_indexes WHERE indexname = \$1/);
  });

  it('the FULL-mode stale-link cleanup is ONE generated DELETE, scoped to the parcels being re-evaluated', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS library
    const write = require('../../scripts/lib/step/write.js');
    const d = LM_DESCRIPTOR() as { outputs: { writes: unknown[] } };
    const plan = write.buildWritePlan(d.outputs.writes[1], d) as { delete_sql: string };
    expect(plan.delete_sql).toMatch(/DELETE FROM parcel_buildings WHERE parcel_id IN \(SELECT id FROM parcels/);
    expect(write.retractionFires(plan, 'full')).toBe(true);
    expect(write.retractionFires(plan, 'incremental'), 'an incremental run must never retract').toBe(false);
  });

  it('the nearest fallback bbox-prefilters BEFORE the geography ST_DWithin (lessons.md runaway guard)', () => {
    const sql = lmSql();
    expect(sql).toMatch(/bf\.geom\s*&&\s*ST_Expand\(p\.geom/);
    expect(sql).toMatch(/ST_DWithin\(p\.geom::geography,\s*bf\.geom::geography/);
    expect(sql).toMatch(/DISTINCT ON \(p\.id\)/);
    expect(sql.indexOf('ST_Expand'), 'the prefilter must precede the distance').toBeLessThan(sql.indexOf('ST_DWithin'));
  });

  it('the match counters are still incremented per matched building (honest telemetry)', () => {
    // The counters moved from `buildingsMatched++` in the loop to the LINK phase's own
    // per-pass tally, named by the compute so the runner spells no domain value. What the
    // old lock asserted — that a match increments a counter — is asserted here on the
    // classifier's own output, which is what the runner adds up.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute
    const compute = require('../../scripts/lib/compute/link-massing.js');
    const config = { massing_shed_threshold_sqm: 20, massing_garage_max_sqm: 60, link_massing_centroid_confidence: 0.95, link_massing_nearest_confidence: 0.6 };
    const out = compute.classifyMatches(
      [{ parcel_id: 1, building_id: 10, footprint_area_sqm: 300 }, { parcel_id: 1, building_id: 11, footprint_area_sqm: 15 }],
      config,
    ) as { rows: unknown[]; parcels: number; matches: number };
    expect(out.matches, 'every matched building is counted, not every parcel').toBe(2);
    expect(out.parcels).toBe(1);
    expect(compute.buildMatchSql(LM_DESCRIPTOR(), config, 'full').primary_counter).toBe('centroid_in_parcel');
    expect(compute.buildMatchSql(LM_DESCRIPTOR(), config, 'full').fallback_counter).toBe('nearest');
  });
});
