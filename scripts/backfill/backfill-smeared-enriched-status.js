#!/usr/bin/env node
/**
 * Backfill — clear `enriched_status` from rows whose own `status` is not 'Inspection'.
 *
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3 (Write Grain)
 *
 * WHY: `enriched_status` is a PER-ROW refinement of that row's own `status`
 * (Spec 44 §3, shipped in eff28a7e). Before that fix the scraper wrote on
 * `permit_num` alone, smearing one scraped answer across every revision row.
 * This clears the historical residue. C2 (the writer fix) MUST be live first —
 * backfill-first is simply re-smeared.
 *
 * ── C3 IS RE-RUNNABLE BY DESIGN. THIS IS NOT A ONE-OFF. ────────────────────
 * The population REGENERATES with no `enriched_status` write involved at all:
 * `load-permits.js`'s `ON CONFLICT DO UPDATE SET status = EXCLUDED.status`
 * (:340,:357) moves a permit past 'Inspection' while its legitimately-written
 * `enriched_status` stays. Measured evidence: the 97 scraped permits that were
 * 'Pending Closed'/'Closed' — they closed AFTER being scraped.
 * `enriched_status` is DELIBERATELY excluded from that upsert list
 * (classify-permit-phase.js:10-12: "so the permits loader upsert won't conflict")
 * — someone answered exactly half the question and never wrote the other half:
 * what invalidates `enriched_status` when `status` moves out from under it.
 * That missing rule is the real defect; this script clears the symptom.
 * Filed in review_followups.md. Until it lands, this script is re-run.
 * ⇒ THE BACKUP TABLE IS DATED so each run keeps its OWN rollback. The
 *   `wf2-p13` precedent's fixed name + DROP-then-CREATE would silently destroy
 *   the previous run's rollback on the second run. Precedent for the dated form:
 *   scripts/analysis/wf2-reset-coa-trade-classification.js:46.
 *
 * ── PREDICATE: `IS DISTINCT FROM`, never `<>` ──────────────────────────────
 * `status <> 'Inspection'` is UNKNOWN (not TRUE) when `status IS NULL`, so such
 * a row would be SILENTLY SKIPPED — never nulled, never reported as a miss
 * (replay-to-zero cannot see what the predicate structurally excludes), and the
 * cross-checks read `enriched_status` with no `status` gate, so it would fail
 * forever with no way to clear it. `permits.status` is nullable (no CHECK) and
 * 2 NULL-status rows exist today. Spec 47 §6.4 mandates IS DISTINCT FROM on
 * write-guarded UPDATEs. Both predicates return an identical count today.
 *
 * ── WHAT THIS DELETES IS PARTLY DELIBERATE — the fences ────────────────────
 * (a) `Revision Issued` rows: ACCIDENTAL. Origin 91ed25d3 wrote on permit_num
 *     alone while the queue kept `p.status = 'Inspection'` — writer and reader
 *     disagreed from day one. No fence.
 * (b) `Pending Closed`/`Closed` rows: DELIBERATELY PRESERVED by 4c5009ca's
 *     FEED-STATUS GUARD (Severity: HIGH + Lesson-routing footer) — "a permit the
 *     feed calls closed is not stalled". Operator ruling e4a7b6e6 made
 *     'Active Inspection' the RESTING value of a finished permit.
 *     FENCE STATEMENT: that guard existed to stop finished permits drifting to a
 *     sticky 'Stalled'. NULL still covers it — NULL fails computeStalled signal 1
 *     (lifecycle-phase.ts:646) MORE strongly than 'Active Inspection' did — and
 *     under e4a7b6e6's own ruling the preserved value carries no completion
 *     truth; `permits.status` does. KNOWINGLY RETIRED.
 * (c) `enriched_status='Stalled'` on non-Inspection rows: DELIBERATELY WRITTEN
 *     by the pre-C2 sweep, whose 8-word denylist left 'Revision Issued' /
 *     'Permit Issued' / "Examiner's Notice Sent" eligible. Reported per-value
 *     below so the operator sees exactly what is being deleted.
 *
 * ── ATOMICITY: the backup MUST contain exactly the rows the UPDATE nulls ────
 * The advisory lock serializes this script against ITSELF only — not against
 * classify_permit_phase (~11:00Z), the scraper / classify_inspection_status
 * (~15:00Z), or load-permits (which changes `status`, i.e. how a row ENTERS this
 * predicate). Under READ COMMITTED each statement takes a fresh snapshot, so a
 * row entering the predicate between the backup and the UPDATE would be nulled
 * WITHOUT a backup — unrecoverable. Hence REPEATABLE READ + count inside the
 * transaction + a hard backup/update row-count equality assert.
 *
 * RESTORE (per run — substitute the dated table printed by that run):
 *   UPDATE permits p SET enriched_status = b.enriched_status, last_seen_at = b.last_seen_at
 *     FROM _backup_smeared_enriched_status_<YYYYMMDD> b
 *    WHERE p.permit_num = b.permit_num AND p.revision_num = b.revision_num;
 *
 * Usage:  node scripts/backfill/backfill-smeared-enriched-status.js [--confirm]
 *   (no flag = DRY RUN: counts and reports, writes nothing)
 */
