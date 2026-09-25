// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① — PH-7 test design, prove red)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.2 (conformance), §5.5 (compute shape)
// SPEC LINK: docs/specs/01-pipeline/124_step_opt_policy.md Rules 1–13 (Rule 1: no fictional declarations; Rule 3: every
//              literal is a declared config.logic_variables[] entry with a seed row; Rule 10: verdict row-derived)
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md (the source producer contract)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_massing step)
// SPEC LINK: docs/specs/01-pipeline/121_step_opt_method.md §4.3 (pin the wrong form, do not fix it in a conversion)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_runs.md §A.5 lock 56
//
// Batch-2 row 3.6 — `massing`, the INGESTOR archetype's FOURTH member (after `load_ravines`,
// `address_points`, `parcels`) — R-PACE-1 COMPRESSED form. Commit ① lands this RED suite +
// fixtures (this file) plus the assessment report + PRE goldens; commit ② lands the descriptor +
// compute + frozen shell + seeds (POST goldens, zero-diff); commit ③ is the cutover (registration).
//
// ⚠️ EVERY RED CLAIM BELOW IS RED TODAY AND RED FOR THE RIGHT REASON. `artifact()` asserts the
// FUTURE artifact exists and names it in the failure message, so a test failing on a missing
// descriptor says so instead of surfacing as a TS or require error. RED claims are `it.fails('…')`
// with the expected post-② value stated inline; the legacy pins that already hold today are plain
// `it(` (green-by-construction). The current step file is NEVER required in-process — it calls
// `pipeline.run()` and would open a pool.
//
// Artifacts asserted against (plan of record `.cursor/batch2_p3_6_massing_active_task.md` §2/§4/§7①,
// assessment report `docs/reports/2026-09-24-batch2-p3-6-massing-assessment.md`):
//   scripts/load-massing.descriptor.json  — shape:"ingest", lock 56, class A `guarded_upsert`,
//                                            10 write columns incl. geom + 2 derived area columns,
//                                            guard_columns = the legacy 5 (M-D4 pinned wrong-form),
//                                            execution.maintenance[0] vacuum_analyze (S9 / M-D12)
//   scripts/load-massing.notes.json       — the storage-format constants (hash_, 12, 2-dp, 1e-7)
//   scripts/lib/compute/load-massing.js   — coerceKey / shapeRecord / dedupeBySourceId /
//                                            validatorCounterDelta / buildLoadMeta / checks
//   scripts/load-massing.js               — the §5.1 frozen shell (pipeline.step(...), NO pipeline.run()
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const STEP_DIR_REL = 'src/tests/steps/massing';

const DESCRIPTOR_REL = 'scripts/load-massing.descriptor.json';
const NOTES_REL = 'scripts/load-massing.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-massing.js';
const SHELL_REL = 'scripts/load-massing.js';
const FEATURES_REL = `${STEP_DIR_REL}/fixtures/massing-features.json`;
const LEGACY_SQL_REL = `${STEP_DIR_REL}/fixtures/legacy-upsert.sql.txt`;

/** Spec 47 §A.5 lock registry row 56 [READ scripts/load-massing.js:131]. */
const LOCK_ID = 56;
const WRITE_TABLE = 'building_footprints';
const WRITE_CLASS = 'guarded_upsert';
/** The 10 write columns of the legacy INSERT [:268-274], in order. */
const WRITE_COLUMNS = [
  'source_id', 'geometry',
  'footprint_area_sqm', 'footprint_area_sqft',
  'max_height_m', 'min_height_m', 'elev_z',
  'estimated_stories',
  'centroid_lat', 'centroid_lng',
];
/**
 * M-D4 (KNOWN-DEFECT, PINNED — Spec 121 §4.3): the legacy WHERE guard is exactly these FIVE
 * predicates [:294-298]. `elev_z` and `estimated_stories` are in the SET list but NOT in the
 * guard, so an elevation-only source change is never written. This conversion carries the five
 * verbatim; widening to seven is post-conversion fix F2, never a conversion-time change.
 */
const GUARD_COLUMNS = ['geometry', 'max_height_m', 'min_height_m', 'centroid_lat', 'centroid_lng'];
/** The two columns the legacy INSERT writes NULL and the S7 pass (:403-414) fills. */
const DERIVED_AREA_COLUMNS = ['footprint_area_sqm', 'footprint_area_sqft'];
/** `hash_` + md5(geojson).slice(0,12) — the LIVE key arm [:336-342]; the format lives in compute. */
const HASH_PREFIX = 'hash_';
const HASH_HEX_LEN = 12;
const STORY_HEIGHT_M = 3;
const CENTROID_DP = 7;

