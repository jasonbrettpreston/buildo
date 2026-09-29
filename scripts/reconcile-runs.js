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
 * it THROWS if asked for `crashed` (`ledger.js:89`, the
 * `finalizeLedgerRow refuses to write 'crashed'` guard — line number
 * re-measured 2026-09-15; the previous `:83-87` citation had drifted ~3 lines.
 * Cite by the greppable message, not the line). The rows a dead process
 * left behind in `running` are therefore nobody's but this step's.
 *
 * ⚠️ WHAT THIS REPLACED — AND, AS OF 2026-09-15, WHAT IT NOW SOLELY OWNS.
 * `GET /api/admin/stats` used to auto-fail orphaned `running` rows older than
 * 2 hours, but only when a human loaded the admin stats page, and it wrote
 * `failed` — the exact conflation above. It masked 19 stranded rows for months
 * (filed 2026-08-23, `514568fa`).
 *
 * That call site is **DELETED** (WF3 SEC-1, Spec 128 ASK-12 Q2(a)): a dashboard
 * GET must not write. The sentence this block used to carry — "the admin reaper
 * is left in place for now… two reapers racing is harmless" — is now FALSE and
 * is replaced by the current truth:
 *
 *   • **This file is the SOLE reaper.** There is no second one.
 *   • **Sources-chain only, weekly.** It reaps when `manifest.chains.sources`
 *     runs (weekday-scheduled cron), not on demand. The retired admin reaper
 *     fired on any page load, so the interim cadence is COARSER, not finer.
 *   • **Heartbeat-aware — ONE declared rule (WF2 one-reaper-rule, 2026-09-29).**
 *     A `running` row is stranded only when `started_at` is older than logic
 *     variable `run_stranded_after_minutes` (default 120 — the old 2 h floor,
 *     so nothing is reaped earlier than before) AND its
 *     `records_meta.last_heartbeat_at` is absent or older than
 *     `run_heartbeat_fresh_minutes` (default 30). A `chain_<id>` row is spared
 *     while any `<id>:<step>` row is running with a fresh heartbeat. Spared rows
 *     are counted in the audit table, never silent. See `STRANDED_SQL` below.
 *   • **`RECONCILE_STRANDED_AFTER_MINUTES` is RETIRED** (declared here and in
 *     Spec 122 §7.4 — a descriptor-less R-AP `runner_owned` step has no
 *     `config.retired[]` host). No env override remains; tune the two logic
 *     variables in the admin panel ("Pipeline Staleness Thresholds").
 *   • **Named residual (Spec 128 ASK-12):** `src/lib/admin/reap-stale-runs.ts`
 *     is left untouched and uncalled — it keeps its own 30 min / 2 h literals
 *     and writes `failed`; the ASK-12 `SCHEDULED` job that adopts it must
 *     reconcile it with this rule.
 *   • **The guard PRECEDES this step** — `scripts/check-chain-running.js` runs
 *     before chain Step 0, so a stranded `chain_sources` row makes every
 *     dispatch skip until the guard's own 12 h TTL expires: the reaper sits
 *     downstream of the gate it would open. Filed HIGH in
 *     `docs/reports/review_followups.md`; operator workaround is to clear the
 *     row before dispatching, never by re-dispatching (runbook §3b).
 *   • **No wedge, though.** A stranded row does NOT silently disable a
 *     run-ledger gate: `scripts/lib/source-version.js` E-R2 makes an
 *     unterminated upstream row force the consumer to **RUN**, so the failure
 *     direction is lost savings, never skipped work.
 *
 * `reapStaleRunningRows` + `src/tests/db/admin-stats-reaper.db.test.ts` are
 * RETAINED (and locked as present) for the ASK-12 `SCHEDULED` JOB to call —
 * that JOB, not this step, is the ruled long-run home.
 *
 * ⚠️ `published_batch` ROLLBACK IS DECLARED BUT NOT ARMED. §7.4 also assigns this
 * step the `published_batch` rollback, which is otherwise ownerless. The table
 * does not exist yet — it arrives with the S4 state-table migration at the
 * next free migration number (`ls migrations | tail -1`; the Spec 122 §7.5
 * reservation is exhausted). Tracked as programme item STA-1. The branch below
 * is guarded on `to_regclass` and reports
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

