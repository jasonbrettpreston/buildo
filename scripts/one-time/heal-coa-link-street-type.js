#!/usr/bin/env node
/**
 * Address-type WF2 brief M — one-time heal of CoA links that sit on a
 * DIFFERENT street type than the CoA's own street name.
 *
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §3 (level 0 — street type)
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9 (CoA→parcel link) + §6.8 (lock 4201)
 * SPEC LINK: migrations/257_address_points_street_type.sql (the column this class exists because of)
 *
 * WHY THIS EXISTS: 2026-10-10 cloud-measured (Spec 54 §3 level 0): a CoA application `ca`
 * with `parcel_linked_at IS NOT NULL` and a live `lead_parcels` row `lp`
 * (`lp.lead_id = ca.lead_id`, `lp.match_type IN ('address_points_exact','tier_1a_exact')`)
 * is WRONG when the linked parcel carries at least one live address point
 * (`retired_at IS NULL`) whose number + linear name match the CoA's own, whose
 * COALESCE(address_points.street_type_normalized, parcels.street_type_normalized) IS NOT NULL,
 * and NONE of those matching address points carries the CoA's own parsed street type
 * (`parseLinearName(ca.street_name).street_type`). The type column was only added by mig 257
 * (NULL until the next load_address_points run), so these links were produced before the
 * disambiguating type existed at all: the Tier 1a bridge could match a "12 Main AVE" CoA onto a
 * parcel whose only matching address point is "12 Main ST".
 *
 * THE MEASURED CLASS is withdrawn to NULL/NOT-LINKED here (not re-linked): the correct parcel
 * for these rows is either the one the corrected linker will find on the re-run, or none. The
 * CoA is left exactly as the pre-link state expects (`parcel_linked_at = NULL`, no lead_parcels
 * row), so `scripts/link-coa-to-parcels.js` re-derives the link with the type now available.
 *
 * NEVER blind-UPDATE (Rule 1's own spirit — transactional, backed up, count-asserted):
 *   1. BACKUP the exact lead_parcels rows being withdrawn (+ coa id + prior parcel_linked_at).
 *   2. DELETE those lead_parcels rows by (lead_id, parcel_id) — assert deleted == backed up.
 *   3. UPDATE coa_applications SET parcel_linked_at = NULL for those CoA ids — assert the count.
 * All three in ONE transaction; any mismatch throws and the whole thing rolls back.
 *
 * ATOMICITY: REPEATABLE READ gives the candidate SELECT, the backup and the writes ONE snapshot,
 * so the backup provably contains exactly the rows removed — the same pattern as
 * scripts/one-time/wf3-prune-pass3-scope.js.
 *
 * RESTORE (per run — substitute the dated/timed table printed by that run):
 *   INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence, matched_at)
 *     SELECT lead_id, parcel_id, match_type, confidence, matched_at
 *       FROM _backup_coa_link_street_type_<YYYYMMDD>_<HHMMSS>;
 *   UPDATE coa_applications ca
 *      SET parcel_linked_at = b.prior_parcel_linked_at
 *     FROM _backup_coa_link_street_type_<YYYYMMDD>_<HHMMSS> b
 *    WHERE ca.id = b.coa_id;
 * ⚠ This restore is valid ONLY before the NEXT link-coa-to-parcels run. Once that run has
 *   executed, it will have re-inserted its own lead_parcels rows under the same PK
 *   (lead_id, parcel_id) — re-inserting the backup on top would collide, and resetting
 *   parcel_linked_at would contradict the fresh, type-correct link.
 *
 * Usage:  node -r dotenv/config scripts/one-time/heal-coa-link-street-type.js [--confirm]
 *   (no flag = DRY RUN: prints candidate/selected counts + match_type breakdown + first 10
 *    (coa id, application number) pairs, writes nothing)
 *   Then re-run: node -r dotenv/config scripts/link-coa-to-parcels.js
 *
 * Usage block ends; require.main guard + pipeline.run mirror wf3-prune-pass3-scope.js.
 */
'use strict';

const pipeline = require('../lib/pipeline');
const {
  parseLinearName,
  normalizeAddressNumber,
} = require('../lib/address-normalizers');