// ---------------------------------------------------------------------------
// Artifact helpers (copied from src/tests/steps/parcels/violations.test.ts:133-200)
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the row-3.6 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list — the loader property (Spec 122 §4.2)
  return d;
}

/** Collapse all whitespace runs to a single space — the fixture's declared normalisation. */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

interface ComputeModule {
  compute?: (ctx: unknown) => Promise<unknown>;
  coerceKey?: (raw: unknown, ctx?: { geojson?: string | null }) => string | null;
  shapeRecord?: (ctx: unknown) => Record<string, unknown> | null;
  dedupeBySourceId?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
  validatorCounterDelta?: (...args: unknown[]) => unknown;
  buildLoadMeta?: (ctx: unknown) => unknown;
  checks?: Record<string, (ctx: unknown) => unknown>;
  [k: string]: unknown;
}

function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return mod;
}

// ONE compiler, the same one pipeline.step() validates with.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

interface Feature {
  record: Record<string, unknown>;
  geojson: string;
}

interface WriteSpec {
  table?: string;
  key?: string;
  key_sql_type?: string;
  class?: string;
  columns?: Array<Record<string, unknown>>;
  guard_columns?: string[];
  retract?: string;
  cascades?: string;
  txn_scope?: string;
}

interface Descriptor {
  slug?: string;
  shape?: string;
  advisory_lock_id?: number;
  archetype?: string;
  inputs?: {
    reads?: {
      steps?: Array<Record<string, unknown>>;
      externals?: Array<Record<string, unknown>>;
    };
  };
  outputs?: { writes?: WriteSpec[] } | 'none';
  write_discipline?: { guard_columns?: string[] };
  source_key_policy?: Record<string, unknown>;
  execution?: {
    txn_scope?: string;
    maintenance?: Array<Record<string, unknown>>;
  };
  checks?: Check[];
  invariants?: Array<Record<string, unknown>>;
  config?: { logic_variables?: Array<{ name: string; on_invalid?: string }> } | 'none';
  deviations?: unknown[];
  limitations?: unknown[];
  recovery?: { interrupted?: string; interrupted_why?: unknown };
  [k: string]: unknown;
}

/** §6/§7's `checks[]` shape — id, threshold source, severity (Spec 122 §5.5 (1)). */
interface Check {
  id: string;
  limit_from_config?: string;
  limit?: unknown;
  severity?: string;
  [k: string]: unknown;
}

function checkById(d: Descriptor, id: string): Check {
  const c = (d.checks ?? []).find((x) => x.id === id);
  expect(c, `descriptor declares no check "${id}"`).toBeDefined();
  return c as Check;
}

/** Drive ONE check function from the compute's dispatch table, capturing its report() calls. */
function driveCheck(checkId: string, ctx: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const mod = loadComputeModule();
  const fn = (mod.checks ?? {})[checkId];
  expect(typeof fn, `the compute dispatch carries no function for check "${checkId}"`).toBe('function');
  const calls: Array<[string, Record<string, unknown>]> = [];
  (fn as (c: unknown) => unknown)({
    ...ctx,
    report: (id: string, o: Record<string, unknown>) => { calls.push([id, o]); },
  } as never);
  return calls;
}

function features(): Feature[] {
  return JSON.parse(readText(FEATURES_REL)) as Feature[];
}

/** The oracle key from §2/§4 (`hash_` + md5(geojson).slice(0,12)), computed HERE with node crypto. */
function oracleKey(geojson: string): string {
  return HASH_PREFIX + createHash('md5').update(geojson).digest('hex').slice(0, HASH_HEX_LEN);
}

/** The ring mean of a 3857 ring mean (M-D9 fallback), rounded to 1e-7 — the WRONG form, pinned. */
function ringMeanCentroid(ring: number[][]): [number, number] {
  const pts = ring.slice(0, ring.length - 1); // the closing point repeats the first
  const sumLng = pts.reduce((a, p) => a + (p[0] ?? 0), 0);
  const sumLat = pts.reduce((a, p) => a + (p[1] ?? 0), 0);
  const round7 = (v: number) => Math.round(v * 1e7) / 1e7;
  return [round7(sumLng / pts.length), round7(sumLat / pts.length)];
}

function massRow(f: Feature, storyHeight: number) {
  return {
    geojson: f.geojson,
    record: f.record,
    config: { massing_story_height_m: storyHeight },
    run_at: '2026-09-24T12:00:00.000Z',
    tag: 'test',
  };
}

/** The i-th fixture (asserted present — the fixture is an invariant of this suite). */
function fx(i: number): Feature {
  const f = features()[i];
  expect(f, `fixture feature #${i} is missing`).toBeDefined();
  return f as Feature;
}

