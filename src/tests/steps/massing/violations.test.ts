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
// ✅ GREEN AT ②. Every converted claim below now pins the REAL runner vocabulary (corrected at ② —
// see the `// corrected at ②:` anchors) and passes against the landed descriptor/compute/shell/seeds.
// The legacy pins that already held at ① are plain `it(` (green-by-construction). EXCEPTION — two
// assertions still pin TODAY's WRONG FORM and flip only in the later fixed commits: the M-D4
// (5-column guard) and M-D9 (ring-mean centroid) claims, both called out inline. The current step
// file is NEVER required in-process — it is read as TEXT (the frozen shell runs `pipeline.step()`).
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
  shapeRecord?: (record: unknown, seam: unknown) => Record<string, unknown> | null;
  dedupeBySourceId?: (rows: Record<string, unknown>[]) => { kept: Record<string, unknown>[]; duplicateCount: number };
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
  // corrected at ②: the runner reads these on the WRITE spec, not inside write_discipline
  // (write.js anchor `const geometrySrid = writeSpec.geometry_srid`).
  geometry_kind?: string;
  geometry_srid?: number;
  geometry_repair?: string;
  columns?: Array<Record<string, unknown>>;
  retract?: string;
  source_key_policy?: Record<string, unknown>;
  write_discipline?: {
    class?: string;
    guard_columns?: string[];
    txn_scope?: string;
  };
}

