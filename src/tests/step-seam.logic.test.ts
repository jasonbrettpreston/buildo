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

  it('the REAL 14-descriptor registry (batch-2 I5 cutover, 2026-09-16 — geocode_permits) yields 7 live pairs: link_massing -> enrich_parcels, compute_centroids -> link_massing, link_parcel_addresses -> link_parcels, plus refresh_snapshot\'s 3 declared inputs.reads.steps', () => {
    const byName = seam.loadConvertedDescriptors();
    expect(Object.keys(byName).sort()).toEqual(
      ['assert_data_bounds', 'assert_engine_health', 'assert_global_coverage', 'assert_schema', 'compute_centroids', 'enrich_parcels', 'geocode_permits', 'link_massing', 'link_neighbourhoods', 'link_parcel_addresses', 'link_parcels', 'link_wsib', 'load_ravines', 'refresh_snapshot'].sort(),
    );
    // assert_global_coverage (batch1 I1, cut over commit 9, 2026-09-12) declares
    // inputs.reads.steps: [] — measured from scripts/quality/assert-global-coverage.
    // descriptor.json on 2026-09-12: it reads 28 TABLES directly (permits/coa_applications/
    // parcels/etc.), never another converted step's declared step-to-step edge, so its
    // registration contributes zero new seam pairs — the registry grows 9 -> 10 descriptors
    // but the live-pairs count stays exactly 6.
    // link_neighbourhoods (batch-2 I4, cut over 2026-09-16) declares inputs.reads.steps:
    // [neighbourhoods, geocode_permits] — BOTH still unconverted, so neither resolves to a
    // registered producer and the registry grows 12 → 13 while live pairs stay at 6. It is
    // also not NAMED by any converted descriptor's own reads.steps (grepped), so it adds no
    // inbound edge either. The moment `geocode_permits` converts, this count moves.
    // AND IT MOVED, at the batch-2 I5 cutover the same day (2026-09-16), exactly as that
    // sentence said it would: geocode_permits' registration resolves link_neighbourhoods'
    // ALREADY-DECLARED `reads.steps` entry to a live producer, so the registry grows 13 -> 14
    // and live pairs 6 -> 7 with ONE new pair, `geocode_permits -> link_neighbourhoods`. Note
    // which direction produced it: NOT geocode_permits' own declared read (it declares
    // `address_points`, which is still unconverted and therefore still resolves to nothing),
    // but its appearance as the UPSTREAM of a downstream that was already converted. A
    // cutover can add a seam pair without the step itself declaring one.
    // ALSO KNOWN, and filed MED in review_followups.md rather than discovered later: the
    // moment `address_points` converts (batch-2 Phase 3), `address_points -> geocode_permits`
    // becomes an 8th pair AND starts WARNing permanently on every permits chain-end, because
    // `load-address-points.js` is a sources-only step, `deriveSeamPairs` has no chain filter,
    // and `chain-end-synthesis.mjs` passes the LIVE chain. Accepted and pre-announced.
    // assert_data_bounds (batch1 I2, cut over commit 9, 2026-09-13) likewise declares
    // inputs.reads.steps: [] — measured from scripts/quality/assert-data-bounds.descriptor.json
    // on 2026-09-13: it reads 16 TABLES directly (§0 row 5 of its plan), never another
    // converted step's declared step-to-step edge, so its registration also contributes zero
    // new seam pairs — the registry grows 10 -> 11 descriptors but the live-pairs count stays
    // exactly 6.
    // assert_engine_health (batch1 I3, cut over commit 9, 2026-09-14) likewise declares
    // inputs.reads.steps: [] — measured from scripts/quality/assert-engine-health.
    // descriptor.json on 2026-09-14: it reads pg_stat_user_tables directly (a catalog view,
    // not another converted step's declared output), never another converted step's declared
    // step-to-step edge, so its registration also contributes zero new seam pairs — the
    // registry grows 11 -> 12 descriptors but the live-pairs count stays exactly 6.
    // enrich_parcels (pilot 9, cut over commit 9, 2026-09-11) declares inputs.reads.steps:
    // [{step: 'link_massing'}] ONLY — measured from scripts/enrich-parcels.descriptor.json on
    // 2026-09-11 (the PH-5 seam map in the plan named five producers; the descriptor declares
    // one — corrected here the same day, a transcription caught by re-executing the claim).
    // link_massing is itself converted, so the registration contributes exactly ONE new live
    // pair, downstream=enrich_parcels, which sorts FIRST
    // ('enrich_parcels:link_massing' < 'link_massing:compute_centroids').
    // link_parcels now declares inputs.reads.steps: [{step: 'link_parcel_addresses',
    // version_pin: 'gte'}] (LDG-D1 split disposition, WF3 wf3_link_parcels_declared_reads,
    // 2026-09-03: the read is genuine and load-bearing — Strategy 1a's
    // parcel_address_points JOIN — while compute_centroids stays undeclared, a
    // stale-ledger artifact per G3/G4, routed to review_followups.md:17) — its
    // addition contributes ONE new pair, downstream=link_parcels. refresh_snapshot
    // (pilot 8) DOES declare inputs.reads.steps — scripts/refresh-snapshot.descriptor.json:22-24
    // names link_parcels, link_massing, link_wsib (each `version_pin: "gte"`) — so its
    // addition contributes 3 new pairs, all downstream=refresh_snapshot. Order is
    // deriveSeamPairs's own deterministic `downstream:upstream` localeCompare sort
    // (scripts/lib/step/seam.js:95) — 'link_massing:compute_centroids' <
    // 'link_parcels:link_parcel_addresses' < 'refresh_snapshot:link_massing' <
    // 'refresh_snapshot:link_parcels' < 'refresh_snapshot:link_wsib'.
    expect(seam.deriveSeamPairs(byName)).toEqual([
      { upstream: 'link_massing', downstream: 'enrich_parcels' },
      { upstream: 'compute_centroids', downstream: 'link_massing' },
      // batch-2 I5 (2026-09-16) — sorts here by deriveSeamPairs's own deterministic
      // `downstream:upstream` localeCompare: 'link_neighbourhoods:geocode_permits' falls
      // between 'link_massing:compute_centroids' and 'link_parcels:link_parcel_addresses'.
      { upstream: 'geocode_permits', downstream: 'link_neighbourhoods' },
      { upstream: 'link_parcel_addresses', downstream: 'link_parcels' },
      { upstream: 'link_massing', downstream: 'refresh_snapshot' },
      { upstream: 'link_parcels', downstream: 'refresh_snapshot' },
      { upstream: 'link_wsib', downstream: 'refresh_snapshot' },
    ]);
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
  // Pilot 8 cutover (2026-08-31) added refresh_snapshot's OWN 3 declared
  // `inputs.reads.steps` pairs (link_parcels, link_massing, link_wsib —
  // assessment report §0.7) on top of the sole pre-existing live pair
  // (compute_centroids -> link_massing) — 1 -> 4. WF3 wf3_link_parcels_declared_reads
  // (LDG-D1 split disposition, 2026-09-03) adds a 5th: link_parcels now declares
  // link_parcel_addresses (genuine, load-bearing read — G5/G12), while
  // compute_centroids stays undeclared (stale-ledger artifact, G3/G4, routed to
  // review_followups.md:17) — 4 -> 5. Order is `deriveSeamPairs`'s own deterministic
  // `downstream:upstream` localeCompare sort: 'link_massing:compute_centroids' <
  // 'link_parcels:link_parcel_addresses' < 'refresh_snapshot:link_massing' <
  // 'refresh_snapshot:link_parcels' < 'refresh_snapshot:link_wsib'. Pilot 9 commit 9
  // (2026-09-11) adds 'enrich_parcels:link_massing', which sorts FIRST — 5 -> 6.
  // Spec 124 R-AN (batch-2 Phase 0.8, 2026-09-15): the CONTENT list below is the
  // deliberate literal R-AN permits — it names the actual declared edges, and a
  // wrong edge is a real defect, not a bookkeeping number. What is NOT retyped
  // any more is the COUNT: it is derived from this same list, so a cutover that
  // adds an edge fails on the edge it added, not on an arithmetic mismatch.
  const EXPECTED_SEAM_METRICS = [
    'seam_link_massing_before_enrich_parcels',
    'seam_compute_centroids_before_link_massing',
    // batch-2 I5 cutover (2026-09-16) — the 7th pair, in deriveSeamPairs's own
    // `downstream:upstream` sort position. link_neighbourhoods declared this read at ITS
    // cutover the same day; geocode_permits' registration is what resolves it to a live
    // producer, which is why a cutover can add a seam pair the converting step never declared.
    'seam_geocode_permits_before_link_neighbourhoods',
    'seam_link_parcel_addresses_before_link_parcels',
    'seam_link_massing_before_refresh_snapshot',
    'seam_link_parcels_before_refresh_snapshot',
    'seam_link_wsib_before_refresh_snapshot',
  ];

  it('runs every live pair against the REAL registry and returns one row each', async () => {
    const pool = fakeSeamPool([], []);
    const rows = await seam.runSeamChecks(pool, { chainId: 'sources' });
    expect(rows).toHaveLength(EXPECTED_SEAM_METRICS.length);
    expect(rows.map((r) => r?.metric)).toEqual(EXPECTED_SEAM_METRICS);
    for (const row of rows) {
      expect(row?.status).toBe('WARN'); // no history in this fake pool
    }
  });
});
