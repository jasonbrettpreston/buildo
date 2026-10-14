'use strict';

// ===========================================================================
// scope-retire (Spec 124 R-CI / R-BZ G1+G5) — the step-start stale-cohort floor
// over enrich_parcels_pass3_scope, as RUNNER HYGIENE rather than compute.
// ===========================================================================
//
// WHY THIS LIVES IN THE LIBRARY, NOT IN COMPUTE (Spec 124 R-CI):
// the retirement is hygiene on the DECLARED scope-ledger target
// (`enrich_parcels_pass3_scope`) at STEP START, not part of deriving a parcel's
// values. It is a decision about the ledger's lifecycle — "an unconsumed row
// belonging to a terminal prior run is stale, not pending recovery" — and the
// ledger is the runner's, so the retirement belongs to the runner's library.
// R-BZ G1/G5 states the fence this placement satisfies: the COMPUTE module holds
// no `pipeline_runs` read and issues no DML. The guard below reads `pipeline_runs`
// and the retirement is a DELETE, so neither may sit in `lib/compute/enrich-parcels.js`.
// The step calls this library function with its own pool/client and its run ledger.
//
// EP-PASS3-BACKLOG provenance (WF3, .cursor/wf3_enrich_parcels_pass3_backlog_active_task.md C1,
// 2026-09-15) — `enrich_parcels_pass3_scope` had no expiry. Both the own-run stamp and the
// EP-D10 prune are the LAST things pass 5 does, so a run killed INSIDE pass 5 adds a full
// ~443,023-row cohort that no later run ever retires: measured on cloud 2026-09-15,
// 886,046 rows across 2 cohorts, 100% unconsumed, nothing ever consumed. `retireStaleScope`
// puts a floor under that, at STEP START, applying the ruling EP-D14's own one-off
// (`scripts/one-time/wf3-prune-pass3-scope.js`) already made and a human already executed
// once by hand — an unconsumed row from a terminal prior run is STALE, not pending
// recovery, and deleting it is byte-identical to the legacy per-parcel loop's output.
//
// Fences preserved (Regression Guardian §3, stated for each):
//   1. `run_id <> $1` — THIS run's own rows (including a parcel that threw in THIS run's
//      own stream, the `errorIds` fence at enrich-parcels.js:1509/1684) are NEVER touched.
//   2. The F3 refusal of the one-off script — retirement is skipped outright while ANY
//      OTHER `enrich_parcels` `pipeline_runs` row reads `running`. Encoded in SQL rather
//      than in a human's head; `r.id <> ownRunId` is load-bearing, because THIS run's own
//      ledger row is itself `running` for its entire lifetime.
//   3. The EP-D10 end-of-pass-5 prune (`consumed_at IS NOT NULL`) is untouched and cannot
//      double-count: this DELETE is `consumed_at IS NULL`-only — the two are disjoint.
//
// REPORTING (S3-E5a): the retirement statement also REPORTS whether a live peer held the
// scope, in the SAME snapshot as the guard's own decision — `holder AS (...)` reuses the
// identical `pipeline_runs` predicate as the `NOT EXISTS`, and `eligible AS (...)` counts
// what a held-back retirement left in place. Same statement ⇒ same snapshot ⇒ the report can
// never disagree with what the guard did. `holder_run_id` null means the guard did not trip;
// `rows_retained` null likewise (0 is a real count, never a null).
// ---------------------------------------------------------------------------

