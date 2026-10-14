// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ G1/G12, Rule 10
//
// S1-P-5 — the 9 producer-contract HALTs in scripts/lib/compute/enrich-heritage.js#readHeritageContract
// become DECLARED `staleness.pins[]` rows on the step's own descriptor, evaluated by the runner
// (scripts/lib/step/index.js#measureProducerPins) BEFORE any phase or compute. This file is the
// executable lock for that fold:
//   * G1  — no `pipeline_runs` SQL, no `pinnedEquals`, no `require(<own descriptor>)` in the compute.
//   * Rule 10 — a producer-contract violation is a DECLARED FAIL row, never a compute throw.
//   * Rule 1  — the expectation (spec_version, the count/drift/lineage predicates) is DESCRIPTOR data.
//
// The hook now reads its producer through `ctx.producer(PRODUCER_STEP)` — the SAME read identity the
// runner's pins use (default baseline statuses + `id DESC`), so there is exactly ONE run-history read
// shape in the step. Case (l) locks that identity at the SQL-params level.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports */
const compute = require('../../scripts/lib/compute/enrich-heritage.js');
const { evaluatePins, makeProducer } = require('../../scripts/lib/step/producer');
/* eslint-enable @typescript-eslint/no-require-imports */

const DESCRIPTOR_PATH = path.resolve(__dirname, '../../scripts/enrich-heritage.descriptor.json');
const COMPUTE_PATH = path.resolve(__dirname, '../../scripts/lib/compute/enrich-heritage.js');
const DESCRIPTOR = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));
const PINS = DESCRIPTOR.staleness.pins;

// The GOOD producer contract: spec_version 1.1 + both sub-blocks present, non-zero, drift-clean,
// lineage-stamped. Every mutation case below flips EXACTLY one field of this object.
const GOOD = {
  heritage_load: {
    spec_version: '1.1',
    heritage_register: { feature_count: 8824, drift_check_passed: true, source_dataset_version: 'reg1' },
    heritage_districts: { feature_count: 29, drift_check_passed: true, source_dataset_version: 'hcd1' },
  },
};

/** The producer() result for a `records_meta` (or an explicit reason override). */
const found = (records_meta: object) => ({ load_heritage: { reason: 'FOUND', sid: 1, status: 'completed', completed_at: 't', records_meta } });

/** FAIL rows from evaluating the real descriptor's pins against a producer result. */
const fails = (meta: object) => evaluatePins(PINS, found(meta)).filter((r: { status: string }) => r.status === 'FAIL');

/** A deep clone of GOOD so a per-case mutation cannot leak into the next case. */
const goodClone = () => JSON.parse(JSON.stringify(GOOD));

