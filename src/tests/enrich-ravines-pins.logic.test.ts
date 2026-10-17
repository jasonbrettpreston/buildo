// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ G1/G9/G12, Rule 10
//
// S1-P-6 — the SIX producer-contract HALTs in scripts/lib/compute/enrich-ravines.js#readRavineContract
// become DECLARED `staleness.pins[]` rows on this step's own descriptor, evaluated by the runner
// (scripts/lib/step/index.js#measureProducerPins) BEFORE any phase or compute. This file is the
// executable lock for that fold:
//   * G1  — no `pipeline_runs` SQL, no `pinnedEquals`, no `require(<own descriptor>)` in the compute.
//   * G12 — the descriptor require is gone; every expectation is descriptor data (Rule 1).
//   * G9  — the `MAX_INVALID_GEOM_RATIO = 0.05` function-scope literal is gone: the ratio is a
//           `bound` pin over two producer stamps with its limit resolved from the declared logic
//           variable `enrich_ravines_producer_invalid_geom_max_pct` (Rule 3 — a tunable is never
//           a literal).
//   * Rule 10 — a producer-contract violation is a DECLARED FAIL row, never a compute throw.
//
// The hook now reads its producer through `ctx.producer(PRODUCER_STEP)` — the SAME read identity the
// runner's pins use (default baseline statuses, `completed_at DESC, id DESC`), so there is exactly ONE
// run-history read shape in the step. Case (l) locks that identity at the SQL-params level.
//
// The test loads the REAL descriptor (fs + JSON.parse) so a pin that exists only in prose cannot
// pass: the hook's reads and the declared pins are locked against the SAME artifact the runner
// evaluates. The own-table SRID guard is no longer a compute throw (CP-S5: the runner srid requirement; case (o)).

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const compute = require('../../scripts/lib/compute/enrich-ravines.js');
const { evaluatePins, makeProducer } = require('../../scripts/lib/step/producer.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROOT = path.resolve(__dirname, '../..');
const DESCRIPTOR_PATH = path.join(ROOT, 'scripts', 'enrich-ravines.descriptor.json');
const COMPUTE_PATH = path.join(ROOT, 'scripts', 'lib', 'compute', 'enrich-ravines.js');

const DESCRIPTOR = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));
const SRC = fs.readFileSync(COMPUTE_PATH, 'utf8');

const PINS = DESCRIPTOR.staleness.pins as Array<{
  step: string;
  stamp: string;
  equals?: string;
  op?: string;
  bound?: string;
  of?: string;
  limit_from_config?: string;
  why?: { text?: string; liveness?: { kind?: string; ref?: string } };
}>;
const EVALUATED = PINS.filter((p) => p.op !== undefined || p.equals !== undefined || p.bound !== undefined);

/**
 * The GOOD producer contract, the shape `load_ravines` writes (scripts/lib/compute/load-ravines.js
 * buildLoadMeta: `delete_skipped_empty_guard` / `drift_check_passed` / `mass_delete_check_passed` are
 * ALWAYS written). Every mutation case below flips EXACTLY one field of this object.
 */
const GOOD_RL = {
  spec_version: '1.2',
  source_dataset_version: 'rv1',
  delete_skipped_empty_guard: false,
  drift_check_passed: true,
  mass_delete_check_passed: true,
  feature_count: 854,
  invalid_geometry_skipped: 0,
};

const CONFIG = { enrich_ravines_producer_invalid_geom_max_pct: 5 };

/** A `producer()` result (reason FOUND) for one `ravine_load` records_meta object. */
const found = (rl: Record<string, unknown>) => ({
  load_ravines: { reason: 'FOUND', sid: 1, status: 'completed', completed_at: 't', records_meta: { ravine_load: rl } },
});

/** Every row the real descriptor's pins produce for one records_meta / config. */
const rowsFor = (rl: Record<string, unknown>, config?: Record<string, unknown>) => evaluatePins(PINS, found(rl), config ?? CONFIG);
const failsFor = (rl: Record<string, unknown>, config?: Record<string, unknown>) =>
  rowsFor(rl, config).filter((r: { status: string }) => r.status === 'FAIL');

/** A deep clone of GOOD_RL so a per-case mutation cannot leak into the next case. */
const goodClone = (): Record<string, unknown> => JSON.parse(JSON.stringify(GOOD_RL));

