#!/usr/bin/env node
/**
 * compute-storey-norms.js — permit-derived neighbourhood storey norms (WF3-C1, Spec 65 §8).
 *
 * Extracts storey counts from NEW-BUILD permit descriptions, dedupes per dominant parcel (so one
 * project's Building + (already-excluded) MEP companions, or a New Houses + Residential Building
 * Permit pair, count ONCE), and writes per-neighbourhood p50 (typical) / p90 (aggressive ceiling)
 * to neighbourhood_storey_norms (truncate-replace snapshot) + one citywide fallback row
 * (neighbourhood_id = NULL). WF3-C2 consumes it to replace the height÷3.0 max_build_stories guess.
 *
 * MARKET-REALIZED, NOT LEGAL (maximizer bias) — see the table COMMENT + Spec 65 §8.
 *
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §8 (permit-pocket storey norms)
 * CHAIN: permits chain, after classify_permits. Advisory lock 195.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { extractStoreys, STOREY_NORM_MIN_SAMPLE } = require('./lib/storey-extract');
const bn = require('./lib/build-norms');

const ADVISORY_LOCK_ID = 195;
// Building-permit types only — drops the Plumbing/Mechanical/Drain MEP companions that repeat the
// storey text (the #1 dedup risk). Dedup-by-dominant-parcel then collapses multi-building-permit projects.
const BUILDING_PERMIT_TYPES = ['New Houses', 'New Building', 'Residential Building Permit'];

/**
 * Core (lock-less, testable): extract → dedup → percentile-aggregate → truncate-replace the
 * neighbourhood_storey_norms snapshot. Returns counters/stats for the caller to emit. Pure I/O on
 * the given pool (streamQuery opens its own connection; the write is one withTransaction).
 */
