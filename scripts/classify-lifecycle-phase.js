#!/usr/bin/env node
/**
 * Classify Lifecycle Phase — Strangler Fig V1 classifier.
 *
 * Reads dirty rows from `permits` and `coa_applications`, applies the
 * pure function in scripts/lib/lifecycle-phase.js, and writes the
 * computed `lifecycle_phase` + `lifecycle_stalled` + `lifecycle_classified_at`
 * back to the DB via `IS DISTINCT FROM`-guarded UPDATEs.
 *
 * Runs as a standalone pipeline_runs entry. Triggered by:
 *   - `scripts/trigger-lifecycle-sync.js` (final step of permits + CoA chains)
 *   - Manual CLI: `node scripts/classify-lifecycle-phase.js`
 *
 * Incremental: only re-classifies rows where
 *   `lifecycle_classified_at IS NULL OR last_seen_at > lifecycle_classified_at`.
 * First-run backfill processes all ~237K permits + ~33K CoAs in one pass.
 * Typical incremental runs process ~5K-15K rows in 2-5 seconds.
 *
 * SPEC LINK: docs/reports/lifecycle_phase_implementation.md §2.3
 */
'use strict';

const pipeline = require('./lib/pipeline');
const {
  classifyLifecyclePhase,
  classifyCoaPhase,
  DEAD_STATUS_ARRAY,
  NORMALIZED_DEAD_DECISIONS_ARRAY,
} = require('./lib/lifecycle-phase');
const { loadMarketplaceConfigs } = require('./lib/config-loader');

// ─────────────────────────────────────────────────────────────────
// Batch UPDATE SQL builders — batched via VALUES clause to avoid
// 65535-parameter PG limit. Batch size 500 × 4 params = 2000 params
// per UPDATE, well under the limit.
// ─────────────────────────────────────────────────────────────────

const PERMIT_BATCH_SIZE = 500;
const COA_BATCH_SIZE = 1000;

function buildPermitUpdateSQL(batchSize) {
  const tuples = [];
  for (let i = 0; i < batchSize; i++) {
    const base = i * 4;
    tuples.push(
      `($${base + 1}::varchar, $${base + 2}::varchar, $${base + 3}::varchar, $${base + 4}::boolean)`,
    );
  }
  // Phase 2 state machine: phase_started_at is stamped ONLY when
  // lifecycle_phase actually changes (IS DISTINCT FROM), NOT when only
  // lifecycle_stalled changes. This creates the immutable "start time"
  // anchor required for countdown math. If only stalled changed, the
  // existing phase_started_at is preserved.
  return `
    UPDATE permits p
       SET lifecycle_phase = v.phase,
           lifecycle_stalled = v.stalled,
           lifecycle_classified_at = NOW(),
           phase_started_at = CASE
             WHEN p.lifecycle_phase IS DISTINCT FROM v.phase
             THEN NOW()
             ELSE p.phase_started_at
           END
      FROM (VALUES ${tuples.join(', ')}) AS v(permit_num, revision_num, phase, stalled)
     WHERE p.permit_num = v.permit_num
       AND p.revision_num = v.revision_num
       AND (p.lifecycle_phase IS DISTINCT FROM v.phase
            OR p.lifecycle_stalled IS DISTINCT FROM v.stalled)
  `;
}

function buildCoaUpdateSQL(batchSize) {
  const tuples = [];
  for (let i = 0; i < batchSize; i++) {
    const base = i * 3;
    tuples.push(`($${base + 1}::int, $${base + 2}::varchar, $${base + 3}::boolean)`);
  }
  // WF3 2026-04-13 — lifecycle_stalled added (migration 094).
  // IS DISTINCT FROM guard on EITHER phase or stalled so we don't
  // bump lifecycle_classified_at when nothing actually changed.
  return `
    UPDATE coa_applications ca
       SET lifecycle_phase = v.phase,
           lifecycle_stalled = v.stalled,
           lifecycle_classified_at = NOW()
      FROM (VALUES ${tuples.join(', ')}) AS v(id, phase, stalled)
     WHERE ca.id = v.id
       AND (ca.lifecycle_phase IS DISTINCT FROM v.phase
            OR ca.lifecycle_stalled IS DISTINCT FROM v.stalled)
  `;
}

