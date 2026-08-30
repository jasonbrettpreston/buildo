// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 13, R-T addendum, commit 5)
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md
//
// scripts/lib/step/seam.js — the seam-validation pass. Derives every "live"
// seam (both endpoints converted, real descriptor) from converted.json +
// manifest.json (Fold A-5's correction: the edge is `inputs.reads.steps`,
// not `outputs.invalidates`, which is table/column-shaped). Joins PRIMARILY
// on `records_meta.chain_run_id` (R-U, Fold B-5), falls back for legacy rows
// to the RUN-level `pipeline`/`started_at`/`completed_at` comparison
// (Fold A-5 — real column names, not `slug`/`run_at`).

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const seam = require('../../scripts/lib/step/seam.js') as {
  loadConvertedDescriptors: () => Record<string, { descriptor: Record<string, unknown>; slug: string; relFile: string }>;
  deriveSeamPairs: (byName?: Record<string, { descriptor: Record<string, unknown> }>) => Array<{ upstream: string; downstream: string }>;
  checkSeam: (
    pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
    opts: { upstream: string; downstream: string; chainId?: string },
  ) => Promise<{ metric: string; value: unknown; threshold: string; status: string; source: string; why?: string }>;
  runSeamChecks: (
    pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
    opts?: { chainId?: string; descriptorsByName?: Record<string, { descriptor: Record<string, unknown> }> },
  ) => Promise<Array<{ metric: string; status: string }>>;
};

/** A minimal fake pool: `rowsFor(text)` decides what a query returns, based on substring match. */
function fakeSeamPool(rowsForPrimary: Array<Record<string, unknown>>, rowsForFallback: Array<Record<string, unknown>>) {
  return {
    query: async (text: string) => {
      if (text.includes("records_meta ? 'chain_run_id'")) return { rows: rowsForPrimary };
      return { rows: rowsForFallback };
    },
  };
}

describe('deriveSeamPairs — derived from converted.json + manifest.json, never hand-maintained', () => {
  it('a downstream descriptor reading an upstream step NOT in the registry yields no pair for that read', () => {
    const byName = {
      link_massing: {
        descriptor: { inputs: { reads: { steps: [{ step: 'massing' }, { step: 'compute_centroids' }] } } },
      },
      compute_centroids: { descriptor: { inputs: { reads: { steps: [] } } } },
    };
    expect(seam.deriveSeamPairs(byName)).toEqual([{ upstream: 'compute_centroids', downstream: 'link_massing' }]);
  });

  it('a descriptor with no inputs.reads.steps (e.g. load_ravines, assert_schema) contributes zero pairs, not a throw', () => {
    const byName = {
      load_ravines: { descriptor: { inputs: { reads: { steps: [] } } } },
      assert_schema: { descriptor: { inputs: {} } },
    };
    expect(seam.deriveSeamPairs(byName)).toEqual([]);
  });

  it('the REAL 6-descriptor registry yields exactly the one live pair this commit builds for: compute_centroids -> link_massing', () => {
    const byName = seam.loadConvertedDescriptors();
    expect(Object.keys(byName).sort()).toEqual(
      ['assert_schema', 'compute_centroids', 'link_massing', 'link_parcel_addresses', 'link_wsib', 'load_ravines'].sort(),
    );
    expect(seam.deriveSeamPairs(byName)).toEqual([{ upstream: 'compute_centroids', downstream: 'link_massing' }]);
  });
});