async function computeStoreyNorms(pool) {
  const RUN_AT = await pipeline.getDbTimestamp(pool);

  // Candidate new-build building permits with a neighbourhood (excl. the -1 no-match sentinel).
  // ORDER stable so dedup keeps a deterministic representative per parcel. The structure_type
  // ALLOWLIST is applied HERE (in the WHERE, before the JS dedup) so apartment/mixed-use towers never
  // claim a parcel's representative slot and suppress its low-rise residential permit (the contamination
  // that inflated storeys_p90 → opt_coa). NULL structure_type is retained (see build-norms.js).
  const sourceSQL = `SELECT permit_num, revision_num, neighbourhood_id, zoning_dominant_parcel_id, description, structure_type
           FROM permits
           WHERE permit_type = ANY($1)
             AND neighbourhood_id IS NOT NULL AND neighbourhood_id <> -1
             AND description IS NOT NULL
             AND ${bn.lowRiseResidentialSql('permits')}
           ORDER BY zoning_dominant_parcel_id NULLS LAST, permit_num, revision_num`;

  // Observability: how many candidates the structure_type allowlist drops (apartment/mixed/commercial).
  const excludedNonLowrise = parseInt((await pool.query(
    `SELECT count(*) FILTER (WHERE NOT ${bn.lowRiseResidentialSql('permits')})::int AS excluded
       FROM permits
      WHERE permit_type = ANY($1) AND neighbourhood_id IS NOT NULL AND neighbourhood_id <> -1
        AND description IS NOT NULL`,
    [BUILDING_PERMIT_TYPES],
  )).rows[0].excluded, 10);

  // Stream → JS extract + dedup. Observations are tiny (int,int); holding the deduped set in memory
  // is safe (~tens of thousands). Dedup key = dominant parcel, or the permit itself when unlinked
  // (so unlinked permits are each kept once — no silent NULL-collapse).
  const seen = new Set();
  const obs = []; // { nbhd, storeys }
  let candidates = 0; let extracted = 0; let parcelLinked = 0; let droppedImplausible = 0;
  for await (const r of pipeline.streamQuery(pool, sourceSQL, [BUILDING_PERMIT_TYPES])) {
    candidates += 1;
    const storeys = extractStoreys(r.description);
    if (storeys == null) continue; // no storey text / out-of-band noise
    if (storeys > bn.STOREYS_PLAUSIBILITY_MAX) { droppedImplausible += 1; continue; } // backstop, COUNTED (not hidden): a low-rise-typed permit reporting >8 storeys is a data error (extract already clamps >15)
    const key = r.zoning_dominant_parcel_id != null
      ? `parcel:${r.zoning_dominant_parcel_id}`
      : `permit:${r.permit_num}:${r.revision_num}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.zoning_dominant_parcel_id != null) parcelLinked += 1;
    obs.push({ nbhd: r.neighbourhood_id, storeys });
    extracted += 1;
  }

  const rowsWritten = await pipeline.withTransaction(pool, async (client) => {
    await client.query('DELETE FROM neighbourhood_storey_norms'); // truncate-replace snapshot
    await client.query('CREATE TEMP TABLE storey_obs (neighbourhood_id INT, storeys INT) ON COMMIT DROP');
    if (obs.length > 0) {
      await client.query(
        `INSERT INTO storey_obs (neighbourhood_id, storeys)
         SELECT * FROM unnest($1::int[], $2::int[])`,
        [obs.map((o) => o.nbhd), obs.map((o) => o.storeys)],
      );
    }
    const perNbhd = await client.query(
      `INSERT INTO neighbourhood_storey_norms
         (neighbourhood_id, storeys_p50, storeys_p90, sample_count, low_sample, data_provenance, computed_at)
       SELECT neighbourhood_id,
              percentile_disc(0.5) WITHIN GROUP (ORDER BY storeys),
              percentile_disc(0.9) WITHIN GROUP (ORDER BY storeys),
              count(*)::int, count(*) < $1, 'market_realized_new_builds', $2
       FROM storey_obs GROUP BY neighbourhood_id`,
      [STOREY_NORM_MIN_SAMPLE, RUN_AT],
    );
    if (obs.length > 0) {
      await client.query(
        `INSERT INTO neighbourhood_storey_norms
           (neighbourhood_id, storeys_p50, storeys_p90, sample_count, low_sample, data_provenance, computed_at)
         SELECT NULL,
                percentile_disc(0.5) WITHIN GROUP (ORDER BY storeys),
                percentile_disc(0.9) WITHIN GROUP (ORDER BY storeys),
                count(*)::int, false, 'market_realized_new_builds', $1
         FROM storey_obs`,
        [RUN_AT],
      );
    }
    return perNbhd.rowCount + (obs.length > 0 ? 1 : 0);
  });

  const stats = (await pool.query(
    `SELECT count(*) FILTER (WHERE neighbourhood_id IS NOT NULL)::int AS pockets,
            count(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND low_sample)::int AS low_sample_pockets,
            count(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND storeys_p50 = storeys_p90)::int AS degenerate_pockets,
            max(storeys_p50) FILTER (WHERE neighbourhood_id IS NULL) AS citywide_p50,
            max(storeys_p90) FILTER (WHERE neighbourhood_id IS NULL) AS citywide_p90
     FROM neighbourhood_storey_norms`)).rows[0];

  return { rowsWritten, candidates, extracted, parcelLinked, excludedNonLowrise, droppedImplausible, ...stats };
}

// WF3: row-derived verdict cascade (Spec 48 §3.6) — replaces the old parallel-boolean verdict which
// could never emit FAIL and would ignore a future FAIL-grade row.
function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

function main() {
  pipeline.run('compute-storey-norms', async (pool) => {
    const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
      const s = await computeStoreyNorms(pool);
      const parcelLinkedPct = s.extracted > 0 ? Math.round((1000 * s.parcelLinked) / s.extracted) / 10 : 0;
      const auditRows = [
        { metric: 'pockets_computed', value: s.pockets, threshold: '> 0', status: s.pockets > 0 ? 'INFO' : 'WARN' },
        { metric: 'pockets_low_sample', value: s.low_sample_pockets, threshold: null, status: 'INFO' },
        { metric: 'pockets_p50_equals_p90', value: s.degenerate_pockets, threshold: null, status: 'INFO' },
        // The citywide backstop is load-bearing: enrich-parcels' stories_calc falls back to it when a
        // pocket is absent. A NULL citywide p50 means NO storey fallback exists → FAIL (not silent).
        { metric: 'citywide_p50', value: s.citywide_p50, threshold: '!= null', status: s.citywide_p50 != null ? 'INFO' : 'FAIL' },
        { metric: 'citywide_p90', value: s.citywide_p90, threshold: null, status: 'INFO' },
        { metric: 'storey_permits_candidates', value: s.candidates, threshold: null, status: 'INFO' },
        { metric: 'storey_permits_extracted_deduped', value: s.extracted, threshold: null, status: 'INFO' },
        { metric: 'storey_permits_parcel_linked_pct', value: parcelLinkedPct, threshold: null, status: 'INFO' },
        { metric: 'storeys_excluded_nonlowrise', value: s.excludedNonLowrise, threshold: null, status: 'INFO' },
        { metric: 'storeys_dropped_implausible', value: s.droppedImplausible, threshold: null, status: 'INFO' },
      ];
      pipeline.emitSummary({
        records_total: s.extracted,
        records_new: s.rowsWritten,
        records_updated: 0,
        records_meta: { audit_table: { phase: ADVISORY_LOCK_ID, name: 'Neighbourhood Storey Norms', verdict: verdictCascade(auditRows), rows: auditRows } },
      });
      pipeline.emitMeta(
        { permits: ['permit_num', 'revision_num', 'permit_type', 'neighbourhood_id', 'zoning_dominant_parcel_id', 'description', 'structure_type'] },
        { neighbourhood_storey_norms: ['neighbourhood_id', 'storeys_p50', 'storeys_p90', 'sample_count', 'low_sample', 'data_provenance', 'computed_at'] },
      );
    });

    if (!lockResult.acquired) {
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          skipped: true, reason: 'advisory_lock_held_elsewhere', advisory_lock_id: ADVISORY_LOCK_ID,
          audit_table: { phase: ADVISORY_LOCK_ID, name: 'Neighbourhood Storey Norms', verdict: 'SKIP',
            rows: [{ metric: 'pockets_computed', value: 0, threshold: null, status: 'SKIP' }] },
        },
      });
      pipeline.emitMeta({ permits: [] }, {});
    }
  });
}

module.exports = { computeStoreyNorms, BUILDING_PERMIT_TYPES, ADVISORY_LOCK_ID };

if (require.main === module) main();