'use strict';

const pipeline = require('./../lib/pipeline');

// §R2 — Spec 47 §A.5. Adopts the §R1-R12 skeleton BY CHOICE: 47:5-6 scopes the
// spec to chain-step scripts and this is a one-off, so the skeleton is a
// deliberate adoption (precedent: scripts/one-time/wf2-p13-null-legacy-cost-tail.js),
// not a compliance obligation. §R4 (Zod config) and §R5 (startup guards) are N/A —
// this script reads no logic vars and no env beyond the pool.
const ADVISORY_LOCK_ID = 44;

// The one predicate, defined once. IS DISTINCT FROM, never <> — see header.
const SMEAR_PREDICATE = "enriched_status IS NOT NULL AND status IS DISTINCT FROM 'Inspection'";

function backupTableName(runAt) {
  const d = new Date(runAt);
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `_backup_smeared_enriched_status_${stamp}`;
}

async function runBackfill(pool, { confirm = false } = {}) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool); // §R3.5 — DB clock, never new Date()
    const backupTable = backupTableName(RUN_AT);

    // ── Report BEFORE writing: the status breakdown AND the enriched_status
    // VALUE breakdown. The value breakdown is what shows the operator that some
    // of this data was deliberately written (fence (c) above) — a status-only
    // breakdown hides that.
    const { rows: byStatus } = await pool.query(
      `SELECT status, enriched_status, COUNT(*)::int AS n
         FROM permits WHERE ${SMEAR_PREDICATE}
        GROUP BY status, enriched_status ORDER BY n DESC`,
    );
    const { rows: byValue } = await pool.query(
      `SELECT enriched_status, COUNT(*)::int AS n
         FROM permits WHERE ${SMEAR_PREDICATE}
        GROUP BY enriched_status ORDER BY n DESC`,
    );
    const evaluated = byStatus.reduce((s, r) => s + r.n, 0);

    pipeline.log.info('[backfill-smeared-enriched-status]', 'Scope computed at run time', {
      evaluated,
      by_enriched_status: byValue.map((r) => `${r.enriched_status}=${r.n}`),
      top_pairs: byStatus.slice(0, 8).map((r) => `${r.status}/${r.enriched_status}=${r.n}`),
      deliberate_stalled_rows: byValue.find((r) => r.enriched_status === 'Stalled')?.n ?? 0,
    });

    // Early idempotent return — precedent wf2-p13:56-61. Nothing to back up,
    // nothing to null, no empty dated table left behind.
    if (evaluated === 0) {
      pipeline.log.info('[backfill-smeared-enriched-status]', 'Nothing to correct — already clean');
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          confirmed: confirm, backup_table: null,
          audit_table: {
            phase: 44, name: 'Smeared enriched_status backfill', verdict: 'PASS',
            rows: [{ metric: 'smeared_rows_evaluated', value: 0, threshold: null, status: 'INFO' }],
          },
        },
      });
      return { evaluated: 0, corrected: 0, backupTable: null, confirmed: confirm };
    }

    if (!confirm) {
      // Pattern A, default-safe — precedent scripts/analysis/backfill-admin-watchlist.js:108-112.
      // A DELIBERATE deviation from this directory's backfill-permits-location.js,
      // whose --dry-run defaults to WRITE. Default-safe is load-bearing here: this
      // dry-run count is also the empirical proof named by
      // scripts/tests/test_scraper_enriched_status_scoping.py's stated ceiling.
      pipeline.log.warn('[backfill-smeared-enriched-status]',
        `DRY RUN (no --confirm) — ${evaluated} rows WOULD be corrected. No writes. Re-run with --confirm.`);
      pipeline.emitSummary({
        records_total: evaluated, records_new: 0, records_updated: 0,
        records_meta: {
          confirmed: false, backup_table: null,
          audit_table: {
            phase: 44, name: 'Smeared enriched_status backfill (DRY RUN)', verdict: 'PASS',
            rows: [
              { metric: 'smeared_rows_evaluated', value: evaluated, threshold: null, status: 'INFO' },
              { metric: 'rows_corrected', value: 0, threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      return { evaluated, corrected: 0, backupTable: null, confirmed: false };
    }

    const corrected = await pipeline.withTransaction(pool, async (client) => {
      // ATOMICITY — see header. REPEATABLE READ gives the backup and the UPDATE
      // ONE snapshot, so the backup provably contains exactly the rows nulled.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

      // Backup FIRST — a destructive NULL-out with no rollback path is not
      // acceptable (Gemini P9 ruling, 6af3d537). Dated name: this script re-runs.
      // Captures last_seen_at too, because we bump it below.
      const backup = await client.query(
        `CREATE TABLE ${backupTable} AS
           SELECT permit_num, revision_num, status, enriched_status, last_seen_at
             FROM permits WHERE ${SMEAR_PREDICATE}`,
      );

      // FOLD 2 — bump last_seen_at. enriched_status is NOT a dirty key for
      // classify-lifecycle-phase.js:1005-1007; without this bump, rows that have
      // LEFT the CKAN feed keep lifecycle_stalled = true with its basis deleted,
      // and compute-trade-forecasts.js filters on that flag in four places.
      // Both existing enriched_status writers bump it in the same UPDATE
      // (classify-inspection-status.js:82-83, classify-permit-phase.js:49-50).
      // NOTE: last_seen_at, NOT last_scraped_at — the don't-touch ruling is about
      // the latter (the 7-day scraper cooldown) and is untouched here.
      const upd = await client.query(
        `UPDATE permits SET enriched_status = NULL, last_seen_at = $1::timestamptz
          WHERE ${SMEAR_PREDICATE}`,
        [RUN_AT],
      );

      // The backup is the ONLY rollback. If it does not contain exactly what we
      // nulled, fail LOUDLY rather than leave unrecoverable rows behind.
      if (backup.rowCount !== upd.rowCount) {
        throw new Error(
          `[backfill-smeared-enriched-status] ABORT — backup/update row mismatch: ` +
          `backed up ${backup.rowCount}, nulled ${upd.rowCount}. Transaction rolled back.`,
        );
      }
      return upd.rowCount;
    });

    pipeline.log.info('[backfill-smeared-enriched-status]', 'Corrected', {
      corrected, backup_table: backupTable,
      restore: `UPDATE permits p SET enriched_status = b.enriched_status, last_seen_at = b.last_seen_at ` +
               `FROM ${backupTable} b WHERE p.permit_num = b.permit_num AND p.revision_num = b.revision_num;`,
    });

    // §11 counter semantics (Spec 47 §11, :1980/:1982): records_total = primary
    // entity rows EVALUATED; records_updated = rows that CHANGED.
    pipeline.emitSummary({
      records_total: evaluated, records_new: 0, records_updated: corrected,
      records_meta: {
        confirmed: true, backup_table: backupTable,
        audit_table: {
          phase: 44, name: 'Smeared enriched_status backfill', verdict: 'PASS',
          rows: [
            { metric: 'smeared_rows_evaluated', value: evaluated, threshold: null, status: 'INFO' },
            { metric: 'rows_corrected', value: corrected, threshold: null, status: 'INFO' },
          ],
        },
      },
    });

    // §R11 — declare EVERY column read, including the backup SELECT's (the
    // precedent under-reports its reads and corrupts the data-lineage map).
    pipeline.emitMeta(
      { permits: ['permit_num', 'revision_num', 'status', 'enriched_status', 'last_seen_at'] },
      { permits: ['enriched_status', 'last_seen_at'] },
    );

    return { evaluated, corrected, backupTable, confirmed: true };
  });

  if (!lockResult.acquired) return null; // §R12 — SDK already emitted the SKIP summary
  return lockResult.result;
}

module.exports = { runBackfill, SMEAR_PREDICATE, ADVISORY_LOCK_ID, backupTableName };

// The require.main guard WRAPS pipeline.run. No repo script combines the two —
// without this, a test that require()s this module to reach runBackfill would
// call createPool() and start a real destructive run against whatever
// SUPABASE_DATABASE_URL / PG_HOST is in .env.
if (require.main === module) {
  const confirm = process.argv.includes('--confirm');
  pipeline.run('backfill-smeared-enriched-status', async (pool) => {
    await runBackfill(pool, { confirm });
  });
}