/**
 * Retire UNCONSUMED scope rows left behind by runs that never reached pass 5.
 *
 * THE RULING THIS EXECUTES IS ALREADY MADE — it is not re-litigated here.
 * `scripts/one-time/wf3-prune-pass3-scope.js` (EP-D14, run once by hand on 2026-09-09)
 * carries it in full: under `--full` (the only live cloud invocation) an unconsumed row
 * belonging to a terminal prior run is **stale, not pending recovery**. Either the parcel is
 * no longer eligible — the next `--full`'s own hand-off INSERT will not re-spool it — or it
 * is still eligible, in which case the next `--full`'s own stream recomputes it in the same
 * invocation. Neither case needs the stale row; deleting it is byte-identical to the legacy
 * per-parcel loop's output, and the one-off's own header records that "nothing here is
 * load-bearing to preserve". What was missing was only that NOTHING DID IT AUTOMATICALLY:
 * the one-off runs when a human notices, so the backlog was unbounded between incidents.
 * This makes the existing ruling ROUTINE. The one-off script stays — it is the operator's
 * incident tool and its dated backup/restore path has no equivalent here, deliberately.
 *
 * FENCES (Regression Guardian §3), each knowingly preserved:
 *  1. `run_id <> $1` — THIS run's own cohort is never touched, so the `errorIds` carve-out
 *     (`parcel_id <> ALL($3::int[])` at :1509/:1684, the marker that lets a future run
 *     genuinely retry a parcel whose engine threw in this run's stream) is untouched by
 *     construction rather than by a second, parallel exclusion list.
 *  2. The one-off's F3 refusal, encoded in SQL instead of in a human's head: retire nothing
 *     while ANY OTHER `enrich_parcels` invocation shows `running`. `r.id <> $3` is
 *     LOAD-BEARING — this step's own `pipeline_runs` row reads `running` for its entire
 *     lifetime, so without the exclusion the guard would always block and this whole
 *     function would be dead code. (Operator ruling 2026-09-15, plan Q4: a row stuck
 *     `running` for hours is NOT auto-closed here. A hygiene DELETE must not be the thing
 *     that decides a run is dead — that is the §3b reaper's job, filed separately. The
 *     consequence is accepted and honest: while a stranded row exists, retirement is
 *     blocked and `scope_retired_rows` reads 0 with the backlog still reported.)
 *  3. Disjoint from the EP-D10 end-of-pass-5 prune by predicate: that one is
 *     `consumed_at IS NOT NULL`, this one is `consumed_at IS NULL`. No overlap, no
 *     double-count, both directions locked in enrich-parcels-optconfig.logic.test.ts.
 *
 * The age cutoff is derived IN SQL from two bound parameters — the runner's injected DB clock
 * (`pipeline.getDbTimestamp`) minus the tunable — never with `new Date(...)` here (Rule 2 /
 * §5.5's compute-no-wall-clock rule: the clock is the runner's, a library function is not the
 * clock), and never as a `now() - interval '24 hours'` SQL literal: the
 * window is an admin logic variable (`enrich_parcels_scope_retire_after_hours`, Rule 3 —
 * nothing hidden), and a literal would make the tunable inert. Note `created_at DEFAULT
 * now()` returns the TRANSACTION start timestamp and the hand-off INSERT runs inside the
 * shared txn, so this clock dates the shared txn's BEGIN, not the insert — still a usable
 * clock for a 24 h window (a `--full` run is ~3.5-5 h end to end), but it is the txn clock.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client - autocommit; NOT inside the shared txn
 * @param {{runId: number, ownRunId: number|null, retireAfterHours: number, now: Date, tag?: string}} opts
 * @returns {Promise<{backlog_rows: number, backlog_cohorts: number, retired_rows: number, retired_cohorts: number, retire_after_hours: number, cutoff_at: Date, holder_run_id: number|null, rows_retained: number|null}>}
 */