// §R4 — the ONE stranded rule (WF2 one-reaper-rule, 2026-09-29; Spec 124 Rule 3).
// Both thresholds are registered logic variables (scripts/seeds/logic_variables.json,
// admin group "Pipeline Staleness Thresholds"); their bounds are READ from the seed
// entry, never restated here. The env var RECONCILE_STRANDED_AFTER_MINUTES is RETIRED.
// A `running` row is stranded iff
//   started_at < RUN_AT − run_stranded_after_minutes   (the 2 h floor, unchanged)
//   AND its heartbeat is absent or older than run_heartbeat_fresh_minutes
//   AND, for a `chain_<id>` row, no `<id>:<step>` row is running with a fresh heartbeat
//       (run-chain.js writes `chain_${chainId}` and `${chainId}:${slug}` rows).
// Written ONCE and shared by the reap, `stranded_remaining` and `runs_still_live`.
// Params: $1 = RUN_AT, $2 = run_stranded_after_minutes, $3 = run_heartbeat_fresh_minutes.
const SEED = require('./seeds/logic_variables.json');
const RULE_KEYS = {
  strandedAfterMinutes: 'run_stranded_after_minutes',
  heartbeatFreshMinutes: 'run_heartbeat_fresh_minutes',
};
const bounded = (key) => z.number().int().min(SEED[key].min).max(SEED[key].max);
const ConfigSchema = z.object({
  strandedAfterMinutes: bounded(RULE_KEYS.strandedAfterMinutes),
  heartbeatFreshMinutes: bounded(RULE_KEYS.heartbeatFreshMinutes),
});
// A heartbeat is a timestamp ONLY if it looks like one; anything else (a
// malformed string) is treated as NO heartbeat rather than aborting the reap
// transaction on a failed cast. Regex guard, not pg_input_is_valid (PG16+; dev
// runs PG15). ONE definition, used for the row itself and the chain child.
const hbTs = (textExpr) =>
  `(CASE WHEN ${textExpr} ~ '^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}' THEN (${textExpr})::timestamptz END)`;
const HB = hbTs(`(pipeline_runs.records_meta->>'last_heartbeat_at')`);
const FRESH_CUTOFF = `$1::timestamptz - ($3 * INTERVAL '1 minute')`;
const HAS_FRESH_HB = `(${HB} IS NOT NULL AND ${HB} >= ${FRESH_CUTOFF})`;
const STRANDED_SQL = `(pipeline_runs.status = 'running'
    AND pipeline_runs.started_at < $1::timestamptz - ($2 * INTERVAL '1 minute')
    AND NOT ${HAS_FRESH_HB}
    AND NOT (starts_with(pipeline_runs.pipeline, 'chain_') AND EXISTS (
      SELECT 1 FROM pipeline_runs c
       WHERE c.status = 'running'
         AND starts_with(c.pipeline, substr(pipeline_runs.pipeline, 7) || ':')
         AND ${hbTs(`(c.records_meta->>'last_heartbeat_at')`)} >= ${FRESH_CUTOFF})))`;

// §R5 — load + validate the rule BEFORE the lock. A present-but-invalid value
// THROWS here (never after acquiring the lock and half-reaping). A MISSING row
// falls back to the seed default and is reported as a `rule_source_<key>` FAIL
// row — the chain keeps running and reaps; the red verdict names the gap
// (e.g. `apply-logic-variables.js` not yet run against this DB).
async function loadRule(pool) {
  const { rows } = await pool.query(
    `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1)`,
    [Object.values(RULE_KEYS)],
  );
  const db = new Map(rows.map((r) => [r.variable_key, Number(r.variable_value)]));
  const raw = {};
  const sources = {};
  for (const [field, key] of Object.entries(RULE_KEYS)) {
    raw[field] = db.has(key) ? db.get(key) : SEED[key].default;
    sources[field] = db.has(key) ? 'db' : 'seed_default';
  }
  const config = ConfigSchema.parse(raw);
  // Fold A5 — the widest per-step heartbeat cadence (every `*_heartbeat_minutes`).
  const hbRes = await pool.query(
    `SELECT MAX(variable_value)::float8 AS max_minutes
       FROM logic_variables
      WHERE variable_key LIKE '%\\_heartbeat\\_minutes'`,
  );
  return { config, sources, maxHeartbeatMinutes: hbRes.rows[0].max_minutes };
}

const SLUG = 'reconcile';

