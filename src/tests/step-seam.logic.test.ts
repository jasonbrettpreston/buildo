// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 13, R-T addendum, commit 5)
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.5 (SEAM-CHAIN-1, batch-2 row 3.1 prerequisite 0c)
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
  deriveSeamPairs: (
    byName?: Record<string, { descriptor: Record<string, unknown> }>,
    opts?: { chainId?: string },
  ) => Array<{ upstream: string; downstream: string }>;
  deriveSeamPairsScoped: (
    byName: Record<string, { descriptor: Record<string, unknown> }>,
    chainId?: string,
  ) => {
    pairs: Array<{ upstream: string; downstream: string }>;
    excluded: Array<{ upstream: string; downstream: string; reason: 'upstream_not_in_chain' | 'downstream_not_in_chain' }>;
  };
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

  it('the REAL 19-descriptor registry (batch2 row 3.1 cutover, 2026-09-24 — address_points) yields 13 live pairs (up from 11): this registration ADDS TWO, both as the UPSTREAM half of already-declared edges — address_points itself declares NO inputs.reads.steps (a leaf INGESTOR, like load_ravines/assert_schema)', () => {
    const byName = seam.loadConvertedDescriptors();
    expect(Object.keys(byName).sort()).toEqual(
      ['address_points', 'assert_data_bounds', 'assert_engine_health', 'assert_global_coverage', 'assert_parcel_sanity', 'assert_schema', 'compute_centroids', 'compute_parcel_cost_estimates', 'enrich_heritage', 'enrich_parcels', 'enrich_ravines', 'geocode_permits', 'link_massing', 'link_neighbourhoods', 'link_parcel_addresses', 'link_parcels', 'link_wsib', 'load_ravines', 'refresh_snapshot'].sort(),
    );
    // enrich_heritage (batch2 row 2.2, cut over 2026-09-20) declares inputs.reads.steps:
    // [{step: 'load_heritage', version_pin: 'exact'}] ONLY — measured from
    // scripts/enrich-heritage.descriptor.json. load_heritage is NOT itself converted (not in
    // the registry above), so this read resolves to nothing. Nor is enrich_heritage named by
    // any OTHER converted descriptor's own inputs.reads.steps (grepped scripts/ for
    // `"step": "enrich_heritage"` — zero hits): enrich_parcels' compute reads
    // is_heritage_designated (enrich-parcels.js:460/587/593/597) but does not declare
    // enrich_heritage as a read — a MEASURED pre-existing gap (EH-D4), allowlisted in
    // KNOWN_GAPS.enrich_parcels.missing alongside RV-D5's identical enrich_ravines gap,
    // src/tests/step-conformance.infra.test.ts. So the registry grows 16 -> 17 descriptors
    // while live pairs stay exactly 9 — this cutover's registration contributes zero new
    // seam pairs in EITHER direction.
    // enrich_ravines (batch-2 row 2.1, cut over 2026-09-18) declares inputs.reads.steps:
    // [{step: 'load_ravines', version_pin: 'exact'}] ONLY — measured from
    // scripts/enrich-ravines.descriptor.json. load_ravines is itself converted, so the
    // registration contributes exactly ONE new pair, downstream=enrich_ravines, which sorts
    // by deriveSeamPairs's own deterministic `downstream:upstream` localeCompare BETWEEN
    // 'enrich_parcels:link_massing' and 'link_massing:compute_centroids'
    // ('enrich_parcels' < 'enrich_ravines' < 'link_massing').
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
    // WAS ALSO KNOWN and filed MED in review_followups.md rather than discovered later: the
    // moment `address_points` converts, `address_points -> geocode_permits` becomes a live
    // pair via the UNSCOPED `deriveSeamPairs` used above, which has no chain filter — a
    // sources-only step would then WARN permanently on every permits chain-end.
    // SUPERSEDED before that cutover landed: prerequisite 0c (SEAM-CHAIN-1, Spec 122 §6.5,
    // commit `08063c58`) built `deriveSeamPairsScoped`, and `runSeamChecks` (the function
    // `chain-end-synthesis.mjs` actually calls) was wired to it directly — the chain-scoped
    // describe block below (`seam pairs are scoped to the chain they run in`) is the live
    // lock. The address_points cutover (batch-2 row 3.1, 2026-09-24) landed with the
    // permanent-WARN premise already closed; see the `deriveSeamPairs` (unscoped, both
    // chains) test above for the two pairs it DOES contribute to the fleet-wide count.
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
    // assert_parcel_sanity (batch2 P1.1, cut over 2026-09-18, commit 2e/③) declares
    // inputs.reads.steps: [{step: 'enrich_parcels'}, {step: 'compute_parcel_cost_estimates'}]
    // (LDG-4 — the folded scan reads columns BOTH steps write, not only the cost step's).
    // Until batch2 row 2.4's cutover, only `enrich_parcels` was itself converted, so the
    // registration contributed exactly ONE pair, downstream=assert_parcel_sanity.
    //
    // batch2 row 2.4 cutover (compute_parcel_cost_estimates, 2026-09-21) — 9 -> 11 PAIRS,
    // TWO NEW, in BOTH directions (retiring the earlier "contributes zero new pairs" text,
    // which was correct only while the slug was unconverted):
    // (a) DOWNSTREAM: compute_parcel_cost_estimates's own inputs.reads.steps (measured from
    //     scripts/compute-parcel-cost-estimates.descriptor.json) names enrich_parcels and
    //     parcels — only enrich_parcels is itself converted, so registering
    //     compute_parcel_cost_estimates contributes ONE new pair,
    //     downstream=compute_parcel_cost_estimates.
    // (b) UPSTREAM: assert_parcel_sanity's ALREADY-DECLARED second inputs.reads.steps entry
    //     (compute_parcel_cost_estimates, present since 2026-09-18 — see the LDG-4 note
    //     above) now resolves to a live producer for the first time, contributing a SECOND
    //     pair with downstream=assert_parcel_sanity. Exactly the same class as
    //     link_neighbourhoods/geocode_permits below: a cutover can add a seam pair without
    //     the step itself declaring a new read, purely by completing an EXISTING declared
    //     edge on the other end.
    // Sort (deriveSeamPairs's own deterministic `downstream:upstream` localeCompare):
    // 'assert_parcel_sanity:compute_parcel_cost_estimates' < 'assert_parcel_sanity:enrich_parcels'
    // (both downstream=assert_parcel_sanity; 'c' < 'e' on the upstream half) — the new pair
    // sorts FIRST, ahead of the pre-existing one. 'compute_parcel_cost_estimates:enrich_parcels'
    // (downstream=compute_parcel_cost_estimates) sorts between 'assert_parcel_sanity:*' and
    // 'enrich_parcels:link_massing' ('c' < 'e' on the downstream half).
    // batch-2 row 3.1 cutover (address_points, 2026-09-24) — 11 -> 13 PAIRS, TWO NEW,
    // BOTH as the upstream half of an edge ALREADY declared by a converted downstream
    // (the same class as link_neighbourhoods/geocode_permits and assert_parcel_sanity/
    // compute_parcel_cost_estimates above — a cutover can add a seam pair without the
    // registering step declaring one itself, purely by completing an existing edge on
    // the other end): (a) geocode_permits declares inputs.reads.steps:
    // [{step: 'address_points'}] (measured from scripts/geocode-permits.descriptor.json)
    // — already declared, now resolves; (b) link_parcel_addresses declares
    // inputs.reads.steps naming BOTH 'address_points' and its alias 'load_address_points'
    // (measured from scripts/link-parcel-addresses.descriptor.json) — dedup keeps one
    // pair. address_points' OWN inputs.reads.steps is [] (a leaf INGESTOR, like
    // load_ravines/assert_schema), so its registration contributes zero pairs as a
    // downstream.
    expect(seam.deriveSeamPairs(byName)).toEqual([
      { upstream: 'compute_parcel_cost_estimates', downstream: 'assert_parcel_sanity' },
      { upstream: 'enrich_parcels', downstream: 'assert_parcel_sanity' },
      { upstream: 'enrich_parcels', downstream: 'compute_parcel_cost_estimates' },
      { upstream: 'link_massing', downstream: 'enrich_parcels' },
      { upstream: 'load_ravines', downstream: 'enrich_ravines' },
      // batch-2 row 3.1 (2026-09-24) — sorts here: 'geocode_permits:address_points'
      // falls between 'enrich_ravines:load_ravines' and 'link_massing:compute_centroids'.
      { upstream: 'address_points', downstream: 'geocode_permits' },
      { upstream: 'compute_centroids', downstream: 'link_massing' },
      // batch-2 I5 (2026-09-16) — sorts here by deriveSeamPairs's own deterministic
      // `downstream:upstream` localeCompare: 'link_neighbourhoods:geocode_permits' falls
      // between 'link_massing:compute_centroids' and 'link_parcel_addresses:link_parcels'.
      { upstream: 'geocode_permits', downstream: 'link_neighbourhoods' },
      // batch-2 row 3.1 (2026-09-24) — sorts here: 'link_parcel_addresses:address_points'
      // falls between 'link_neighbourhoods:geocode_permits' and
      // 'link_parcel_addresses:link_parcels' ('address_points' < 'link_parcels').
      { upstream: 'address_points', downstream: 'link_parcel_addresses' },
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
  // assert_parcel_sanity (batch2 P1.1, cut over 2026-09-18) declares inputs.reads.steps:
  // [enrich_parcels, compute_parcel_cost_estimates] — only enrich_parcels is itself
  // converted, so the registration contributes exactly ONE new pair,
  // 'assert_parcel_sanity:enrich_parcels', which sorts FIRST alphabetically — 6 -> 7.
  // enrich_ravines (batch-2 row 2.1, cut over 2026-09-18) declares inputs.reads.steps:
  // [{step: 'load_ravines'}] — load_ravines is itself converted, so the registration
  // contributes exactly ONE new pair, 'enrich_ravines:load_ravines', sorting between
  // 'enrich_parcels:link_massing' and 'link_massing:compute_centroids' — 8 -> 9.
  // enrich_heritage (batch2 row 2.2, cut over 2026-09-20) declares inputs.reads.steps:
  // [{step: 'load_heritage'}] — load_heritage is NOT itself converted, and no converted
  // descriptor declares enrich_heritage as a read (enrich_parcels' identical dependency is
  // undeclared — KNOWN_GAPS EH-D4), so the registration contributes zero new pairs/metrics.
  // Registry 16 -> 17 descriptors; live pairs/metrics stay at 9.
  // compute_parcel_cost_estimates (batch2 row 2.4, cut over 2026-09-21) ADDS TWO — see the
  // deriveSeamPairs test above for the full both-directions derivation. Registry 17 -> 18
  // descriptors; live pairs/metrics 9 -> 11. Sort: 'seam_compute_parcel_cost_estimates_
  // before_assert_parcel_sanity' sorts FIRST (downstream=assert_parcel_sanity, upstream
  // 'compute_parcel_cost_estimates' < 'enrich_parcels'); 'seam_enrich_parcels_before_
  // compute_parcel_cost_estimates' sorts between the assert_parcel_sanity pair(s) and
  // 'seam_link_massing_before_enrich_parcels' (downstream 'compute_parcel_cost_estimates'
  // < 'enrich_parcels').
  // address_points (batch2 row 3.1, cut over 2026-09-24) ADDS TWO MORE — measured 2026-09-24
  // (`seam.runSeamChecks({chainId:'sources'})` against the real registry): geocode_permits
  // is ITSELF a member of the 'sources' chain (Spec 43 row 4), so chain-scoping (SEAM-CHAIN-1,
  // prerequisite 0c) does NOT filter out `address_points -> geocode_permits` — the permanent-
  // WARN premise the I5 cutover pre-announced never materializes (see the deriveSeamPairs
  // test above). Registry 18 -> 19 descriptors; live pairs/metrics 11 -> 13.
  const EXPECTED_SEAM_METRICS = [
    'seam_compute_parcel_cost_estimates_before_assert_parcel_sanity',
    'seam_enrich_parcels_before_assert_parcel_sanity',
    'seam_enrich_parcels_before_compute_parcel_cost_estimates',
    'seam_link_massing_before_enrich_parcels',
    'seam_load_ravines_before_enrich_ravines',
    'seam_address_points_before_geocode_permits',
    'seam_compute_centroids_before_link_massing',
    // batch-2 I5 cutover (2026-09-16) — in deriveSeamPairs's own `downstream:upstream` sort
    // position. link_neighbourhoods declared this read at ITS cutover the same day;
    // geocode_permits' registration is what resolves it to a live producer, which is why a
    // cutover can add a seam pair the converting step never declared.
    'seam_geocode_permits_before_link_neighbourhoods',
    'seam_address_points_before_link_parcel_addresses',
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

describe('seam pairs are scoped to the chain they run in (SEAM-CHAIN-1, Spec 122 §6.5, batch-2 row 3.1 prerequisite 0c)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const manifest = require('../../scripts/manifest.json') as { chains: Record<string, string[]> };

  // compute_centroids -> link_massing: a real pair (see the first describe block
  // above), both slugs are members of `sources`, but compute_centroids is NOT a
  // member of `permits` (link_massing is) — SEAM-CHAIN-1's motivating case: a
  // permits chain-end evaluating a sources-only pair.
  const byName = {
    link_massing: {
      descriptor: { inputs: { reads: { steps: [{ step: 'compute_centroids' }] } } },
    },
    compute_centroids: { descriptor: { inputs: { reads: { steps: [] } } } },
  };
  const PAIR = { upstream: 'compute_centroids', downstream: 'link_massing' };

  it('the chosen pair is sources-only in the REAL manifest (upstream absent from permits, downstream present)', () => {
    expect(manifest.chains.sources).toEqual(expect.arrayContaining(['compute_centroids', 'link_massing']));
    expect(manifest.chains.permits).not.toContain('compute_centroids');
    expect(manifest.chains.permits).toContain('link_massing');
  });

  it('T1 — an unscoped pair whose upstream is missing from the chain is excluded, not evaluated (RED before the fix: one row)', async () => {
    const scoped = seam.deriveSeamPairsScoped(byName, 'permits');
    expect(scoped.pairs).toEqual([]);
    expect(scoped.excluded).toEqual([{ ...PAIR, reason: 'upstream_not_in_chain' }]);

    const pool = fakeSeamPool([], []);
    const rows = await seam.runSeamChecks(pool, { chainId: 'permits', descriptorsByName: byName });
    expect(rows).toEqual([]);
  });

  it('T2 — the same pair is live, unexcluded, and produces one row on the chain both slugs belong to', async () => {
    const scoped = seam.deriveSeamPairsScoped(byName, 'sources');
    expect(scoped.pairs).toEqual([PAIR]);
    expect(scoped.excluded).toEqual([]);

    const pool = fakeSeamPool([], []);
    const rows = await seam.runSeamChecks(pool, { chainId: 'sources', descriptorsByName: byName });
    expect(rows).toHaveLength(1);
  });

  it('T3 — deriveSeamPairs with no chain argument is byte-identical to the unscoped derivation (backward compatible)', () => {
    expect(seam.deriveSeamPairs(byName)).toEqual([PAIR]);
  });

  it('T4 — an unknown chainId throws a named Error rather than silently returning everything or nothing', () => {
    expect(() => seam.deriveSeamPairsScoped(byName, 'not_a_real_chain')).toThrow(/unknown chainId/i);
  });
});
