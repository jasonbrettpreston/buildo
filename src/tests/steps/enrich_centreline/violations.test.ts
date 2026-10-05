// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.11 (version-skip gate), §9 (centreline_enrich), §11 (the CTE chain + UPDATE guard)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.7 (red-first), §7 (commit ① — PH-7 test design, prove red)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (ENRICHER), §4.1 (step layout), §5.1 (frozen shape)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 3 (tunables), Rule 10 (row-derived verdict), §5 R-BA (gates A-K)
//
// ============================================================================
// Batch-2 row 3.10 — `enrich_centreline`, ENRICHER, class N `set_based_join_update`, COMPRESSED
// (R-PACE-1). Plan of record: `.cursor/batch2_enrich_centreline_active_task.md` (AUTHORIZED
// 2026-09-29, D1 = (a) port the three-mode gate verbatim). Assessment:
// `docs/reports/2026-09-30-batch2-p3-10-enrich-centreline-assessment.md`.
//
// THE RED-FIRST PROOF (Spec 123 §4.7). Two parts:
//   PART A — ORACLE PINS, plain `it`, GREEN from ① and forever. The oracle is
//     `fixtures/legacy-enrich-centreline.js.txt`, a BYTE COPY of the legacy script taken at
//     4a74da2d (sha256 pinned below). It is compiled in place of the live script so it keeps
//     answering after ② turns `scripts/enrich-centreline.js` into a frozen shell. PART A pins
//     today's behaviour, including three WRONG FORMS carried unchanged (EC-D1, EC-D4, EC-D5).
//   PART B — CONVERTED CLAIMS, `it.fails`, RED at ①. Each body first loads the artifact it
//     reads through `artifact()`, which throws `MISSING ARTIFACT <path>` — so the red is the
//     named missing descriptor / compute / seed, never an import crash. ② flips them to `it`.
//   PART C — the registration claim, RED until ③ (`npm run cutover`).
//
// ⛔ TRAP: a byte-equality test that compares the compute's SQL to the LIVE script would pass
// at ② only because both sides changed together (or fail because the live script is a shell).
// The oracle copy is what makes "builder output === legacy SQL" a real both-directions lock.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Module from 'module';
import { witnessGuard } from '../_witness-guard';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
// P1-C4a fixture guard (Fold 7): every statement on a wrapped handle is resolved against this
// step's descriptor. Only the handles that feed the step's REAL compute/library are wrapped —
// the oracle pins (PART A) run the LEGACY copy and are never wrapped.
const guard = witnessGuard('enrich_centreline', __filename);
const STEP_REL = 'scripts/enrich-centreline.js';
const ORACLE_REL = 'src/tests/steps/enrich_centreline/fixtures/legacy-enrich-centreline.js.txt';
const ORACLE_SHA256 = '24131dcf8a217adc168ea3a912b1d8d427b15af6599fc7ca83815bcedd64c4c4';
const DESCRIPTOR_REL = 'scripts/enrich-centreline.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/enrich-centreline.js';
const SEED_REL = 'scripts/seeds/logic_variables.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-09-30-batch2-p3-10-enrich-centreline-assessment.md';

const V = '80496e679ef7a2ae8b2e87eb986142a0';
const V_NEW = '7b86fe74c3fbee4f073e631e3b17dd91';
const RUN_AT = new Date('2026-09-30T12:00:00.000Z');

/** The five columns the UPDATE writes and the guard compares [READ legacy :254-265]. */
const WRITE_COLS = ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'abuts_laneway', 'centreline_dataset_version_when_enriched'];
/** assertPreconditions TARGET_COLS [READ legacy :357] — abuts_laneway absent (EC-D5). */
const PRECONDITION_COLS_4 = ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'centreline_dataset_version_when_enriched'];
/** Plan §5 + Fold "Logic-variable count": 12 compute + 3 runner, defaults byte-equal to the legacy literals —
 *  + 4 at ② for decision D4 (the §7 corner/through share bounds as WARN plausibility[] rows; Rule 3: a bound is a
 *  logic variable, the enrich_heritage plausibility precedent). */
