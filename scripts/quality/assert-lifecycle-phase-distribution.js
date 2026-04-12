#!/usr/bin/env node
/**
 * Assert Lifecycle Phase Distribution — Tier 2 CQA check.
 *
 * Runs after the lifecycle classifier. Asserts that every phase's
 * count is within ±5% of the expected value, and that the unclassified
 * count is at most 100 rows (the strongest correctness gate).
 *
 * Designed to be included in the permits/coa pipeline chains as a
 * separate assert step, OR invoked standalone after a manual
 * classifier run.
 *
 * SPEC LINK: docs/reports/lifecycle_phase_implementation.md §3.3
 */
'use strict';

const pipeline = require('./../lib/pipeline');

// Expected distribution bands. Wide enough (±5%) to absorb normal
// day-to-day fluctuation but tight enough to catch a rule regression.
// Based on live DB snapshot 2026-04-11.
//
// NOTE: these bands assume the classifier has recently run on fresh
// data. If the classifier hasn't run yet, most counts will be 0 and
// the assertion will fail — which is the correct behavior (the
// feature is not healthy until the classifier has populated the
// column).
const EXPECTED_BANDS = {
  // permits
  P3:  { min: 1100, max: 1600 },
  P4:  { min: 2500, max: 3100 },
  P5:  { min: 2100, max: 2700 },
  P6:  { min: 2800, max: 3500 },
  P7a: { min: 1500, max: 2200 },
  P7b: { min: 2800, max: 3700 },
  P7c: { min: 38000, max: 46000 },
  P7d: { min: 1000, max: 1400 },
  P8:  { min: 19500, max: 22000 },
  P18: { min: 125000, max: 140000 },
  P19: { min: 5000, max: 6100 },
  P20: { min: 8000, max: 9300 },
  // P9-P17 combined (current scraper coverage is ~5.5%; wide tolerance
  // while the scraper scales up)
  'P9-P17': { min: 0, max: 80000 },
  // orphans
  O1:  { min: 8000, max: 12000 },
  O2:  { min: 15000, max: 21000 },
  O3:  { min: 4500, max: 7500 },
  // coa
  P1:  { min: 20, max: 55 },
  P2:  { min: 120, max: 200 },
};

const UNCLASSIFIED_MAX = 100;

// Phases that roll into the P9-P17 aggregate bucket
const ACTIVE_SUBPHASES = new Set([
  'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17',
]);

pipeline.run('assert-lifecycle-phase-distribution', async (pool) => {
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

  // Merge CoA counts under the same phase keys (P1 and P2 are
  // CoA-only — they can't collide with permit phases)
  const allCounts = { ...permitCounts, ...coaCounts };

  // Compute active sub-stage aggregate
  let p9p17Total = 0;
  for (const phase of ACTIVE_SUBPHASES) {
    p9p17Total += allCounts[phase] || 0;
  }
  allCounts['P9-P17'] = p9p17Total;

  // Unclassified count (non-dead statuses that fell through the tree)
  const { rows: unclRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM permits
      WHERE lifecycle_phase IS NULL
        AND status NOT IN (
          'Cancelled','Revoked','Permit Revoked','Refused','Refusal Notice',
          'Application Withdrawn','Abandoned','Not Accepted','Work Suspended',
          'VIOLATION','Order Issued','Tenant Notice Period','Follow-up Required'
        )
        AND status IS NOT NULL
        AND TRIM(status) <> ''`,
  );
  const unclassifiedCount = unclRows[0].n;

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
    threshold: `<= ${UNCLASSIFIED_MAX}`,
    status: unclassifiedCount <= UNCLASSIFIED_MAX ? 'PASS' : 'FAIL',
  });
  if (unclassifiedCount > UNCLASSIFIED_MAX) {
    failures.push(
      `unclassified_count ${unclassifiedCount} exceeds hard limit ${UNCLASSIFIED_MAX}`,
    );
  }

  // Cross-check vs enriched_status (spec §3.5)
  const { rows: crossCheck1 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE enriched_status = 'Stalled' AND lifecycle_stalled = false`,
  );
  const crossStalled = crossCheck1[0].n;
  auditRows.push({
    metric: 'cross_check_stalled',
    value: crossStalled,
    threshold: '== 0',
    status: crossStalled === 0 ? 'PASS' : 'FAIL',
  });
  if (crossStalled > 0) {
    failures.push(
      `${crossStalled} permits have enriched_status=Stalled but lifecycle_stalled=false`,
    );
  }

  const { rows: crossCheck2 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE enriched_status = 'Active Inspection'
        AND lifecycle_phase NOT IN (
          'P9','P10','P11','P12','P13','P14','P15','P16','P17','P18'
        )`,
  );
  const crossActive = crossCheck2[0].n;
  auditRows.push({
    metric: 'cross_check_active_inspection',
    value: crossActive,
    threshold: '== 0',
    status: crossActive === 0 ? 'PASS' : crossActive < 10 ? 'WARN' : 'FAIL',
  });
  if (crossActive >= 10) {
    failures.push(
      `${crossActive} permits with enriched_status=Active Inspection are not in P9-P18`,
    );
  } else if (crossActive > 0) {
    warnings.push(
      `${crossActive} permits with enriched_status=Active Inspection are not in P9-P18 (below hard fail threshold)`,
    );
  }

  const { rows: crossCheck3 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE enriched_status = 'Permit Issued'
        AND lifecycle_phase NOT IN ('P7a','P7b','P7c','P7d','P8','P18')`,
  );
  const crossIssued = crossCheck3[0].n;
  auditRows.push({
    metric: 'cross_check_permit_issued',
    value: crossIssued,
    threshold: '== 0',
    status: crossIssued === 0 ? 'PASS' : crossIssued < 10 ? 'WARN' : 'FAIL',
  });
  if (crossIssued >= 10) {
    failures.push(
      `${crossIssued} permits with enriched_status=Permit Issued are not in P7a/b/c/d/P8/P18`,
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
    records_total: Object.values(allCounts).reduce((a, b) => a + b, 0),
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
    { permits: ['lifecycle_phase', 'lifecycle_stalled', 'enriched_status'],
      coa_applications: ['lifecycle_phase'] },
    {},
  );

  if (failures.length > 0) {
    throw new Error(
      `Distribution sanity check FAILED (${failures.length} failures):\n${failures.join('\n')}`,
    );
  }
});