pipeline.run(SLUG, async (pool) => {
  const { config, sources, maxHeartbeatMinutes } = await loadRule(pool);

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
                error_message = COALESCE(
                  error_message,
                  'stranded (' || CASE WHEN ${HB} IS NULL THEN 'no heartbeat' ELSE 'stale heartbeat' END || '): ' || $4::text
                )
          WHERE ${STRANDED_SQL}
        RETURNING id, pipeline, started_at, (${HB} IS NULL) AS no_heartbeat`,
        [
          RUN_AT,
          config.strandedAfterMinutes,
          config.heartbeatFreshMinutes,
          `no terminal status after ${config.strandedAfterMinutes} minutes and no heartbeat within ${config.heartbeatFreshMinutes} minutes — reaped by ${SLUG} (Spec 122 §7.4)`,
        ],
      );
      return res.rows;
    });

    // The self-check — the SAME predicate as the reap (STRANDED_SQL, fold A2).
    // Anything still matching it after the UPDATE means the two disagree: a
    // FAIL, not a shrug. A spared row (fresh heartbeat / live chain child) does
    // not match, so it never raises this count.
    const ruleParams = [RUN_AT, config.strandedAfterMinutes, config.heartbeatFreshMinutes];
    const remainingRes = await pool.query(
      `SELECT COUNT(*)::int AS stranded,
              COALESCE(MAX(EXTRACT(EPOCH FROM ($1::timestamptz - started_at)) / 60), 0)::int AS oldest_minutes
         FROM pipeline_runs
        WHERE ${STRANDED_SQL}`,
      ruleParams,
    );
    const remaining = remainingRes.rows[0];

    // Running and NOT stranded — live, including rows spared past the floor.
    // Spared rows are counted by reason, never silent.
    const liveRes = await pool.query(
      `SELECT COUNT(*)::int AS live,
              COUNT(*) FILTER (WHERE started_at < $1::timestamptz - ($2 * INTERVAL '1 minute')
                                 AND ${HAS_FRESH_HB})::int AS spared_fresh,
              COUNT(*) FILTER (WHERE started_at < $1::timestamptz - ($2 * INTERVAL '1 minute')
                                 AND NOT ${HAS_FRESH_HB})::int AS spared_chain
         FROM pipeline_runs
        WHERE status = 'running' AND NOT ${STRANDED_SQL}`,
      ruleParams,
    );
    const { live, spared_fresh: sparedFresh, spared_chain: sparedChain } = liveRes.rows[0];

    // ── published_batch rollback (§7.4) — declared, guarded, not yet armed ──
    const tableRes = await pool.query(
      `SELECT to_regclass('public.published_batch') IS NOT NULL AS present`,
    );
    //
    // TO BE ARMED AT S4 (next free migration number — `ls migrations | tail -1`;
    // the Spec 122 §7.5 reservation is exhausted; STA-1). The rollback is: any
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
      { metric: 'stranded_after_minutes', value: config.strandedAfterMinutes, threshold: null, status: 'INFO' },
      { metric: 'heartbeat_fresh_minutes', value: config.heartbeatFreshMinutes, threshold: null, status: 'INFO' },
      {
        metric: 'published_batch_rollback',
        value: publishedBatchValue,
        threshold: 'not_armed until S4',
        status: publishedBatchPresent ? 'FAIL' : 'INFO',
      },
      { metric: 'reaped_no_heartbeat', value: reaped.filter((r) => r.no_heartbeat).length, threshold: null, status: 'INFO' },
      { metric: 'reaped_stale_heartbeat', value: reaped.filter((r) => !r.no_heartbeat).length, threshold: null, status: 'INFO' },
      { metric: 'spared_fresh_heartbeat', value: sparedFresh, threshold: null, status: 'INFO' },
      { metric: 'spared_chain_live_child', value: sparedChain, threshold: null, status: 'INFO' },
      // Fold A4 — a missing logic_variables row reaps on the seed default but
      // turns the verdict red, naming the key.
      ...Object.entries(RULE_KEYS).map(([field, key]) => ({
        metric: `rule_source_${key}`,
        value: sources[field] === 'db' ? 'db' : `seed_default: ${key} missing from logic_variables`,
        threshold: '== db',
        status: sources[field] === 'db' ? 'INFO' : 'FAIL',
      })),
      // Fold A5 — the fresh window must cover at least two heartbeat intervals.
      {
        metric: 'heartbeat_window_margin',
        value: `fresh=${config.heartbeatFreshMinutes} max_heartbeat=${maxHeartbeatMinutes ?? 'none'}`,
        threshold: 'fresh >= 2 x max *_heartbeat_minutes',
        status:
          maxHeartbeatMinutes != null && config.heartbeatFreshMinutes < 2 * maxHeartbeatMinutes ? 'WARN' : 'INFO',
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