// ---------------------------------------------------------------------------
// A. The six declared pins — the real descriptor, the real evaluator
// ---------------------------------------------------------------------------

describe('enrich_ravines — the six producer-contract HALTs are declared staleness.pins[] rows (S1-P-6)', () => {
  it('(a) declares six evaluated pins on load_ravines, each with a live `why` — no un-losable expectation', () => {
    expect(EVALUATED).toHaveLength(6);
    for (const pin of EVALUATED) {
      expect(pin.step).toBe('load_ravines');
      expect(pin.why?.liveness?.kind).toBe('file');
      expect(pin.why?.liveness?.ref).toBe('scripts/lib/compute/enrich-ravines.js');
      // The former-throw provenance is stated on the four pins appended by S1-P-6, and the two
      // pre-existing pins must still carry a non-empty why of their own.
      expect(String(pin.why?.text ?? '')).not.toBe('');
    }
    // The invalid-geometry ratio is a BOUND pin: two stamps, a resolved limit, NO op and NO equals.
    const ratio = EVALUATED.find((p) => p.stamp.endsWith('invalid_geometry_skipped'));
    expect(ratio).toMatchObject({
      of: 'records_meta.ravine_load.feature_count',
      bound: 'pct <= 5',
      limit_from_config: 'enrich_ravines_producer_invalid_geom_max_pct',
    });
    expect(ratio?.op).toBeUndefined();
    expect(ratio?.equals).toBeUndefined();
  });

  it('(b) the GOOD producer contract PASSes every pin: 6 rows, 0 FAIL', () => {
    const rows = rowsFor(GOOD_RL);
    expect(rows).toHaveLength(6);
    expect(rows.filter((r: { status: string }) => r.status === 'FAIL')).toHaveLength(0);
    expect(rows.every((r: { result: string }) => r.result === 'PASS')).toBe(true);
  });

  it('(c) spec_version 1.1 -> EXACTLY one FAIL row, the spec_version pin', () => {
    const meta = goodClone();
    meta.spec_version = '1.1';
    const f = failsFor(meta);
    expect(f).toHaveLength(1);
    expect(f[0].pin_id).toBe('load_ravines.records_meta.ravine_load.spec_version');
  });

  it('(d) delete_skipped_empty_guard true -> EXACTLY one FAIL row (no in-array value is a second source)', () => {
    const meta = goodClone();
    meta.delete_skipped_empty_guard = true;
    const f = failsFor(meta);
    expect(f).toHaveLength(1);
    expect(f[0].pin_id).toBe('load_ravines.records_meta.ravine_load.delete_skipped_empty_guard');
  });

  it('(e) drift_check_passed false -> EXACTLY one FAIL row', () => {
    const meta = goodClone();
    meta.drift_check_passed = false;
    const f = failsFor(meta);
    expect(f).toHaveLength(1);
    expect(f[0].pin_id).toBe('load_ravines.records_meta.ravine_load.drift_check_passed');
  });

  it('(f) mass_delete_check_passed false -> EXACTLY one FAIL row', () => {
    const meta = goodClone();
    meta.mass_delete_check_passed = false;
    const f = failsFor(meta);
    expect(f).toHaveLength(1);
    expect(f[0].pin_id).toBe('load_ravines.records_meta.ravine_load.mass_delete_check_passed');
  });

  it('(g) source_dataset_version null -> EXACTLY one FAIL row (the empty-lineage contract)', () => {
    const meta = goodClone();
    meta.source_dataset_version = null;
    const f = failsFor(meta);
    expect(f).toHaveLength(1);
    expect(f[0].pin_id).toBe('load_ravines.records_meta.ravine_load.source_dataset_version');
  });

  it('(h) source_dataset_version "" -> EXACTLY one FAIL row (nonzero rejects the empty string)', () => {
    const meta = goodClone();
    meta.source_dataset_version = '';
    const f = failsFor(meta);
    expect(f).toHaveLength(1);
    expect(f[0].pin_id).toBe('load_ravines.records_meta.ravine_load.source_dataset_version');
  });

  it('(i) no producer run at all (reason MISSING) -> all 6 pins FAIL as MISSING (the old "no successful run" HALT)', () => {
    const rows = evaluatePins(PINS, { load_ravines: { reason: 'MISSING' } }, CONFIG);
    expect(rows).toHaveLength(6);
    const f = rows.filter((r: { status: string }) => r.status === 'FAIL');
    expect(f).toHaveLength(6);
    for (const r of f) expect(r.result).toBe('MISSING');
  });
});