// §R2 — this one-off's OWN lock (Spec 47 §A.5): 127 and 130 are claimed by the H6 port (load_bylaw_map_areas, link_parcel_abutments), 129 by load-coa-notices → 131,
// Spec 47 §A.5 — the wf3-prune-pass3-scope.js precedent (own lock + a probe of the step's lock).
const ADVISORY_LOCK_ID = 131;

// The CoA→parcel linker's own lock (Spec 42 §6.8 Phase D allocation). This script mutates the
// same rows link-coa-to-parcels.js owns, so it refuses to start while the linker holds it (probe).
const LINK_COA_LOCK_ID = 4201; // scripts/link-coa-to-parcels.js ADVISORY_LOCK_ID

const TAG = '[heal-coa-link-street-type]';

// The two match_types the brief names as in-scope (Address-type WF2 brief M selector).
const IN_SCOPE_MATCH_TYPES = ['address_points_exact', 'tier_1a_exact'];

function backupTableName(runAt) {
  // `runAt` is ALREADY a `Date` (pipeline.getDbTimestamp's pg-driver-parsed `NOW()` result) —
  // no `new Date(...)` re-wrap needed (`new Date()` is banned in pipeline scripts, §47 §R3.5,
  // argument-agnostic by design — "Time Cop").
  // <YYYYMMDD>_<HHMMSS> (not date-only): this is a manual, human-triggered one-off that could
  // genuinely run twice inside the same UTC day — date-only would collide on the SECOND run
  // (CREATE TABLE without IF NOT EXISTS) and fail the whole heal. Same reasoning as
  // wf3-prune-pass3-scope.js.
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${runAt.getUTCFullYear()}${pad(runAt.getUTCMonth() + 1)}${pad(runAt.getUTCDate())}_${pad(runAt.getUTCHours())}${pad(runAt.getUTCMinutes())}${pad(runAt.getUTCSeconds())}`;
  return `_backup_coa_link_street_type_${stamp}`;
}

/**
 * Fetch the candidate rows ONCE (every live lead_parcels row on a linked CoA of the two in-scope
 * match_types), then evaluate the type check per row in JS — the brief's "fetch candidates once;
 * evaluate per row or with one unnest query" instruction, taken as the per-row form so the parser
 * (JS-only, single implementation per Spec 54 §3 step 3) is the ONLY source of truth for `t`.
 *
 * @returns {Promise<{ scanned: number, selected: Array<{lead_id:string,parcel_id:number,coa_id:number,application_number:string|null}> }>}
 */
async function selectRows(client) {
  const candidates = await client.query(
    `SELECT lp.lead_id,
            lp.parcel_id,
            lp.match_type,
            ca.id               AS coa_id,
            ca.application_number,
            ca.street_num,
            ca.street_name,
            ca.street_name_normalized,
            ca.parcel_linked_at
       FROM lead_parcels lp
       JOIN coa_applications ca
         ON ca.lead_id = lp.lead_id
      WHERE lp.lead_id LIKE 'coa:%'
        AND lp.match_type = ANY($1::text[])
        AND ca.parcel_linked_at IS NOT NULL
      ORDER BY ca.id, lp.parcel_id`,
    [IN_SCOPE_MATCH_TYPES],
  );

  const scanned = candidates.rowCount;
  const selected = [];

  for (const row of candidates.rows) {
    const t = parseLinearName(row.street_name).street_type;
    if (!t) continue; // brief: skip rows whose parsed type is '' (unconstrained).

    const addrNum = normalizeAddressNumber(row.street_num);
    if (!addrNum) continue; // nothing to match an address point on.
    if (!row.street_name_normalized) continue;

    // Does the linked parcel hold AT LEAST ONE live address point whose number+name match the
    // CoA's own, whose COALESCEd type is NOT NULL, and NONE of which carries the CoA's own type?
    //   1) any live ap matching number+name with a NON-NULL coalesced type  → EXISTS
    //   2) any live ap matching number+name with coalesced type = t        → EXISTS
    // Wrong ⇔ EXISTS(1) AND NOT EXISTS(2).
    const check = await client.query(
      `SELECT
         EXISTS (
           SELECT 1
             FROM parcel_address_points pap
             JOIN address_points ap ON ap.address_point_id = pap.address_point_id
             JOIN parcels p2        ON p2.id = pap.parcel_id
            WHERE pap.parcel_id = $1
              AND ap.retired_at IS NULL
              AND ap.addr_num_normalized = $2
              AND ap.linear_name_normalized = $3
              AND COALESCE(ap.street_type_normalized, p2.street_type_normalized) IS NOT NULL
         ) AS has_other_type_point,
         EXISTS (
           SELECT 1
             FROM parcel_address_points pap
             JOIN address_points ap ON ap.address_point_id = pap.address_point_id
             JOIN parcels p2        ON p2.id = pap.parcel_id
            WHERE pap.parcel_id = $1
              AND ap.retired_at IS NULL
              AND ap.addr_num_normalized = $2
              AND ap.linear_name_normalized = $3
              AND COALESCE(ap.street_type_normalized, p2.street_type_normalized) = $4
         ) AS has_own_type_point`,
      [row.parcel_id, addrNum, row.street_name_normalized, t],
    );

    const { has_other_type_point: hasOther, has_own_type_point: hasOwn } = check.rows[0];
    if (hasOther && !hasOwn) {
      selected.push({
        lead_id: row.lead_id,
        parcel_id: row.parcel_id,
        match_type: row.match_type,
        coa_id: row.coa_id,
        application_number: row.application_number,
      });
    }
  }

  return { scanned, selected };
}

async function runHeal(pool, { confirm = false } = {}) {
  // ── REFUSED while the CoA→parcel linker is live ─────────────────────────────
  // An acquire-and-release probe on link-coa-to-parcels.js's OWN advisory lock (4201, single-key):
  // `pipeline.run`-based invocations hold it for the WHOLE step. The probe goes through
  // `pipeline.withAdvisoryLock` itself (Spec 47 §5 — the footgun gate bans direct advisory-lock
  // SQL in scripts; a raw advisory-lock probe is exactly that ban's target).
  // A `pipeline_runs` row assert adds a second, independent signal (the lock probe alone could
  // miss a run between COMMIT and its own final `status='completed'` UPDATE).
  const linkProbe = await pipeline.withAdvisoryLock(pool, LINK_COA_LOCK_ID, async () => ({ probed: true }));
  if (!linkProbe.acquired) {
    throw new Error(`${TAG} REFUSED — the CoA→parcel linker's advisory lock (${LINK_COA_LOCK_ID}) is held elsewhere (a live link-coa-to-parcels invocation). Re-run after it finishes.`);
  }
  const runningRow = await pool.query(
    `SELECT id FROM pipeline_runs WHERE pipeline LIKE '%link-coa-to-parcels' AND status = 'running' LIMIT 1`,
  );
  if (runningRow.rowCount) {
    throw new Error(`${TAG} REFUSED — pipeline_runs row ${runningRow.rows[0].id} shows a link-coa-to-parcels invocation still 'running'. Re-run after it finishes.`);
  }

  // Now take THIS script's own outer lock (131) over the whole heal, so a second heal cannot run
  // concurrently. The heal is ONE REPEATABLE READ transaction, and the linker only picks up
  // rows with parcel_linked_at IS NULL, so a linker started mid-heal cannot see the withdrawn rows
  // before COMMIT (the wf3-prune-pass3-scope.js posture).
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool); // §R3.5 — DB clock, never new Date()
    const backupTable = backupTableName(RUN_AT);

    // ✅ Short-circuit: compute candidates + evaluate on ONE snapshot.
    // The evaluation reads (parcel_address_points/address_points/parcels) and the selection are
    // both inside a REPEATABLE READ transaction; the --confirm path re-reads candidates INSIDE its
    // own REPEATABLE READ txn so the backup and the writes share ONE snapshot.
    const probe = await pipeline.withTransaction(pool, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      return selectRows(client);
    });

    const { scanned, selected } = probe;

    pipeline.log.info(TAG, 'Candidates scanned', {
      scanned,
      selected: selected.length,
    });

    // Breakdown by match_type (audit only — no addresses/names).
    const byMatchType = {};
    for (const r of selected) byMatchType[r.match_type] = (byMatchType[r.match_type] || 0) + 1;

    // First 10 (coa id, application number) pairs ONLY — never an address or a name.
    const sample = selected.slice(0, 10).map((r) => ({ coa_id: r.coa_id, application_number: r.application_number }));

    if (selected.length === 0) {
      pipeline.log.info(TAG, 'Nothing to heal — no CoA link sits on another street type');
      pipeline.emitSummary({
        records_total: scanned, records_new: 0, records_updated: 0,
        records_meta: {
          confirmed: confirm, backup_table: null,
          by_match_type: byMatchType,
          audit_table: {
            phase: 54, name: 'heal CoA links on another street type', verdict: 'PASS',
            rows: [
              { metric: 'coa_link_candidates_scanned', value: scanned, threshold: null, status: 'INFO' },
              { metric: 'coa_links_selected', value: 0, threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      return { scanned, selected: 0, healed: 0, backupTable: null, confirmed: confirm, byMatchType, sample };
    }

    if (!confirm) {
      pipeline.log.warn(TAG,
        `DRY RUN (no --confirm) — ${selected.length} of ${scanned} candidate links WOULD be withdrawn (parcel_linked_at=NULL + lead_parcels deleted). No writes. Re-run with --confirm.`);
      pipeline.emitSummary({
        records_total: scanned, records_new: 0, records_updated: 0,
        records_meta: {
          confirmed: false, backup_table: null,
          by_match_type: byMatchType,
          sample,
          audit_table: {
            phase: 54, name: 'heal CoA links on another street type (DRY RUN)', verdict: 'PASS',
            rows: [
              { metric: 'coa_link_candidates_scanned', value: scanned, threshold: null, status: 'INFO' },
              { metric: 'coa_links_selected', value: selected.length, threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      return { scanned, selected: selected.length, healed: 0, backupTable: null, confirmed: false, byMatchType, sample };
    }

    // ── --confirm: ONE transaction, backup → delete → update, all count-asserted ──
    const healed = await pipeline.withTransaction(pool, async (client) => {
      // ATOMICITY — see header. REPEATABLE READ gives the selection, the backup and the writes
      // ONE snapshot, so the backup provably contains exactly the rows removed.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

      // Re-select INSIDE this txn so the backup is computed from the SAME snapshot as the writes.
      const { selected: locked } = await selectRows(client);
      if (locked.length === 0) return { count: 0, coaIds: [] };

      const leadIds = locked.map((r) => r.lead_id);
      const parcelIds = locked.map((r) => r.parcel_id);

      // 1. BACKUP the exact lead_parcels rows being withdrawn, plus the CoA id and its prior
      //    parcel_linked_at so RESTORE can undo step 3 too. A destructive write with no rollback
      //    path is not acceptable (same ruling wf3-prune-pass3-scope.js cites).
      const backup = await client.query(
        `CREATE TABLE ${backupTable} AS
           SELECT lp.*,
                  ca.id               AS coa_id,
                  ca.parcel_linked_at AS prior_parcel_linked_at
             FROM lead_parcels lp
             JOIN coa_applications ca ON ca.lead_id = lp.lead_id
             JOIN unnest($1::text[], $2::int[]) AS v(lead_id, parcel_id)
               ON v.lead_id = lp.lead_id AND v.parcel_id = lp.parcel_id`,
        [leadIds, parcelIds],
      );

      // 2. DELETE exactly those (lead_id, parcel_id) rows.
      const del = await client.query(
        `DELETE FROM lead_parcels lp
          USING unnest($1::text[], $2::int[]) AS v(lead_id, parcel_id)
          WHERE lp.lead_id = v.lead_id AND lp.parcel_id = v.parcel_id`,
        [leadIds, parcelIds],
      );

      // The backup is the ONLY rollback. If it does not contain exactly what we deleted,
      // fail LOUDLY rather than leave unrecoverable rows behind.
      if (backup.rowCount !== del.rowCount) {
        throw new Error(
          `${TAG} ABORT — backup/delete row mismatch: backed up ${backup.rowCount}, deleted ${del.rowCount}. Transaction rolled back.`,
        );
      }

      // 3. Reset parcel_linked_at on those CoA applications.
      const coaIds = [...new Set(locked.map((r) => r.coa_id))];
      const upd = await client.query(
        `UPDATE coa_applications SET parcel_linked_at = NULL WHERE id = ANY($1::bigint[])`,
        [coaIds],
      );
      // Assert: every selected CoA was (a) linked (selector precondition) and (b) distinct — so
      // the update must touch exactly one row per distinct selected coa_id.
      if (upd.rowCount !== coaIds.length) {
        throw new Error(
          `${TAG} ABORT — coa_applications update count mismatch: expected ${coaIds.length}, updated ${upd.rowCount}. Transaction rolled back.`,
        );
      }

      return { count: del.rowCount, coaIds };
    });

    pipeline.log.info(TAG, 'Healed', {
      healed: healed.count,
      coa_updated: healed.coaIds.length,
      backup_table: backupTable,
      // The caveat travels WITH the printed SQL, not only in the source header an operator
      // copy-pasting from the log will never see.
      restore: `INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence, matched_at) SELECT lead_id, parcel_id, match_type, confidence, matched_at FROM ${backupTable}; UPDATE coa_applications ca SET parcel_linked_at = b.prior_parcel_linked_at FROM ${backupTable} b WHERE ca.id = b.coa_id; -- valid ONLY before the NEXT link-coa-to-parcels run`,
    });

    // §11 counter semantics (Spec 47 §11): records_total = primary entity rows EVALUATED;
    // a pure withdrawal mutates no surviving row, so records_new/records_updated are 0 with the
    // real count in the audit_table (§11.2 overflow rule).
    pipeline.emitSummary({
      records_total: scanned, records_new: 0, records_updated: 0,
      records_meta: {
        confirmed: true, backup_table: backupTable,
        by_match_type: byMatchType,
        sample,
        audit_table: {
          phase: 54, name: 'heal CoA links on another street type', verdict: 'PASS',
          rows: [
            { metric: 'coa_link_candidates_scanned', value: scanned, threshold: null, status: 'INFO' },
            { metric: 'coa_links_selected', value: selected.length, threshold: null, status: 'INFO' },
            { metric: 'lead_parcels_deleted', value: healed.count, threshold: null, status: 'INFO' },
            { metric: 'coa_applications_unlinked', value: healed.coaIds.length, threshold: null, status: 'INFO' },
          ],
        },
      },
    });

    // §R11 — declare every column read/written.
    pipeline.emitMeta(
      {
        lead_parcels: ['lead_id', 'parcel_id', 'match_type', 'confidence', 'matched_at'],
        coa_applications: ['id', 'lead_id', 'application_number', 'street_num', 'street_name', 'street_name_normalized', 'parcel_linked_at'],
        address_points: ['id', 'retired_at', 'addr_num_normalized', 'linear_name_normalized', 'street_type_normalized'],
        parcel_address_points: ['parcel_id', 'address_point_id'],
        parcels: ['id', 'street_type_normalized'],
      },
      {
        lead_parcels: ['lead_id', 'parcel_id'],
        coa_applications: ['id', 'parcel_linked_at'],
      },
    );

    return { scanned, selected: selected.length, healed: healed.count, backupTable, confirmed: true, byMatchType, sample };
  });

  if (!lockResult.acquired) return null; // §R12 — SDK already emitted the SKIP summary
  return lockResult.result;
}

module.exports = {
  runHeal,
  selectRows,
  ADVISORY_LOCK_ID,
  LINK_COA_LOCK_ID,
  IN_SCOPE_MATCH_TYPES,
  backupTableName,
};

// The require.main guard WRAPS pipeline.run — precedent wf3-prune-pass3-scope.js.
if (require.main === module) {
  const confirm = process.argv.includes('--confirm');
  pipeline.run('heal-coa-link-street-type', async (pool) => {
    await runHeal(pool, { confirm });
  });
}
