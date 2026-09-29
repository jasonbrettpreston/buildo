// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① — PH-7, prove red)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5 (compute shape)
// SPEC LINK: docs/specs/01-pipeline/124_step_opt_policy.md Rules 1–13 (Rule 1: no fictional declarations;
//              Rule 3: every literal is a declared config.logic_variables[] entry with a seed row;
//              Rule 10: verdict row-derived; Rule 12: recovery.interrupted truthful)
// SPEC LINK: docs/specs/01-pipeline/57_source_neighbourhoods.md (the source producer contract)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 17 `neighbourhoods`)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_runs.md §A.5 (advisory-lock registry row 57)
//
// Batch-2 row 3.8 — `neighbourhoods`, the INGESTOR archetype's SIXTH member (after `load_ravines`,
// `address_points`, `parcels`, `load_centreline`, `massing`) — R-PACE-1 COMPRESSED form (two sources → one target).
// Commit ① landed the RED suite + fixtures + the commit-① assessment report + PRE goldens; commit ②
// landed the descriptor + compute + frozen shell + notes + seeds (POST goldens, zero-diff); commit ③
// is the cutover (registration).
//
// ✅ THE 11 RED CLAIMS FLIPPED GREEN AT ②. What was `it.fails` is now plain `it(` — the descriptor,
// compute, frozen shell, notes and seeds all exist, so each claim passes against them. The 8 legacy
// pins (L1–L8) were green at ① and read the PRE-② script as SOURCE TEXT from the VERBATIM fixture
// copy `fixtures/legacy-load-neighbourhoods.js.txt` (= `git show 110c8c31:scripts/load-neighbourhoods.js`,
// sha256 9638974e…8729): at ② the live `scripts/load-neighbourhoods.js` became the frozen shell, so
// the oracle no longer reads it. It is NEVER required in-process — the pre-② script calls
// `pipeline.run()` at module scope and would open a pool; `fixtures/legacy-harness.ts` evaluates its
// source text with a fake pipeline / fake pool / fake ExcelJS.
//
// Artifacts asserted against (plan of record `.cursor/batch2_p3_8_neighbourhoods_active_task.md`;
// commit-① report `docs/reports/2026-09-28-batch2-p3-8-neighbourhoods-assessment.md`):
//   scripts/load-neighbourhoods.descriptor.json  — shape:"ingest", lock 57, class A `guarded_upsert`,
//                                                  two externals (primary geojson + lookup xlsx),
//                                                  17 written columns incl. the 14 census `preserve_null`
//   scripts/load-neighbourhoods.notes.json       — the publisher vocabulary + storage-format constants
//   scripts/lib/compute/load-neighbourhoods.js   — coerceKey / shapeRecord / buildLookup / checks
//   scripts/load-neighbourhoods.js               — the §5.1 frozen shell (pipeline.step(...))
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadLegacy, gridToRows } from './fixtures/legacy-harness';
import type { Grid, FakePool } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const STEP_DIR_REL = 'src/tests/steps/neighbourhoods';

const DESCRIPTOR_REL = 'scripts/load-neighbourhoods.descriptor.json';
const NOTES_REL = 'scripts/load-neighbourhoods.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-neighbourhoods.js';
const SHELL_REL = 'scripts/load-neighbourhoods.js';
const REPORT_REL = 'docs/reports/2026-09-28-batch2-p3-8-neighbourhoods-assessment.md';
const FEATURES_REL = `${STEP_DIR_REL}/fixtures/features.json`;
const CENSUS_REL = `${STEP_DIR_REL}/fixtures/census-sheet.json`;

/** Spec 47 §A.5 lock registry row 57 [READ scripts/load-neighbourhoods.js `ADVISORY_LOCK_ID = 57`]. */
const LOCK_ID = 57;
/** The ONE write target (plan §4) — 17 written columns of which 14 are the census pivot. */
const WRITE_TABLE = 'neighbourhoods';
/** External ids (plan §4, Gate answers): the GeoJSON PRIMARY and the census XLSX LOOKUP. */
const PRIMARY_ID = 'ckan:neighbourhoods-4326';
const LOOKUP_ID = 'ckan:nbhd-2021-census-profile';
/** The 14 census columns in plan §4 order — the legacy 8 SET lists, flattened and de-duplicated. */
const CENSUS_COLUMNS = [
  'avg_household_income',
  'median_household_income',
  'avg_individual_income',
  'low_income_pct',
  'tenure_owner_pct',
  'tenure_renter_pct',
  'period_of_construction',
  'couples_pct',
  'lone_parent_pct',
  'married_pct',
  'university_degree_pct',
  'immigrant_pct',
  'visible_minority_pct',
  'english_knowledge_pct',
] as const;

type CensusCol = (typeof CENSUS_COLUMNS)[number];
type CensusCell = number | string | null;
type CensusRow = Record<CensusCol, CensusCell>;

// ---------------------------------------------------------------------------
// Artifact helpers (copied from src/tests/steps/massing/violations.test.ts:68-145)
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the row-3.8 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

/** Collapse all whitespace runs to a single space — the fixture's declared normalisation. */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list — the loader property (Spec 122 §4.2)
  return d;
}