describe('checkSeam — chain_run_id join (primary, R-U/Fold B-5)', () => {
  it('GREEN — downstream started_at >= upstream completed_at, same chain_run_id: PASS', async () => {
    const pool = fakeSeamPool(
      [
        { pipeline: 'sources:compute_centroids', id: 1, started_at: '2026-08-30T10:00:00Z', completed_at: '2026-08-30T10:00:05Z', meta_chain_run_id: '999' },
        { pipeline: 'sources:link_massing', id: 2, started_at: '2026-08-30T10:00:06Z', completed_at: '2026-08-30T10:15:00Z', meta_chain_run_id: '999' },
      ],
      [],
    );
    const row = await seam.checkSeam(pool, { upstream: 'compute_centroids', downstream: 'link_massing', chainId: 'sources' });
    expect(row.status).toBe('PASS');
    expect(row.source).toBe('seam');
    expect((row.value as Record<string, unknown>).join).toBe('chain_run_id');
    expect((row.value as Record<string, unknown>).join_value).toBe('999');
  });

  it('RED — a stale compute_centroids write (link_massing started BEFORE compute_centroids finished, same chain_run_id): FAIL', async () => {
    const pool = fakeSeamPool(
      [
        { pipeline: 'sources:compute_centroids', id: 1, started_at: '2026-08-30T10:00:00Z', completed_at: '2026-08-30T10:20:00Z', meta_chain_run_id: '999' },
        { pipeline: 'sources:link_massing', id: 2, started_at: '2026-08-30T10:00:06Z', completed_at: '2026-08-30T10:15:00Z', meta_chain_run_id: '999' },
      ],
      [],
    );
    const row = await seam.checkSeam(pool, { upstream: 'compute_centroids', downstream: 'link_massing', chainId: 'sources' });
    expect(row.status).toBe('FAIL');
  });

  it('picks the MOST RECENT shared chain_run_id when several exist', async () => {
    const pool = fakeSeamPool(
      [
        { pipeline: 'sources:compute_centroids', id: 1, started_at: '2026-08-29T10:00:00Z', completed_at: '2026-08-29T10:20:00Z', meta_chain_run_id: '100' },
        { pipeline: 'sources:link_massing', id: 2, started_at: '2026-08-29T10:00:00Z', completed_at: '2026-08-29T10:05:00Z', meta_chain_run_id: '100' },
        { pipeline: 'sources:compute_centroids', id: 3, started_at: '2026-08-30T10:00:00Z', completed_at: '2026-08-30T10:05:00Z', meta_chain_run_id: '200' },
        { pipeline: 'sources:link_massing', id: 4, started_at: '2026-08-30T10:06:00Z', completed_at: '2026-08-30T10:20:00Z', meta_chain_run_id: '200' },
      ],
      [],
    );
    const row = await seam.checkSeam(pool, { upstream: 'compute_centroids', downstream: 'link_massing', chainId: 'sources' });
    expect((row.value as Record<string, unknown>).join_value).toBe('200');
    expect(row.status).toBe('PASS');
  });
});

describe('checkSeam — legacy temporal fallback (Fold A-5, no shared chain_run_id)', () => {
  it('GREEN — no chain_run_id rows exist on either side; falls back to the RUN-level completed_at/started_at comparison: PASS', async () => {
    const pool = fakeSeamPool(
      [],
      [
        { pipeline: 'sources:compute_centroids', id: 1, started_at: '2026-08-30T09:00:00Z', completed_at: '2026-08-30T09:05:00Z' },
        { pipeline: 'sources:link_massing', id: 2, started_at: '2026-08-30T09:10:00Z', completed_at: '2026-08-30T09:20:00Z' },
      ],
    );
    const row = await seam.checkSeam(pool, { upstream: 'compute_centroids', downstream: 'link_massing', chainId: 'sources' });
    expect(row.status).toBe('PASS');
    expect((row.value as Record<string, unknown>).join).toBe('temporal_fallback');
  });

  it('RED — legacy fallback, downstream started before upstream completed: FAIL', async () => {
    const pool = fakeSeamPool(
      [],
      [
        { pipeline: 'sources:compute_centroids', id: 1, started_at: '2026-08-30T09:00:00Z', completed_at: '2026-08-30T09:25:00Z' },
        { pipeline: 'sources:link_massing', id: 2, started_at: '2026-08-30T09:10:00Z', completed_at: '2026-08-30T09:20:00Z' },
      ],
    );
    const row = await seam.checkSeam(pool, { upstream: 'compute_centroids', downstream: 'link_massing', chainId: 'sources' });
    expect(row.status).toBe('FAIL');
  });

  it('WARN, not a throw, when one side has no run history at all yet', async () => {
    const pool = fakeSeamPool([], [{ pipeline: 'sources:compute_centroids', id: 1, started_at: '2026-08-30T09:00:00Z', completed_at: '2026-08-30T09:05:00Z' }]);
    const row = await seam.checkSeam(pool, { upstream: 'compute_centroids', downstream: 'link_massing', chainId: 'sources' });
    expect(row.status).toBe('WARN');
    expect(row.why).toMatch(/link_massing/);
  });
});

describe('runSeamChecks — one row per derived pair', () => {
  it('runs the single live pair against the REAL registry and returns one row', async () => {
    const pool = fakeSeamPool([], []);
    const rows = await seam.runSeamChecks(pool, { chainId: 'sources' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metric).toBe('seam_compute_centroids_before_link_massing');
    expect(rows[0]?.status).toBe('WARN'); // no history in this fake pool
  });
});