const LOGIC_VAR_DEFAULTS: Record<string, number> = {
  enrich_centreline_unlinked_warn_pct: 10,
  enrich_centreline_unlinked_fail_pct: 40,
  enrich_centreline_name_coverage_warn_min_pct: 90,
  enrich_centreline_intersection_null_warn_pct: 50,
  enrich_centreline_address_null_warn_pct: 10,
  enrich_centreline_proximity_m: 20,
  enrich_centreline_abut_m: 13,
  enrich_centreline_through_opposite_tol_deg: 45,
  enrich_centreline_pair_cap: 20,
  enrich_centreline_parallel_tol_deg: 15,
  enrich_centreline_azimuth_sample_m: 10,
  enrich_centreline_round_scale: 10,
  enrich_centreline_heartbeat_minutes: 5,
  enrich_centreline_lock_timeout_ms: 1800000,
  enrich_centreline_phase_timeout_minutes: 240,
  enrich_centreline_corner_share_plausible_min_pct: 8,
  enrich_centreline_corner_share_plausible_max_pct: 14,
  enrich_centreline_through_share_plausible_min_pct: 0.2,
  enrich_centreline_through_share_plausible_max_pct: 3,
};
/** The legacy full-mode `centreline_enrich` keys [READ legacy :571-588]. */
const FULL_SHAPE_KEYS = [
  'spec_version', 'source_dataset_version', 'mode', 'parcels_updated',
  'parcels_with_zero_centreline_intersections_count', 'parcels_with_zero_centreline_intersections_pct',
  'parcels_is_corner_lot_true_count', 'parcels_is_through_lot_true_count', 'parcels_abuts_laneway_true_count',
  'parcels_primary_frontage_resolved_count', 'parcels_frontage_priority1_name_match_count',
  'parcels_frontage_priority2_addrrange_match_count', 'parcels_frontage_priority3_nearest_segment_count',
  'parcels_truncated_pair_count', 'completed_at',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;
const abs = (rel: string) => path.join(REPO_ROOT, rel);

/** Lazy: a named MISSING ARTIFACT throw, never an import crash (the ① red). */
function artifact(rel: string): string {
  if (!fs.existsSync(abs(rel))) throw new Error(`MISSING ARTIFACT ${rel} — lands at commit ②`);
  return abs(rel);
}
function loadDescriptor(): AnyObj {
  return JSON.parse(fs.readFileSync(artifact(DESCRIPTOR_REL), 'utf8'));
}
function loadCompute(): AnyObj {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(artifact(COMPUTE_REL));
}
/** Defaults from the seed file; a missing seed row is a named ① red. */
function seededConfig(): Record<string, number> {
  const seeds: AnyObj = JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8'));
  const out: Record<string, number> = {};
  for (const name of Object.keys(LOGIC_VAR_DEFAULTS)) {
    if (!seeds[name]) throw new Error(`MISSING ARTIFACT seed row ${name} in ${SEED_REL} — lands at commit ②`);
    out[name] = seeds[name].default;
  }
  return out;
}

/** Compile the oracle copy AS IF it were the live script, so `./lib/pipeline` resolves. */
function loadOracle(): AnyObj {
  const src = fs.readFileSync(abs(ORACLE_REL), 'utf8');
  const filename = abs(STEP_REL);
  const M: AnyObj = Module;
  const m: AnyObj = new M(filename);
  m.filename = filename;
  m.paths = M._nodeModulePaths(path.dirname(filename));
  m._compile(src, filename);
  return m.exports;
}
const oracle: AnyObj = loadOracle();

type Call = { sql: string; params: unknown[] | undefined };
/** A fake pg client/pool: records every query, answers by SQL shape. */
function fakeDb(answer: (sql: string, params?: unknown[]) => AnyObj) {
  const calls: Call[] = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return answer(sql, params);
    },
  };
  return { db, calls };
}
const TALLY_ROW = { intersecting: 5, corner_true: 1, through_true: 1, frontage_resolved: 5, p1: 3, p2: 1, p3: 1, truncated: 0, abuts_laneway_true: 2 };
/** The legacy engine's own statement sequence (scoped or full), from the oracle. */
async function oracleEngineCalls(scoped: boolean): Promise<Call[]> {
  const { db, calls } = fakeDb((sql) => (/^\s*UPDATE parcels/.test(sql) ? { rows: [], rowCount: 3 } : { rows: [TALLY_ROW], rowCount: 0 }));
  await oracle.enrichCentreline(db, { sourceDatasetVersion: V, scoped });
  return calls;
}
/** The legacy reduced-mode summary, captured from the oracle's own emitter. */
function oracleReducedSummary(mode: string, staleCount: number, updated: number): AnyObj {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pipeline: AnyObj = require(abs('scripts/lib/pipeline.js'));
  const origS = pipeline.emitSummary;
  const origM = pipeline.emitMeta;
  let summary: AnyObj = null;
  pipeline.emitSummary = (s: AnyObj) => { summary = s; };
  pipeline.emitMeta = () => {};
  try {
    oracle.emitReducedSummary({ mode, staleCount, updated, sourceDatasetVersion: V, RUN_AT, t0: Date.now() });
  } finally {
    pipeline.emitSummary = origS;
    pipeline.emitMeta = origM;
  }
  return summary;
}

