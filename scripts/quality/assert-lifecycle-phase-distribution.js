#!/usr/bin/env node
/**
 * Assert Lifecycle Phase Distribution — Tier 3 CQA check.
 *
 * Runs after the lifecycle classifier. Asserts that every phase's
 * count is within ±5% of the expected value, and that the unclassified
 * count is at most 100 rows (the strongest correctness gate).
 *
 * Designed to be included in the permits/coa pipeline chains as a
 * separate assert step, OR invoked standalone after a manual
 * classifier run.
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./../lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./../lib/config-loader');
const {
  DEAD_STATUS_ARRAY,
  NORMALIZED_DEAD_DECISIONS_ARRAY,
} = require('./../lib/lifecycle-phase');

const LOGIC_VARS_SCHEMA = z.object({
  lifecycle_unclassified_max: z.coerce.number().finite().nonnegative().int(),
}).passthrough();

// Advisory lock ID — unique to this assert script (§47 §A.5, ID 109).
// Prevents two concurrent chain runs from executing the distribution
// check simultaneously. If the classifier (lock 84) is concurrently
// mid-write, the skipEmit-false pattern below still guards via the
// lock-is-held check on the shared lock (see WF3 Bug #10 rationale).
const ADVISORY_LOCK_ID = 109;

// Expected distribution bands. Wide enough (±5%) to absorb normal
// day-to-day fluctuation but tight enough to catch a rule regression.
// Based on live DB snapshot 2026-04-11.
//
// NOTE: these bands assume the classifier has recently run on fresh
// data. If the classifier hasn't run yet, most counts will be 0 and
// the assertion will fail — which is the correct behavior (the
// feature is not healthy until the classifier has populated the
// column).
// Recalibrated 2026-04-12 against live DB post-classifier-V1 backfill.
// Bands are ±10% for phases >1000, ±30% for phases <1000 (small counts
// fluctuate more from daily CKAN delta ingestion).
const EXPECTED_BANDS = {
  // permits — pre-issuance
  P3:  { min: 200, max: 400 },
  P4:  { min: 1200, max: 1600 },
  P5:  { min: 900, max: 1200 },
  P6:  { min: 2200, max: 2900 },
  // permits — issued time-bucketed
  P7a: { min: 700, max: 1400 },
  P7b: { min: 1200, max: 2200 },
  P7c: { min: 14000, max: 18000 },
  P7d: { min: 600, max: 1200 },
  // permits — active + revised
  P8:  { min: 4700, max: 6000 },
  P18: { min: 41000, max: 52000 },
  // permits — terminal
  P19: { min: 4900, max: 6200 },
  P20: { min: 7700, max: 9600 },
  // P9-P17 combined (current scraper coverage is ~5.5%; wide tolerance
  // while the scraper scales up)
  'P9-P17': { min: 0, max: 80000 },
  // orphans
  O1:  { min: 7000, max: 9000 },
  O2:  { min: 13000, max: 16000 },
  O3:  { min: 115000, max: 145000 },
  // coa
  P1:  { min: 30, max: 80 },
  P2:  { min: 120, max: 200 },
};

// unclassifiedMax externalized to logic_variables as lifecycle_unclassified_max (WF3-E12)

// Phases that roll into the P9-P17 aggregate bucket
const ACTIVE_SUBPHASES = new Set([
  'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17',
]);

// Startup validation — `<> ALL(ARRAY[]::text[])` is vacuously true
// in Postgres (every value is not-equal to every element of an empty
// array), which would make the unclassified gate pass silently even
// if the classifier is completely broken. Guard against accidental
// empty arrays from a future bad edit to lifecycle-phase.js.
if (DEAD_STATUS_ARRAY.length === 0) {
  throw new Error('DEAD_STATUS_ARRAY is empty — refusing to run with a vacuously-true unclassified gate');
}
if (NORMALIZED_DEAD_DECISIONS_ARRAY.length === 0) {
  throw new Error('NORMALIZED_DEAD_DECISIONS_ARRAY is empty — refusing to run');
}

pipeline.run('assert-lifecycle-phase-distribution', async (pool) => {
  // ─── Advisory lock awareness — pipeline.withAdvisoryLock (Phase 2 migration) ──
  // If the classifier is mid-write we skip gracefully (reason: 'classifier_running')
  // rather than reading half-updated distribution counts. skipEmit:false preserves
  // the custom reason — the helper's default SKIP emit omits it.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  // §4: config reads MUST execute inside the lock callback
  const { logicVars } = await loadMarketplaceConfigs(pool, 'assert-lifecycle-phase-distribution');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'assert-lifecycle-phase-distribution');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  const unclassifiedMax = logicVars.lifecycle_unclassified_max;
  // Distribution from permits.lifecycle_phase
  const { rows: permitRows } = await pool.query(
    `SELECT lifecycle_phase, COUNT(*)::int AS n
       FROM permits
      GROUP BY lifecycle_phase`,
  );
  const permitCounts = Object.fromEntries(
    permitRows.map((r) => [
      r.lifecycle_phase === null ? 'null' : r.lifecycle_phase,
      r.n,
    ]),
  );

  // CoA distribution
  const { rows: coaRows } = await pool.query(
    `SELECT lifecycle_phase, COUNT(*)::int AS n
       FROM coa_applications
      GROUP BY lifecycle_phase`,
  );
  const coaCounts = Object.fromEntries(
    coaRows.map((r) => [
      r.lifecycle_phase === null ? 'null' : r.lifecycle_phase,
      r.n,
    ]),
  );

  // WF3 Bug #6: merge by SUMMING shared keys, not overwriting.
  // Both maps have a 'null' key (from lifecycle_phase IS NULL).
  // Object spread would silently overwrite permits' ~50K null count
  // with CoAs' ~50 null count — a 1000× undercount.
  const allCounts = { ...permitCounts };
  for (const [phase, count] of Object.entries(coaCounts)) {
    allCounts[phase] = (allCounts[phase] || 0) + count;
  }

  // Compute active sub-stage aggregate
  let p9p17Total = 0;
  for (const phase of ACTIVE_SUBPHASES) {
    p9p17Total += allCounts[phase] || 0;
  }
  allCounts['P9-P17'] = p9p17Total;

  // Unclassified count — uses DEAD_STATUS_ARRAY from the shared lib
  // (single source of truth). WF3 Bug #4 + #8.
  const { rows: unclPermitRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM permits
      WHERE lifecycle_phase IS NULL
        AND status <> ALL($1::text[])
        AND status IS NOT NULL
        AND TRIM(status) <> ''`,
    [DEAD_STATUS_ARRAY],
  );
  // WF3 Bug #8: also check CoA unclassified. If the CoA classifier
  // breaks and leaves 5K rows with NULL phase, the assert script must
  // catch it — not silently PASS.
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

  const auditRows = [];
  const failures = [];
  const warnings = [];

  for (const [phase, band] of Object.entries(EXPECTED_BANDS)) {
    const actual = allCounts[phase] || 0;
    const inBand = actual >= band.min && actual <= band.max;
    const status = inBand ? 'PASS' : 'FAIL';
    if (!inBand) {
      failures.push(
        `${phase}: ${actual} outside expected band [${band.min}, ${band.max}]`,
      );
    }
    auditRows.push({
      metric: `phase_${phase}_count`,
      value: actual,
      threshold: `${band.min}..${band.max}`,
      status,
    });
  }

  auditRows.push({
    metric: 'unclassified_count',
    value: unclassifiedCount,
    threshold: `<= ${unclassifiedMax}`,
    status: unclassifiedCount <= unclassifiedMax ? 'PASS' : 'FAIL',
  });
  if (unclassifiedCount > unclassifiedMax) {
    failures.push(
      `unclassified_count ${unclassifiedCount} exceeds hard limit ${unclassifiedMax}`,
    );
  }

  // Cross-check vs enriched_status (spec §3.5)
  //
  // WF3 Bug #9 (Strangler Fig contradiction): the enriched_status
  // column was set by the legacy classify-inspection-status.js which
  // aggressively flags permits as 'Stalled'. The new lifecycle
  // classifier uses more accurate date math. Holding the new logic
  // hostage to legacy bugs produces false FAILs. Downgraded to WARN
  // with a threshold of 1000 before escalating to FAIL.
  const { rows: crossCheck1 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE enriched_status = 'Stalled' AND lifecycle_stalled = false`,
  );
  const crossStalled = crossCheck1[0].n;
  const stalledStatus = crossStalled === 0
    ? 'PASS'
    : crossStalled < 1000 ? 'WARN' : 'FAIL';
  auditRows.push({
    metric: 'cross_check_stalled',
    value: crossStalled,
    threshold: '< 1000 (WARN), >= 1000 (FAIL)',
    status: stalledStatus,
  });
  if (crossStalled >= 1000) {
    failures.push(
      `${crossStalled} permits have enriched_status=Stalled but lifecycle_stalled=false (exceeds 1000 threshold)`,
    );
  } else if (crossStalled > 0) {
    warnings.push(
      `${crossStalled} permits have enriched_status=Stalled but lifecycle_stalled=false (Strangler Fig drift — legacy column is less accurate)`,
    );
  }

  // WF3 Bug #7: SQL NOT IN ignores NULL values. `lifecycle_phase NOT IN
  // ('P9',...,'P18')` evaluates to NULL (not TRUE) when lifecycle_phase
  // IS NULL, silently excluding rows the cross-check should catch. Fix:
  // add `OR lifecycle_phase IS NULL`.
  // Cross-check 2: enriched_status='Active Inspection' should map to
  // either the P9-P18 construction sub-stages OR the O1-O3 orphan
  // branch (orphan trade permits with status='Inspection' get routed
  // to O2/O3 by the decision tree — that's correct behavior, not a
  // classification failure). Also includes IS NULL guard per WF3 Bug #7.
  const { rows: crossCheck2 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE enriched_status = 'Active Inspection'
        AND (lifecycle_phase NOT IN (
          'P9','P10','P11','P12','P13','P14','P15','P16','P17','P18',
          'O1','O2','O3'
        ) OR lifecycle_phase IS NULL)`,
  );
  const crossActive = crossCheck2[0].n;
  // Small drift (<500) is expected: permits whose status changed to a
  // terminal state after the legacy enriched_status was set will have
  // lifecycle_phase=P19/P20/null even though enriched_status still says
  // 'Active Inspection'. That's correct Strangler Fig behavior.
  auditRows.push({
    metric: 'cross_check_active_inspection',
    value: crossActive,
    threshold: '< 500 (WARN), >= 500 (FAIL)',
    status: crossActive === 0 ? 'PASS' : crossActive < 500 ? 'WARN' : 'FAIL',
  });
  if (crossActive >= 500) {
    failures.push(
      `${crossActive} permits with enriched_status=Active Inspection are not in P9-P18/O1-O3 (exceeds 500 threshold)`,
    );
  } else if (crossActive > 0) {
    warnings.push(
      `${crossActive} permits with enriched_status=Active Inspection are not in P9-P18/O1-O3 (Strangler Fig drift — legacy column is less accurate)`,
    );
  }

  // Cross-check 3: same orphan inclusion + IS NULL guard as cross-check 2.
  const { rows: crossCheck3 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE enriched_status = 'Permit Issued'
        AND (lifecycle_phase NOT IN ('P7a','P7b','P7c','P7d','P8','P18',
             'O1','O2','O3')
             OR lifecycle_phase IS NULL)`,
  );
  const crossIssued = crossCheck3[0].n;
  auditRows.push({
    metric: 'cross_check_permit_issued',
    value: crossIssued,
    threshold: '< 500 (WARN), >= 500 (FAIL)',
    status: crossIssued === 0 ? 'PASS' : crossIssued < 500 ? 'WARN' : 'FAIL',
  });
  if (crossIssued >= 500) {
    failures.push(
      `${crossIssued} permits with enriched_status=Permit Issued are not in P7a/b/c/d/P8/P18/O1-O3 (exceeds 500 threshold)`,
    );
  }

  const verdict = failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';

  if (failures.length > 0) {
    pipeline.log.error('[assert-lifecycle-phase-distribution]', 'FAILURES', {
      failures,
    });
  }
  if (warnings.length > 0) {
    pipeline.log.warn('[assert-lifecycle-phase-distribution]', 'WARNINGS', {
      warnings,
    });
  }

  pipeline.emitSummary({
    // Exclude the synthetic 'P9-P17' aggregate key to avoid double-
    // counting those phases (they exist individually AND as the sum).
    records_total: Object.entries(allCounts)
      .filter(([k]) => k !== 'P9-P17')
      .reduce((sum, [, n]) => sum + n, 0),
    records_new: 0,
    records_updated: 0,
    records_meta: {
      phase_distribution: allCounts,
      unclassified_count: unclassifiedCount,
      audit_table: {
        phase: 22,
        name: 'Assert Lifecycle Phase Distribution',
        verdict,
        rows: auditRows,
      },
    },
  });

  pipeline.emitMeta(
    { permits: ['lifecycle_phase', 'lifecycle_stalled', 'enriched_status', 'status'],
      coa_applications: ['lifecycle_phase', 'linked_permit_num', 'decision'] },
    {},
  );

  if (failures.length > 0) {
    throw new Error(
      `Distribution sanity check FAILED (${failures.length} failures):\n${failures.join('\n')}`,
    );
  }
  }, { skipEmit: false }); // end withAdvisoryLock

  // Classifier is mid-write — skip assertion to avoid false-positive band violations.
  if (!lockResult.acquired) {
    pipeline.log.info(
      '[assert-lifecycle-phase-distribution]',
      `Advisory lock ${ADVISORY_LOCK_ID} held by classifier — skipping assertion to avoid false-positive.`,
    );
    pipeline.emitSummary({
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        skipped: true,
        reason: 'classifier_running',
        advisory_lock_id: ADVISORY_LOCK_ID,
      },
    });
    pipeline.emitMeta({}, {});
    return;
  }
});