function shape(compute: ComputeModule, f: Feature, storyHeight = STORY_HEIGHT_M): Record<string, unknown> | null {
  return compute.shapeRecord!(massRow(f, storyHeight)) as Record<string, unknown> | null;
}

function write0(d: Descriptor): WriteSpec {
  expect(d.outputs, 'an INGESTOR may not declare outputs:"none"').not.toBe('none');
  const ws = (d.outputs as { writes: WriteSpec[] }).writes;
  expect(ws[0], 'outputs.writes[0] is missing').toBeDefined();
  return ws[0] as WriteSpec;
}

// ---------------------------------------------------------------------------
// 1 — legacy pins (plain `it`: these hold TODAY against the legacy source text)
// ---------------------------------------------------------------------------

/**
 * The legacy WHERE guard [:294-298] is EXACTLY five `IS DISTINCT FROM` predicates — `elev_z`
 * and `estimated_stories` are in the SET list but NOT in the guard (M-D4, a KNOWN-DEFECT pinned
 * wrong-form per Spec 121 §4.3; widening it is post-conversion fix F2, never a conversion change).
 */
describe('row 3.6 — legacy pins: the UPSERT guard/area text (RED suite commit ①, GREEN today)', () => {
  let sql = '';
  try {
    sql = fs.readFileSync(abs(LEGACY_SQL_REL), 'utf8');
  } catch {
    sql = '';
  }
  const nsql = normalizeWs(sql);
  // The expression the post-INSERT S7 UPDATE pass (fixture tail) uses for the geodesic area.
  const AREA_EXPR =
    'ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography';

  it('declares the INSERT column list and the SET clauses for the five guarded columns', () => {
    expect(nsql).toContain(
      normalizeWs(
        'INSERT INTO building_footprints ( source_id, geometry, footprint_area_sqm, footprint_area_sqft, max_height_m, min_height_m, elev_z, estimated_stories, centroid_lat, centroid_lng )',
      ),
    );
    expect(nsql).toContain('ON CONFLICT (source_id) DO UPDATE SET');
    for (const set of ['geometry', 'max_height_m', 'min_height_m', 'elev_z', 'estimated_stories', 'centroid_lat', 'centroid_lng']) {
      expect(nsql, `SET clause for ${set} missing`).toContain(`${set} = EXCLUDED.${set}`);
    }
  });

  it('gives each of the legacy guard/area predicates a verbatim home (the RED assertions bracket them)', () => {
    for (const p of [
      'building_footprints.geometry IS DISTINCT FROM EXCLUDED.geometry',
      'building_footprints.max_height_m IS DISTINCT FROM EXCLUDED.max_height_m',
      'building_footprints.min_height_m IS DISTINCT FROM EXCLUDED.min_height_m',
      'building_footprints.centroid_lat IS DISTINCT FROM EXCLUDED.centroid_lat',
      'building_footprints.centroid_lng IS DISTINCT FROM EXCLUDED.centroid_lng',
    ]) {
      expect(nsql).toContain(normalizeWs(p));
    }
  });

  it('pins the S7 area UPDATE: the 3857→4326 geodesic expression and the 10.7639104167 factor', () => {
    expect(nsql).toContain(normalizeWs(AREA_EXPR));
    expect(nsql).toContain('10.7639104167');
    expect(nsql).toContain(
      normalizeWs('WHERE footprint_area_sqm IS NULL AND geometry IS NOT NULL'),
    );
  });

  it('pins the M-D4 wrong form: no elev_z / estimated_stories predicate escapes the fixture', () => {
    expect(nsql).not.toContain('building_footprints.elev_z IS DISTINCT FROM');
    expect(nsql).not.toContain('building_footprints.estimated_stories IS DISTINCT FROM');
  });

  it('pins the insert-only SET omission: footprint_area_sqm is never assigned in the SET list', () => {
    expect(nsql).not.toContain('footprint_area_sqm = EXCLUDED.footprint_area_sqm');
    expect(nsql).not.toContain('footprint_area_sqft = EXCLUDED.footprint_area_sqft');
  });
});

// ---------------------------------------------------------------------------
// 2 — the artifacts (RED today: ENOENT — none of them exists yet)
// ---------------------------------------------------------------------------

