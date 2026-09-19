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
const descriptor = require('../../scripts/enrich-ravines.descriptor.json');

const GOOD_RL = {
  spec_version: '1.2',
  source_dataset_version: '97b4ac7fb3f9808726a106a4b67083ac',
  delete_skipped_empty_guard: false,
  drift_check_passed: true,
  mass_delete_check_passed: true,
};

/**
 * The converted `readRavineContract` (RV-L2) issues up to THREE queries where the legacy issued
 * ONE for the same "clean producer" path: the §9/L18 producer-contract SELECT, then (F2/F3,
 * folded in here since the runner gives a contract_read hook no other pre-transaction seam) the
 * L14 ravines-COUNT and the SRID SELECT. A single `mockResolvedValue` (the legacy tests' own
 * shape) would silently misrespond to query 2/3 and either mask or wrongly trip those two new
 * checks. This mock answers BY STATEMENT SHAPE, so each of the three real queries gets the
 * response it actually asks for, and the two new pre-transaction checks stay genuinely exercised
 * (not accidentally satisfied by a generic empty-object row) rather than papered over.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeContractPool(producerRows: any[], opts: { ravinesCount?: number; srid?: number } = {}) {
  const ravinesCount = opts.ravinesCount ?? 1; // non-empty by default — only the L14 test wants 0
  const srid = opts.srid ?? 4326; // correct by default — only a dedicated test wants a mismatch
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    void params; // present only so pool.query.mock.calls[0] types as [string, unknown[]]
    if (/FROM pipeline_runs/.test(sql)) return { rows: producerRows };
    if (/COUNT\(\*\)::int AS n FROM ravines/.test(sql)) return { rows: [{ n: ravinesCount }] };
    if (/Find_SRID/.test(sql)) return { rows: [{ srid }] };
    throw new Error(`makeContractPool: unexpected SQL: ${sql}`);
  });
  return { query };
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

describe('readRavineContract — §9/L18 consumer protocol (F1), folded with L14/SRID (F2/F3, RV-L2)', () => {
  it('queries the producer by chain-scoped name, completed status, completed_at DESC', async () => {
    const pool = makeContractPool([{ records_meta: { ravine_load: GOOD_RL } }]);
    await compute.readRavineContract(pool);
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/status = 'completed'/);
    expect(sql).toMatch(/ORDER BY completed_at DESC/);
    expect(params).toEqual(['sources:load_ravines']);
  });

  it('returns the source_dataset_version on a clean producer run (ravines non-empty, SRID 4326)', async () => {
    const pool = makeContractPool([{ records_meta: { ravine_load: GOOD_RL } }]);
    await expect(compute.readRavineContract(pool)).resolves.toEqual({
      sourceDatasetVersion: '97b4ac7fb3f9808726a106a4b67083ac',
    });
  });

  it('HALTs when no successful producer run exists', async () => {
    await expect(compute.readRavineContract(makeContractPool([]))).rejects.toThrow(/no successful sources:load_ravines run/);
  });

  it('HALTs on spec_version mismatch (frozen contract guard)', async () => {
    const pool = makeContractPool([{ records_meta: { ravine_load: { ...GOOD_RL, spec_version: '1.1' } } }]);
    await expect(compute.readRavineContract(pool)).rejects.toThrow(/spec_version=1\.1 !== 1\.2/);
  });

  it('HALTs when the producer suppressed its orphan-prune (delete_skipped_empty_guard)', async () => {
    const pool = makeContractPool([{ records_meta: { ravine_load: { ...GOOD_RL, delete_skipped_empty_guard: true } } }]);
    await expect(compute.readRavineContract(pool)).rejects.toThrow(/delete_skipped_empty_guard=true/);
  });

  it('HALTs on a failed drift / mass-delete check (defense-in-depth)', async () => {
    await expect(compute.readRavineContract(makeContractPool([{ records_meta: { ravine_load: { ...GOOD_RL, drift_check_passed: false } } }]))).rejects.toThrow(/drift\/mass-delete check failed/);
    await expect(compute.readRavineContract(makeContractPool([{ records_meta: { ravine_load: { ...GOOD_RL, mass_delete_check_passed: false } } }]))).rejects.toThrow(/drift\/mass-delete check failed/);
  });

  it('HALTs on a null/empty source_dataset_version (no lineage to stamp)', async () => {
    const pool = makeContractPool([{ records_meta: { ravine_load: { ...GOOD_RL, source_dataset_version: null } } }]);
    await expect(compute.readRavineContract(pool)).rejects.toThrow(/source_dataset_version is null\/empty/);
  });

  // ── F2 (L14) — folded into this hook, RV-L2: not a runner-enforced guards.empty_source ──
  it('HALTs when the ravines table is empty, even with an otherwise-clean producer run (L14, Gemini CRIT-1)', async () => {
    const pool = makeContractPool([{ records_meta: { ravine_load: GOOD_RL } }], { ravinesCount: 0 });
    await expect(compute.readRavineContract(pool)).rejects.toThrow(/ravines table is empty/);
  });

  // ── F3 (SRID) half — folded into this hook, RV-L2: not a runner-enforced guards.srid ──
  it('HALTs when parcels.geom SRID is not 4326', async () => {
    const pool = makeContractPool([{ records_meta: { ravine_load: GOOD_RL } }], { srid: 3857 });
    await expect(compute.readRavineContract(pool)).rejects.toThrow(/SRID is 3857, expected 4326/);
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