// ============================================================================
// PART A — oracle pins (plain `it`, GREEN at ① and after ②).
// ============================================================================

describe('enrich_centreline — PART A: the legacy oracle (pinned behaviour, green from ①)', () => {
  it('A1 oracle — the fixture is the byte copy of the legacy script at 4a74da2d (sha256 pinned)', () => {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(abs(ORACLE_REL))).digest('hex');
    expect(sha).toBe(ORACLE_SHA256);
  });

  it('A2 oracle — identity: lock 64, producer sources:load_centreline, self sources:enrich_centreline', () => {
    expect(oracle.ADVISORY_LOCK_ID).toBe(64);
    expect(oracle.PRODUCER_NAME).toBe('sources:load_centreline');
    expect(oracle.SELF_NAME).toBe('sources:enrich_centreline');
  });

  it('A3 oracle — readCentrelineContract: four HALTs (no run, spec_version, features_inserted, empty version) + the happy path', async () => {
    const meta = (cl: AnyObj) => ({ rows: [{ records_meta: { centreline_load: cl } }] });
    const run = (answer: AnyObj) => oracle.readCentrelineContract(fakeDb(() => answer).db);
    await expect(run({ rows: [] })).rejects.toThrow(/no successful sources:load_centreline run/);
    await expect(run(meta({ spec_version: '1.0', features_inserted: 5, source_dataset_version: V }))).rejects.toThrow(/spec_version=1\.0 !== 1\.1/);
    await expect(run(meta({ spec_version: '1.1', features_inserted: 0, source_dataset_version: V }))).rejects.toThrow(/features_inserted=0/);
    await expect(run(meta({ spec_version: '1.1', features_inserted: 5, source_dataset_version: '' }))).rejects.toThrow(/source_dataset_version is null\/empty/);
    await expect(run(meta({ spec_version: '1.1', features_inserted: 5, source_dataset_version: V }))).resolves.toEqual({ sourceDatasetVersion: V });
  });

  it('A4 oracle — EC-D10 pinned: the contract reads ONLY the chain-prefixed producer row with status completed', async () => {
    const { db, calls } = fakeDb(() => ({ rows: [{ records_meta: { centreline_load: { spec_version: '1.1', features_inserted: 5, source_dataset_version: V } } }] }));
    await oracle.readCentrelineContract(db);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual(['sources:load_centreline']);
    expect(calls[0]?.sql).toMatch(/pipeline = \$1 AND status = 'completed'/);
    // the bare `load_centreline` ledger name a converted standalone producer run writes is never read
    expect(calls[0]?.sql).not.toMatch(/load_centreline'/);
  });

  it('A5 oracle — decideCentrelineMode: changed or no prior → full; unchanged + stale → incremental; unchanged + 0 → skip', () => {
    expect(oracle.decideCentrelineMode({ lastVersion: V, currentVersion: V_NEW, staleCount: null })).toBe('full');
    expect(oracle.decideCentrelineMode({ lastVersion: null, currentVersion: V, staleCount: null })).toBe('full');
    expect(oracle.decideCentrelineMode({ lastVersion: V, currentVersion: V, staleCount: 24426 })).toBe('incremental');
    expect(oracle.decideCentrelineMode({ lastVersion: V, currentVersion: V, staleCount: 0 })).toBe('skip');
  });

  it('A6 oracle — UPDATE_SQL writes the 5 columns behind a 5-disjunct IS DISTINCT FROM guard (incl. abuts_laneway and the stamp)', () => {
    const sql: string = oracle.UPDATE_SQL;
    for (const col of WRITE_COLS) expect(sql).toMatch(new RegExp(`p\\.${col}\\s+IS DISTINCT FROM`));
    expect((sql.match(/IS DISTINCT FROM/g) || []).length).toBe(5);
    expect(sql).toMatch(/centreline_dataset_version_when_enriched = \$1/);
    expect((sql.match(/\$1/g) || []).length).toBe(2);
  });

  it('A7 oracle — EC-D5 pinned wrong-form: assertPreconditions checks 4 target columns, abuts_laneway absent', async () => {
    let colsAsked: unknown = null;
    const answer = (sql: string, params?: unknown[]) => {
      if (/information_schema\.columns/.test(sql)) {
        colsAsked = params?.[0];
        return { rows: (params?.[0] as string[]).map((c) => ({ column_name: c })) };
      }
      if (/pg_proc/.test(sql)) return { rows: [{ proname: 'normalize_address_number' }, { proname: 'address_match_status' }] };
      return { rows: [{ '?column?': 1 }] };
    };
    await oracle.assertPreconditions(fakeDb(answer).db);
    expect(colsAsked).toEqual(PRECONDITION_COLS_4);
    expect(colsAsked).not.toContain('abuts_laneway');
  });

  it('A8 oracle — EC-D1 pinned wrong-form: a reduced run emits verdict literal PASS, 6 INFO rows, no graded row', () => {
    for (const [mode, stale, upd] of [['skip', 0, 0], ['incremental', 24426, 8366]] as const) {
      const s = oracleReducedSummary(mode, stale, upd);
      const at = s.records_meta.audit_table;
      expect(at.verdict).toBe('PASS');
      expect(at.rows.map((r: AnyObj) => r.metric)).toEqual([
        'enrich_centreline_mode', 'enrich_centreline_skip_reason', 'parcels_recomputed',
        'parcels_enriched_count', 'centreline_source_dataset_version', 'enrich_centreline_duration_ms',
      ]);
      expect(at.rows.every((r: AnyObj) => r.status === 'INFO')).toBe(true);
      expect(s.records_total).toBeNull();
      expect(s.records_new).toBeNull();
      expect(s.records_updated).toBe(upd);
    }
  });

  it('A9 oracle — EC-D4 pinned wrong-form: the UPDATE joins only in-range temp rows; no retraction arm', () => {
    expect(oracle.UPDATE_SQL).toMatch(/FROM tmp_centreline_enrich e\s+WHERE p\.id = e\.parcel_id/);
    expect(oracle.UPDATE_SQL).not.toMatch(/NOT EXISTS|NOT IN/);
    expect(oracle.BUILD_TEMP_SQL).toMatch(/FROM parcel_ids_intersecting pii/);
  });

  it('A10 oracle — BUILD_TEMP_SQL_SCOPED = the full build minus the DROP plus one stale-stamp predicate, exactly one $1 (LC-4)', () => {
    const full: string = oracle.BUILD_TEMP_SQL;
    const scoped: string = oracle.BUILD_TEMP_SQL_SCOPED;
    expect(full).toMatch(/^\nDROP TABLE IF EXISTS tmp_centreline_enrich;\nCREATE TEMP TABLE tmp_centreline_enrich ON COMMIT DROP AS/);
    expect(scoped).not.toMatch(/DROP TABLE/);
    expect((scoped.match(/\$1/g) || []).length).toBe(1);
    expect(scoped).toContain('AND (p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1)  -- WF2 P11-1');
    expect(full).not.toContain('$1');
  });

  it('A11 oracle — the §5 literal inventory sits verbatim in the full build (20 m, cap 20, 13 m ×4, 15°, 10.0 m ×4, 45°)', () => {
    const full: string = oracle.BUILD_TEMP_SQL;
    const count = (s: string) => full.split(s).length - 1;
    expect(count('ST_DWithin(p.geom::geography, c.geom::geography, 20)')).toBe(1);
    expect(count('WHERE rn <= 20')).toBe(1);
    expect(count('c1_dist <= 13 AND c2_dist <= 13')).toBe(2);
    expect(count('cos(radians(15))')).toBe(1);
    expect(count('+ 10.0 / GREATEST(ST_Length(')).toBe(4);
    expect(count('> pi() - radians(45)')).toBe(1);
    expect(fs.readFileSync(abs(ORACLE_REL), 'utf8')).toContain('COUNT(*) FILTER (WHERE seg_count > 20)::int');
  });

  it('A12 oracle — the pct byte form round1(1000·x/t)/10 reproduces run 1477 (14528 of 486530 → 2.9899999999999998)', () => {
    const round1 = (n: number) => Math.round(n * 10) / 10;
    expect(round1((1000 * 14528) / 486530) / 10).toBe(2.9899999999999998);
  });

  it('A13 oracle — gradeDiagnosticRows edges: L21 WARN at 10 / FAIL at 40 (>=); name WARN below 90; node-null and addr-null WARN above 50 / 10', () => {
    const st = (a: AnyObj) => Object.fromEntries(oracle.gradeDiagnosticRows({ zeroPct: 0, invalidGeom: 0, namePct: 100, nodeNullPct: 0, addrNullPct: 0, ...a }).map((r: AnyObj) => [r.metric, r.status]));
    expect(st({ zeroPct: 9.9 }).parcels_with_zero_centreline_intersections_pct).toBe('PASS');
    expect(st({ zeroPct: 10 }).parcels_with_zero_centreline_intersections_pct).toBe('WARN');
    expect(st({ zeroPct: 40 }).parcels_with_zero_centreline_intersections_pct).toBe('FAIL');
    expect(st({ namePct: 90 }).parcels_street_name_normalized_pct).toBe('INFO');
    expect(st({ namePct: 89.9 }).parcels_street_name_normalized_pct).toBe('WARN');
    expect(st({ nodeNullPct: 50 }).centreline_intersection_id_null_pct).toBe('INFO');
    expect(st({ nodeNullPct: 50.1 }).centreline_intersection_id_null_pct).toBe('WARN');
    expect(st({ addrNullPct: 10 }).parcels_address_number_null_pct).toBe('INFO');
    expect(st({ addrNullPct: 10.1 }).parcels_address_number_null_pct).toBe('WARN');
    expect(st({}).parcels_invalid_geom_count).toBe('INFO');
  });
});

