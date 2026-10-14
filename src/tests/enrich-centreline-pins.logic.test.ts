// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ G1/G12, Rule 10
//
// S1-P-7 — enrich_centreline's producer contract is now DECLARED, not thrown:
//
//   * the descriptor's `staleness.pins[]` carries THREE evaluated pins on
//     `load_centreline` (spec_version / features_inserted / source_dataset_version)
//     and the runner's `measureProducerPins` FAILs the run before any phase when one
//     does not hold — the four legacy `readCentrelineContract` throws are gone;
//   * BOTH ledger reads (the #9a self baseline and the #9b producer read) go through
//     `ctx.producer`, i.e. the ONE `readRunHistory` reader — so the slug forms
//     (`slugForms(name, ['sources'])`), the two success statuses, the shared
//     warn-skip predicate and the `completed_at DESC, id DESC` order come from the
//     library, and the compute file contains NO ledger SQL at all.
//
// The test loads the REAL descriptor (fs + JSON.parse) so a pin that exists only in
// prose cannot pass: the hook's reads and the declared pins are locked against the
// same artifact the runner evaluates.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const compute = require('../../scripts/lib/compute/enrich-centreline.js');
const { makeProducer, evaluatePins } = require('../../scripts/lib/step/producer.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROOT = path.resolve(__dirname, '../..');
const DESCRIPTOR_PATH = path.join(ROOT, 'scripts/enrich-centreline.descriptor.json');
const COMPUTE_PATH = path.join(ROOT, 'scripts/lib/compute/enrich-centreline.js');

const DESCRIPTOR = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));
const SRC = fs.readFileSync(COMPUTE_PATH, 'utf8');

const PINS = DESCRIPTOR.staleness.pins as Pin[];
const EVALUATED = PINS.filter((p) => p.op !== undefined || p.equals !== undefined);

type Pin = { step: string; stamp: string; equals?: string; op?: string };
type LedgerRow = { id: number; pipeline: string; status: string; completed_at: string; records_meta: object | null };

const readCentrelineContract = compute.readCentrelineContract as (ctx: ContractCtx) => Promise<{
  sourceDatasetVersion: string;
  lastVersion: string | null;
  staleCount: number | null;
  mode: string;
  specVersion: string;
}>;
const readLastEnrichedVersion = compute.readLastEnrichedVersion as (ctx: { producer: (...args: never[]) => unknown }) => Promise<string | null>;

type ContractCtx = {
  pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: LedgerRow[] }> };
  producer: (slug: string, opts?: Record<string, unknown>) => Promise<object>;
};

const GOOD_META = { centreline_load: { spec_version: '1.1', features_inserted: 5, source_dataset_version: 'v1' } };

/** A producer result shaped exactly like `makeProducer`'s return (the runner's contract). */
const found = (records_meta: object) => ({
  slug: 'load_centreline',
  forms: ['sources:load_centreline', 'load_centreline', 'load-centreline'],
  reason: 'FOUND' as const,
  sid: 812,
  status: 'completed',
  started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:01:00Z',
  records_meta,
  rows: [],
});

// ---------------------------------------------------------------------------
// A. The DECLARED pins — the real descriptor, the real evaluator
// ---------------------------------------------------------------------------