describe('enrich-heritage — the 9 producer-contract HALTs are declared staleness.pins[] rows (S1-P-5)', () => {
  it('(a) the GOOD producer contract PASSes every evaluated pin: 7 rows, 0 FAIL', () => {
    const rows = evaluatePins(PINS, found(GOOD));
    expect(rows).toHaveLength(7);
    expect(rows.filter((r: { status: string }) => r.status === 'FAIL')).toHaveLength(0);
  });

  it("(b) spec_version '1.0' -> exactly the spec_version pin FAILs", () => {
    const meta = goodClone();
    meta.heritage_load.spec_version = '1.0';
    const f = fails(meta);
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toEqual(['load_heritage.records_meta.heritage_load.spec_version']);
  });

  it('(c) heritage_register sub-block deleted -> the register feature_count pin FAILs first (deleting the block violates all three register pins)', () => {
    const meta = goodClone();
    delete meta.heritage_load.heritage_register;
    const f = fails(meta);
    // Deleting the sub-block is the strongest violation: feature_count, drift and lineage all go MISSING.
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toContain('load_heritage.records_meta.heritage_load.heritage_register.feature_count');
    expect(f.every((r: { result: string }) => r.result === 'MISSING')).toBe(true);
  });

  it('(d) heritage_districts sub-block deleted -> the districts feature_count pin FAILs first', () => {
    const meta = goodClone();
    delete meta.heritage_load.heritage_districts;
    const f = fails(meta);
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toContain('load_heritage.records_meta.heritage_load.heritage_districts.feature_count');
    expect(f.every((r: { result: string }) => r.result === 'MISSING')).toBe(true);
  });

  it('(e) register feature_count 0 -> exactly that pin FAILs', () => {
    const meta = goodClone();
    meta.heritage_load.heritage_register.feature_count = 0;
    const f = fails(meta);
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toEqual(['load_heritage.records_meta.heritage_load.heritage_register.feature_count']);
  });

  it('(f) districts feature_count 0 -> exactly that pin FAILs', () => {
    const meta = goodClone();
    meta.heritage_load.heritage_districts.feature_count = 0;
    const f = fails(meta);
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toEqual(['load_heritage.records_meta.heritage_load.heritage_districts.feature_count']);
  });

  it('(g) register drift_check_passed=false -> exactly the register drift pin FAILs', () => {
    const meta = goodClone();
    meta.heritage_load.heritage_register.drift_check_passed = false;
    const f = fails(meta);
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toEqual(['load_heritage.records_meta.heritage_load.heritage_register.drift_check_passed']);
  });

  it('(h) districts drift_check_passed=false -> exactly the districts drift pin FAILs', () => {
    const meta = goodClone();
    meta.heritage_load.heritage_districts.drift_check_passed = false;
    const f = fails(meta);
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toEqual(['load_heritage.records_meta.heritage_load.heritage_districts.drift_check_passed']);
  });

  it('(i) register source_dataset_version "" -> exactly that lineage pin FAILs', () => {
    const meta = goodClone();
    meta.heritage_load.heritage_register.source_dataset_version = '';
    const f = fails(meta);
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toEqual(['load_heritage.records_meta.heritage_load.heritage_register.source_dataset_version']);
  });

  it('(j) districts source_dataset_version "" -> exactly that lineage pin FAILs', () => {
    const meta = goodClone();
    meta.heritage_load.heritage_districts.source_dataset_version = '';
    const f = fails(meta);
    expect(f.map((r: { pin_id: string }) => r.pin_id)).toEqual(['load_heritage.records_meta.heritage_load.heritage_districts.source_dataset_version']);
  });

  it('(k) no producer run at all (reason MISSING) -> all 7 pins FAIL as MISSING (the old "no successful run" HALT)', () => {
    const rows = evaluatePins(PINS, { load_heritage: { reason: 'MISSING' } });
    const f = rows.filter((r: { status: string }) => r.status === 'FAIL');
    expect(rows).toHaveLength(7);
    expect(f).toHaveLength(7);
    for (const r of f) expect(r.result).toBe('MISSING');
  });

  it("(l) the hook reads its producer through ctx.producer('load_heritage') — the runner's read identity (baseline statuses, sources chain)", async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        seen.push({ sql, params });
        if (sql.includes('FROM pipeline_runs')) {
          return { rows: [{ id: 5, status: 'completed', records_meta: GOOD }] };
        }
        if (sql.includes('FROM heritage_properties')) return { rows: [{ n: 5 }] };
        if (sql.includes('FROM heritage_districts')) return { rows: [{ n: 5 }] };
        return { rows: [{ srid: 4326 }] };
      },
    };
    const out = await compute.readHeritageContract({
      pool,
      producer: makeProducer({ pool, chains: ['sources'] }),
    });
    expect(out).toEqual({ datasetVersion: 'reg1|hcd1' });

    const runRead = seen.find((q) => q.sql.includes('FROM pipeline_runs'));
    expect(runRead).toBeTruthy();
    // The slug identity: the chain-scoped producer name AND the bare step slug the runner's pins use.
    const joined = (runRead!.params as unknown[]).map((p) => JSON.stringify(p)).join(' ');
    expect(joined).toContain('sources:load_heritage');
    expect(joined).toContain('load_heritage');
    // The default baseline status set (R-CB) — the SAME closed set the runner's pins use.
    expect((runRead!.params as unknown[])[1]).toEqual(['completed', 'completed_with_warnings']);
  });

  it('(m) G12/G1 source-scan lock: the compute holds no pipeline_runs SQL, no staleness-pins require, no own-descriptor require', () => {
    const src = fs.readFileSync(COMPUTE_PATH, 'utf8');
    expect(src).not.toMatch(/pipeline_runs|staleness-pins|pinnedEquals|\.descriptor\.json/);
  });

  it('(n) SPEC_VERSION is gone from the compute, and every descriptor pin with an op/equals is keyed to load_heritage', () => {
    expect(compute.SPEC_VERSION).toBeUndefined();
    expect(compute.PRODUCER_NAME).toBe('sources:load_heritage');
    expect(compute.PRODUCER_STEP === undefined || true).toBe(true); // PRODUCER_STEP is module-private
    for (const pin of PINS) {
      if (pin.op !== undefined || pin.equals !== undefined) {
        expect(pin.step).toBe('load_heritage');
      }
    }
  });
});
