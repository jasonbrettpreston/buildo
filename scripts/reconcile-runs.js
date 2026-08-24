#!/usr/bin/env node
/**
 * Reconcile — the Step-0 reaper. Reaps runs that DIED, and says so out loud.
 *
 * A3 (Spec 122 §7.4). Spec 120 §4.1 Step 0 reconciles the previous run once at
 * start, before any work. Islands have no single start — `run-chain.js:167`
 * spawns each step as its own child process — so reconcile would either run 27
 * times, reaping *other steps'* rows, or have no home at all. The resolution is
 * this file: ONE step, at the head of `manifest.chains.sources`.
 *
 * ⚠️ THIS IS THE ONLY WRITER OF `crashed`, AND THAT IS STRUCTURAL.
 * Spec 120 §3.2b: "`failed` means your code ran and reached a verdict, `crashed`
 * means the process died before anything could." `scripts/lib/step/ledger.js`
 * finalizes from a `finally`, and a `finally` by definition only runs while the
 * process is still alive — so it can only ever legitimately write `failed`, and
 * it THROWS if asked for `crashed` (ledger.js:83-87). The rows a dead process
 * left behind in `running` are therefore nobody's but this step's.
 *
 * ⚠️ WHAT THIS REPLACES. `src/app/api/admin/stats/route.ts:188-199` has been
 * auto-failing orphaned `running` rows older than 2 hours — but only when a human
 * loads the admin stats page, and it writes `failed`, which is the exact
 * conflation above. It masked 19 stranded rows for months (filed 2026-08-23,
 * `514568fa`). Under unattended cron those rows wedge Phase B's run-ledger gates
 * permanently, because a gate that reads "the previous run is still running"
 * never fires. A chain step needs no page-load. The admin reaper is left in place
 * for now — retiring it is its own Cross-Domain change with its own regression
 * lock, and two reapers racing is harmless: this one's WHERE clause is a subset.
 *
 * ⚠️ `published_batch` ROLLBACK IS DECLARED BUT NOT ARMED. §7.4 also assigns this
 * step the `published_batch` rollback, which is otherwise ownerless. The table
 * does not exist yet — it arrives with the S4 state-table migrations (246-249,
 * Spec 122 §7.5). The branch below is guarded on `to_regclass` and reports
 * `not_armed` rather than silently doing nothing, so the gap is VISIBLE in the
 * audit table every run instead of being discovered at S4.
 *
 * Claim #85 — the report prints even when empty. A reaper that only speaks when
 * it finds something is indistinguishable from a reaper that never ran.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §7.4
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.2b, §4.1 Step 0
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { z } = require('zod');

// §R2 — lock ID per Spec 47 §A.5. The owning spec is 122, but 122 is taken by
// scripts/one-time/wf2-p13-null-legacy-cost-tail.js and 123 by
// dispatch-notifications.js, so 124 is assigned from the next-free range —
// the compute-phase-calibration precedent.
const ADVISORY_LOCK_ID = 124;

// §R4 — the one knob, validated upfront. A run is "stranded" once it has been
// `running` longer than this. 120 minutes matches the admin reaper's 2 hours
// (stats/route.ts:194) deliberately: this step must not reap rows that reaper
// would have considered live, or the two disagree about what "dead" means.
// The longest measured chain step is well inside an hour; the margin is for a
// cloud runner that stalls rather than dies.
const ConfigSchema = z.object({
  strandedAfterMinutes: z.number().int().min(1).max(60 * 24 * 7),
});

const SLUG = 'reconcile';

pipeline.run(SLUG, async (pool) => {
  // §R5 — startup guard, BEFORE the lock. A bad threshold must fail loud here,
  // not after acquiring a lock and half-reaping.
  const rawMinutes = process.env.RECONCILE_STRANDED_AFTER_MINUTES;
  const config = ConfigSchema.parse({
    strandedAfterMinutes: rawMinutes === undefined || rawMinutes === '' ? 120 : Number(rawMinutes),
  });

  // §R6 — transaction-level advisory lock, auto-released on commit/rollback.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // §R3.5 — DB clock, never new Date(): every timestamp below is written to
    // the DB and compared against `started_at`, which the DB wrote.
    const RUN_AT = await pipeline.getDbTimestamp(pool);

    // ⚠️ NO self-exclusion by name, deliberately. In-chain, run-chain.js:591-604
    // has already INSERTed this step's own `sources:reconcile` row as `running`,
    // seconds ago — the age predicate excludes it structurally. A *previous*
    // reconcile that died IS a legitimate reap target, so excluding the slug by
    // name would make this the one step that can never be reconciled.
    const reaped = await pipeline.withTransaction(pool, async (client) => {
      const res = await client.query(
        `UPDATE pipeline_runs
            SET status = 'crashed',
                completed_at = $1,
                -- ⚠️ LEAST(..., 2147483647): pipeline_runs.duration_ms is INT
                -- (migration 033), and a row stranded ~25 days would overflow it.
                -- Saturating is right here: the exact millisecond count of a run
                -- that died a month ago carries no information, and an overflow
                -- would abort the whole reap transaction.
                duration_ms = COALESCE(
                  duration_ms,
                  LEAST(EXTRACT(EPOCH FROM ($1::timestamptz - started_at)) * 1000, 2147483647)::int
                ),
                error_message = COALESCE(error_message, $3)
          WHERE status = 'running'
            AND started_at < $1::timestamptz - ($2 * INTERVAL '1 minute')
        RETURNING id, pipeline, started_at`,
        [
          RUN_AT,
          config.strandedAfterMinutes,
          `stranded: no terminal status after ${config.strandedAfterMinutes} minutes — reaped by ${SLUG} (Spec 122 §7.4)`,
        ],
      );
      return res.rows;
    });

    // The self-check. If anything is still stranded after the UPDATE, the
    // predicate and the reap disagree — that is a FAIL, not a shrug.
    const remainingRes = await pool.query(
      `SELECT COUNT(*)::int AS stranded,
              COALESCE(MAX(EXTRACT(EPOCH FROM ($1::timestamptz - started_at)) / 60), 0)::int AS oldest_minutes
         FROM pipeline_runs
        WHERE status = 'running'
          AND started_at < $1::timestamptz - ($2 * INTERVAL '1 minute')`,
      [RUN_AT, config.strandedAfterMinutes],
    );
    const remaining = remainingRes.rows[0];

    // How many are running but NOT yet stranded — context for the operator, and
    // the number that makes "0 reaped" readable as healthy rather than blind.
    const liveRes = await pool.query(
      `SELECT COUNT(*)::int AS live
         FROM pipeline_runs
        WHERE status = 'running'
          AND started_at >= $1::timestamptz - ($2 * INTERVAL '1 minute')`,
      [RUN_AT, config.strandedAfterMinutes],
    );
    const live = liveRes.rows[0].live;

    // ── published_batch rollback (§7.4) — declared, guarded, not yet armed ──
    const tableRes = await pool.query(
      `SELECT to_regclass('public.published_batch') IS NOT NULL AS present`,
    );
    //
    // TO BE ARMED AT S4 (migrations 246-249). The rollback is: any
    // `published_batch` row whose producing run this step just moved to
    // `crashed` never completed its Write-Audit-Publish, so its pointer must be
    // rolled back to the prior batch. Writing that against a table that does not
    // exist would be an unexecutable claim (Spec 08 §11), so the branch reports
    // instead of pretending — and it reports a FAIL, not a shrug, so the S4
    // migration cannot land quietly with the owner still unimplemented. It does
    // NOT throw: a hard throw would wedge the whole sources chain on the day the
    // migration applies, which is a worse failure than a red verdict that names
    // exactly what is missing.
    const publishedBatchPresent = tableRes.rows[0].present === true;
    const publishedBatchValue = publishedBatchPresent ? 'TABLE_EXISTS_ROLLBACK_NOT_IMPLEMENTED' : 'not_armed';

    // §R10 — the report, and it PRINTS EVEN WHEN EMPTY (claim #85).
    const rows = [
      {
        metric: 'stranded_reaped',
        value: reaped.length,
        threshold: '== 0 (steady state)',
        status: reaped.length > 0 ? 'WARN' : 'INFO',
      },
      {
        metric: 'stranded_remaining',
        value: remaining.stranded,
        threshold: '== 0',
        status: remaining.stranded > 0 ? 'FAIL' : 'INFO',
      },
      { metric: 'oldest_stranded_minutes', value: remaining.oldest_minutes, threshold: null, status: 'INFO' },
      { metric: 'runs_still_live', value: live, threshold: null, status: 'INFO' },
      { metric: 'threshold_minutes', value: config.strandedAfterMinutes, threshold: null, status: 'INFO' },
      {
        metric: 'published_batch_rollback',
        value: publishedBatchValue,
        threshold: 'not_armed until S4',
        status: publishedBatchPresent ? 'FAIL' : 'INFO',
      },
    ];

    // Row-derived verdict, computed once from the rows — never a parallel
    // boolean (Spec 122 §7.1; the defect class §2.2 catalogues).
    const verdict = rows.some((r) => r.status === 'FAIL')
      ? 'FAIL'
      : rows.some((r) => r.status === 'WARN')
        ? 'WARN'
        : 'PASS';

    pipeline.log.info(
      `[${SLUG}]`,
      `reaped ${reaped.length} stranded run(s) older than ${config.strandedAfterMinutes}m; ` +
        `${live} still live; ${remaining.stranded} still stranded; published_batch=${publishedBatchValue}`,
    );
    for (const r of reaped) {
      // String(), not .toISOString(): node-postgres hands back a Date for
      // timestamptz today, but a driver/type-parser change would turn this
      // logging line into the thing that crashes the reaper.
      pipeline.log.warn(`[${SLUG}]`, `crashed: pipeline_runs#${r.id} "${r.pipeline}" started ${String(r.started_at)}`);
    }

    pipeline.emitSummary({
      // The primary entity is the stranded run. `records_new` is 0 by
      // construction — this step creates nothing, it only terminates rows a
      // dead process left open.
      records_total: reaped.length,
      records_new: 0,
      records_updated: reaped.length,
      records_meta: {
        audit_table: {
          phase: 122,
          name: 'Run Reconciliation',
          verdict,
          rows,
        },
      },
    });

    // §R11
    pipeline.emitMeta(
      { pipeline_runs: ['id', 'pipeline', 'status', 'started_at'] },
      { pipeline_runs: ['status', 'completed_at', 'duration_ms', 'error_message'] },
    );
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted the SKIP summary already
});
