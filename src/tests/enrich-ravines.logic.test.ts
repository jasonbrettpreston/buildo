// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §9 (L18 consumer protocol)
//
// Pure / mock-pool unit tests for enrich-ravines.js. Locks the §9 consumer
// read protocol gate decisions (DEC-C), the chain-scoped producer name, the
// completed_at ordering, and the verdict cascade. No real DB.

import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const er = require('../../scripts/enrich-ravines.js');

const GOOD_RL = {
  spec_version: '1.2',
  source_dataset_version: '97b4ac7fb3f9808726a106a4b67083ac',
  delete_skipped_empty_guard: false,
  drift_check_passed: true,
  mass_delete_check_passed: true,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const poolReturning = (rows: any[]) => ({ query: vi.fn().mockResolvedValue({ rows }) });

describe('enrich-ravines — constants', () => {
  it('uses advisory lock 60 (L4b) and the chain-scoped producer name', () => {
    expect(er.ADVISORY_LOCK_ID).toBe(60);
    expect(er.PRODUCER_NAME).toBe('sources:load_ravines'); // NOT the spec's stale 'source-ravines'
  });
  it('ENRICH_SQL uses the index-accelerated LATERAL KNN (materialized centroid) + scopes to geom-bearing parcels', () => {
    expect(er.ENRICH_SQL).toMatch(/pc\.cg <-> r\.geom::geography/); // KNN binds idx_ravines_geog_gist
    expect(er.ENRICH_SQL).toContain('AS MATERIALIZED'); // centroid materialized (perf — not a per-row recompute)
    expect(er.ENRICH_SQL).toMatch(/LEFT JOIN LATERAL/);
    expect(er.ENRICH_SQL).toContain('WHERE p.geom IS NOT NULL');
    expect(er.ENRICH_SQL).toContain('IS DISTINCT FROM');
  });
});

describe('readRavineContract — §9/L18 consumer protocol', () => {
  it('queries the producer by chain-scoped name, completed status, completed_at DESC', async () => {
    const pool = poolReturning([{ records_meta: { ravine_load: GOOD_RL } }]);
    await er.readRavineContract(pool);
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/status = 'completed'/);
    expect(sql).toMatch(/ORDER BY completed_at DESC/);
    expect(params).toEqual(['sources:load_ravines']);
  });

  it('returns the source_dataset_version on a clean producer run', async () => {
    const pool = poolReturning([{ records_meta: { ravine_load: GOOD_RL } }]);
    await expect(er.readRavineContract(pool)).resolves.toEqual({
      sourceDatasetVersion: '97b4ac7fb3f9808726a106a4b67083ac',
    });
  });

  it('HALTs when no successful producer run exists', async () => {
    await expect(er.readRavineContract(poolReturning([]))).rejects.toThrow(/no successful sources:load_ravines run/);
  });

  it('HALTs on spec_version mismatch (frozen contract guard)', async () => {
    const pool = poolReturning([{ records_meta: { ravine_load: { ...GOOD_RL, spec_version: '1.1' } } }]);
    await expect(er.readRavineContract(pool)).rejects.toThrow(/spec_version=1\.1 !== 1\.2/);
  });

  it('HALTs when the producer suppressed its orphan-prune (delete_skipped_empty_guard)', async () => {
    const pool = poolReturning([{ records_meta: { ravine_load: { ...GOOD_RL, delete_skipped_empty_guard: true } } }]);
    await expect(er.readRavineContract(pool)).rejects.toThrow(/delete_skipped_empty_guard=true/);
  });

  it('HALTs on a failed drift / mass-delete check (defense-in-depth)', async () => {
    await expect(er.readRavineContract(poolReturning([{ records_meta: { ravine_load: { ...GOOD_RL, drift_check_passed: false } } }]))).rejects.toThrow(/drift\/mass-delete check failed/);
    await expect(er.readRavineContract(poolReturning([{ records_meta: { ravine_load: { ...GOOD_RL, mass_delete_check_passed: false } } }]))).rejects.toThrow(/drift\/mass-delete check failed/);
  });

  it('HALTs on a null/empty source_dataset_version (no lineage to stamp)', async () => {
    const pool = poolReturning([{ records_meta: { ravine_load: { ...GOOD_RL, source_dataset_version: null } } }]);
    await expect(er.readRavineContract(pool)).rejects.toThrow(/source_dataset_version is null\/empty/);
  });
});

describe('verdictCascade (Spec 47 §8.2, row-derived)', () => {
  it('FAIL dominates WARN dominates PASS', () => {
    expect(er.verdictCascade([{ status: 'INFO' }, { status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
    expect(er.verdictCascade([{ status: 'INFO' }, { status: 'WARN' }])).toBe('WARN');
    expect(er.verdictCascade([{ status: 'PASS' }, { status: 'INFO' }])).toBe('PASS');
  });
});
