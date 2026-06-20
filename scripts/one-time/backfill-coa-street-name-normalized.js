#!/usr/bin/env node
/**
 * One-time backfill: populate coa_applications.street_name_normalized for rows that carry a raw
 * street_name but have a NULL normalized JOIN key.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md (link), docs/specs/01-pipeline/54_source_address_points.md (bridge JOIN key)
 *
 * Why this exists: the 2026-06 dev-DB rebuild repopulated coa_applications but left ~30.4K
 * historical CoAs with a raw street_name (+street_num) yet NULL street_name_normalized. Because
 * link-coa-to-parcels Tier 1a matches on the NORMALIZED key (Spec 54 bridge), those rows can never
 * link -> never get zoning enrichment (Spec 58 §8d coa coverage gate FAILed at 7.3%). load-coa.js
 * already normalizes on every upsert (line 228, normalizeStreetName) but only for the records it
 * processes, and the active-only incremental load never re-touched the historical rows.
 *
 * This script re-applies the SAME normalizer (scripts/lib/address.normalizeStreetName) to the
 * existing raw data — no CKAN dependency. After it runs, reset parcel_linked_at on the unlinked
 * CoAs and re-run link_coa_to_parcels (it will now match them via the bridge) then enrich_coa_zoning.
 *
 * Operational characteristics:
 *   - Idempotent: only touches rows where street_name IS NOT NULL AND street_name_normalized IS NULL.
 *     Re-running after completion is a no-op (no pending rows). Rows whose raw name normalizes to
 *     empty are skipped (left NULL — genuinely unnormalizable) and the monotonic id cursor advances
 *     past them, so there is no infinite loop.
 *   - Monotonic id cursor + batched: per-batch lock duration stays small (NOT a migrate.js txn —
 *     same mig-162 / footprint-geom precedent: a 30K-row UPDATE shouldn't hold a long txn lock).
 *   - Advisory lock 118 — single instance at a time.
 *
 * Usage: node -r dotenv/config scripts/one-time/backfill-coa-street-name-normalized.js
 */
'use strict';

const pipeline = require('../lib/pipeline');
const { safeParseIntOrNull } = require('../lib/safe-math');
const { normalizeStreetName } = require('../lib/address');

const TAG = '[backfill-coa-street-name-normalized]';
const ADVISORY_LOCK_ID = 118;
const BATCH_SIZE = 5000;

const PENDING_PREDICATE = `lead_id IS NOT NULL AND street_name IS NOT NULL AND street_name_normalized IS NULL`;

pipeline.run('backfill-coa-street-name-normalized', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();

    const { rows: preRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM coa_applications WHERE ${PENDING_PREDICATE}`,
    );
    const pendingTotal = safeParseIntOrNull(preRows[0].total) ?? 0;
    pipeline.log.info(TAG, `Pre-run: ${pendingTotal.toLocaleString()} CoAs have raw street_name but NULL normalized`);

    let totalNormalized = 0; // rows we wrote a non-empty normalized value to
    let totalUnnormalizable = 0; // raw present but normalizer returned empty
    let iteration = 0;
    let errors = 0;
    let lastId = 0;

    while (true) {
      iteration++;
      try {
        // Pull a batch by monotonic id cursor (ordered) — index-range scan, no re-walk.
        const { rows: batch } = await pool.query(
          `SELECT id, street_name FROM coa_applications
            WHERE id > $1 AND ${PENDING_PREDICATE}
            ORDER BY id ASC
            LIMIT $2`,
          [lastId, BATCH_SIZE],
        );
        if (batch.length === 0) {
          pipeline.log.info(TAG, `Backfill complete after ${iteration - 1} batch(es)`);
          break;
        }

        // Compute the normalized key in JS (same fn load-coa uses). Skip rows whose raw name
        // normalizes to empty — they stay NULL (genuinely unnormalizable) but the cursor advances.
        const ids = [];
        const norms = [];
        for (const r of batch) {
          const norm = normalizeStreetName(r.street_name);
          if (norm) { ids.push(r.id); norms.push(norm); }
          else totalUnnormalizable++;
          if (r.id > lastId) lastId = r.id; // advance regardless so skipped rows aren't re-selected
        }

        if (ids.length > 0) {
          const res = await pipeline.withTransaction(pool, async (client) =>
            client.query(
              `UPDATE coa_applications ca
                  SET street_name_normalized = v.norm
                 FROM unnest($1::bigint[], $2::text[]) AS v(id, norm)
                WHERE ca.id = v.id`,
              [ids, norms],
            ),
          );
          totalNormalized += res.rowCount ?? 0;
        }

        pipeline.log.info(
          TAG,
          `Batch ${iteration}: normalized ${ids.length} (running ${totalNormalized.toLocaleString()}/${pendingTotal.toLocaleString()}, cursor id=${lastId})`,
        );
      } catch (err) {
        errors++;
        pipeline.log.error(TAG, err, { iteration });
        break;
      }
    }

    const elapsedMs = Date.now() - t0;
    const { rows: postRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM coa_applications WHERE ${PENDING_PREDICATE}`,
    );
    const remaining = safeParseIntOrNull(postRows[0].total) ?? 0;

    const auditRows = [
      { metric: 'pending_pre_run', value: pendingTotal, threshold: null, status: 'INFO' },
      { metric: 'normalized_written', value: totalNormalized, threshold: null, status: 'INFO' },
      { metric: 'unnormalizable_skipped', value: totalUnnormalizable, threshold: null, status: totalUnnormalizable > 0 ? 'WARN' : 'INFO' },
      { metric: 'remaining_pending', value: remaining, threshold: '== unnormalizable', status: remaining <= totalUnnormalizable ? 'PASS' : 'FAIL' },
      { metric: 'errors', value: errors, threshold: '== 0', status: errors === 0 ? 'PASS' : 'FAIL' },
      { metric: 'sys_duration_ms', value: elapsedMs, threshold: null, status: 'INFO' },
    ];
    const verdict = auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                  : auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

    pipeline.log.info(TAG, `Done. Normalized ${totalNormalized.toLocaleString()} in ${elapsedMs}ms. ${remaining.toLocaleString()} still pending (raw name normalizes to empty).`);

    pipeline.emitSummary({
      records_total: pendingTotal,
      records_new: 0,
      records_updated: totalNormalized,
      records_meta: {
        duration_ms: elapsedMs,
        normalized_written: totalNormalized,
        unnormalizable_skipped: totalUnnormalizable,
        remaining_pending: remaining,
        audit_table: { phase: 42, name: 'CoA street_name_normalized backfill', verdict, rows: auditRows },
      },
    });
    pipeline.emitMeta(
      { coa_applications: ['id', 'lead_id', 'street_name', 'street_name_normalized'] },
      { coa_applications: ['street_name_normalized'] },
    );
  });

  if (!lockResult.acquired) return;
});
