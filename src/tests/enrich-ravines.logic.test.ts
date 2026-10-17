// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §9 (L18 consumer protocol)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5 (compute shape)
//
// RE-POINTED at the output-panel O1 fold (batch-2 row 2.1, 2026-09-18, Guardian-blocking):
// this file requires `scripts/enrich-ravines.js` (the frozen shell) and reads legacy exports
// (`ADVISORY_LOCK_ID`, `PRODUCER_NAME`, `ENRICH_SQL`, `readRavineContract`, `verdictCascade`)
// that stopped existing on the shell the moment commit 2b landed the conversion — the file was
// LIVE-RED (10/10, `TypeError: er.readRavineContract is not a function`) and, because it is not
// excluded from `npm run test`, would have reddened the full suite at pre-push. Missed by this
// WF's own search for `enrich-ravines` test files (found `.infra.test.ts` and the two
// `db/*.test.ts` siblings, never grepped for a THIRD `.logic.test.ts` sibling) — filed as its
// own finding below, not swept under the fix.
//
// Pure / mock-pool unit tests for the CONVERTED enrich_ravines step. Locks the §9 consumer read
// protocol gate decisions (DEC-C / F1), the chain-scoped producer name, the completed_at
// ordering, and — since the legacy's hand-rolled `verdictCascade` is RETIRED by Rule 10 (the
// converted step cannot define a verdict at all; PRESERVED as descriptor + runner-owned, the
// exact F3 disposition `assert_parcel_sanity`'s own conversion already established) — a citation
// to the EXISTING generic test that already pins the identical FAIL-dominates-WARN-dominates-PASS
// behaviour against the shared library, in the old-vs-new table below. No real DB.