async function retireStaleScope(client, opts) {
  const { runId, ownRunId = null, retireAfterHours, now } = opts || {};
  const TAG = (opts && opts.tag) || '[scope-retire]';
  if (!Number.isFinite(retireAfterHours) || retireAfterHours <= 0) {
    throw new Error(`${TAG} retireStaleScope: retention window must be a positive finite number of hours, got ${retireAfterHours} — check enrich_parcels_scope_retire_after_hours in logic_variables`);
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error(`${TAG} retireStaleScope: opts.now must be the runner's DB clock (pipeline.getDbTimestamp), got ${String(now)}`);
  }
  // Observed BEFORE the DELETE, so the audit rows reconcile:
  // retired + surviving = backlog_at_step_start (Reality-Check §4 invariant).
  // The cutoff is returned BY THE DATABASE (derived from the injected clock and the
  // tunable, the same two parameters the DELETE below uses) so the window that was actually
  // in force travels onto the audit table with the counts — a reader of the rows alone can
  // then tell a 0 that means "nothing was old enough" from a 0 that means "the window is
  // misconfigured". Never re-derived in JS, which would be a second source of truth.
  const observed = await client.query(
    `SELECT count(*)::int AS backlog_rows, count(DISTINCT run_id)::int AS backlog_cohorts,
            ($1::timestamptz - ($2::numeric * interval '1 hour')) AS cutoff_at
       FROM enrich_parcels_pass3_scope WHERE consumed_at IS NULL`,
    [now, retireAfterHours],
  );
  // ONE statement: the guard, the age bound, the holder report and the counting all commit or
  // none do, so a run that dies mid-retirement can never leave a half-retired cohort
  // (idempotent on replay — a second call simply matches nothing).
  //
  // The cutoff is DERIVED IN SQL from two bound parameters — the runner's injected clock
  // ($2, `pipeline.getDbTimestamp`) minus the tunable ($4) — rather than computed here with
  // `new Date(...)`: the clock is the runner's, and a bare `now() - interval '24 hours'`
  // literal would make the admin logic variable inert (Rule 3, nothing hidden). Both halves
  // arrive as parameters; neither is a literal and neither is read from this process's clock.
  //
  // `holder` is byte-for-byte the `NOT EXISTS` predicate in `victims`, hoisted into a CTE so
  // the SAME statement can also REPORT which live peer held the scope. Same statement ⇒ same
  // snapshot ⇒ the report can never disagree with the guard's decision.
  // `eligible` counts what a held-back retirement leaves in place, so `rows_retained` is a
  // measured count, not an inference. Both are null when the guard did not trip (nothing was
  // held); a measured 0 stays 0.
  const retired = await client.query(
    `WITH holder AS (
       SELECT min(r.id)::bigint AS holder_run_id FROM pipeline_runs r
        WHERE r.status = 'running'
          AND r.pipeline LIKE '%enrich_parcels'
          AND ($3::bigint IS NULL OR r.id <> $3)
     ),
     victims AS (
       DELETE FROM enrich_parcels_pass3_scope s
        WHERE s.consumed_at IS NULL
          AND s.run_id <> $1
          AND s.created_at < ($2::timestamptz - ($4::numeric * interval '1 hour'))
          AND NOT EXISTS (
            SELECT 1 FROM pipeline_runs r
             WHERE r.status = 'running'
               AND r.pipeline LIKE '%enrich_parcels'
               AND ($3::bigint IS NULL OR r.id <> $3))
       RETURNING s.run_id
     ),
     eligible AS (
       SELECT count(*)::int AS n FROM enrich_parcels_pass3_scope s
        WHERE s.consumed_at IS NULL
          AND s.run_id <> $1
          AND s.created_at < ($2::timestamptz - ($4::numeric * interval '1 hour'))
     )
     SELECT count(*)::int AS retired_rows, count(DISTINCT run_id)::int AS retired_cohorts,
            (SELECT holder_run_id FROM holder) AS holder_run_id,
            CASE WHEN (SELECT holder_run_id FROM holder) IS NULL THEN NULL ELSE (SELECT n FROM eligible) END AS rows_retained
       FROM victims`,
    [runId, now, ownRunId, retireAfterHours],
  );
  return {
    backlog_rows: observed.rows[0].backlog_rows,
    backlog_cohorts: observed.rows[0].backlog_cohorts,
    retired_rows: retired.rows[0].retired_rows,
    retired_cohorts: retired.rows[0].retired_cohorts,
    retire_after_hours: retireAfterHours,
    cutoff_at: observed.rows[0].cutoff_at,
    holder_run_id: retired.rows[0].holder_run_id == null ? null : Number(retired.rows[0].holder_run_id),
    rows_retained: retired.rows[0].rows_retained == null ? null : Number(retired.rows[0].rows_retained),
  };
}

module.exports = { retireStaleScope };