// ---------------------------------------------------------------------------
// B. The invalid-geometry ratio — the ex-`MAX_INVALID_GEOM_RATIO = 0.05` literal
//    is now a declared bound with a tunable limit
// ---------------------------------------------------------------------------

describe('the invalid-geometry ratio is a declared bound, not a 0.05 literal (G9, Rule 1/3)', () => {
  const ratioRow = (rl: Record<string, unknown>, config?: Record<string, unknown>) =>
    rowsFor(rl, config).find((r: { pin_id: string }) => r.pin_id === 'load_ravines.records_meta.ravine_load.invalid_geometry_skipped')!;

  it('exactly 5.0% (5 of 100) PASSes — the legacy `5/100 > 0.05` is false at the boundary', () => {
    const row = ratioRow({ ...goodClone(), feature_count: 100, invalid_geometry_skipped: 5 });
    expect(row.result).toBe('PASS');
    expect(row.observed).toBe(5);
    expect(row.threshold).toBe('pct <= 5');
    expect(row.status).toBe('INFO');
  });

  it('6 of 100 FAILs, and the row NAMES its operands (`6 / ` and `100`) so the violation is readable', () => {
    const row = ratioRow({ ...goodClone(), feature_count: 100, invalid_geometry_skipped: 6 });
    expect(row.result).toBe('FAIL');
    expect(row.status).toBe('FAIL');
    expect(row.observed).toBe(6);
    expect(String(row.note)).toContain('6 / ');
    expect(String(row.note)).toContain('100');
    // ...and exactly this ONE pin fails — the other five still PASS.
    const f = failsFor({ ...goodClone(), feature_count: 100, invalid_geometry_skipped: 6 });
    expect(f).toHaveLength(1);
    expect(f[0].pin_id).toBe('load_ravines.records_meta.ravine_load.invalid_geometry_skipped');
  });

  it('a ZERO feature_count is vacuously within the bound (the legacy `featureCount > 0 &&`)', () => {
    const row = ratioRow({ ...goodClone(), feature_count: 0, invalid_geometry_skipped: 9 });
    expect(row.result).toBe('PASS');
    expect(row.observed).toBe(0);
  });

  it('both ratio stamps ABSENT counts as 0% — the existing fixture shape (no feature_count) still PASSes', () => {
    const meta = goodClone();
    delete meta.feature_count;
    delete meta.invalid_geometry_skipped;
    const row = ratioRow(meta);
    expect(row.result).toBe('PASS');
    expect(row.observed).toBe(0);
    expect(failsFor(meta)).toHaveLength(0);
  });

  it('the limit is TUNABLE: 6 of 100 PASSes when config raises the bound to 10', () => {
    const row = ratioRow(
      { ...goodClone(), feature_count: 100, invalid_geometry_skipped: 6 },
      { enrich_ravines_producer_invalid_geom_max_pct: 10 },
    );
    expect(row.result).toBe('PASS');
    expect(row.threshold).toBe('pct <= 10');
  });

  it('an unresolved logic variable is an ERROR row, never a silent PASS (config {})', () => {
    const row = ratioRow({ ...goodClone(), feature_count: 100, invalid_geometry_skipped: 6 }, {});
    expect(row.result).toBe('ERROR');
    expect(row.status).toBe('FAIL');
  });
});

// ---------------------------------------------------------------------------
// C. The hook reads its producer through ctx.producer (G1/G12)
// ---------------------------------------------------------------------------

/** Records every statement, answering by shape — the honest model of the two reads the hook makes. */
function recordingPool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    // The producer read: the ONE run-history reader (readRunHistory) projects exactly these columns.
    // The warn-skip predicate rides in the same WHERE clause, so the text still carries `pipeline_runs`.
    if (sql.includes('FROM pipeline_runs')) {
      return { rows: [{ id: 5, status: 'completed', records_meta: { ravine_load: GOOD_RL } }] };
    }
    if (sql.includes('COUNT(*)::int AS n FROM ravines')) return { rows: [{ n: 1 }] };
    if (sql.includes('Find_SRID')) return { rows: [{ srid: 4326 }] };
    return { rows: [] };
  };
  return { query, calls };
}