function flattenPermitBatch(rows) {
  const out = [];
  for (const r of rows) {
    out.push(r.permit_num, r.revision_num, r.phase, r.stalled);
  }
  return out;
}

function flattenCoaBatch(rows) {
  const out = [];
  for (const r of rows) {
    out.push(r.id, r.phase, r.stalled);
  }
  return out;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Main run
// ─────────────────────────────────────────────────────────────────

// Startup validation — `<> ALL(ARRAY[]::text[])` is vacuously true
// in Postgres, which would silently zero-out the unclassified count.
if (DEAD_STATUS_ARRAY.length === 0) {
  throw new Error('DEAD_STATUS_ARRAY is empty — refusing to run');
}
if (NORMALIZED_DEAD_DECISIONS_ARRAY.length === 0) {
  throw new Error('NORMALIZED_DEAD_DECISIONS_ARRAY is empty — refusing to run');
}

// Advisory lock ID — must be stable across runs so two classifier
// instances contend for the same lock. Chosen as the migration number
// (085) to keep the ID human-traceable to the feature that added it.
// See adversarial review C1: without this, two chains finishing close
// in time would each fire the classifier and race on the UPDATE set.
const ADVISORY_LOCK_ID = 85;

pipeline.run('classify-lifecycle-phase', async (pool) => {
  const now = new Date();

  // ═══════════════════════════════════════════════════════════
  // Load Control Panel (WF3 2026-04-13)
  // ═══════════════════════════════════════════════════════════
  // Pulls `coa_stall_threshold` (logic_variables, default 30 days) used
  // to flag CoAs stuck in P1/P2 for too long. Falls back gracefully if
  // the control panel query fails.
  const { logicVars } = await loadMarketplaceConfigs(pool, 'classify-lifecycle-phase');
  const COA_STALL_THRESHOLD_DAYS = logicVars.coa_stall_threshold;

  // ═══════════════════════════════════════════════════════════
  // Concurrency guard — single-threaded classifier
  // ═══════════════════════════════════════════════════════════
  //
  // CRITICAL: We must hold the advisory lock on a DEDICATED client
  // (pool.connect), NOT via pool.query. pool.query checks out an
  // ephemeral connection, runs the query, and immediately returns it
  // to the pool. During the 20-60s CPU-bound Map-building phase where
  // no SQL queries execute, the pool's default idleTimeoutMillis (10s)
  // can reap that connection — silently releasing the lock mid-run.
  // A dedicated client stays checked out (not idle in the pool) for
  // the full run duration. See WF3 Bug #1.
  const lockClient = await pool.connect();
  try {
    const { rows: lockRows } = await lockClient.query(
      'SELECT pg_try_advisory_lock($1) AS got',
      [ADVISORY_LOCK_ID],
    );
    if (!lockRows[0].got) {
      pipeline.log.info(
        '[classify-lifecycle-phase]',
        `Advisory lock ${ADVISORY_LOCK_ID} already held by another classifier instance — skipping this run.`,
      );
      pipeline.emitSummary({
        records_total: 0,
        records_new: 0,
        records_updated: 0,
        records_meta: {
          skipped: true,
          reason: 'advisory_lock_held_elsewhere',
          advisory_lock_id: ADVISORY_LOCK_ID,
        },
      });
      pipeline.emitMeta({}, {});
      // CRITICAL: release the lockClient BEFORE returning. Without
      // this, the return escapes before the outer try/finally where
      // lockClient.release() lives, leaking one pool connection on
      // every skipped run. Found by independent review, Item 1.
      lockClient.release();
      return;
    }
  } catch (lockErr) {
    lockClient.release();
    throw lockErr;
  }

  try {
  // ═══════════════════════════════════════════════════════════
  // Phase 1: classify dirty permit rows
  // ═══════════════════════════════════════════════════════════
  //
  // We AVOID correlated subqueries in the dirty-permit query because
  // `is_orphan` previously used split_part() on both sides of an
  // equality, which defeats index usage and produces O(n²) behaviour
  // across 243K permits (→ multi-hour classifier run).
  //
  // Instead we do three O(n) passes:
  //   1. Load the minimal dirty-permit columns (partial index covers this)
  //   2. Load BLD/CMB permit_nums and build Map<prefix, Set<permit_num>>
  //      for in-memory orphan detection
  //   3. Load inspection rollups via SQL aggregation (Postgres returns
  //      ~10K pre-aggregated rows, not the full 94K raw table)
  //   4. Classify each dirty permit in JS using the two Maps
  //
  // WATERMARK RACE NOTE (WF3 Bug #5, document only):
  // Between the dirty-SELECT and the per-batch UPDATE that writes
  // lifecycle_classified_at = NOW(), a concurrent writer (e.g.,
  // load-permits.js or link-coa.js) can bump a permit's last_seen_at.
  // The classifier sees stale data for that row but stamps it with a
  // classified_at AFTER the concurrent writer's last_seen_at, so the
  // row won't appear dirty on the NEXT run — meaning the stale
  // classification sticks until another pipeline step bumps
  // last_seen_at again. This is the accepted best-effort incremental
  // trade-off: the next daily chain run will re-classify with fresh
  // data. No code fix needed — the alternative (SELECT FOR UPDATE)
  // would block the entire permits pipeline for ~170s.

  pipeline.log.info('[classify-lifecycle-phase]', 'Querying dirty permits...');
  const permitsResult = await pool.query(
    `SELECT permit_num, revision_num, status, enriched_status, issued_date, last_seen_at,
            lifecycle_phase AS old_phase, permit_type, neighbourhood_id
       FROM permits
      WHERE lifecycle_classified_at IS NULL
         OR last_seen_at > lifecycle_classified_at`,
  );
  const dirtyPermits = permitsResult.rows;
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Dirty permits: ${dirtyPermits.length.toLocaleString()}`,
  );

  // Build orphan-detection map: prefix ("YY NNNNNNN") → Set of permit_nums
  // for permits whose third token is BLD or CMB. A dirty permit is an
  // orphan iff no OTHER permit with the same prefix is in the set.
  pipeline.log.info('[classify-lifecycle-phase]', 'Building BLD/CMB prefix map...');
  const bldCmbResult = await pool.query(
    `SELECT permit_num FROM permits
      WHERE split_part(permit_num, ' ', 3) IN ('BLD','CMB')`,
  );
  const bldCmbByPrefix = new Map();
  for (const row of bldCmbResult.rows) {
    const parts = row.permit_num.split(' ');
    if (parts.length < 3) continue;
    const prefix = `${parts[0]} ${parts[1]}`;
    let set = bldCmbByPrefix.get(prefix);
    if (!set) {
      set = new Set();
      bldCmbByPrefix.set(prefix, set);
    }
    set.add(row.permit_num);
  }
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `BLD/CMB prefixes tracked: ${bldCmbByPrefix.size.toLocaleString()}`,
  );

  // Build inspection rollup map — SQL-side aggregation so Node receives
  // ~10K rows (one per permit with inspections) instead of the full 94K+
  // raw permit_inspections table. Postgres is faster at this than JS, and
  // the approach avoids shipping 94K rows over the wire and building a
  // manual rollup in a for-loop. See WF3 Bug #2.
  pipeline.log.info('[classify-lifecycle-phase]', 'Building inspection rollup map...');
  const inspResult = await pool.query(
    `WITH latest_passed AS (
       SELECT DISTINCT ON (permit_num) permit_num, stage_name
         FROM permit_inspections
        WHERE status = 'Passed'
        ORDER BY permit_num, inspection_date DESC NULLS LAST, stage_name
     ),
     rollup AS (
       SELECT permit_num,
              MAX(inspection_date) AS latest_inspection_date,
              BOOL_OR(status = 'Passed') AS has_passed_inspection
         FROM permit_inspections
        GROUP BY permit_num
     )
     SELECT r.permit_num,
            lp.stage_name AS latest_passed_stage,
            r.latest_inspection_date,
            r.has_passed_inspection
       FROM rollup r
       LEFT JOIN latest_passed lp USING (permit_num)`,
  );
  const inspByPermit = new Map();
  for (const row of inspResult.rows) {
    inspByPermit.set(row.permit_num, {
      latest_passed_stage: row.latest_passed_stage,
      latest_inspection_date: row.latest_inspection_date
        ? new Date(row.latest_inspection_date) : null,
      has_passed_inspection: row.has_passed_inspection,
    });
  }
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Inspection rollups built for ${inspByPermit.size.toLocaleString()} permits`,
  );

  // Apply pure function to every dirty row — all lookups are O(1)
  const EMPTY_INSP = {
    latest_passed_stage: null,
    latest_inspection_date: null,
    has_passed_inspection: false,
  };
  const permitUpdates = dirtyPermits.map((row) => {
    const parts = row.permit_num.split(' ');
    let is_orphan = true;
    if (parts.length >= 3) {
      const prefix = `${parts[0]} ${parts[1]}`;
      const siblings = bldCmbByPrefix.get(prefix);
      if (siblings) {
        // Orphan iff no OTHER permit_num in the set — matches the
        // original SQL semantics (s.permit_num <> p.permit_num).
        for (const pn of siblings) {
          if (pn !== row.permit_num) {
            is_orphan = false;
            break;
          }
        }
      }
    }
    const insp = inspByPermit.get(row.permit_num) || EMPTY_INSP;
    const result = classifyLifecyclePhase({
      status: row.status,
      enriched_status: row.enriched_status,
      issued_date: row.issued_date,
      is_orphan,
      latest_passed_stage: insp.latest_passed_stage,
      latest_inspection_date: insp.latest_inspection_date,
      has_passed_inspection: insp.has_passed_inspection,
      now,
    });
    return {
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      phase: result.phase,
      stalled: result.stalled,
      // Phase 2 state machine: carry the old phase + context for
      // transition logging. old_phase is the value BEFORE this run's
      // classification. If old_phase !== phase, we log a transition.
      old_phase: row.old_phase,
      permit_type: row.permit_type,
      neighbourhood_id: row.neighbourhood_id,
    };
  });

  let permitsUpdated = 0;
  let transitionsLogged = 0;
  if (permitUpdates.length > 0) {
    // Per-batch small transactions — each batch commits independently.
    //
    // Design notes (adversarial review C2 + independent Defect 1):
    //   • The prior version wrapped all 484 batches in ONE transaction,
    //     holding row-level locks on every dirty permit for ~130s during
    //     the first-run backfill. That blocked concurrent writers.
    //   • It also ran the `classified_at` stamp for unchanged rows
    //     OUTSIDE the transaction, creating a consistency gap where a
    //     crash after phase-commit but before stamp-commit would leave
    //     the "unchanged rows" bucket unable to drain on future runs.
    //   • Fix: each batch's phase UPDATE + per-batch stamp UPDATE run
    //     together inside a single small withTransaction. Locks are
    //     released between batches (concurrent writers can interleave),
    //     and phase+stamp always commit atomically per batch.
    const batches = chunkArray(permitUpdates, PERMIT_BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const sql = buildPermitUpdateSQL(batch.length);
      const params = flattenPermitBatch(batch);
      const batchPnums = batch.map((r) => r.permit_num);
      const batchRnums = batch.map((r) => r.revision_num);

      // Identify rows in this batch where lifecycle_phase actually
      // changes (not just stalled). These are the transitions we log.
      //
      // Suppress intra-bucket time-driven transitions (HIGH-1 from
      // adversarial + independent reviews): P7a/P7b/P7c are purely
      // time-bucketed sub-phases — a P7a→P7b "transition" is just
      // the permit aging past 30 days, not a real construction event.
      // Logging these would flood the calibration table with thousands
      // of tautological 60-day "transitions." Same for O2↔O3 (orphan
      // active → orphan stalled at 180 days).
      // P7d (Not Started) is NOT suppressed — P7d→P7a means the status
      // changed from "Work Not Started" to "Permit Issued", which IS real.
      const TIME_BUCKET_GROUPS = {
        P7a: 'P7_time', P7b: 'P7_time', P7c: 'P7_time',
        O2: 'O_time', O3: 'O_time',
      };
      const transitions = batch.filter((r) => {
        if (r.phase === r.old_phase || r.phase === null) return false;
        // Suppress intra-bucket shifts
        const oldGroup = TIME_BUCKET_GROUPS[r.old_phase];
        const newGroup = TIME_BUCKET_GROUPS[r.phase];
        if (oldGroup && oldGroup === newGroup) return false;
        return true;
      });

      await pipeline.withTransaction(pool, async (client) => {
        // (a) Phase/stalled UPDATE + conditional phase_started_at stamp.
        const result = await client.query(sql, params);
        permitsUpdated += result.rowCount || 0;

        // (b) Log phase transitions to permit_phase_transitions.
        // Only fires for rows where the phase actually changed (not
        // stalled-only). Runs inside the same transaction so the
        // permit row and its transition history are always consistent.
        if (transitions.length > 0) {
          const tVals = [];
          const tParams = [];
          for (let j = 0; j < transitions.length; j++) {
            const t = transitions[j];
            // 6 params per row (NOW() is inline SQL, not a param).
            // CRITICAL fix: was j*7, causing param misalignment on
            // batches with 2+ transitions. Adversarial CRITICAL-1.
            const base = j * 6;
            tVals.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, NOW(), $${base + 5}, $${base + 6}::int)`,
            );
            tParams.push(
              t.permit_num, t.revision_num,
              t.old_phase,  // from_phase (NULL on first classification)
              t.phase,      // to_phase
              t.permit_type,
              t.neighbourhood_id,
            );
          }
          const insertResult = await client.query(
            `INSERT INTO permit_phase_transitions
               (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id)
             VALUES ${tVals.join(', ')}`,
            tParams,
          );
          transitionsLogged += insertResult.rowCount || 0;
        }

        // (c) Stamp classified_at for every row in this batch that is
        // still dirty (last_seen_at > classified_at). This covers both
        // (i) rows just updated by (a) — redundant, idempotent — and
        // (ii) rows (a) skipped because phase was already correct.
        await client.query(
          `UPDATE permits
              SET lifecycle_classified_at = NOW()
            FROM unnest($1::text[], $2::text[]) AS t(permit_num, revision_num)
           WHERE permits.permit_num = t.permit_num
             AND permits.revision_num = t.revision_num
             AND (permits.lifecycle_classified_at IS NULL
                  OR permits.last_seen_at > permits.lifecycle_classified_at)`,
          [batchPnums, batchRnums],
        );
      });

      // Progress log every 50 batches
      if ((i + 1) % 50 === 0 || i === batches.length - 1) {
        pipeline.log.info(
          '[classify-lifecycle-phase]',
          `Permits batch ${i + 1}/${batches.length} (${permitsUpdated.toLocaleString()} updated so far)`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 2: classify dirty CoA rows
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[classify-lifecycle-phase]', 'Querying dirty CoAs...');
  // WF3 2026-04-13 — days_since_activity computed in SQL so the pure
  // classifier stays portable (no `new Date()` in the library). Days is
  // since the most recent activity signal we have (last_seen_at).
  // Adversarial Probe 6: NULL last_seen_at must not silently degrade to
  // days_since_activity = 0. `GREATEST(0, NULL) = NULL` → Number(null) = 0
  // in JS, masking the null. Use an explicit CASE so the classifier sees
  // null (→ stalled=false, the only safe default for unknown activity).
  const coaResult = await pool.query(
    `SELECT id, decision, linked_permit_num, status, last_seen_at,
            CASE
              WHEN last_seen_at IS NULL THEN NULL
              ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 86400.0)
            END::float AS days_since_activity
       FROM coa_applications
      WHERE lifecycle_classified_at IS NULL
         OR last_seen_at > lifecycle_classified_at`,
  );
  const dirtyCoAs = coaResult.rows;
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Dirty CoAs: ${dirtyCoAs.length.toLocaleString()} (stall threshold=${COA_STALL_THRESHOLD_DAYS}d)`,
  );

  const coaUpdates = dirtyCoAs.map((row) => {
    const result = classifyCoaPhase({
      decision: row.decision,
      linked_permit_num: row.linked_permit_num,
      status: row.status,
      daysSinceActivity: row.days_since_activity,
      stallThresholdDays: COA_STALL_THRESHOLD_DAYS,
    });
    return { id: row.id, phase: result.phase, stalled: result.stalled };
  });

  let coasUpdated = 0;
  if (coaUpdates.length > 0) {
    // Per-batch small transactions — same design as the permit path.
    // Phase UPDATE + per-batch classified_at stamp run under a single
    // withTransaction so partial commits are impossible.
    const batches = chunkArray(coaUpdates, COA_BATCH_SIZE);
    for (const batch of batches) {
      const sql = buildCoaUpdateSQL(batch.length);
      const params = flattenCoaBatch(batch);
      const batchIds = batch.map((r) => r.id);

      await pipeline.withTransaction(pool, async (client) => {
        const result = await client.query(sql, params);
        coasUpdated += result.rowCount || 0;

        await client.query(
          `UPDATE coa_applications
              SET lifecycle_classified_at = NOW()
            WHERE id = ANY($1::int[])
              AND (lifecycle_classified_at IS NULL
                   OR last_seen_at > lifecycle_classified_at)`,
          [batchIds],
        );
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 2b: backfill phase_started_at for existing permits
  // ═══════════════════════════════════════════════════════════
  //
  // One-time backfill: permits that have a lifecycle_phase but no
  // phase_started_at (set by the Phase 1 migration or prior runs
  // before the state-machine upgrade). Uses best-available proxies:
  //   P7* / P8 / P18 → issued_date
  //   P3-P6          → application_date
  //   P9-P17         → latest inspection_date (from rollup)
  //   P19 / P20      → last_seen_at
  //   O1-O3          → COALESCE(application_date, first_seen_at)
  //
  // Idempotent: WHERE phase_started_at IS NULL. Second run = 0 rows.
  const { rows: backfillRows } = await pool.query(
    `UPDATE permits
        SET phase_started_at = CASE
          WHEN lifecycle_phase IN ('P7a','P7b','P7c','P7d','P8','P18')
            THEN COALESCE(issued_date::timestamptz, first_seen_at)
          WHEN lifecycle_phase IN ('P3','P4','P5','P6')
            THEN COALESCE(application_date::timestamptz, first_seen_at)
          WHEN lifecycle_phase IN ('P9','P10','P11','P12','P13','P14','P15','P16','P17')
            THEN COALESCE(
              (SELECT MAX(i.inspection_date)::timestamptz
                 FROM permit_inspections i
                WHERE i.permit_num = permits.permit_num
                  AND i.status = 'Passed'),
              issued_date::timestamptz,
              first_seen_at
            )
          WHEN lifecycle_phase IN ('P19','P20')
            THEN last_seen_at
          WHEN lifecycle_phase IN ('O1','O2','O3')
            THEN COALESCE(application_date::timestamptz, first_seen_at)
          ELSE first_seen_at
        END
      WHERE lifecycle_phase IS NOT NULL
        AND phase_started_at IS NULL
    RETURNING 1`,
  );
  const backfilledCount = backfillRows.length;
  if (backfilledCount > 0) {
    pipeline.log.info(
      '[classify-lifecycle-phase]',
      `Backfilled phase_started_at for ${backfilledCount.toLocaleString()} permits`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 2c: backfill initial transition rows
  // ═══════════════════════════════════════════════════════════
  //
  // For existing classified permits that have no transition history
  // yet, write a single "initial classification" row with
  // from_phase = NULL. This gives the calibration engine baseline
  // data from day 1.
  //
  // Idempotent: NOT EXISTS guard. Second run = 0 rows.
  const { rows: initialTransRows } = await pool.query(
    `INSERT INTO permit_phase_transitions
       (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id)
     SELECT permit_num, revision_num, NULL, lifecycle_phase,
            COALESCE(phase_started_at, NOW()),
            permit_type, neighbourhood_id
       FROM permits
      WHERE lifecycle_phase IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM permit_phase_transitions t
           WHERE t.permit_num = permits.permit_num
             AND t.revision_num = permits.revision_num
        )
    RETURNING 1`,
  );
  const initialTransCount = initialTransRows.length;
  if (initialTransCount > 0) {
    pipeline.log.info(
      '[classify-lifecycle-phase]',
      `Backfilled ${initialTransCount.toLocaleString()} initial transition rows`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 3: distribution telemetry + blocking unclassified check
  // ═══════════════════════════════════════════════════════════
  const { rows: distRows } = await pool.query(
    `SELECT lifecycle_phase, COUNT(*)::int AS n
       FROM permits
      GROUP BY lifecycle_phase
      ORDER BY lifecycle_phase NULLS LAST`,
  );
  const phaseDistribution = {};
  for (const r of distRows) {
    phaseDistribution[r.lifecycle_phase === null ? 'null' : r.lifecycle_phase] = r.n;
  }

  const { rows: coaDistRows } = await pool.query(
    `SELECT lifecycle_phase, COUNT(*)::int AS n
       FROM coa_applications
      GROUP BY lifecycle_phase`,
  );
  const coaDistribution = {};
  for (const r of coaDistRows) {
    coaDistribution[r.lifecycle_phase === null ? 'null' : r.lifecycle_phase] = r.n;
  }

  const { rows: stalledRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits WHERE lifecycle_stalled = true`,
  );
  const stalledCount = stalledRows[0].n;

  // Unclassified count — uses DEAD_STATUS_ARRAY from the shared lib
  // (single source of truth) instead of hardcoding 13 statuses inline.
  // See WF3 Bug #4 (drift risk from 3 independent copies).
  //
  // Note `TRIM(status) <> ''`: the JS classifier's `normalizeStatus`
  // trims whitespace-only statuses to null BEFORE checking the dead
  // set, so whitespace-only rows get phase=null but should be excluded
  // from the unclassified count. See independent review Defect 2.
  const { rows: unclPermitRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM permits
      WHERE lifecycle_phase IS NULL
        AND status <> ALL($1::text[])
        AND status IS NOT NULL
        AND TRIM(status) <> ''`,
    [DEAD_STATUS_ARRAY],
  );
  // WF3 Bug #3: also check CoA unclassified count. The CoA classifier
  // can silently leave rows with NULL phase if the decision-matching
  // logic breaks. Dead CoA decisions are excluded via the shared
  // NORMALIZED_DEAD_DECISIONS_ARRAY.
  const { rows: unclCoaRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM coa_applications
      WHERE lifecycle_phase IS NULL
        AND linked_permit_num IS NULL
        AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
            <> ALL($1::text[])
        AND decision IS NOT NULL
        AND TRIM(decision) <> ''`,
    [NORMALIZED_DEAD_DECISIONS_ARRAY],
  );
  const unclassifiedCount = unclPermitRows[0].n + unclCoaRows[0].n;

  // Build audit_table rows for the admin dashboard
  const auditRows = [
    { metric: 'permits_dirty', value: dirtyPermits.length, threshold: null, status: 'INFO' },
    { metric: 'permits_updated', value: permitsUpdated, threshold: null, status: 'INFO' },
    { metric: 'coas_dirty', value: dirtyCoAs.length, threshold: null, status: 'INFO' },
    { metric: 'coas_updated', value: coasUpdated, threshold: null, status: 'INFO' },
    { metric: 'stalled_count', value: stalledCount, threshold: null, status: 'INFO' },
    {
      metric: 'unclassified_count',
      value: unclassifiedCount,
      threshold: '<= 100',
      status: unclassifiedCount <= 100 ? 'PASS' : 'FAIL',
    },
  ];

  // Log unclassified details if the threshold failed so operators can
  // see which statuses are missing from the decision tree.
  if (unclassifiedCount > 100) {
    const { rows: unclassifiedByStatus } = await pool.query(
      `SELECT status, COUNT(*)::int AS n
         FROM permits
        WHERE lifecycle_phase IS NULL
          AND status <> ALL($1::text[])
          AND status IS NOT NULL
          AND TRIM(status) <> ''
        GROUP BY status
        ORDER BY n DESC
        LIMIT 20`,
      [DEAD_STATUS_ARRAY],
    );
    pipeline.log.warn(
      '[classify-lifecycle-phase]',
      `BLOCKING: unclassified count ${unclassifiedCount} > 100. Top unhandled statuses:`,
      { unclassifiedByStatus },
    );
  }

  pipeline.emitSummary({
    records_total: dirtyPermits.length + dirtyCoAs.length,
    records_new: 0,
    records_updated: permitsUpdated + coasUpdated,
    records_meta: {
      permits_updated: permitsUpdated,
      phase_transitions_logged: transitionsLogged,
      phase_started_at_backfilled: backfilledCount,
      initial_transitions_backfilled: initialTransCount,
      coas_updated: coasUpdated,
      phase_distribution: phaseDistribution,
      coa_distribution: coaDistribution,
      stalled_count: stalledCount,
      unclassified_count: unclassifiedCount,
      audit_table: {
        phase: 21, // visual ordering in admin dashboard, after assert_engine_health
        name: 'Classify Lifecycle Phase',
        verdict: unclassifiedCount <= 100 ? 'PASS' : 'FAIL',
        rows: auditRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      permits: [
        'permit_num',
        'revision_num',
        'status',
        'enriched_status',
        'issued_date',
        'last_seen_at',
        'lifecycle_classified_at',
      ],
      permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date'],
      coa_applications: [
        'id',
        'decision',
        'linked_permit_num',
        'status',
        'last_seen_at',
        'lifecycle_classified_at',
      ],
    },
    {
      permits: ['lifecycle_phase', 'lifecycle_stalled', 'lifecycle_classified_at', 'phase_started_at'],
      permit_phase_transitions: ['permit_num', 'revision_num', 'from_phase', 'to_phase', 'transitioned_at', 'permit_type', 'neighbourhood_id'],
      coa_applications: ['lifecycle_phase', 'lifecycle_stalled', 'lifecycle_classified_at'],
    },
  );

  // If unclassified threshold breached, emit a non-zero error so the
  // pipeline_runs row shows as FAIL. This is how the CQA gate operates.
  if (unclassifiedCount > 100) {
    throw new Error(
      `BLOCKING: ${unclassifiedCount} unclassified permits exceed threshold of 100. See log for top unhandled statuses.`,
    );
  }
  } finally {
    // Release advisory lock on the SAME dedicated client that acquired
    // it, then return the client to the pool. The lock is session-level
    // so releasing on a different connection would be a no-op.
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (unlockErr) {
      pipeline.log.warn(
        '[classify-lifecycle-phase]',
        'Failed to release advisory lock — it will expire when the session ends.',
        { err: unlockErr instanceof Error ? unlockErr.message : String(unlockErr) },
      );
    } finally {
      lockClient.release();
    }
  }
});
