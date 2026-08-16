#!/usr/bin/env node
/**
 * Link Parcels ↔ Address Points — populate the spatial bridge table.
 *
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md (primary)
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (secondary)
 *
 * ADVISORY LOCK NOTE: ADVISORY_LOCK_ID = 115 — free-range ID, NOT matching
 * the owning spec number (54). Spec 47 §3 default rule is "lock ID = spec
 * number"; this script takes a free ID instead because spec 54's slot is
 * already taken by load-address-points.js (lock 96), and spec 55's slot is
 * taken by load-parcels.js. Same precedent as backfill-realtor-permit-trades
 * (lock 114, owning spec 91 taken by link-massing). Lock 115 is registered
 * in `src/tests/pipeline-advisory-lock.infra.test.ts` LOCK_ID_REGISTRY.
 *
 * For each parcel polygon, find every address_point whose geom is
 * contained by the parcel via ST_Within. Persist (parcel_id,
 * address_point_id) pairs to the parcel_address_points cache table
 * created by migration 162. This table is the spatial bridge that
 * Phase 2d link-parcels.js Strategies 1+2 and Phase 2e
 * link-coa-to-parcels.js Tier 1a/1b consume to resolve an address
 * to the parcel(s) that physically contain it.
 *
 * Operational characteristics:
 *   - Idempotent: ON CONFLICT (parcel_id, address_point_id) DO NOTHING.
 *     Re-runs of an already-complete bridge are near-noop (only the
 *     spatial join cost; no writes).
 *   - Batch-bounded: PK-ordered parcel batches of BATCH_SIZE (1000).
 *     Each batch is a single INSERT...SELECT...JOIN ST_Within with
 *     GIST index lookups on both sides (mig 162 idx_address_points_geom_gist
 *     + the pre-existing idx_parcels_geom_gist).
 *   - Resumable: each batch commits independently; operator Ctrl-C
 *     leaves the DB in a consistent partial state and a re-run picks
 *     up where we left off (ON CONFLICT short-circuits).
 *   - Advisory lock 115 — single concurrent runner.
 *   - NULL-geom safe: WHERE p.geom IS NOT NULL on the parcel side +
 *     WHERE ap.geom IS NOT NULL on the address_point side. Rows
 *     skipped if Phase 2a backfill hasn't completed; surfaced in
 *     audit_table as `address_points_with_null_geom` (WARN).
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { safeParseIntOrNull } = require('./lib/safe-math');
const sourceVersion = require('./lib/source-version'); // Phase B B3 — run-ledger gate

const TAG = '[link-parcel-addresses]';

const ADVISORY_LOCK_ID = 115;

const BATCH_SIZE = 1000;

// Phase B B3 — run-ledger gate slug sets (T2: caller-supplied, never hardcoded
// in source-version.js). link_parcel_addresses runs in the 'sources' chain
// ONLY (manifest.json :102) — not permits, not entities.
const OWN_SLUGS = ['sources:link_parcel_addresses', 'link_parcel_addresses', 'link-parcel-addresses'];
// Upstream producers of the two geometry columns this bridge joins: parcels.geom
// (load-parcels.js) and address_points.geom (load-address-points.js) — both
// sources-chain-only steps that run BEFORE link_parcel_addresses (manifest.json
// chain order: address_points → parcels → ... → link_parcel_addresses).
const UPSTREAM_SLUGS = [
  'sources:address_points', 'address_points', 'load-address-points',
  'sources:parcels', 'parcels', 'load-parcels',
];

/** @param {import('pg').Pool} pool */
async function main(pool) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();
    // Spec 47 §R3.5 / §14.2 — capture RUN_AT once at startup. Every
    // computed_at written by this run uses this single timestamp so
    // midnight-cross during a long run does not split rows across
    // calendar dates. In-SQL clock calls in batch INSERTs are BANNED
    // per §14.2.
    const RUN_AT = await pipeline.getDbTimestamp(pool);

    // Phase B B3 — run-ledger gate. Cheapest check first: has parcels or
    // address_points changed since link_parcel_addresses' own last completed
    // run? If not, the spatial join is a guaranteed no-op — skip it entirely.
    // Still emits a COMPLETED pipeline_runs summary (DS4) so the next
    // evaluation's own-last anchor advances.
    const gate = await sourceVersion.runLedgerGateDecision(pool, {
      ownSlugs: OWN_SLUGS,
      upstreamSlugs: UPSTREAM_SLUGS,
      now: RUN_AT,
    });
    if (gate.skip) {
      pipeline.log.info(
        TAG,
        `Run-ledger gate: SKIP (${gate.reason}) — no upstream parcels/address_points activity since own last completed run.`,
      );
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          audit_table: {
            phase: 54,
            name: 'Parcel ↔ Address Points spatial bridge',
            verdict: 'PASS',
            rows: [
              { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
              { metric: 'reason', value: gate.reason, threshold: null, status: 'INFO' },
              { metric: 'non_completed_upstream', value: gate.nonCompleted, threshold: null, status: 'INFO' },
              { metric: 'completed_with_changes_upstream', value: gate.completedWithChanges, threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      pipeline.emitMeta(
        { parcels: ['id', 'geom'], address_points: ['address_point_id', 'geom'] },
        { parcel_address_points: ['parcel_id', 'address_point_id', 'computed_at'] },
      );
      return;
    }

    pipeline.log.info(TAG, 'Starting parcel ↔ address_points spatial bridge populate');

    const { rows: pre } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM parcels                  WHERE geom IS NOT NULL) AS parcels_with_geom,
         (SELECT COUNT(*) FROM parcels                  WHERE geom IS     NULL) AS parcels_with_null_geom,
         (SELECT COUNT(*) FROM address_points           WHERE geom IS NOT NULL) AS ap_with_geom,
         (SELECT COUNT(*) FROM address_points           WHERE geom IS     NULL) AS ap_with_null_geom,
         (SELECT COUNT(*) FROM parcel_address_points)                            AS existing_links`,
    );
    const parcelsWithGeom     = safeParseIntOrNull(pre[0].parcels_with_geom)     ?? 0;
    const parcelsWithNullGeom = safeParseIntOrNull(pre[0].parcels_with_null_geom) ?? 0;
    const apWithGeom          = safeParseIntOrNull(pre[0].ap_with_geom)           ?? 0;
    const apWithNullGeom      = safeParseIntOrNull(pre[0].ap_with_null_geom)      ?? 0;
    const existingLinks       = safeParseIntOrNull(pre[0].existing_links)         ?? 0;

    pipeline.log.info(
      TAG,
      `Pre-run: ${parcelsWithGeom.toLocaleString()} parcels w/ geom, ` +
        `${apWithGeom.toLocaleString()} address_points w/ geom, ` +
        `${existingLinks.toLocaleString()} existing links. ` +
        `(${parcelsWithNullGeom.toLocaleString()} parcels + ` +
        `${apWithNullGeom.toLocaleString()} APs have NULL geom and will be skipped.)`,
    );

    let totalNewLinks = 0;
    let parcelBatchesProcessed = 0;
    let lastParcelId = -1;
    let errors = 0;
    let completedNaturally = false;

    while (true) {
      try {
        const result = await pipeline.withTransaction(pool, async (client) => {
          // Single-statement set-based ST_Within join over a PK-ordered
          // batch of parcels with non-NULL geom. The GIST index on
          // address_points.geom (mig 162) + the existing GIST on
          // parcels.geom make the spatial join O(log n) per parcel.
          // ON CONFLICT DO NOTHING gives idempotency on re-run.
          return client.query(
            `WITH parcel_batch AS (
               SELECT id, geom
               FROM parcels
               WHERE geom IS NOT NULL
                 AND id > $1
               ORDER BY id
               LIMIT $2
             ),
             ins AS (
               INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
               SELECT pb.id, ap.address_point_id, $3::timestamptz
               FROM parcel_batch pb
               JOIN address_points ap
                 ON ap.geom IS NOT NULL
                AND ST_Within(ap.geom, pb.geom)
               ON CONFLICT (parcel_id, address_point_id) DO NOTHING
               RETURNING parcel_id
             )
             SELECT
               (SELECT COUNT(*) FROM ins)                AS new_links,
               (SELECT MAX(id) FROM parcel_batch)        AS max_parcel_id,
               (SELECT COUNT(*) FROM parcel_batch)       AS parcels_in_batch`,
            [lastParcelId, BATCH_SIZE, RUN_AT],
          );
        });

        const row = result.rows[0];
        const newLinks      = safeParseIntOrNull(row.new_links)       ?? 0;
        const maxParcelId   = safeParseIntOrNull(row.max_parcel_id);
        const parcelsInBatch = safeParseIntOrNull(row.parcels_in_batch) ?? 0;

        if (parcelsInBatch === 0) {
          completedNaturally = true;
          pipeline.log.info(
            TAG,
            `Bridge populate complete after ${parcelBatchesProcessed} batch(es). ` +
              `${totalNewLinks.toLocaleString()} new links written.`,
          );
          break;
        }

        parcelBatchesProcessed++;
        totalNewLinks += newLinks;
        lastParcelId = maxParcelId ?? lastParcelId;

        if (parcelBatchesProcessed % 25 === 0 || parcelsInBatch < BATCH_SIZE) {
          pipeline.log.info(
            TAG,
            `Batch ${parcelBatchesProcessed}: processed ${parcelsInBatch} parcels, ` +
              `wrote ${newLinks} new links (running total: ${totalNewLinks.toLocaleString()}).`,
          );
        }
      } catch (err) {
        errors++;
        pipeline.log.error(TAG, err, { batch: parcelBatchesProcessed + 1, lastParcelId });
        break;
      }
    }

    const elapsedMs = Date.now() - t0;

    const { rows: post } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM parcel_address_points)                                                    AS final_links,
         (SELECT COUNT(DISTINCT parcel_id) FROM parcel_address_points)                                   AS parcels_with_links,
         (SELECT COUNT(DISTINCT address_point_id) FROM parcel_address_points)                            AS aps_with_links,
         (SELECT COUNT(*) FROM parcels p
            WHERE p.geom IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM parcel_address_points pap WHERE pap.parcel_id = p.id))       AS parcels_with_no_address,
         (SELECT COUNT(*) FROM address_points ap
            WHERE ap.geom IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM parcel_address_points pap WHERE pap.address_point_id = ap.address_point_id)) AS aps_with_no_parcel`,
    );
    const finalLinks            = safeParseIntOrNull(post[0].final_links)             ?? 0;
    const parcelsWithLinks      = safeParseIntOrNull(post[0].parcels_with_links)      ?? 0;
    const apsWithLinks          = safeParseIntOrNull(post[0].aps_with_links)          ?? 0;
    const parcelsWithNoAddress  = safeParseIntOrNull(post[0].parcels_with_no_address) ?? 0;
    const apsWithNoParcel       = safeParseIntOrNull(post[0].aps_with_no_parcel)      ?? 0;

    const noAddressFraction = parcelsWithGeom > 0
      ? parcelsWithNoAddress / parcelsWithGeom
      : 0;
    const noParcelFraction = apWithGeom > 0
      ? apsWithNoParcel / apWithGeom
      : 0;

    pipeline.log.info(
      TAG,
      `Post-run: ${finalLinks.toLocaleString()} total links, ` +
        `${parcelsWithLinks.toLocaleString()} parcels linked, ` +
        `${apsWithLinks.toLocaleString()} address_points linked. ` +
        `Coverage gaps: ${parcelsWithNoAddress.toLocaleString()} parcels w/o address ` +
        `(${(noAddressFraction * 100).toFixed(1)}%), ` +
        `${apsWithNoParcel.toLocaleString()} APs w/o parcel ` +
        `(${(noParcelFraction * 100).toFixed(1)}%). ` +
        `Elapsed ${elapsedMs}ms.`,
    );

    const auditRows = [
      {
        metric: 'parcels_with_geom_pre_run',
        value: parcelsWithGeom,
        threshold: null,
        status: 'INFO',
      },
      {
        metric: 'address_points_with_geom_pre_run',
        value: apWithGeom,
        threshold: null,
        status: 'INFO',
      },
      {
        metric: 'address_points_with_null_geom',
        value: apWithNullGeom,
        threshold: '== 0',
        // WARN, not FAIL — Phase 2a backfill may be incomplete or the
        // operator may have intentionally skipped some rows (they have
        // NULL lat/lng so cannot be geom-backfilled). The bridge keeps
        // working for the rows that do have geom.
        status: apWithNullGeom > 0 ? 'WARN' : 'PASS',
      },
      {
        metric: 'new_links_written',
        value: totalNewLinks,
        threshold: null,
        status: 'INFO',
      },
      {
        // Observability IMPL F3 fold: zero-coverage gate. The bridge is the
        // sole data path for Phase 2d link-parcels Strategies 1+2 and Phase
        // 2e link-coa-to-parcels Tier 1a/1b. A complete failure (PostGIS
        // extension absent, GIST index dropped, SRID mismatch) silently
        // produces final_link_count = 0 and the chain would proceed to
        // unlink every permit downstream. Hard-fail here so an operator
        // sees the regression before Phase 2d runs.
        metric: 'final_link_count',
        value: finalLinks,
        threshold: '> 0',
        status: finalLinks === 0 ? 'FAIL' : 'INFO',
      },
      {
        metric: 'parcels_with_links',
        value: parcelsWithLinks,
        threshold: null,
        status: 'INFO',
      },
      {
        // Spec 43 §6.7-A link-rate telemetry: the bridge's headline coverage figure
        // (parcels with >=1 address point / parcels with geom). Complements the
        // WARN-gated parcels_with_no_address_pct below with the positive framing that
        // Spec 43 documents (~511K bridge rows over ~468K linked parcels live). INFO —
        // the WARN threshold lives on the complement row so the gate isn't double-counted.
        metric: 'parcel_link_rate_pct',
        value: parcelsWithGeom > 0 ? `${((parcelsWithLinks / parcelsWithGeom) * 100).toFixed(1)}%` : 'n/a',
        threshold: null,
        status: 'INFO',
      },
      {
        // Independent IMPL I1 fold: threshold recalibrated from 10% to 50%.
        // PI-2 plan estimate is avg 1.0 ap/parcel — Poisson-like distribution
        // implies ~37% of parcels legitimately have zero address points
        // (vacant land, road allowance, easement, internal subdivision lots).
        // A 10% ceiling would WARN on every clean run, training operators to
        // ignore the signal. 50% is well above the expected baseline; a
        // sudden jump above 50% indicates a spatial-join regression
        // (PostGIS removed, SRID mismatch, index drop).
        metric: 'parcels_with_no_address_pct',
        value: `${(noAddressFraction * 100).toFixed(1)}%`,
        threshold: '< 50%',
        status: noAddressFraction >= 0.50 ? 'WARN' : 'PASS',
      },
      {
        metric: 'address_points_with_no_parcel_pct',
        value: `${(noParcelFraction * 100).toFixed(1)}%`,
        threshold: '< 5%',
        // Address points outside the parcel boundary layer (e.g., points
        // on road allowance not covered by a parcel polygon) are normal.
        // 5% is the ceiling; > 5% suggests parcel coverage gaps.
        status: noParcelFraction >= 0.05 ? 'WARN' : 'PASS',
      },
      {
        metric: 'errors',
        value: errors,
        threshold: '== 0',
        status: errors > 0 ? 'FAIL' : 'PASS',
      },
    ];

    pipeline.emitSummary({
      // Per Spec 47 §11.1 — primary entity evaluated this run is the
      // set of parcels iterated. parcelBatchesProcessed × BATCH_SIZE is
      // approximate (last batch may be partial); we use the precise
      // parcelsWithLinks + parcelsWithNoAddress sum as the evaluated count.
      // records_new = links written (entity = parcel_address_points row).
      records_total: parcelsWithGeom,
      records_new: totalNewLinks,
      records_updated: 0,
      records_meta: {
        duration_ms: elapsedMs,
        batches_processed: parcelBatchesProcessed,
        completed_naturally: completedNaturally,
        audit_table: {
          phase: 54,
          name: 'Parcel ↔ Address Points spatial bridge',
          verdict: auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                 : auditRows.some((r) => r.status === 'WARN') ? 'WARN'
                 : 'PASS',
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      {
        parcels:        ['id', 'geom'],
        address_points: ['address_point_id', 'geom'],
      },
      {
        parcel_address_points: ['parcel_id', 'address_point_id', 'computed_at'],
      },
    );
  });

  if (!lockResult.acquired) return;
}

// I1 — link-parcel-addresses.js formerly ran pipeline.run(...) unconditionally
// at module scope (real DB pool on require()). Guarded + exported (C1 precedent).
if (require.main === module) {
  pipeline.run('link-parcel-addresses', main);
}

module.exports = { main, ADVISORY_LOCK_ID, OWN_SLUGS, UPSTREAM_SLUGS };