describe('readRavineContract — the producer read IS the library read (G1/G12)', () => {
  it('(j) resolves { sourceDatasetVersion } and issues ONE pipeline_runs read with the descriptor-derived identity', async () => {
    const pool = recordingPool();
    const out = await compute.readRavineContract({
      pool,
      producer: makeProducer({ pool, chains: ['sources'] }),
    });
    expect(out).toEqual({ sourceDatasetVersion: 'rv1' });

    const reads = pool.calls.filter((c) => c.sql.includes('FROM pipeline_runs'));
    expect(reads).toHaveLength(1);
    // The three slug forms, in slugForms order — the SAME identity the runner's pins read.
    expect(reads[0]!.params[0]).toEqual(['sources:load_ravines', 'load_ravines', 'load-ravines']);
    // The closed baseline status set (R-CB) — the same set the runner's pins use.
    expect(reads[0]!.params[1]).toEqual(['completed', 'completed_with_warnings']);
    expect(reads[0]!.sql).toMatch(/ORDER BY completed_at DESC/);
    expect(reads[0]!.sql).toMatch(/id DESC/);
  });

  it('(k) G1/G12/G9 source-scan lock: no ledger SQL, no pin library, no own-descriptor require, no 0.05 literal', () => {
    expect(SRC).not.toMatch(/pipeline_runs|staleness-pins|pinnedEquals|\.descriptor\.json|MAX_INVALID_GEOM_RATIO|0\.05/);
  });

  it('(l) SPEC_VERSION is gone from the compute; PRODUCER_NAME and the hook survive', () => {
    expect(compute.SPEC_VERSION).toBeUndefined();
    expect(compute.PRODUCER_NAME).toBe('sources:load_ravines');
    expect(typeof compute.readRavineContract).toBe('function');
  });

  it('(m) the descriptor declares the ratio tunable and its limitations[] no longer carries RV-L3', () => {
    const names = DESCRIPTOR.config.logic_variables.map((v: { name: string }) => v.name);
    expect(names).toContain('enrich_ravines_producer_invalid_geom_max_pct');
    // Default 5 lives in the seed / migration, NEVER in the descriptor (Rule 3: the descriptor
    // declares the bound and its range; the value is a logic variable).
    const declared = DESCRIPTOR.config.logic_variables.find((v: { name: string }) => v.name === 'enrich_ravines_producer_invalid_geom_max_pct');
    expect(declared).toEqual({ name: 'enrich_ravines_producer_invalid_geom_max_pct', min: 0, max: 100, on_invalid: 'fail' });
    const limitationText = JSON.stringify(DESCRIPTOR.limitations);
    expect(limitationText).not.toContain('RV-L3');
  });

  it('(n) every evaluated pin on this descriptor is keyed to load_ravines (the hook reads what the pins evaluate)', () => {
    for (const pin of EVALUATED) expect(pin.step).toBe('load_ravines');
    expect(PINS.every((p) => p.step === 'load_ravines')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D. The own-table SRID guard — never a producer pin; since CP-S5 (Spec 124 R-CX) it is the
//    declared guards.requires srid row the runner probes before this hook, not a compute throw
// ---------------------------------------------------------------------------

describe('the SRID assertion is not in the compute (own-table guard → the runner srid requirement, CP-S5)', () => {
  it('(o) parcels.geom at 3857 no longer reaches the hook: readRavineContract issues no Find_SRID read and resolves', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('FROM pipeline_runs')) {
          return { rows: [{ id: 5, status: 'completed', records_meta: { ravine_load: GOOD_RL } }] };
        }
        if (sql.includes('Find_SRID')) return { rows: [{ srid: 3857 }] };
        return { rows: [] };
      },
    };
    await expect(
      compute.readRavineContract({ pool, producer: makeProducer({ pool, chains: ['sources'] }) }),
    ).resolves.toBeTruthy();
    expect(calls.some((c) => /Find_SRID/i.test(c.sql))).toBe(false);
  });
});