interface Descriptor {
  // corrected at ②: identity carries name/lock/archetype (descriptor.identity.*).
  identity?: { name?: string; lock?: number; archetype?: string };
  inputs?: {
    reads?: {
      steps?: Array<Record<string, unknown>>;
      externals?: Array<Record<string, unknown>>;
    };
  };
  // corrected at ②: `cascades` is an OUTPUTS-level field, not a writer field.
  outputs?: { writes?: WriteSpec[]; cascades?: string } | 'none';
  execution?: {
    shape?: string;
    txn_scope?: string;
    batch?: number;
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

// corrected at ②: the runner calls shapeRecord(f.record, { geojson, config, run_at, tag }) — two
// positional args (index.js anchor `shapeRecord(f.record, { geojson: f.geojson`), and `tag` is the
// runner's tagRecord callback, not a bare string. This helper builds the SEAM object only; the
// record is passed separately by shape().
function massRow(f: Feature, storyHeight: number) {
  return {
    geojson: f.geojson,
    config: { massing_story_height_m: storyHeight },
    run_at: '2026-09-24T12:00:00.000Z',
    tag: () => {},
  };
}

/** The i-th fixture (asserted present — the fixture is an invariant of this suite). */
function fx(i: number): Feature {
  const f = features()[i];
  expect(f, `fixture feature #${i} is missing`).toBeDefined();
  return f as Feature;
}

function shape(compute: ComputeModule, f: Feature, storyHeight = STORY_HEIGHT_M): Record<string, unknown> | null {
  // corrected at ②: the runner passes the record + seam object separately (index.js anchor
  // `shapeRecord(f.record, { geojson: f.geojson, config, run_at: runAt, tag: tagRecord })`).
  return compute.shapeRecord!(f.record, massRow(f, storyHeight)) as Record<string, unknown> | null;
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
  it('the artifact header names all ten write columns and the 1e-7 / hash constants', () => {
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

  it('the descriptor exists, is AJV-valid, and declares shape:"ingest" / lock 56 / INGESTOR', () => {
    const d = loadDescriptor();
    expect(d.execution?.shape).toBe('ingest'); // corrected at ②: shape lives at execution.shape
    expect(d.identity?.lock).toBe(LOCK_ID); // corrected at ②: lock lives at identity.lock
    expect(d.identity?.archetype).toBe('INGESTOR'); // corrected at ②: archetype lives at identity.archetype
  });

  it('externals[0] is a shapefile_zip with no key_property (Fold SF-1)', () => {
    const d = loadDescriptor();
    const ext = ((d.inputs?.reads?.externals ?? [])[0] ?? {}) as Record<string, unknown>;
    expect(ext.format).toBe('shapefile_zip');
    // inputs.reads.externals[].cache deleted in the Phase 3 RE-FREEZE (#11, zero runtime readers)
    // Fold SF-1: with no OBJECTID/ID in the DBF, the key is derived from geometry in compute;
    // the descriptor names NO source property for it (a `key_property` here would be fiction).
    expect(ext.key_property).toBeUndefined();
  });

  it('writes[0] is class A guarded_upsert on building_footprints with a TEXT source_id key', () => {
    const d = loadDescriptor();
    const w = write0(d);
    expect(w.table).toBe(WRITE_TABLE);
    expect(w.key).toBe('source_id');
    expect(w.key_sql_type).toBe('TEXT');
    expect(w.write_discipline?.class).toBe(WRITE_CLASS); // corrected at ②: class lives at write_discipline.class
    expect(w.retract).toBe('none');
    expect(w.write_discipline?.txn_scope).toBe('step'); // corrected at ②: txn_scope lives at write_discipline.txn_scope
    // outputs.cascades deleted in the Phase 3 RE-FREEZE (#21, zero runtime readers)
  });

  it('the geom column is an unrepaired 3857 insert-only wkb_geometry', () => {
    const d = loadDescriptor();
    const w = write0(d);
    const cols = w.columns ?? [];
    const geom = cols.find((c) => c.name === 'geom');
    expect(geom, 'no `geom` column declared').toBeDefined();
    expect(geom!.bind).toBe('wkb_geometry');
    expect(geom!.written).toBe('insert_only');
    // corrected at ②: geometry_kind/srid/repair are WRITE-level fields (write.js anchor
    // `const geometrySrid = writeSpec.geometry_srid`), not per-column.
    expect(w.geometry_kind).toBe('polygon');
    expect(w.geometry_srid).toBe(3857);
    expect(w.geometry_repair).toBe('none');
  });

  it('area columns are geodesic insert-only derived values', () => {
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

  it('guard_columns carries the legacy five (M-D4 wrong form, carried not fixed)', () => {
    const d = loadDescriptor();
    const declared = (write0(d).write_discipline?.guard_columns ?? []).slice().sort(); // corrected at ②: read write_discipline.guard_columns
    expect(declared).toEqual(GUARD_COLUMNS.slice().sort());
    expect(declared).not.toContain('elev_z');
    expect(declared).not.toContain('estimated_stories');
  });

  // source_key_policy deleted in the Phase 3 RE-FREEZE (#18, zero runtime readers); the LAST-wins
  // duplicate resolution is compute behaviour, recorded in load-massing.notes.json.

  it('execution.maintenance[0] vacuums building_footprints, self-owned (S9 / M-D12)', () => {
    const m = ((loadDescriptor().execution?.maintenance ?? [])[0] ?? {}) as Record<string, unknown>;
    expect(m.operation).toBe('vacuum_analyze');
    expect(m.table).toBe(WRITE_TABLE);
    expect(m.owned_by).toBe('self');
  });

  it('the notes file exists and is a REAL notes document', () => {
    const notes = JSON.parse(readText(NOTES_REL)) as Record<string, unknown>;
    expect(Object.keys(notes).length).toBeGreaterThan(0);
  });

  it('the shell is frozen: it calls pipeline.step( and never pipeline.run(', () => {
    const shell = fs.readFileSync(abs(SHELL_REL), 'utf8');
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it('the compute module exists and exports the six names', () => {
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
// 3 — coerceKey
// ---------------------------------------------------------------------------

describe('row 3.6 — coerceKey derives the storage key from the geometry string (loader :336-342, 0s)', () => {
  it('hashes the geojson exactly as the legacy oracle for all seven fixtures', () => {
    const { coerceKey } = loadComputeModule();
    for (const f of features()) {
      expect(coerceKey!(undefined, { geojson: f.geojson })).toBe(oracleKey(f.geojson));
    }
  });

  it('ignores a DBF id entirely: coerceKey(\'123\', …) still hashes the geometry (Fold SF-1)', () => {
    const { coerceKey } = loadComputeModule();
    const f = fx(0);
    expect(coerceKey!('123', { geojson: f.geojson })).toBe(oracleKey(f.geojson));
  });

  it('returns null for a null geometry', () => {
    const { coerceKey } = loadComputeModule();
    expect(coerceKey!(undefined, { geojson: null })).toBeNull();
  });

  it('keys (1) and (7) — same geometry, different MAX_HEIGHT — to the SAME key', () => {
    const { coerceKey } = loadComputeModule();
    const f1 = fx(0);
    const f7 = fx(6);
    expect(f7.geojson).toBe(f1.geojson); // fixture invariant: (7) really is (1)'s geometry
    expect(coerceKey!(undefined, { geojson: f7.geojson })).toBe(coerceKey!(undefined, { geojson: f1.geojson }));
  });
});

// ---------------------------------------------------------------------------
// 4 — shapeRecord
// ---------------------------------------------------------------------------

describe('row 3.6 — shapeRecord maps a feature to the bound columns (loader :330-372)', () => {
  it('(1) rounds the heights to 2 dp, stories to ≥1, and the centroid to 1e-7', () => {
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

  it('(2) maxH 0 ⇒ estimated_stories null', () => {
    const rec = shape(loadComputeModule(), fx(1));
    expect(rec).not.toBeNull();
    expect(rec!.estimated_stories).toBeNull();
  });

  it('(3) maxH 1.2 ⇒ estimated_stories 1, not 0', () => {
    const rec = shape(loadComputeModule(), fx(2));
    expect(rec).not.toBeNull();
    expect(rec!.estimated_stories).toBe(1);
  });

  it('(4) no LONGITUDE/LATITUDE ⇒ the 3857 ring mean, rounded 1e-7 (M-D9 wrong form, pinned)', () => {
    const f = fx(3);
    const ring = (JSON.parse(f.geojson) as { coordinates: number[][][] }).coordinates[0] ?? [];
    const [lng, lat] = ringMeanCentroid(ring);
    const rec = shape(loadComputeModule(), f);
    expect(rec).not.toBeNull();
    expect(rec!.centroid_lng).toBe(lng);
    expect(rec!.centroid_lat).toBe(lat);
  });

  it('(5) a ring of three points cannot form a polygon ⇒ null, the feature is skipped', () => {
    expect(shape(loadComputeModule(), fx(4))).toBeNull();
  });

  it('(6) MultiPolygon ⇒ same heights as (1), geometry is the first outer ring', () => {
    const rec = shape(loadComputeModule(), fx(5));
    expect(rec).not.toBeNull();
    expect(rec!.max_height_m).toBe(10.46);
    // corrected at ②: the legacy binds `feature.geometry` UNCHANGED (anchor
    // `JSON.stringify(row.geometry)`), so the stored geometry stays a MultiPolygon — NOT a
    // collapsed single ring. `extractRing` measures ring 0 of part 0, which is exactly what the
    // caller compares against fx(0)'s `coordinates[0]`.
    const poly = JSON.parse(rec!.geometry as string) as { type: string; coordinates: number[][][][] };
    const multi = JSON.parse(fx(0).geojson) as { coordinates: number[][][][] };
    expect(poly.type).toBe('MultiPolygon');
    expect(poly.coordinates[0]![0]).toEqual(multi.coordinates[0]);
    expect(rec!.estimated_stories).toBe(3);
  });

  it('reads massing_story_height_m from config: 5 ⇒ (1) stories 2, from the UNROUNDED height', () => {
    const rec = shape(loadComputeModule(), fx(0), 5);
    expect(rec).not.toBeNull();
    expect(rec!.estimated_stories).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5 — dedupeBySourceId + validatorCounterDelta
// ---------------------------------------------------------------------------

describe('row 3.6 — dedupeBySourceId keeps the LAST row per key; validatorCounterDelta under geometry_repair:"none" (0s M-D3, 0t Fold PB-3)', () => {
  it('fixtures (1) and (7) share a key: dedupe keeps ONE row, the LAST (MAX_HEIGHT 20)', () => {
    const compute = loadComputeModule();
    const f1 = fx(0);
    const f7 = fx(6);
    const r1 = { ...shape(compute, f1), source_id: compute.coerceKey!(undefined, { geojson: f1.geojson }) };
    const r7 = { ...shape(compute, f7), source_id: compute.coerceKey!(undefined, { geojson: f7.geojson }) };
    // corrected at ②: the runner contract is { kept, duplicateCount } (index.js anchor
    // `const { kept, duplicateCount } = compute.dedupeBySourceId(features)`).
    const { kept, duplicateCount } = compute.dedupeBySourceId!([r1, r7] as Record<string, unknown>[]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.max_height_m).toBe(20);
    expect(duplicateCount).toBe(1);
  });

  it('input order is preserved for non-colliding keys', () => {
    const compute = loadComputeModule();
    const rows = features().map((f) => ({
      ...shape(compute, f),
      source_id: compute.coerceKey!(undefined, { geojson: f.geojson }),
    })).filter((r) => r.source_id != null);
    const { kept } = compute.dedupeBySourceId!(rows as Record<string, unknown>[]); // corrected at ②: `.kept`
    const uniqueKeys = Array.from(new Set(rows.map((r) => r.source_id)));
    expect(kept.map((r) => r.source_id)).toEqual(
      uniqueKeys.map((k) => rows.filter((r) => r.source_id === k).pop()!.source_id),
    );
  });

  it('an accepted row under geometry_repair:"none" carries with repaired:0, even when is_valid_original is false (O-C/Fold PB-3)', () => {
    const { validatorCounterDelta } = loadComputeModule();
    // corrected at ②: the runner calls classify(v.status, v.is_valid_original) — TWO positional
    // args (write.js anchor `const d = classify(v.status, v.is_valid_original)`).
    const acceptedValid = validatorCounterDelta!('accepted', true) as Record<string, unknown>;
    expect(acceptedValid.carry).toBe(true);
    expect(acceptedValid.repaired).toBe(0);
    expect(acceptedValid.collectionExtracted).toBe(0); // corrected at ②: assert the extracted counter too
    const acceptedInvalidStored = validatorCounterDelta!('accepted', false) as Record<string, unknown>;
    expect(acceptedInvalidStored.carry).toBe(true);
    expect(acceptedInvalidStored.repaired, 'M-D2/0t: "none" never repairs, so repaired stays 0 even for a stored-invalid row').toBe(0);
    expect(acceptedInvalidStored.collectionExtracted).toBe(0);
  });

  it('a skipped row carries:false, skipped:1', () => {
    const { validatorCounterDelta } = loadComputeModule();
    // corrected at ②: the validator's real skip status is 'skipped_null'.
    const skipped = validatorCounterDelta!('skipped_null') as Record<string, unknown>;
    expect(skipped.carry).toBe(false);
    expect(skipped.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6 — checks: thresholds (report spy)
// ---------------------------------------------------------------------------

describe('row 3.6 — checks: skip_rate_pct / features_read_floor / batch_error_rate_pct (report §6, Rule 3)', () => {
  const CFG = {
    massing_skip_rate_max_pct: 5,
    massing_batch_error_rate_max_pct: 1,
    sources_building_footprints_floor: 400000,
  };

  it('skip_rate_pct: bad_key + null_geometry + shaped_skipped over rows_read, FAIL at >= 5% (0s re-bucketing)', () => {
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

  it('skip_rate_pct is declared: no limit_from_config, severity FAIL, and the compute reads the config bound', () => {
    const c = checkById(loadDescriptor(), 'skip_rate_pct');
    // corrected at ②: the legacy boundary is STRICT (`skipRate >= 5 ? 'FAIL'`), which `pct <=`
    // cannot express, and verdict.js compares `violations` first — so the compute compares against
    // the config bound and reports violations 0/1, and NO limit_from_config is declared.
    expect(c.limit).toBe('viol == 0');
    expect(c.severity).toBe('FAIL');
    expect(c.limit_from_config).toBeUndefined();
    expect(readText(COMPUTE_REL)).toContain('ctx.config.massing_skip_rate_max_pct');
  });

  it('features_read_floor: rows_read 399999 WARNs, 400000 passes (legacy WARN, not FAIL)', () => {
    const below = driveCheck('features_read_floor', { acquired: { rows_read: 399999 }, config: CFG });
    expect(below[0]![1]!.violations).toBe(1);
    const at = driveCheck('features_read_floor', { acquired: { rows_read: 400000 }, config: CFG });
    expect(at[0]![1]!.violations).toBe(0);
  });

  it('features_read_floor is declared: limit_from_config sources_building_footprints_floor, severity WARN, limit in value_min form (AP-D6 trap)', () => {
    const c = checkById(loadDescriptor(), 'features_read_floor');
    expect(c.limit_from_config).toBe('sources_building_footprints_floor');
    expect(c.severity).toBe('WARN');
    expect(String(c.limit)).toMatch(/^value_min\b/);
    expect(String(c.limit)).not.toMatch(/viol\s*==\s*0/);
  });

  it('batch_error_rate_pct is declared: no limit_from_config, severity FAIL, and the compute reads the config bound', () => {
    const c = checkById(loadDescriptor(), 'batch_error_rate_pct');
    // corrected at ②: same STRICT-boundary / violations-first reason as skip_rate_pct -> no
    // limit_from_config, the compute compares against the registered config variable.
    expect(c.limit).toBe('viol == 0');
    expect(c.severity).toBe('FAIL');
    expect(c.limit_from_config).toBeUndefined();
    expect(readText(COMPUTE_REL)).toContain('ctx.config.massing_batch_error_rate_max_pct');
  });

  // NEW at ②: drive the batch_error_rate_pct check itself (the declaration above is not enough).
  it('batch_error_rate_pct: 1 error over ceil(100000/1000)=100 batches = 1% FAILs, 0 errors passes', () => {
    const fail = driveCheck('batch_error_rate_pct', {
      acquired: { rows_read: 100000, batch_errors: 1 },
      descriptor: { execution: { batch: 1000 } },
      config: CFG,
    });
    expect(fail[0]![1]!.detail).toBe(1);
    expect(fail[0]![1]!.violations).toBe(1);
    const pass = driveCheck('batch_error_rate_pct', {
      acquired: { rows_read: 100000, batch_errors: 0 },
      descriptor: { execution: { batch: 1000 } },
      config: CFG,
    });
    expect(pass[0]![1]!.violations).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7 — declared post checks + invariant: M-D7 nulls, M-D1 key-space, M-D3 duplicates
// ---------------------------------------------------------------------------

describe('row 3.6 — post checks + invariant replace the S1–S8 cleanup/backfill statements (M-D1/M-D3/M-D7)', () => {
  it('footprint_area_null_count and geom_null_count are declared invariants, severity FAIL, bound 0 (M-D7)', () => {
    const d = loadDescriptor();
    // corrected at ②: these are SQL counts over the table, so they are invariants[] (the compute
    // has no pool; plausibility.js `runInvariants`), found by `id`.
    for (const id of ['footprint_area_null_count', 'geom_null_count']) {
      const inv = (d.invariants ?? []).find((i) => i.id === id);
      expect(inv, `invariants[] must declare ${id}`).toBeDefined();
      expect(inv!.severity, `${id} must FAIL`).toBe('FAIL');
      expect(inv!.bound).toBe('value_max 0');
      expect(inv!.source).toBe('invariant');
      expect(String(inv!.sql)).toContain('IS NULL');
    }
  });

  it("invariants[] declares building_footprints_foreign_key_space_rows: SQL uses NOT LIKE 'hash_%', FAIL when > 0 (M-D1)", () => {
    const inv = (loadDescriptor().invariants ?? []).find(
      (i) => i.id === 'building_footprints_foreign_key_space_rows',
    );
    expect(inv, 'invariants[] must declare building_footprints_foreign_key_space_rows').toBeDefined();
    expect(String(inv!.sql)).toContain("NOT LIKE 'hash_%'");
    expect(inv!.source).toBe('invariant');
    expect(inv!.bound).toBe('value_max 0');
    expect(String(inv!.severity ?? inv!.on_invalid ?? '')).toMatch(/FAIL/i);
  });

  it('duplicate_key_count is a declared INFO check (M-D3, cross-batch self-overwrite)', () => {
    const c = checkById(loadDescriptor(), 'duplicate_key_count');
    expect(c.severity).toBe('INFO');
  });

  it('no check id revives the retired S2–S5 key-format auto-cleanup (M-D1, knowingly-retired)', () => {
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

  it('config.logic_variables declares every required name', () => {
    const d = loadDescriptor();
    expect(d.config).not.toBe('none');
    const names = ((d.config as { logic_variables: Array<{ name: string }> }).logic_variables ?? []).map((v) => v.name);
    for (const v of REQUIRED_VARS) {
      expect(names, `config.logic_variables must declare ${v}`).toContain(v);
    }
  });

  it('scripts/seeds/logic_variables.json has a row for every required name; the three pinned defaults match §6', () => {
    const seeds = JSON.parse(fs.readFileSync(abs('scripts/seeds/logic_variables.json'), 'utf8')) as Record<string, { default: unknown }>;
    for (const v of REQUIRED_VARS) {
      expect(seeds[v], `${v} has no seed row (Rule 3 / LM-D15: a missing row throws)`).toBeDefined();
    }
    for (const [name, def] of Object.entries(SEED_DEFAULTS)) {
      expect(seeds[name]!.default, `seed default for ${name} must equal the report §6 ledger`).toBe(def);
    }
  });

  it('the compute source binds thresholds through ctx.config, never a bare 400000 / 3.0 / >= 5 / >= 1 literal', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/[^.\w]400000\b/);
    expect(src).not.toMatch(/\b3\.0\b/);
    expect(src).not.toMatch(/>=\s*5\b/);
    expect(src).not.toMatch(/>=\s*1\b/);
  });

  it('the compute has no hasFails/hasWarns identifier and no bare verdict: key (Rule 10 — verdict is row-derived by the runner)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/hasFails|hasWarns/);
    expect(src).not.toMatch(/\bverdict\s*:/);
  });
});

// ---------------------------------------------------------------------------
// 9 — deviations/limitations carry the M-D ids; recovery.interrupted:"none" + why
// ---------------------------------------------------------------------------

describe('row 3.6 — deviations/limitations name every M-D id; recovery is truthful (Rule 1/12)', () => {
  it('deviations[] joined text names M-D1 M-D3 M-D6 M-D7 M-D10 M-D11 M-D12, each with adjudicated_by', () => {
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

  it('limitations[] joined text names M-D2 M-D4 M-D5 M-D9', () => {
    const d = loadDescriptor();
    expect(Array.isArray(d.limitations), 'limitations must be an explicit array').toBe(true);
    const text = JSON.stringify(d.limitations);
    for (const id of ['M-D2', 'M-D4', 'M-D5', 'M-D9']) {
      expect(text, `limitations[] must name ${id}`).toContain(id);
    }
  });

  it('recovery.interrupted is "none" with a stated why (class A guarded_upsert has no retraction to recover, Rule 12)', () => {
    const d = loadDescriptor();
    expect(d.recovery?.interrupted).toBe('none');
    expect(d.recovery?.interrupted_why, 'the none posture must be justified').toBeDefined();
  });

  it('the assessment report states the compressed-form marker line (plain `it`: GREEN today, ① already landed part A1)', () => {
    const report = fs.readFileSync(abs('docs/reports/2026-09-24-batch2-p3-6-massing-assessment.md'), 'utf8');
    expect(report).toContain('**Commit form: compressed (R-PACE-1)**');
  });
});