interface ComputeModule {
  compute?: (ctx: unknown) => Promise<unknown>;
  coerceKey?: (raw: unknown, ctx?: { geojson?: string | null }) => number | null;
  shapeRecord?: (record: unknown, seam: unknown) => Record<string, unknown> | null;
  buildLookup?: (externalId: string, rows: unknown[], seam: unknown) => unknown;
  dedupeBySourceId?: (rows: Record<string, unknown>[]) => { kept: Record<string, unknown>[]; duplicateCount: number };
  validatorCounterDelta?: (...args: unknown[]) => unknown;
  checks?: Record<string, (ctx: unknown) => unknown>;
  [k: string]: unknown;
}

function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return mod;
}

function checkById(d: Descriptor, id: string): Check {
  const c = d.checks.find((x) => x.id === id);
  expect(c, `descriptor declares no check "${id}"`).toBeDefined();
  return c as Check;
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'an INGESTOR may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
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

// ONE compiler, the same one pipeline.step() validates with.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

// ---------------------------------------------------------------------------
// Fixture drivers — a GeoJSON FeatureCollection on a tmp path, and n valid features
// ---------------------------------------------------------------------------

interface Feature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: unknown;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

/** The fixture (a) MultiPolygon — a tiny valid polygon near -79.4,43.7. */
const FIXTURE_GEOMETRY = {
  type: 'MultiPolygon',
  coordinates: [[[[-79.4, 43.7], [-79.399, 43.7], [-79.399, 43.7005], [-79.4, 43.7005], [-79.4, 43.7]]]],
};

interface TmpGeojson {
  path: string;
  collection: FeatureCollection;
}

/** Write a FeatureCollection to a fresh tmp dir; the returned path is what the legacy script reads. */
function tmpGeojson(features: Feature[]): TmpGeojson {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-1c1-'));
  const filePath = path.join(dir, 'features.geojson');
  const collection: FeatureCollection = { type: 'FeatureCollection', features };
  fs.writeFileSync(filePath, JSON.stringify(collection), 'utf8');
  return { path: filePath, collection };
}

/** n valid features keyed `String(i+1)`, named `N${i+1}` — the floor fixture. */
function nFeatures(n: number): Feature[] {
  return Array.from({ length: n }, (_unused, index) => ({
    type: 'Feature' as const,
    properties: { AREA_SHORT_CODE: String(index + 1), AREA_NAME: `N${index + 1}` },
    geometry: FIXTURE_GEOMETRY,
  }));
}

function feature(props: Record<string, unknown>): Feature {
  return { type: 'Feature', properties: props, geometry: FIXTURE_GEOMETRY };
}

/** The on-disk fixture feature collection (6 features, 3 of which qualify). */
function fixturePath(): string {
  return artifact(FEATURES_REL, 'the legacy-oracle boundary fixture');
}

/** The census fixture grid (row-major, 0-based). */
function censusGrid(): Grid {
  const fixture = JSON.parse(readText(CENSUS_REL)) as { grid: Grid };
  return fixture.grid;
}

// ---------------------------------------------------------------------------
// legacyCensus — replay the legacy loadProfiles against the fixture grid and
// read the 8 UPDATE statements back off the fake pool.
// ---------------------------------------------------------------------------

/** `UPDATE neighbourhoods AS n SET <targets> FROM (SELECT unnest($1::int[]) AS …` */
const UPDATE_SET_CLAUSE = /UPDATE neighbourhoods AS n SET([\s\S]*?)\bFROM\s*\(/;

interface CensusCapture {
  map: Record<number, CensusRow>;
  matched: number;
}

/**
 * Run the LEGACY `loadProfiles` over `grid` via the source-text oracle and reconstruct, per
 * neighbourhood id, the Census columns the legacy statements would write.
 *
 * Every `UPDATE neighbourhoods … FROM (SELECT unnest(…)` statement binds `$1` = the nid array
 * followed by ONE array per SET target, positionally. A value the legacy never pushes (absent /
 * suppressed) is NOT in the array, so the column keeps its stored value — the "absent ⇒ leave
 * alone" semantics the converted `on_empty:"preserve_null"` axis reproduces (Fold CF-5). Cells not
 * written are null here, and every seen nid starts with all 14 columns null.
 */
async function legacyCensus(grid: Grid): Promise<CensusCapture> {
  const oracle = loadLegacy({ grid });
  const pool: FakePool = oracle.pool;
  const matched = await oracle.loadProfiles(pool, 'fixture.xlsx');

  const map: Record<number, CensusRow> = {};
  const rowFor = (nid: number): CensusRow => {
    if (!map[nid]) map[nid] = blankCensusRow();
    return map[nid]!;
  };

  for (const call of pool.queries) {
    const clause = UPDATE_SET_CLAUSE.exec(call.sql);
    if (!clause) continue;
    const targets = [...clause[1]!.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*=/gim)].map((m) => m[1] as string);
    const ids = call.params[0] as number[];
    if (!Array.isArray(ids) || targets.length === 0) continue;
    for (let i = 0; i < ids.length; i += 1) {
      const nid = Number(ids[i]);
      const row = rowFor(nid);
      for (let j = 0; j < targets.length; j += 1) {
        const col = targets[j] as CensusCol;
        if (!(CENSUS_COLUMNS as readonly string[]).includes(col)) continue;
        const val = (call.params[j + 1] as unknown[])[i] as number | string | null;
        if (val !== null && val !== undefined) row[col] = val;
      }
    }
  }

  return { map, matched };
}

function blankCensusRow(): CensusRow {
  const row = {} as CensusRow;
  for (const col of CENSUS_COLUMNS) row[col] = null;
  return row;
}

// ---------------------------------------------------------------------------
// EXPECTED_CENSUS — `.cursor/engine-briefs/nb-1-evidence.md` §E5, transcribed.
// Every value carries the rule that produces it; L5 re-proves the whole table on the legacy oracle.
// ---------------------------------------------------------------------------

/** The census fixture's own 3 neighbourhoods (nids 1/2/3), all 14 columns each. */
const EXPECTED_CENSUS: Record<number, CensusRow> = {
  1: {
    avg_household_income: 100000, // Math.round(100000.4) — income is Math.round'd into an INT column
    median_household_income: 80000, // exact integer passthrough
    avg_individual_income: 50001, // Math.round(50000.5) — .5 rounds UP
    low_income_pct: 12.34, // NOT rounded in JS; NUMERIC(5,2) casts it on the way in (Fold CF-5)
    tenure_owner_pct: 60, // 60 / (60+40) * 100, rounded to 1 dp
    tenure_renter_pct: 40, // 40 / (60+40) * 100, rounded to 1 dp
    period_of_construction: 'pre-1960', // dominant period from {10,10,2} — a TIE resolves first-wins
    couples_pct: 90, // 90 / (90+10) * 100
    lone_parent_pct: 10, // 10 / (90+10) * 100
    married_pct: 50, // 45 / 90 * 100 (the 'Married or living common-law' spelling branch)
    immigrant_pct: 30, // 30 / 100 * 100
    university_degree_pct: null, // no education characteristic row in the fixture — never written
    visible_minority_pct: null, // no visible-minority row — never written
    english_knowledge_pct: null, // no language row — never written
  },
  2: {
    avg_household_income: 95001, // '95,000.6' → comma-cleaned → Math.round(95000.6)
    median_household_income: 70000,
    avg_individual_income: 40000,
    low_income_pct: 5, // a REAL 5, not absent
    tenure_owner_pct: null, // owner+renter total is 0 → the ÷0 guard skips the row entirely
    tenure_renter_pct: null,
    period_of_construction: '2016-2021', // dominant from {5,3,8}
    couples_pct: null, // family total is 0 → skipped
    lone_parent_pct: null,
    married_pct: null, // marital total is 0 → skipped
    immigrant_pct: 25, // 20 / 80 * 100
    university_degree_pct: null,
    visible_minority_pct: null,
    english_knowledge_pct: null,
  },
  3: {
    avg_household_income: null, // 'x' is a suppression token → absent → keeps stored
    median_household_income: 60000,
    avg_individual_income: 30000,
    low_income_pct: null, // '...' is a suppression token → absent
    tenure_owner_pct: 30, // 30 / (30+70) * 100
    tenure_renter_pct: 70,
    period_of_construction: null, // every construction count is 0 → the >0 gate stores nothing
    couples_pct: 90, // 45 / (45+5) * 100
    lone_parent_pct: 10,
    married_pct: null, // 'x' → absent numerator AND absent denominator
    immigrant_pct: 25, // 10 / 40 * 100
    university_degree_pct: null,
    visible_minority_pct: null,
    english_knowledge_pct: null,
  },
};

/** §E5: 3 income + 1 pct + 2 tenure + 3 periods + 2 family + 2 married + 2 immigrant = 15. */
const EXPECTED_MATCHED = 15;

// ===========================================================================
// Legacy oracle pins — GREEN today, and the oracle the RED values below must reproduce
// ===========================================================================

describe('row 3.8 — legacy oracle pins (GREEN today; the RED values below are these)', () => {
  it('L1 — the key/name contract: 3 of the 6 fixture features load, keyed AREA_SHORT_CODE with the AREA_LONG_CODE name fallback', async () => {
    const oracle = loadLegacy();
    const inserted = await oracle.loadBoundaries(oracle.pool, fixturePath(), true);

    expect(inserted).toBe(3);
    expect(oracle.pool.queries).toHaveLength(1);
    const call = oracle.pool.queries[0]!;
    expect(call.sql).toContain('INSERT INTO neighbourhoods');
    // (d) AREA_SHORT_CODE '0' → 0 → falsy → skipped; (e) no key → '0' → skipped;
    // (f) key '4' but NO name → skipped. (b)'s name falls back to AREA_LONG_CODE.
    expect(call.params[0]).toEqual([1, 2, 3]);
    expect(call.params[1]).toEqual(['Alpha', 'Beta Long', 'Gamma']);
    expect(call.params[2]).toHaveLength(3);
  });

  it('L2 — a non-numeric AREA_SHORT_CODE REJECTS /positive integer/ — the run halts, it does not skip', async () => {
    const oracle = loadLegacy();
    const bad = tmpGeojson([feature({ AREA_SHORT_CODE: 'abc', AREA_NAME: 'Bad' })]);
    await expect(oracle.loadBoundaries(oracle.pool, bad.path, true)).rejects.toThrow(/positive integer/);
  });

  it('L3 — N-D1: the INSERT column list is exactly (neighbourhood_id, name, geometry); a NEW row leaves `geom` NULL (the converted RED value is that geom IS written on insert)', async () => {
    const oracle = loadLegacy();
    await oracle.loadBoundaries(oracle.pool, fixturePath(), true);
    const sql = normalizeWs(oracle.pool.queries[0]!.sql);

    expect(sql).toContain('INSERT INTO neighbourhoods (neighbourhood_id, name, geometry)');
    // `geom` appears ONLY in the SET list — never among the inserted columns, so an INSERT leaves it NULL.
    const insertCols = /INSERT INTO neighbourhoods \(([^)]*)\)/.exec(sql)![1]!.split(',').map((c) => c.trim());
    expect(insertCols).toEqual(['neighbourhood_id', 'name', 'geometry']);
    expect(insertCols).not.toContain('geom');
    expect(sql).toContain('geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)');
  });

  it('L4 — a duplicated key binds [1,1] in ONE INSERT under ON CONFLICT (neighbourhood_id) DO UPDATE — Postgres then refuses "cannot affect row a second time" (the B11 refusal)', async () => {
    const oracle = loadLegacy();
    const dup = tmpGeojson([
      feature({ AREA_SHORT_CODE: '1', AREA_NAME: 'First' }),
      feature({ AREA_SHORT_CODE: '1', AREA_NAME: 'Second' }),
    ]);
    const inserted = await oracle.loadBoundaries(oracle.pool, dup.path, true);

    expect(inserted).toBe(2);
    expect(oracle.pool.queries).toHaveLength(1);
    expect(oracle.pool.queries[0]!.sql).toContain('ON CONFLICT (neighbourhood_id) DO UPDATE');
    expect(oracle.pool.queries[0]!.params[0]).toEqual([1, 1]);
  });

  it('L5 — the census pivot: (await legacyCensus(fixture grid)).map equals EXPECTED_CENSUS, and 15 characteristic rows match', async () => {
    const capture = await legacyCensus(censusGrid());
    expect(capture.map).toEqual(EXPECTED_CENSUS);
    expect(capture.matched).toBe(EXPECTED_MATCHED);
  });

  it('L6 — the 5-pct bulk UPDATE preserves stored values via COALESCE(v.col, n.col), and nid 3 is absent from the avg_household_income param list (its cell is suppressed)', () => {
    const oracle = loadLegacy({ grid: censusGrid() });
    const pool = oracle.pool;
    return oracle.loadProfiles(pool, 'fixture.xlsx').then(() => {
      const bulk = pool.queries.find((q) => /UPDATE neighbourhoods/.test(q.sql) && /COALESCE\(v\.married_pct/.test(q.sql));
      expect(bulk, 'the bulk-5 statement must exist').toBeDefined();
      expect(normalizeWs(bulk!.sql)).toContain('married_pct = COALESCE(v.married_pct, n.married_pct)');

      const income = pool.queries.find(
        (q) => /UPDATE neighbourhoods/.test(q.sql) && /SET avg_household_income = v\.val/.test(normalizeWs(q.sql)),
      );
      expect(income, 'the avg_household_income statement must exist').toBeDefined();
      expect(income!.params[0]).not.toContain(3); // 'x' → parseNumeric null → never pushed
      expect(income!.params[0]).toEqual([1, 2]);
    });
  });

  it('L7 — the audit floor: 157 boundaries FAILs the `boundaries_loaded` row (`>= 158`), 158 PASSes', async () => {
    const below = loadLegacy({ grid: censusGrid() });
    const belowPath = tmpGeojson(nFeatures(157));
    await below.runMain(belowPath.path, 'x.xlsx');
    const belowRows = auditRows(below.summaries[0]!.records_meta);
    const belowRow = belowRows.find((r) => r.metric === 'boundaries_loaded');
    expect(belowRow, 'the legacy audit table carries a boundaries_loaded row').toBeDefined();
    expect(belowRow!.value).toBe(157);
    expect(belowRow!.threshold).toBe('>= 158');
    expect(belowRow!.status).toBe('FAIL');
    expect((below.summaries[0]!.records_meta.audit_table as { verdict: string }).verdict).toBe('FAIL');

    const at = loadLegacy({ grid: censusGrid() });
    await at.runMain(tmpGeojson(nFeatures(158)).path, 'x.xlsx');
    const atRow = auditRows(at.summaries[0]!.records_meta).find((r) => r.metric === 'boundaries_loaded');
    expect(atRow!.value).toBe(158);
    expect(atRow!.status).toBe('PASS');
    expect((at.summaries[0]!.records_meta.audit_table as { verdict: string }).verdict).toBe('PASS');
  });

  it('L8 — a contended advisory lock (57) SKIPS SILENTLY: no summary, no audit row at all', async () => {
    const oracle = loadLegacy({ grid: censusGrid(), lockAcquired: false });
    await oracle.runMain(tmpGeojson(nFeatures(158)).path, 'x.xlsx');
    expect(oracle.summaries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Small readers over the legacy emit payloads
// ---------------------------------------------------------------------------

interface AuditRow {
  metric: string;
  value: unknown;
  threshold: unknown;
  status: string;
}

function auditRows(meta: Record<string, unknown>): AuditRow[] {
  const table = meta.audit_table as { rows?: AuditRow[] } | undefined;
  return table?.rows ?? [];
}

// ---------------------------------------------------------------------------
// Descriptor / compute shapes (used by part 2 — declared here so the types are one home)
// ---------------------------------------------------------------------------

interface Check {
  id: string;
  kind: string;
  severity: string;
  blocking: boolean;
  when: string;
  limit: unknown;
  limit_from_config?: string;
  [k: string]: unknown;
}

interface WriteSpec {
  table: string;
  key: string | string[];
  geometry_kind?: string;
  columns: Array<{ name: string; on_empty?: string; written?: string; bind?: string }>;
  write_discipline: { class: string; guard_columns: unknown; set_source?: string; [k: string]: unknown };
  [k: string]: unknown;
}

interface Descriptor {
  identity: { name: string; archetype: string; lock: number; spec: string; display_name?: string };
  /** Spec 122 §5.1 — the frozen shape lives under `execution` (massing ② precedent). */
  execution: { shape: string; [k: string]: unknown };
  inputs: { reads: { externals: Array<{ id: string; format: string; role?: string; key_property?: string; [k: string]: unknown }> } };
  outputs: 'none' | { writes: WriteSpec[]; invalidates?: unknown };
  checks: Check[];
  [k: string]: unknown;
}

// ===========================================================================
// PART 2 — the converted claims, FLIPPED GREEN at ② (landed row 3.8 ①).
// These were `it.fails` at ① — vitest INVERTED them, because the body genuinely
// THREW: the throw was a NAMED MISSING ARTIFACT (`artifact()`), never a
// require/TS error, since the FIRST statement of every body that touches a
// future file goes through `loadDescriptor()` / `readText()` / `artifact()`.
// At ② that throw is gone: every body now passes as a plain `it(`. Each claim
// keeps its `legacy L<n>` comment naming the part-1 pin it replaces.
//
// The pre-② state, for the record: `scripts/load-neighbourhoods.js` was the
// legacy source-text loader — it called `pipeline.run()` at module scope and
// had no `.descriptor.json`, no `.notes.json` and no `lib/compute/` module.
// ===========================================================================

describe('row 3.8 — the four ① artifacts exist and the frozen shape lands (GREEN at ②)', () => {
  it('D1 — descriptor AJV-valid; identity name/archetype/spec/lock/display_name; shape "ingest"; notes file exists; shell text has pipeline.step( and NOT pipeline.run( (flipped GREEN at ②)', () => {
    const d = loadDescriptor(); // MISSING ARTIFACT scripts/load-neighbourhoods.descriptor.json — the ① RED reason
    expect(d.identity.name).toBe('neighbourhoods');
    expect(d.identity.archetype).toBe('INGESTOR');
    expect(d.identity.spec).toBe('57');
    expect(d.identity.lock).toBe(LOCK_ID); // legacy L1: ADVISORY_LOCK_ID = 57 [READ scripts/load-neighbourhoods.js:627]
    // Fold H-1 (§14): the audit_table NAME legacies at :705 as "Neighbourhood Boundaries".
    expect(d.identity.display_name).toBe('Neighbourhood Boundaries');
    // corrected at ② (massing ② precedent): the frozen Spec 122 §5.1 shape lives under `execution`.
    expect(d.execution.shape).toBe('ingest');
    expect(fs.existsSync(abs(NOTES_REL)), `MISSING ARTIFACT ${NOTES_REL} — publisher vocabulary + storage-format constants`).toBe(true);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run('); // RED today: the legacy shell's terminal statement IS pipeline.run(...)
  });
});

describe('row 3.8 — D2 externals: the GeoJSON primary + the census XLSX lookup (GREEN at ②)', () => {
  it('D2 — primary ckan:neighbourhoods-4326 format geojson key_property AREA_SHORT_CODE (N-D6: no AREA_S_CD/AREA_ID arm); lookup ckan:nbhd-2021-census-profile format xlsx role lookup (flipped GREEN at ②)', () => {
    const d = loadDescriptor();
    const externals = d.inputs.reads.externals;
    const primary = externals.find((e) => e.id === PRIMARY_ID);
    // legacy L1: the key source is AREA_SHORT_CODE [READ :132]; N-D6 retires the dead
    // `AREA_S_CD` arm and the 7-digit `AREA_ID` arm that would key 158 garbage rows.
    expect(primary, `external ${PRIMARY_ID} is not declared`).toBeDefined();
    expect(primary!.format).toBe('geojson');
    expect(primary!.key_property).toBe('AREA_SHORT_CODE');
    const lookup = externals.find((e) => e.id === LOOKUP_ID);
    expect(lookup, `external ${LOOKUP_ID} is not declared`).toBeDefined();
    expect(lookup!.format).toBe('xlsx');
    expect(lookup!.role).toBe('lookup'); // 0w seam (RE-FREEZE #27, landed 4ea7621e)
  });
});

describe('row 3.8 — D3 coerceKey: the B2 key parse (GREEN at ②)', () => {
  it("D3 — coerceKey: '1'→1, '129'→129, '0'→null, ''→null, undefined→null, 'abc' throws /positive integer/ (flipped GREEN at ②)", () => {
    const compute = loadComputeModule(); // MISSING ARTIFACT scripts/lib/compute/load-neighbourhoods.js — the ① RED reason
    // legacy L1/L2: safeParsePositiveInt(props.AREA_S_CD || props.AREA_SHORT_CODE || props.AREA_ID || '0')
    // [READ scripts/load-neighbourhoods.js:132]; 0/empty ⇒ falsy ⇒ the feature is SKIPPED (:134).
    expect(compute.coerceKey!('1')).toBe(1);
    expect(compute.coerceKey!('129')).toBe(129);
    expect(compute.coerceKey!('0')).toBeNull(); // 0 ⇒ null (bad_key), never a real id
    expect(compute.coerceKey!('')).toBeNull();
    expect(compute.coerceKey!(undefined)).toBeNull();
    // legacy L2: a non-numeric key REJECTS the whole run — it does NOT skip.
    expect(() => compute.coerceKey!('abc')).toThrow(/positive integer/);
  });
});

describe('row 3.8 — D4 shapeRecord name fallback: AREA_NAME ‖ AREA_LONG_CODE (GREEN at ②)', () => {
  it("D4 — shapeRecord on fixtures (a)/(b) ⇒ name 'Alpha'/'Beta Long'; (f) ⇒ the 0p skip reason string 'missing_name' (flipped GREEN at ②)", () => {
    const compute = loadComputeModule();
    const features = (JSON.parse(readText(FEATURES_REL)) as FeatureCollection).features;
    /** The seam `runIngestPhase` passes (:887) — a lookup map, a tag spy, a fixed run_at. */
    const shape = (props: Record<string, unknown>, tags: string[] = []) => compute.shapeRecord!(props, {
      geojson: '{"type":"MultiPolygon","coordinates":[]}',
      config: {},
      run_at: new Date(0),
      tag: (name: string) => { tags.push(name); },
      lookups: { [LOOKUP_ID]: {} },
    });
    // legacy L1: (a) AREA_NAME 'Alpha'; (b) has no AREA_NAME so the AREA_LONG_CODE fallback
    // yields 'Beta Long' (:133).
    const a = shape(features[0]!.properties) as Record<string, unknown>;
    expect(a).not.toBeNull();
    expect(a.name).toBe('Alpha');
    const b = shape(features[1]!.properties) as Record<string, unknown>;
    expect(b).not.toBeNull();
    expect(b.name).toBe('Beta Long');
    // legacy L1: (f) carries key '4' but NO name at all ⇒ the feature is SKIPPED (:134-137).
    // 0p: the compute names the skip by returning the reason STRING.
    const skipped = shape(features[5]!.properties);
    expect(skipped).toBe('missing_name'); // 0p skip reason
  });
});

describe('row 3.8 — D5 buildLookup: the B6–B8 census pivot (GREEN at ②)', () => {
  it('D5 — buildLookup(LOOKUP_ID, gridToRows(grid), {config:{}}) ⇒ .map normalised over CENSUS_COLUMNS = EXPECTED_CENSUS and .stats.matched_rows = EXPECTED_MATCHED (flipped GREEN at ②)', () => {
    const compute = loadComputeModule();
    const out = compute.buildLookup!(LOOKUP_ID, gridToRows(censusGrid()), { config: {} }) as {
      map: Record<number, Record<string, CensusCell>>;
      stats: { matched_rows: number };
    };
    // legacy L5: the fixture's own 3 neighbourhoods, every absent/÷0 cell left null.
    const normalized: Record<number, CensusRow> = {};
    for (const [key, row] of Object.entries(out.map)) {
      const blank = blankCensusRow();
      for (const col of CENSUS_COLUMNS) blank[col] = (row[col] ?? null) as CensusCell;
      normalized[Number(key)] = blank; // keys numeric
    }
    expect(normalized).toEqual(EXPECTED_CENSUS);
    // legacy L5: 3 income + 1 pct + 2 tenure + 3 periods + 2 family + 2 married + 2 immigrant = 15.
    expect(out.stats.matched_rows).toBe(EXPECTED_MATCHED);
  });
});

describe('row 3.8 — D6 the lookup merge into shapeRecord (GREEN at ②)', () => {
  it('D6 — shapeRecord fixture (a) with lookups {[LOOKUP_ID]: {1: EXPECTED_CENSUS[1]}} ⇒ avg_household_income 100000; fixture (c) (key 3 absent) ⇒ every CENSUS_COLUMNS null (N-D14: keeps stored) (flipped GREEN at ②)', () => {
    const compute = loadComputeModule();
    const features = (JSON.parse(readText(FEATURES_REL)) as FeatureCollection).features;
    const shaped = (index: number, lookups: Record<string, unknown>) => compute.shapeRecord!(features[index]!.properties, {
      geojson: '{"type":"MultiPolygon","coordinates":[]}',
      config: {},
      run_at: new Date(0),
      tag: () => {},
      lookups,
    }) as Record<string, unknown>;
    // legacy L5: nid 1's income is Math.round(100000.4) = 100000.
    const a = shaped(0, { [LOOKUP_ID]: { 1: EXPECTED_CENSUS[1] } });
    expect(a.avg_household_income).toBe(100000);
    // legacy L5/L6 + Fold CF-5 N-D14: a boundary row whose key is ABSENT from the census
    // map keeps every stored value ⇒ the step binds null for every census column (the
    // declared `on_empty:"preserve_null"` axis reproduces the legacy "absent ⇒ keep").
    const c = shaped(2, { [LOOKUP_ID]: { 1: EXPECTED_CENSUS[1] } }); // fixture (c) is key 3
    for (const col of CENSUS_COLUMNS) {
      expect(c[col], `${col} must be null — key 3 is absent from the census map`).toBeNull();
    }
  });
});

describe('row 3.8 — D7 preserve_null guard: the census merge is a guarded COALESCE (GREEN at ②)', () => {
  it('D7 — the upsert SQL carries, per census column, the COALESCE set arm AND the (EXCLUDED.c IS NOT NULL AND t.c IS DISTINCT FROM EXCLUDED.c) guard; plus name/geometry IS DISTINCT FROM; .guard_columns ⊇ name, geometry, all 14 (flipped GREEN at ②)', () => {
    const d = loadDescriptor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write codegen
    const writeLib = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js')) as {
      buildWritePlan: (w: unknown, dd: unknown) => { upsertSqlFor: (n: number) => string; guard_columns: string[] };
    };
    const sql = writeLib.buildWritePlan(writes(d)[0], d).upsertSqlFor(1);
    for (const col of CENSUS_COLUMNS) {
      // legacy L6: the bulk-5 UPDATE is literally `COALESCE(v.col, n.col)` (:603-609).
      expect(sql, `${col} set arm`).toContain(`${col} = COALESCE(EXCLUDED.${col}, ${WRITE_TABLE}.${col})`);
      expect(sql, `${col} guard arm`).toContain(`(EXCLUDED.${col} IS NOT NULL AND ${WRITE_TABLE}.${col} IS DISTINCT FROM EXCLUDED.${col})`);
    }
    // legacy L3/L4: the boundary guard (`WHERE neighbourhoods.name IS DISTINCT FROM ... OR
    // neighbourhoods.geometry IS DISTINCT FROM ...`, :152-156).
    expect(sql).toContain(`${WRITE_TABLE}.name IS DISTINCT FROM EXCLUDED.name`);
    expect(sql).toContain(`${WRITE_TABLE}.geometry IS DISTINCT FROM EXCLUDED.geometry`);
    const guard = writeLib.buildWritePlan(writes(d)[0], d).guard_columns;
    for (const col of ['name', 'geometry', ...CENSUS_COLUMNS]) {
      expect(guard, `guard_columns must carry ${col}`).toContain(col);
    }
  });
});

describe('row 3.8 — D8 geom on insert: N-D1 (GREEN at ②; the legacy INSERT omits geom)', () => {
  it('D8 — the INSERT column list contains geom and the SQL contains ST_GeomFromWKB(; the geom column is written:"step" (flipped GREEN at ②; legacy L3 NULLs geom on insert)', () => {
    const d = loadDescriptor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write codegen
    const writeLib = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js')) as {
      buildWritePlan: (w: unknown, dd: unknown) => { upsertSqlFor: (n: number) => string };
    };
    const sql = writeLib.buildWritePlan(writes(d)[0], d).upsertSqlFor(1);
    // legacy L3: the INSERT list is exactly (neighbourhood_id, name, geometry) — `geom` is
    // NEVER among the inserted columns, so a NEW row leaves it NULL. N-D1 knowingly retires
    // that: the converted INSERT binds the validated WKB and DOES write `geom`.
    const insertCols = /INSERT INTO \w+ \(([^)]*)\)/.exec(sql)![1]!.split(',').map((c) => c.trim());
    expect(insertCols).toContain('geom');
    expect(sql).toContain('ST_GeomFromWKB(');
    const geomCol = writes(d)[0]!.columns.find((c) => c.name === 'geom');
    expect(geomCol, 'the write declares no geom column').toBeDefined();
    expect(geomCol!.written).toBe('step');
    expect(geomCol!.bind).toBe('wkb_geometry');
  });
});

describe('row 3.8 — D9 the three pre_write/B11/N-D17/N-D6 refusals (GREEN at ②)', () => {
  it('D9 — checks declared per the Gate answers (duplicate_key_count + null_geometry_count FAIL pre_write with order_guarantee naming Spec 57; bad_key_count FAIL); driveCheck duplicate_key_count 1 ⇒ violations 1, 0 ⇒ 0 (flipped GREEN at ②)', () => {
    const d = loadDescriptor();
    // legacy L4: B11 — a duplicate key aborts via `cannot affect row a second time`.
    const dup = checkById(d, 'duplicate_key_count');
    expect(dup.severity).toBe('FAIL');
    expect(dup.when).toBe('pre_write');
    expect(JSON.stringify(dup.order_guarantee)).toContain('57_source_neighbourhoods');
    // Fold CF-8 N-D17 — a null-geometry feature fails the legacy run (UPDATE arm's
    // ST_GeomFromGeoJSON('null') throws); the converted path preserves the refusal.
    const nullGeom = checkById(d, 'null_geometry_count');
    expect(nullGeom.severity).toBe('FAIL');
    expect(nullGeom.when).toBe('pre_write');
    expect(JSON.stringify(nullGeom.order_guarantee)).toContain('57_source_neighbourhoods');
    // N-D6 — a non-numeric key is a refusal, visible as a FAIL>0 counter.
    const badKey = checkById(d, 'bad_key_count');
    expect(badKey.severity).toBe('FAIL');
    const fail = driveCheck('duplicate_key_count', { acquired: { duplicate_key_count: 1 }, config: {} });
    expect(fail[0]![1]!.violations).toBe(1);
    const pass = driveCheck('duplicate_key_count', { acquired: { duplicate_key_count: 0 }, config: {} });
    expect(pass[0]![1]!.violations).toBe(0);
  });
});

describe('row 3.8 — D10 the floor check: B12 (GREEN at ②)', () => {
  it('D10 — boundaries_loaded: rows_shaped 157 vs floor 158 ⇒ violations > 0 and value 157; rows_shaped 158 ⇒ violations 0 (flipped GREEN at ②)', () => {
    const d = loadDescriptor();
    const c = checkById(d, 'boundaries_loaded');
    // legacy L7: `boundaries_loaded >= 158` FAILs at 157, PASSes at 158; the bound is the
    // SHARED registered variable `sources_neighbourhoods_floor`.
    expect(c.limit_from_config).toBe('sources_neighbourhoods_floor');
    expect(c.severity).toBe('FAIL');
    const fail = driveCheck('boundaries_loaded', { acquired: { rows_shaped: 157 }, config: { sources_neighbourhoods_floor: 158 } });
    expect(fail[0]![1]!.violations as number).toBeGreaterThan(0);
    expect(fail[0]![1]!.value).toBe(157);
    const at = driveCheck('boundaries_loaded', { acquired: { rows_shaped: 158 }, config: { sources_neighbourhoods_floor: 158 } });
    expect(at[0]![1]!.violations).toBe(0);
  });
});

describe('row 3.8 — D11 the lock-skip WARN terminal: B15 (GREEN at ②; the legacy path L8 emits nothing)', () => {
  it('D11 — terminals include skip_lock_contention; skipRecordsMeta(d,"advisory_lock_held_elsewhere").audit_table name "Neighbourhood Boundaries", verdict WARN (flipped GREEN at ②; legacy L8 emits no summary at all)', () => {
    const d = loadDescriptor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS runner library
    const stepLib = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js')) as {
      skipRecordsMeta: (dd: unknown, reason: string) => { audit_table: { name: string; verdict: string } };
    };
    const terminals = (d as Record<string, unknown>).terminals as Array<{ kind: string }>;
    expect(terminals.some((t) => t.kind === 'skip_lock_contention')).toBe(true);
    const meta = stepLib.skipRecordsMeta(d, 'advisory_lock_held_elsewhere');
    // legacy L8: a contended lock (57) SKIPS SILENTLY — no summary, no audit row at all. The
    // runner's skip terminal now emits a row-derived WARN, named by identity.display_name.
    expect(meta.audit_table.name).toBe('Neighbourhood Boundaries');
    expect(meta.audit_table.verdict).toBe('WARN');
  });
});

describe('row 3.8 — D12 geom is a guard term (N-D20, WF3 2026-09-28 class lock)', () => {
  it('D12 — the guard compares `neighbourhoods.geom IS DISTINCT FROM EXCLUDED.geom` and .guard_columns carries geom, so a geom-only drift heals on any run (orchestrator ruling; the legacy L3 guard compared name/geometry only)', () => {
    const d = loadDescriptor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write codegen
    const writeLib = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js')) as {
      buildWritePlan: (w: unknown, dd: unknown) => { upsertSqlFor: (n: number) => string; guard_columns: string[] };
    };
    const plan = writeLib.buildWritePlan(writes(d)[0], d);
    // N-D20: `geom` is a step-written wkb_geometry column (D8) and, per the WF3
    // 2026-09-28 geometry-guard-coverage class lock, a DERIVED geometry column must be a
    // guard term — else a display/derivation drift is invisible to the write guard and never
    // re-derives (parcels D2 / address_points / load_ravines precedent).
    expect(plan.guard_columns, 'guard_columns must carry geom').toContain('geom');
    const sql = plan.upsertSqlFor(1);
    // legacy L3/L4: the boundary guard is `WHERE neighbourhoods.name IS DISTINCT FROM
    // EXCLUDED.name OR neighbourhoods.geometry IS DISTINCT FROM ...` (:152-156) — it compares
    // name and geometry jsonb but NEVER geom, so a geom-only drift never healed.
    expect(sql).toContain(`${WRITE_TABLE}.geom IS DISTINCT FROM EXCLUDED.geom`);
    const deviations = (d as Record<string, unknown>).deviations as Array<{ from: string }>;
    expect(
      deviations.some((x) => x.from.startsWith('N-D20')),
      'the descriptor must carry the N-D20 deviation',
    ).toBe(true);
  });
});

// ===========================================================================
// The commit-① report itself — plain `it`: GREEN today (part A1 landed it).
// ===========================================================================

describe('row 3.8 — the commit-① assessment report (plain `it`: GREEN today)', () => {
  it('the report states the compressed-form marker line (R-PACE-1)', () => {
    const report = readText(REPORT_REL);
    expect(report).toContain('**Commit form: compressed (R-PACE-1)**');
  });
});