import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../scripts/lib/compute/enrich-ravines.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeProducer } = require('../../scripts/lib/step/producer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require('../../scripts/enrich-ravines.descriptor.json');

const GOOD_RL = {
  spec_version: '1.2',
  source_dataset_version: '97b4ac7fb3f9808726a106a4b67083ac',
  delete_skipped_empty_guard: false,
  drift_check_passed: true,
  mass_delete_check_passed: true,
};

/**
 * The hook now reads its producer through `ctx.producer(PRODUCER_STEP)` (S1-P-6) — the SAME read
 * identity the runner's declared pins use (`slugForms(slug, ['sources'])`, the closed baseline
 * status set, `completed_at DESC, id DESC`) — so the pipeline_runs read is the LIBRARY's
 * single-sentence `readRunHistory` query, not a hand-rolled SELECT. The pool mock below answers by
 * STATEMENT SHAPE, so the producer read and the SRID read each get the response they ask for
 * instead of being satisfied by a generic empty-object row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeContractPool(producerRows: any[], opts: { srid?: number } = {}) {
  const srid = opts.srid ?? 4326; // correct by default — only a dedicated test wants a mismatch
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    void params; // present only so pool.query.mock.calls[0] types as [string, unknown[]]
    if (/FROM pipeline_runs/.test(sql)) return { rows: producerRows };
    if (/Find_SRID/.test(sql)) return { rows: [{ srid }] };
    throw new Error(`makeContractPool: unexpected SQL: ${sql}`);
  });
  return { query };
}

/** The ctx the runner passes a contract_read hook: the pool AND the shared producer reader. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function contractCtx(pool: any) {
  return { pool, producer: makeProducer({ pool, chains: ['sources'] }) };
}

describe('enrich_ravines — descriptor + compute constants', () => {
  it('descriptor.identity.lock is 60 (L4b) and compute.PRODUCER_NAME is the chain-scoped producer name', () => {
    expect(descriptor.identity.lock).toBe(60);
    expect(compute.PRODUCER_NAME).toBe('sources:load_ravines'); // NOT the spec's stale 'source-ravines'
  });
  it('ENRICH_SQL uses the index-accelerated LATERAL KNN (materialized centroid) + scopes to geom-bearing parcels — PORTED VERBATIM (F5)', () => {
    expect(compute.ENRICH_SQL).toMatch(/pc\.cg <-> r\.geom::geography/); // KNN binds idx_ravines_geog_gist
    expect(compute.ENRICH_SQL).toContain('AS MATERIALIZED'); // centroid materialized (perf — not a per-row recompute)
    expect(compute.ENRICH_SQL).toMatch(/LEFT JOIN LATERAL/);
    expect(compute.ENRICH_SQL).toContain('WHERE p.geom IS NOT NULL');
    expect(compute.ENRICH_SQL).toContain('IS DISTINCT FROM');
  });
});

describe('readRavineContract — §9/L18 consumer protocol through ctx.producer (F1); the SRID guard is the runner srid requirement (F3, CP-S5)', () => {
  it('reads the producer through ctx.producer: slugForms, baseline statuses, completed_at DESC, id DESC', async () => {
    const pool = makeContractPool([{ id: 5, status: 'completed', records_meta: { ravine_load: GOOD_RL } }]);
    await compute.readRavineContract(contractCtx(pool));
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY completed_at DESC/);
    expect(sql).toMatch(/id DESC/);
    // The three slug forms, in slugForms order, and the closed baseline status set (R-CB).
    expect(params[0]).toEqual(['sources:load_ravines', 'load_ravines', 'load-ravines']);
    expect(params[1]).toEqual(['completed', 'completed_with_warnings']);
  });

  it('returns the source_dataset_version on a clean producer run (SRID 4326)', async () => {
    const pool = makeContractPool([{ id: 5, status: 'completed', records_meta: { ravine_load: GOOD_RL } }]);
    await expect(compute.readRavineContract(contractCtx(pool))).resolves.toEqual({
      sourceDatasetVersion: '97b4ac7fb3f9808726a106a4b67083ac',
    });
  });

  // S1-P-6: the producer-protocol HALTs are descriptor pins — see
  // src/tests/enrich-ravines-pins.logic.test.ts. Six `rejects.toThrow` cases lived here (no
  // successful run, spec_version mismatch, delete_skipped_empty_guard, drift/mass-delete, the
  // invalid-geometry ratio, null lineage); all six are now DECLARED `staleness.pins[]` rows the
  // runner evaluates BEFORE this hook (Rule 10), so the coverage moved to the pins file rather
  // than being deleted.

  // ── F2 (L14) — RETARGETED (S4): now a DECLARED runner guard (guards.empty_source), counted
  // before any hook or mode decision. Gemini CRIT-1: must halt even with a clean producer run —
  // a matching version stamp cannot bypass it, because the guard fires first. ──
  it('HALTs when the ravines table is empty, even with an otherwise-clean producer run → stopped by the declared guards.empty_source (runner, before the hook; S4)', async () => {
    const declared = descriptor.guards.empty_source;
    const declaredTables = Array.isArray(declared) ? declared : [declared];
    expect(declaredTables).toContain('ravines');
    // The hook is no longer the L14 owner: an empty table does not make it throw.
    const pool = makeContractPool([{ id: 5, status: 'completed', records_meta: { ravine_load: GOOD_RL } }]);
    await expect(compute.readRavineContract(contractCtx(pool))).resolves.toBeTruthy();
  });

  // ── F3 (SRID) half — RETARGETED (CP-S5, Spec 124 R-CX): the declared guards.requires
  // {kind:"srid", name:"parcels.geom", equals:4326} row, probed by the runner BEFORE this hook
  // (REQUIREMENT_PROBES.srid; the refusal is locked in purity-s5-catalog-srid.logic L1). The
  // hook no longer reads the SRID, so a 3857 answer cannot make it throw. ──
  it('the SRID HALT is the declared srid requirement (runner, before the hook) — the hook issues no Find_SRID read', async () => {
    expect(descriptor.guards.requires.find((r: { kind: string }) => r.kind === 'srid')).toMatchObject({ name: 'parcels.geom', equals: 4326, on_missing: 'fail' });
    const pool = makeContractPool([{ id: 5, status: 'completed', records_meta: { ravine_load: GOOD_RL } }], { srid: 3857 });
    await expect(compute.readRavineContract(contractCtx(pool))).resolves.toBeTruthy();
    expect(pool.query.mock.calls.some((c: unknown[]) => /Find_SRID/i.test(String(c[0])))).toBe(false);
  });
});

describe('verdictCascade — RETIRED by Rule 10, cited not re-implemented', () => {
  it('the converted step defines no second verdict derivation — compute exports no verdictCascade at all', () => {
    expect(compute.verdictCascade).toBeUndefined();
  });
  // The legacy `verdictCascade`'s own behaviour (FAIL dominates WARN dominates PASS) is now
  // OWNED by `scripts/lib/step/verdict.js#deriveVerdict`, the single shared derivation every
  // converted step routes through (Rule 10). That behaviour is ALREADY pinned generically —
  // not re-asserted here, which would just be a second, redundant lock on the same library
  // function every other converted step already shares:
  //   src/tests/step-library.logic.test.ts:149-179 "the verdict is ROW-DERIVED, and all three
  //   values are reachable (§7.1, claim #28)" — PASS/WARN/FAIL cases plus a direct
  //   `verdictLib.deriveVerdict(rows)` call proving the cascade tracks the rows, not a frozen
  //   snapshot (the exact "FAIL dominates WARN dominates PASS" claim this file's own retired
  //   describe block asserted, now proven once for the whole fleet instead of once per step).
  //   src/tests/step-conformance.infra.test.ts "Rule 10 — verdict is row-derived from exactly
  //   one place (checkVerdictSingleSource)" additionally proves NO converted step (enrich_ravines
  //   included, post-cutover) defines an unsanctioned second derivation.
});