describe('row 3.6 — the artifacts exist and validate (Spec 122 §5.1, Spec 123 §7 row 6)', () => {
  it.fails('the artifact header names all ten write columns and the 1e-7 / hash constants (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const header = [
      readText(DESCRIPTOR_REL),
      fs.readFileSync(abs(SHELL_REL), 'utf8'),
      fs.readFileSync(abs(FEATURES_REL), 'utf8'),
      fs.readFileSync(abs(LEGACY_SQL_REL), 'utf8'),
    ].join('\n');
    for (const col of [...WRITE_COLUMNS, ...DERIVED_AREA_COLUMNS]) {
      expect(header, `write column ${col} is not named anywhere in the artifact set`).toContain(col);
    }
    expect(header).toContain(String(CENTROID_DP));
    expect(header).toContain(HASH_PREFIX);
  });

  it.fails('the descriptor exists, is AJV-valid, and declares shape:"ingest" / lock 56 / INGESTOR (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.shape).toBe('ingest');
    expect(d.advisory_lock_id).toBe(LOCK_ID);
    expect(d.archetype).toBe('INGESTOR');
  });

  it.fails('externals[0] is a cacheless shapefile_zip with no key_property (RED: ENOENT descriptor; Fold SF-1) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const ext = ((d.inputs?.reads?.externals ?? [])[0] ?? {}) as Record<string, unknown>;
    expect(ext.format).toBe('shapefile_zip');
    expect(ext.cache).toBe('none');
    // Fold SF-1: with no OBJECTID/ID in the DBF, the key is derived from geometry in compute;
    // the descriptor names NO source property for it (a `key_property` here would be fiction).
    expect(ext.key_property).toBeUndefined();
  });

  it.fails('writes[0] is class A guarded_upsert on building_footprints with a TEXT source_id key (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const w = write0(loadDescriptor());
    expect(w.table).toBe(WRITE_TABLE);
    expect(w.key).toBe('source_id');
    expect(w.key_sql_type).toBe('TEXT');
    expect(w.class).toBe(WRITE_CLASS);
    expect(w.retract).toBe('none');
    expect(w.txn_scope).toBe('step');
    expect(w.cascades).toBe('none');
  });

  it.fails('the geom column is an unrepaired 3857 insert-only wkb_geometry (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const w = write0(loadDescriptor());
    const cols = w.columns ?? [];
    const geom = cols.find((c) => c.name === 'geom');
    expect(geom, 'no `geom` column declared').toBeDefined();
    expect(geom!.bind).toBe('wkb_geometry');
    expect(geom!.geometry_kind).toBe('polygon');
    expect(geom!.geometry_srid).toBe(3857);
    expect(geom!.geometry_repair).toBe('none');
    expect(geom!.written).toBe('insert_only');
  });

  it.fails('area columns are geodesic insert-only derived values (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const cols = write0(loadDescriptor()).columns ?? [];
    for (const [name, unit] of [
      ['footprint_area_sqm', 'm2'],
      ['footprint_area_sqft', 'ft2'],
    ] as const) {
      const col = cols.find((c) => c.name === name);
      expect(col, `no \`${name}\` column declared`).toBeDefined();
      expect(col!.written).toBe('insert_only');
      const dg = col!.derived_from_geometry as Record<string, unknown> | undefined;
      expect(dg, `${name}.derived_from_geometry missing (prerequisite 0u)`).toBeDefined();
      expect(dg!.measure).toBe('geodesic_area');
      expect(dg!.unit).toBe(unit);
      expect(dg!.scale).toBe(2);
    }
  });

  it.fails('guard_columns carries the legacy five (M-D4 wrong form, carried not fixed) (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const declared = (write0(d).guard_columns ?? d.write_discipline?.guard_columns ?? []).slice().sort();
    expect(declared).toEqual(GUARD_COLUMNS.slice().sort());
    expect(declared).not.toContain('elev_z');
    expect(declared).not.toContain('estimated_stories');
  });

  it.fails('source_key_policy resolves a re-key last-write-wins and declares no migrations (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const s = loadDescriptor().source_key_policy ?? {};
    expect(s.on_collision).toBe('last_write_wins');
    expect(s.key_space_migration ?? 'none').toBe('none');
  });

  it.fails('execution.maintenance[0] vacuums building_footprints, self-owned (S9 / M-D12) (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const m = ((loadDescriptor().execution?.maintenance ?? [])[0] ?? {}) as Record<string, unknown>;
    expect(m.operation).toBe('vacuum_analyze');
    expect(m.table).toBe(WRITE_TABLE);
    expect(m.owned_by).toBe('self');
  });

  it.fails('the notes file exists and is a REAL notes document (RED: ENOENT notes) (flips at: commit ②)', () => {
    const notes = JSON.parse(readText(NOTES_REL)) as Record<string, unknown>;
    expect(Object.keys(notes).length).toBeGreaterThan(0);
  });

  it.fails('the shell is frozen: it calls pipeline.step( and never pipeline.run( (RED: shell still calls pipeline.run() today) (flips at: commit ②)', () => {
    const shell = fs.readFileSync(abs(SHELL_REL), 'utf8');
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it.fails('the compute module exists and exports the six names (RED: ENOENT compute) (flips at: commit ②)', () => {
    const compute = loadComputeModule();
    for (const name of [
      'coerceKey',
      'shapeRecord',
      'dedupeBySourceId',
      'validatorCounterDelta',
      'buildLoadMeta',
      'checks',
    ]) {
      expect(typeof compute[name], `compute export \`${name}\` is missing`).not.toBe('undefined');
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — coerceKey (RED: ENOENT compute; the value is `null` today, the assertion is the hash)
// ---------------------------------------------------------------------------

describe('row 3.6 — coerceKey derives the storage key from the geometry string (loader :336-342, 0s)', () => {
  it.fails('hashes the geojson exactly as the legacy oracle for all seven fixtures (RED: ENOENT compute) (flips at: commit ②)', () => {
    const { coerceKey } = loadComputeModule();
    for (const f of features()) {
      expect(coerceKey!(undefined, { geojson: f.geojson })).toBe(oracleKey(f.geojson));
    }
  });

  it.fails('ignores a DBF id entirely: coerceKey(\'123\', …) still hashes the geometry (RED: ENOENT compute; Fold SF-1) (flips at: commit ②)', () => {
    const { coerceKey } = loadComputeModule();
    const f = fx(0);
    expect(coerceKey!('123', { geojson: f.geojson })).toBe(oracleKey(f.geojson));
  });

  it.fails('returns null for a null geometry (RED: ENOENT compute) (flips at: commit ②)', () => {
    const { coerceKey } = loadComputeModule();
    expect(coerceKey!(undefined, { geojson: null })).toBeNull();
  });

  it.fails('keys (1) and (7) — same geometry, different MAX_HEIGHT — to the SAME key (RED: ENOENT compute) (flips at: commit ②)', () => {
    const { coerceKey } = loadComputeModule();
    const f1 = fx(0);
    const f7 = fx(6);
    expect(f7.geojson).toBe(f1.geojson); // fixture invariant: (7) really is (1)'s geometry
    expect(coerceKey!(undefined, { geojson: f7.geojson })).toBe(coerceKey!(undefined, { geojson: f1.geojson }));
  });
});

// ---------------------------------------------------------------------------
// 4 — shapeRecord (RED: ENOENT compute; returns null today)
// ---------------------------------------------------------------------------

describe('row 3.6 — shapeRecord maps a feature to the bound columns (loader :330-372)', () => {
  it.fails('(1) rounds the heights to 2 dp, stories to ≥1, and the centroid to 1e-7 (RED: ENOENT compute) (flips at: commit ②)', () => {
    const f = fx(0);
    const rec = shape(loadComputeModule(), f);
    expect(rec).not.toBeNull();
    expect(rec!.max_height_m).toBe(10.46);
    expect(rec!.min_height_m).toBe(0);
    expect(rec!.elev_z).toBe(101.24);
    expect(rec!.estimated_stories).toBe(3);
    expect(rec!.centroid_lat).toBe(43.6512346);
    expect(rec!.centroid_lng).toBe(-79.4123457);
    expect(JSON.parse(rec!.geometry as string)).toEqual(JSON.parse(f.geojson));
    expect(rec).not.toHaveProperty('footprint_area_sqm');
    expect(rec).not.toHaveProperty('footprint_area_sqft');
    expect(rec).not.toHaveProperty('geom');
  });

  it.fails('(2) maxH 0 ⇒ estimated_stories null (RED: ENOENT compute) (flips at: commit ②)', () => {
    const rec = shape(loadComputeModule(), fx(1));
    expect(rec).not.toBeNull();
    expect(rec!.estimated_stories).toBeNull();
  });

  it.fails('(3) maxH 1.2 ⇒ estimated_stories 1, not 0 (RED: ENOENT compute) (flips at: commit ②)', () => {
    const rec = shape(loadComputeModule(), fx(2));
    expect(rec).not.toBeNull();
    expect(rec!.estimated_stories).toBe(1);
  });

  it.fails('(4) no LONGITUDE/LATITUDE ⇒ the 3857 ring mean, rounded 1e-7 (M-D9 wrong form, pinned) (RED: ENOENT compute) (flips at: commit ②)', () => {
    const f = fx(3);
    const ring = (JSON.parse(f.geojson) as { coordinates: number[][][] }).coordinates[0] ?? [];
    const [lng, lat] = ringMeanCentroid(ring);
    const rec = shape(loadComputeModule(), f);
    expect(rec).not.toBeNull();
    expect(rec!.centroid_lng).toBe(lng);
    expect(rec!.centroid_lat).toBe(lat);
  });

  it.fails('(5) a ring of three points cannot form a polygon ⇒ null, the feature is skipped (RED: ENOENT compute) (flips at: commit ②)', () => {
    expect(shape(loadComputeModule(), fx(4))).toBeNull();
  });

  it.fails('(6) MultiPolygon ⇒ same heights as (1), geometry is the first outer ring (RED: ENOENT compute) (flips at: commit ②)', () => {
    const rec = shape(loadComputeModule(), fx(5));
    expect(rec).not.toBeNull();
    expect(rec!.max_height_m).toBe(10.46);
    const poly = JSON.parse(rec!.geometry as string) as { type: string; coordinates: number[][][] };
    const multi = JSON.parse(fx(0).geojson) as { coordinates: number[][][] };
    expect(poly.coordinates[0]).toEqual(multi.coordinates[0]);
  });

  it.fails('reads massing_story_height_m from config: 5 ⇒ (1) stories 2, from the UNROUNDED height (RED: ENOENT compute) (flips at: commit ②)', () => {
    const rec = shape(loadComputeModule(), fx(0), 5);
    expect(rec).not.toBeNull();
    expect(rec!.estimated_stories).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5 — dedupeBySourceId + validatorCounterDelta (RED: ENOENT compute)
// ---------------------------------------------------------------------------

describe('row 3.6 — dedupeBySourceId keeps the LAST row per key; validatorCounterDelta under geometry_repair:"none" (0s M-D3, 0t Fold PB-3)', () => {
  it.fails('fixtures (1) and (7) share a key: dedupe keeps ONE row, the LAST (MAX_HEIGHT 20) (RED: ENOENT compute) (flips at: commit ②)', () => {
    const compute = loadComputeModule();
    const f1 = fx(0);
    const f7 = fx(6);
    const r1 = { ...shape(compute, f1), source_id: compute.coerceKey!(undefined, { geojson: f1.geojson }) };
    const r7 = { ...shape(compute, f7), source_id: compute.coerceKey!(undefined, { geojson: f7.geojson }) };
    const deduped = compute.dedupeBySourceId!([r1, r7]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.max_height_m).toBe(20);
  });

  it.fails('input order is preserved for non-colliding keys (RED: ENOENT compute) (flips at: commit ②)', () => {
    const compute = loadComputeModule();
    const rows = features().map((f) => ({
      ...shape(compute, f),
      source_id: compute.coerceKey!(undefined, { geojson: f.geojson }),
    })).filter((r) => r.source_id != null);
    const deduped = compute.dedupeBySourceId!(rows);
    const uniqueKeys = Array.from(new Set(rows.map((r) => r.source_id)));
    expect(deduped.map((r) => r.source_id)).toEqual(
      uniqueKeys.map((k) => rows.filter((r) => r.source_id === k).pop()!.source_id),
    );
  });

  it.fails('an accepted row under geometry_repair:"none" carries with repaired:0, even when is_valid_original is false (RED: ENOENT compute; O-C/Fold PB-3) (flips at: commit ②)', () => {
    const { validatorCounterDelta } = loadComputeModule();
    const acceptedValid = validatorCounterDelta!({ status: 'accepted', is_valid_original: true }) as Record<string, unknown>;
    expect(acceptedValid.carry).toBe(true);
    expect(acceptedValid.repaired).toBe(0);
    const acceptedInvalidStored = validatorCounterDelta!({ status: 'accepted', is_valid_original: false }) as Record<string, unknown>;
    expect(acceptedInvalidStored.carry).toBe(true);
    expect(acceptedInvalidStored.repaired, 'M-D2/0t: "none" never repairs, so repaired stays 0 even for a stored-invalid row').toBe(0);
  });

  it.fails('a skipped row carries:false, skipped:1 (RED: ENOENT compute) (flips at: commit ②)', () => {
    const { validatorCounterDelta } = loadComputeModule();
    const skipped = validatorCounterDelta!({ status: 'skipped_no_geometry' }) as Record<string, unknown>;
    expect(skipped.carry).toBe(false);
    expect(skipped.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6 — checks: thresholds (report spy) (RED: ENOENT compute / descriptor)
// ---------------------------------------------------------------------------

describe('row 3.6 — checks: skip_rate_pct / features_read_floor / batch_error_rate_pct (report §6, Rule 3)', () => {
  const CFG = {
    massing_skip_rate_max_pct: 5,
    massing_batch_error_rate_max_pct: 1,
    sources_building_footprints_floor: 400000,
  };

  it.fails('skip_rate_pct: bad_key + null_geometry + shaped_skipped over rows_read, FAIL at >= 5% (0s re-bucketing) (RED: ENOENT compute) (flips at: commit ②)', () => {
    const fail = driveCheck('skip_rate_pct', {
      acquired: { rows_read: 1000, bad_key_count: 20, null_geometry_count: 10, shaped_skipped: 20 },
      config: CFG,
    });
    expect(fail[0]![1]!.detail).toBe(5);
    expect(fail[0]![1]!.violations).toBe(1);
    const pass = driveCheck('skip_rate_pct', {
      acquired: { rows_read: 1000, bad_key_count: 20, null_geometry_count: 10, shaped_skipped: 19 },
      config: CFG,
    });
    expect(pass[0]![1]!.detail).toBeCloseTo(4.9, 5);
    expect(pass[0]![1]!.violations).toBe(0);
  });

  it.fails('skip_rate_pct is declared: limit_from_config massing_skip_rate_max_pct, severity FAIL (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const c = checkById(loadDescriptor(), 'skip_rate_pct');
    expect(c.limit_from_config).toBe('massing_skip_rate_max_pct');
    expect(c.severity).toBe('FAIL');
  });

  it.fails('features_read_floor: rows_read 399999 WARNs, 400000 passes (legacy WARN, not FAIL) (RED: ENOENT compute) (flips at: commit ②)', () => {
    const below = driveCheck('features_read_floor', { acquired: { rows_read: 399999 }, config: CFG });
    expect(below[0]![1]!.violations).toBe(1);
    const at = driveCheck('features_read_floor', { acquired: { rows_read: 400000 }, config: CFG });
    expect(at[0]![1]!.violations).toBe(0);
  });

  it.fails('features_read_floor is declared: limit_from_config sources_building_footprints_floor, severity WARN, limit in value_min form (AP-D6 trap) (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const c = checkById(loadDescriptor(), 'features_read_floor');
    expect(c.limit_from_config).toBe('sources_building_footprints_floor');
    expect(c.severity).toBe('WARN');
    expect(String(c.limit)).toMatch(/^value_min\b/);
    expect(String(c.limit)).not.toMatch(/viol\s*==\s*0/);
  });

  it.fails('batch_error_rate_pct is declared: limit_from_config massing_batch_error_rate_max_pct, severity FAIL (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const c = checkById(loadDescriptor(), 'batch_error_rate_pct');
    expect(c.limit_from_config).toBe('massing_batch_error_rate_max_pct');
    expect(c.severity).toBe('FAIL');
  });
});

// ---------------------------------------------------------------------------
// 7 — declared post checks + invariant: M-D7 nulls, M-D1 key-space, M-D3 duplicates
// ---------------------------------------------------------------------------

describe('row 3.6 — post checks + invariant replace the S1–S8 cleanup/backfill statements (M-D1/M-D3/M-D7)', () => {
  it.fails('footprint_area_null_count and geom_null_count are declared checks, severity FAIL, limit 0 (M-D7) (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    for (const id of ['footprint_area_null_count', 'geom_null_count']) {
      const c = checkById(d, id);
      expect(c.severity, `${id} must FAIL`).toBe('FAIL');
      expect(c.limit).toBe(0);
    }
  });

  it.fails('invariants[] declares building_footprints_foreign_key_space_rows: SQL uses NOT LIKE \'hash_%\', FAIL when > 0 (M-D1) (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const inv = (loadDescriptor().invariants ?? []).find(
      (i) => i.name === 'building_footprints_foreign_key_space_rows',
    );
    expect(inv, 'invariants[] must declare building_footprints_foreign_key_space_rows').toBeDefined();
    expect(String(inv!.sql)).toContain("NOT LIKE 'hash_%'");
    expect(inv!.source).toBe('invariant');
    expect(String(inv!.severity ?? inv!.on_invalid ?? '')).toMatch(/FAIL/i);
  });

  it.fails('duplicate_key_count is a declared INFO check (M-D3, cross-batch self-overwrite) (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const c = checkById(loadDescriptor(), 'duplicate_key_count');
    expect(c.severity).toBe('INFO');
  });

  it.fails('no check id revives the retired S2–S5 key-format auto-cleanup (M-D1, knowingly-retired) (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const ids = (loadDescriptor().checks ?? []).map((c) => c.id);
    for (const id of ids) {
      expect(id, `check id "${id}" looks like the retired S2–S5 cleanup`).not.toMatch(/delete|cleanup|reindex_key/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 8 — Rule 3 (logic_variables ≡ seeds, no bare literal) + Rule 10 (verdict row-derived)
// ---------------------------------------------------------------------------

describe('row 3.6 — Rule 3 literal ledger + Rule 10 row-derived verdict (report §6)', () => {
  const REQUIRED_VARS = [
    'massing_skip_rate_max_pct',
    'massing_batch_error_rate_max_pct',
    'massing_story_height_m',
    'massing_download_timeout_ms',
    'building_footprints_dead_tuple_ratio_warn_max',
    'building_footprints_maintenance_timeout_minutes',
  ];
  const SEED_DEFAULTS: Record<string, number> = {
    massing_skip_rate_max_pct: 5,
    massing_batch_error_rate_max_pct: 1,
    massing_story_height_m: 3,
  };

  it.fails('config.logic_variables declares every required name (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.config).not.toBe('none');
    const names = ((d.config as { logic_variables: Array<{ name: string }> }).logic_variables ?? []).map((v) => v.name);
    for (const v of REQUIRED_VARS) {
      expect(names, `config.logic_variables must declare ${v}`).toContain(v);
    }
  });

  it.fails('scripts/seeds/logic_variables.json has a row for every required name; the three pinned defaults match §6 (RED: no seed rows yet) (flips at: commit ②)', () => {
    const seeds = JSON.parse(fs.readFileSync(abs('scripts/seeds/logic_variables.json'), 'utf8')) as Record<string, { default: unknown }>;
    for (const v of REQUIRED_VARS) {
      expect(seeds[v], `${v} has no seed row (Rule 3 / LM-D15: a missing row throws)`).toBeDefined();
    }
    for (const [name, def] of Object.entries(SEED_DEFAULTS)) {
      expect(seeds[name]!.default, `seed default for ${name} must equal the report §6 ledger`).toBe(def);
    }
  });

  it.fails('the compute source binds thresholds through ctx.config, never a bare 400000 / 3.0 / >= 5 / >= 1 literal (RED: ENOENT compute) (flips at: commit ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/[^.\w]400000\b/);
    expect(src).not.toMatch(/\b3\.0\b/);
    expect(src).not.toMatch(/>=\s*5\b/);
    expect(src).not.toMatch(/>=\s*1\b/);
  });

  it.fails('the compute has no hasFails/hasWarns identifier and no bare verdict: key (Rule 10 — verdict is row-derived by the runner) (RED: ENOENT compute) (flips at: commit ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/hasFails|hasWarns/);
    expect(src).not.toMatch(/\bverdict\s*:/);
  });
});

// ---------------------------------------------------------------------------
// 9 — deviations/limitations carry the M-D ids; recovery.interrupted:"none" + why
// ---------------------------------------------------------------------------

describe('row 3.6 — deviations/limitations name every M-D id; recovery is truthful (Rule 1/12)', () => {
  it.fails('deviations[] joined text names M-D1 M-D3 M-D6 M-D7 M-D10 M-D11 M-D12, each with adjudicated_by (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(Array.isArray(d.deviations), 'deviations must be an explicit array (never "none")').toBe(true);
    const text = JSON.stringify(d.deviations);
    for (const id of ['M-D1', 'M-D3', 'M-D6', 'M-D7', 'M-D10', 'M-D11', 'M-D12']) {
      expect(text, `deviations[] must name ${id}`).toContain(id);
    }
    for (const entry of d.deviations as Array<Record<string, unknown>>) {
      expect(entry.adjudicated_by, `every deviation entry needs adjudicated_by (parcels precedent): ${JSON.stringify(entry)}`).toBeDefined();
    }
  });

  it.fails('limitations[] joined text names M-D2 M-D4 M-D5 M-D9 (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(Array.isArray(d.limitations), 'limitations must be an explicit array').toBe(true);
    const text = JSON.stringify(d.limitations);
    for (const id of ['M-D2', 'M-D4', 'M-D5', 'M-D9']) {
      expect(text, `limitations[] must name ${id}`).toContain(id);
    }
  });

  it.fails('recovery.interrupted is "none" with a stated why (class A guarded_upsert has no retraction to recover, Rule 12) (RED: ENOENT descriptor) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.recovery?.interrupted).toBe('none');
    expect(d.recovery?.interrupted_why, 'the none posture must be justified').toBeDefined();
  });

  it('the assessment report states the compressed-form marker line (plain `it`: GREEN today, ① already landed part A1)', () => {
    const report = fs.readFileSync(abs('docs/reports/2026-09-24-batch2-p3-6-massing-assessment.md'), 'utf8');
    expect(report).toContain('**Commit form: compressed (R-PACE-1)**');
  });
});