// ============================================================================
// PART B — converted claims. RED at ① (`it.fails`: the descriptor / compute / seeds are
// absent, so each body throws MISSING ARTIFACT); ② lands them and flips every one to `it`.
// ============================================================================

describe('enrich_centreline — PART B: the converted step (RED at ①, flips at ②)', () => {
  it('B1 descriptor — identity enrich_centreline, lock 64, ENRICHER, spec_version 1.1, shape enrich, invocation sources (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.identity.name).toBe('enrich_centreline');
    expect(d.identity.lock).toBe(64);
    expect(d.identity.archetype).toBe('ENRICHER');
    expect(d.identity.spec_version).toBe('1.1');
    expect(d.execution.shape).toBe('enrich');
    expect(Object.keys(d.execution.invocation)).toEqual(['sources']);
  });

  it('B2 descriptor — write_discipline class N set_based_join_update, 5 guard columns incl. the stamp, retract none, zero-write rerun (flips at: commit ②)', () => {
    const w = loadDescriptor().outputs.writes[0];
    expect(w.table).toBe('parcels');
    expect(w.write_discipline).toMatchObject({
      class: 'set_based_join_update', guard: 'is_distinct_from', guard_columns: WRITE_COLS,
      idempotent_rerun: 'zero_writes', txn_scope: 'step',
    });
    // ② correction: step.schema.json puts `retract` on the write target, beside write_discipline (definitions.write),
    // not inside it (definitions.writeDiscipline is additionalProperties:false) — the enrich_heritage shape.
    expect(w.retract).toBe('none');
  });

  it('B3 config — the 19 logic variables (15 + the 4 D4 plausibility bounds) are declared on_invalid fail and seeded byte-equal to the legacy literals (flips at: commit ②)', () => {
    const vars = loadDescriptor().config.logic_variables;
    expect(vars.map((v: AnyObj) => v.name).sort()).toEqual(Object.keys(LOGIC_VAR_DEFAULTS).sort());
    for (const v of vars) expect(v.on_invalid, v.name).toBe('fail');
    expect(seededConfig()).toEqual(LOGIC_VAR_DEFAULTS);
  });

  it('B4 compute — at default config the SQL builder is byte-equal to the legacy full / scoped / UPDATE strings, no .replace() surgery (flips at: commit ②)', () => {
    const c = loadCompute();
    const cfg = seededConfig();
    expect(c.buildTempSql({ scoped: false }, cfg)).toBe(oracle.BUILD_TEMP_SQL);
    expect(c.buildTempSql({ scoped: true }, cfg)).toBe(oracle.BUILD_TEMP_SQL_SCOPED);
    expect(c.UPDATE_SQL).toBe(oracle.UPDATE_SQL);
    expect(fs.readFileSync(abs(COMPUTE_REL), 'utf8')).not.toMatch(/\.replace\(\s*['"`]/);
  });

  it('B5 compute — contract_read keeps the four HALTs and returns {sourceDatasetVersion, lastVersion, staleCount, mode}; staleCount only when unchanged (flips at: commit ②)', async () => {
    const c = loadCompute();
    const producer = { records_meta: { centreline_load: { spec_version: '1.1', features_inserted: 5, source_dataset_version: V } } };
    const self = (ver: string) => ({ records_meta: { centreline_enrich: { source_dataset_version: ver } } });
    const db = (selfRow: AnyObj, stale: number) => {
      const fake = fakeDb((sql, params) => {
        if (/COUNT\(\*\)::int AS n FROM parcels/.test(sql)) return { rows: [{ n: stale }] };
        // EC-D10 fixed (R2 = (b)): the producer read binds slugForms('load_centreline', ['sources']).
        const p0 = params?.[0];
        const isProducer = Array.isArray(p0) ? p0.includes('sources:load_centreline') : p0 === 'sources:load_centreline';
        return { rows: isProducer ? [producer] : (selfRow ? [selfRow] : []) };
      });
      return { ...fake, db: guard.wrap(fake.db) };
    };
    const unchanged = db(self(V), 24426);
    await expect(c.readCentrelineContract(unchanged.db)).resolves.toEqual({ sourceDatasetVersion: V, lastVersion: V, staleCount: 24426, mode: 'incremental' });
    expect(unchanged.calls).toHaveLength(3);
    const changed = db(self(V_NEW), 0);
    await expect(c.readCentrelineContract(changed.db)).resolves.toMatchObject({ lastVersion: V_NEW, staleCount: null, mode: 'full' });
    expect(changed.calls).toHaveLength(2);
    await expect(c.readCentrelineContract(fakeDb(() => ({ rows: [] })).db)).rejects.toThrow(/no successful sources:load_centreline run/);
  });

  it('B6 compute — the pass: mode = ctx.full ? full : contract.mode; per-mode statements equal the legacy engine; passRaw carries the four hand-off keys (flips at: commit ②)', async () => {
    const c = loadCompute();
    const cfg = seededConfig();
    const runPass = async (full: boolean, mode: string) => {
      const fake = fakeDb(() => ({ rows: [TALLY_ROW], rowCount: 0 }));
      const db = guard.wrap(fake.db);
      const calls = fake.calls;
      const ju: AnyObj[] = [];
      const passCtx = {
        full, config: cfg, onProgress: () => {},
        contract: { sourceDatasetVersion: V, lastVersion: V, staleCount: 7, mode },
        joinUpdate: async (ref: number, sql: string, params: unknown[]) => { ju.push({ ref, sql, params }); return 3; },
      };
      const raw = await c.runCentrelineJoinPass(db, passCtx);
      return { raw, calls, ju };
    };
    const skip = await runPass(false, 'skip');
    expect(skip.calls).toHaveLength(0);
    expect(skip.ju).toHaveLength(0);
    expect(skip.raw).toMatchObject({ mode: 'skip', lastVersion: V, sourceDatasetVersion: V, staleCount: 7, updated: 0 });
    // ② amendment: the legacy non-empty probe (assertPreconditions, the last statement before the build) runs
    // FIRST, at its legacy position inside the transaction, in full and incremental mode only (skip: none).
    const PROBE = 'SELECT 1 FROM toronto_centreline LIMIT 1';
    expect(fs.readFileSync(abs(ORACLE_REL), 'utf8')).toContain(`(await client.query('${PROBE}')).rows.length === 0`);
    const legacyScoped = await oracleEngineCalls(true);
    const inc = await runPass(false, 'incremental');
    expect(inc.calls.map((q) => q.sql)).toEqual([PROBE, legacyScoped[0]?.sql, legacyScoped[1]?.sql, legacyScoped[3]?.sql]);
    expect(inc.calls[2]?.params).toEqual([V]);
    expect(inc.ju).toEqual([{ ref: 0, sql: oracle.UPDATE_SQL, params: [V] }]);
    expect(inc.raw).toMatchObject({ mode: 'incremental', lastVersion: V, sourceDatasetVersion: V, staleCount: 7, updated: 3 });
    const legacyFull = await oracleEngineCalls(false);
    const forced = await runPass(true, 'skip');
    expect(forced.calls.map((q) => q.sql)).toEqual([PROBE, legacyFull[0]?.sql, legacyFull[2]?.sql]);
    expect(forced.calls[1]?.params ?? []).toEqual([]);
    expect(forced.raw.mode).toBe('full');
  });

  it('B7 compute — post_phase: reduced modes issue no query and keep the legacy reduced centreline_enrich shape; full keeps the 15 full keys (flips at: commit ②)', async () => {
    const c = loadCompute();
    const cfg = seededConfig();
    const legacy = oracleReducedSummary('skip', 0, 0).records_meta.centreline_enrich;
    const reduced = fakeDb(() => { throw new Error('reduced mode must not query'); });
    const passRaw = { centreline_join: { mode: 'skip', lastVersion: V, sourceDatasetVersion: V, staleCount: 0, updated: 0, tally: null } };
    const r = await c.computePostPhase(guard.wrap(reduced.db), { passRaw, full: false, runAt: RUN_AT, config: cfg });
    expect(r.matched.centreline_enrich).toEqual({ ...legacy, completed_at: RUN_AT.toISOString() });
    const row = { geom_total: 486530, invalid_geom: 0, name_pop: 486080, addr_pop: 486530, node_null: 0, total: 47318, n: 486530 };
    const fullRaw = { centreline_join: { mode: 'full', lastVersion: V, sourceDatasetVersion: V, staleCount: null, updated: 3, tally: { ...TALLY_ROW, intersecting: 472002 } } };
    const f = await c.computePostPhase(guard.wrap(fakeDb(() => ({ rows: [row] })).db), { passRaw: fullRaw, full: true, runAt: RUN_AT, config: cfg });
    expect(Object.keys(f.matched.centreline_enrich).sort()).toEqual([...FULL_SHAPE_KEYS].sort());
    expect(f.matched.centreline_enrich.parcels_with_zero_centreline_intersections_pct).toBe(2.9899999999999998);
  });

  it('B8 descriptor — emits centreline_enrich (object, consumer enrich_centreline) + duration_ms + code_version; staleness mode_select none (fold 8 ruling 8)', () => {
    const d = loadDescriptor();
    const byKey = Object.fromEntries(d.emits.map((e: AnyObj) => [e.key, e]));
    expect(Object.keys(byKey).sort()).toEqual(['centreline_enrich', 'code_version', 'duration_ms']);
    expect(byKey.centreline_enrich).toMatchObject({ type: 'object', consumers: ['enrich_centreline'] });
    // mode_select/logic_version "none": registry-truth plan fold 8 ruling 8 (operator 2026-10-03) — no enrich runner branch calls selectMode; trigger is `always`.
    expect(d.staleness).toMatchObject({ mode_select: 'none', logic_version: 'none', fingerprint: 'derived', fingerprint_inputs: [COMPUTE_REL], on_fingerprint_change: 'run' });
  });

  it('B9 descriptor — guards.requires: postgis, 3 GIST indexes, 2 functions, EXACTLY the legacy 4 columns (EC-D5 carried) (flips at: commit ②)', () => {
    const req = loadDescriptor().guards.requires;
    const names = (kind: string) => req.filter((r: AnyObj) => r.kind === kind).map((r: AnyObj) => r.name).sort();
    expect(names('extension')).toEqual(['postgis']);
    expect(names('index')).toEqual(['idx_parcels_geom_gist', 'idx_toronto_centreline_geog_gist', 'idx_toronto_centreline_geom_gist']);
    expect(names('function')).toEqual(['address_match_status', 'normalize_address_number']);
    expect(names('column')).toEqual(PRECONDITION_COLS_4.map((c) => `parcels.${c}`).sort());
  });

  it('B10 descriptor — override force_full ENRICH_CENTRELINE_FORCE_FULL (dry_run/force_run none), recovery force_full_on_next_run, timeouts from config (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.override).toMatchObject({ force_full: 'ENRICH_CENTRELINE_FORCE_FULL', force_run: 'none', dry_run: 'none' });
    expect(d.recovery.interrupted).toBe('force_full_on_next_run');
    expect(d.execution.heartbeat_minutes_from_config).toBe('enrich_centreline_heartbeat_minutes');
    expect(d.execution.lock_timeout_ms_from_config).toBe('enrich_centreline_lock_timeout_ms');
    expect(d.execution.phases.map((p: AnyObj) => [p.name, p.txn, p.timeout_minutes_from_config])).toEqual([['centreline_join', 'shared', 'enrich_centreline_phase_timeout_minutes']]);
  });

  it('B11 frozen shell — scripts/enrich-centreline.js calls pipeline.step and no longer pipeline.run( (flips at: commit ②)', () => {
    artifact(DESCRIPTOR_REL);
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(src).toMatch(/pipeline\.step\(/);
    expect(src).not.toMatch(/pipeline\.run\(/);
  });
});

// ============================================================================
// PART C — registration, RED until ③ (`npm run cutover`).
// ============================================================================
describe('enrich_centreline — PART C: cutover registration (GREEN from ③, 2026-10-04)', () => {
  it('C1 converted.json registers scripts/enrich-centreline.js in converted[] and drops the pending entry (flips at: commit ③)', () => {
    const conv = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8'));
    expect(conv.converted).toContain(STEP_REL);
    expect(conv.pending.map((p: AnyObj) => p.file)).not.toContain(STEP_REL);
  });
});

// ============================================================================
// PART D — the commit-① report itself (plain `it`: GREEN from ①).
// ============================================================================
describe('enrich_centreline — PART D: the ① assessment report', () => {
  it('D1 the assessment report exists and declares the compressed form', () => {
    expect(fs.readFileSync(abs(REPORT_REL), 'utf8')).toContain('**Commit form: compressed (R-PACE-1)**');
  });
});