describe('enrich-centreline descriptor pins — the former HALTs are declared FAIL rows', () => {
  it('declares THREE evaluated pins, all on load_centreline (S1-P-7 Append)', () => {
    expect(EVALUATED).toHaveLength(3);
    for (const pin of EVALUATED) expect(pin.step).toBe('load_centreline');
    expect(EVALUATED.map((p) => p.stamp).sort()).toEqual([
      'records_meta.centreline_load.features_inserted',
      'records_meta.centreline_load.source_dataset_version',
      'records_meta.centreline_load.spec_version',
    ]);
    // spec_version keeps the L10 equality pin; the other two are the closed `nonzero` op.
    expect(EVALUATED.find((p) => p.stamp.endsWith('spec_version'))).toMatchObject({ equals: '1.1' });
    expect(EVALUATED.filter((p) => p.op === 'nonzero').map((p) => p.stamp).sort()).toEqual([
      'records_meta.centreline_load.features_inserted',
      'records_meta.centreline_load.source_dataset_version',
    ]);
    // liveness on every pin — a declared pin with no liveness is a dead assertion.
    for (const pin of PINS) {
      expect((pin as { why?: { liveness?: { kind?: string; ref?: string } } }).why?.liveness?.kind).toBe('file');
      expect((pin as { why?: { liveness?: { ref?: string } } }).why?.liveness?.ref).toBe('scripts/lib/compute/enrich-centreline.js');
    }
  });

  it('a good producer meta passes all three pins (0 FAIL rows)', () => {
    const rows = evaluatePins(PINS, { load_centreline: found(GOOD_META) });
    expect(rows).toHaveLength(3);
    expect(rows.filter((r: { status: string }) => r.status === 'FAIL')).toEqual([]);
    expect(rows.every((r: { result: string }) => r.result === 'PASS')).toBe(true);
  });

  it.each([
    ['spec_version', { centreline_load: { spec_version: '1.0', features_inserted: 5, source_dataset_version: 'v1' } }, 'load_centreline.records_meta.centreline_load.spec_version'],
    ['features_inserted 0', { centreline_load: { spec_version: '1.1', features_inserted: 0, source_dataset_version: 'v1' } }, 'load_centreline.records_meta.centreline_load.features_inserted'],
    ['source_dataset_version null', { centreline_load: { spec_version: '1.1', features_inserted: 5, source_dataset_version: null } }, 'load_centreline.records_meta.centreline_load.source_dataset_version'],
    ['source_dataset_version empty', { centreline_load: { spec_version: '1.1', features_inserted: 5, source_dataset_version: '' } }, 'load_centreline.records_meta.centreline_load.source_dataset_version'],
  ])('one mutation — %s — yields EXACTLY one FAIL row', (_label, meta, pinId) => {
    const rows = evaluatePins(PINS, { load_centreline: found(meta) });
    const failed = rows.filter((r: { status: string }) => r.status === 'FAIL');
    expect(failed).toHaveLength(1);
    expect(failed[0].pin_id).toBe(pinId);
  });

  it('NO producer run at all: all three pins MISSING/FAIL — the old "no successful run" HALT', () => {
    const rows = evaluatePins(PINS, { load_centreline: { reason: 'MISSING', sid: null, status: null, completed_at: null, records_meta: null } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r: { result: string }) => r.result === 'MISSING')).toBe(true);
    expect(rows.every((r: { status: string }) => r.status === 'FAIL')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. The reads — both through ctx.producer, whose chains come from the descriptor
// ---------------------------------------------------------------------------

/** A producer whose reads land on `pool` with the descriptor's `sources` chain. */
const makeProducerFor = (pool: QueryRecorder) => makeProducer({ pool, chains: ['sources'] }) as ContractCtx['producer'];

class QueryRecorder {
  calls: { sql: string; params: unknown[] }[] = [];

  constructor(private readonly handler: (sql: string, params: unknown[]) => Array<Record<string, unknown>> = () => []) {}

  async query(sql: string, params: unknown[]): Promise<{ rows: LedgerRow[] }> {
    this.calls.push({ sql, params });
    return { rows: this.handler(sql, params) as unknown as LedgerRow[] };
  }
}

/** The hook's pool: `pipeline_runs` reads answered from the recorded params, `parcels` → 0 stale. */
function contractPool(): QueryRecorder {
  return new QueryRecorder((sql, params) => {
    if (sql.includes('pipeline_runs')) {
      const forms = (params[0] as string[]) || [];
      if (JSON.stringify(params[0]).includes('load_centreline')) {
        return [{ id: 900, pipeline: forms[0], status: 'completed', completed_at: '2026-01-01T00:02:00Z', records_meta: GOOD_META }];
      }
      return [{ id: 901, pipeline: forms[0], status: 'completed', completed_at: '2026-01-01T00:01:00Z', records_meta: { centreline_enrich: { source_dataset_version: 'v1' } } }];
    }
    if (sql.includes('FROM parcels')) {
      return [{ n: 0, id: 1, pipeline: 'parcels', status: 'completed', completed_at: '2026-01-01T00:00:00Z', records_meta: null }];
    }
    return [];
  });
}

const ledgerReads = (pool: QueryRecorder) => pool.calls.filter((c) => c.sql.includes('pipeline_runs'));

describe('readCentrelineContract — the producer read is the library read (G1/G12)', () => {
  it('resolves the five-key contract: the producer read + the self baseline read', async () => {
    const pool = contractPool();
    const contract = await readCentrelineContract({ pool, producer: makeProducerFor(pool) });
    expect(contract).toMatchObject({ sourceDatasetVersion: 'v1', lastVersion: 'v1', staleCount: 0, mode: 'skip', specVersion: '1.1' });
  });

  it('issues exactly TWO pipeline_runs reads, each with the descriptor-derived forms/statuses/order', async () => {
    const pool = contractPool();
    await readCentrelineContract({ pool, producer: makeProducerFor(pool) });

    const reads = ledgerReads(pool);
    expect(reads).toHaveLength(2);

    // Read 1 — the producer (#9b): the three slug forms in slugForms order.
    expect(reads[0]!.params[0]).toEqual(['sources:load_centreline', 'load_centreline', 'load-centreline']);
    expect(reads[0]!.params[1]).toEqual(['completed', 'completed_with_warnings']);
    expect(reads[0]!.sql).toMatch(/id DESC/);
    expect(reads[0]!.sql).toMatch(/ORDER BY completed_at DESC/);

    // Read 2 — the self baseline (#9a).
    expect(reads[1]!.params[0]).toEqual(['sources:enrich_centreline', 'enrich_centreline', 'enrich-centreline']);
    expect(reads[1]!.params[1]).toEqual(['completed', 'completed_with_warnings']);
    expect(reads[1]!.sql).toMatch(/id DESC/);
    expect(reads[1]!.sql).toMatch(/ORDER BY completed_at DESC/);
  });

  it('threads the producer OBSERVED spec_version (not a hard-coded constant) onto the contract', async () => {
    const pool = contractPool();
    const contract = await readCentrelineContract({ pool, producer: makeProducerFor(pool) });
    expect(contract.specVersion).toBe('1.1');
    // and the module no longer exports the constant it replaced.
    expect(compute.SPEC_VERSION).toBeUndefined();
  });
});

describe('readLastEnrichedVersion — ctx.producer, fail-closed on ERROR (never a contract HALT)', () => {
  it('MISSING producer → null (no prior run)', async () => {
    const producer = async () => ({ reason: 'MISSING', sid: null, status: null, completed_at: null, records_meta: null, rows: [] });
    await expect(readLastEnrichedVersion({ producer })).resolves.toBeNull();
  });

  it('FOUND → the records_meta stamp', async () => {
    const producer = async () => ({ reason: 'FOUND', sid: 1, status: 'completed', completed_at: null, records_meta: { centreline_enrich: { source_dataset_version: 'v2' } }, rows: [] });
    await expect(readLastEnrichedVersion({ producer })).resolves.toBe('v2');
  });

  it('FOUND without the stamp falls back to the pre-P11 audit row', async () => {
    const producer = async () => ({
      reason: 'FOUND',
      sid: 1,
      status: 'completed',
      completed_at: null,
      records_meta: { audit_table: { rows: [{ metric: 'centreline_source_dataset_version', value: 'vA' }] } },
      rows: [],
    });
    await expect(readLastEnrichedVersion({ producer })).resolves.toBe('vA');
  });

  it('ERROR → rejects fail-closed (the old pool.query rejection posture)', async () => {
    /* library-faithful: onError:"throw" rethrows an ERROR result (producer.js) */
    const producer = async (_s: string, o: Record<string, unknown> = {}) => { if (o.onError === 'throw') throw new Error('boom'); return { reason: 'ERROR', error: 'boom', sid: null, status: null, completed_at: null, records_meta: null, rows: [] }; };
    await expect(readLastEnrichedVersion({ producer })).rejects.toThrow(/boom/);
  });
});

// ---------------------------------------------------------------------------
// C. Purity locks — Rule 10 / Rule 2: no ledger SQL, no descriptor require
// ---------------------------------------------------------------------------

describe('enrich-centreline.js purity locks (S1-P-7)', () => {
  it('carries no ledger SQL, no pin library and no descriptor require', () => {
    expect(SRC).not.toMatch(/pipeline_runs|staleness-pins|pinnedEquals|\.descriptor\.json/);
  });

  it('no longer exports the pin plumbing constants', () => {
    expect(compute.SPEC_VERSION).toBeUndefined();
    expect(compute.PRODUCER_FORMS).toBeUndefined();
    expect(compute.SELF_FORMS).toBeUndefined();
  });

  it('keeps PRODUCER_NAME and both readers exported', () => {
    expect(compute.PRODUCER_NAME).toBe('sources:load_centreline');
    expect(typeof compute.readLastEnrichedVersion).toBe('function');
    expect(typeof compute.readCentrelineContract).toBe('function');
  });

  it('every evaluated descriptor pin is a load_centreline pin', () => {
    for (const pin of EVALUATED) expect(pin.step).toBe('load_centreline');
  });
});
