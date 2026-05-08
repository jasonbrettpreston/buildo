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

// Advisory lock ID — unique to this assert script (§47 §A.5, ID 109).
// Prevents two concurrent chain runs from executing the distribution
// check simultaneously. If the classifier (lock 84) is concurrently
// mid-write, the skipEmit-false pattern below still guards via the
// lock-is-held check on the shared lock (see WF3 Bug #10 rationale).
const ADVISORY_LOCK_ID = 109;

// ──────────────────────────────────────────────────────────────────
// Phase distribution bands — externalized to logic_variables (WF2 2026-05-07).
//
// Audit-table display labels → snake-case logic_variables key suffixes.
// Migration 119 seeded `lifecycle_band_<suffix>_min/_max` rows. Bounds
// are operator-tunable via the admin Control Panel (Spec 86 §1) without
// a code deploy. Defaults are set in scripts/seeds/logic_variables.json
// and mirrored into the DB by migration 119.
//
// Bands assume the classifier has recently run on fresh data. If it
// hasn't, most counts will be 0 and the assertion will fail — correct
// behaviour (the feature is unhealthy until the classifier populates
// the column).
// ──────────────────────────────────────────────────────────────────
const PHASE_TO_LOGIC_VAR_SUFFIX = {
  // permits — pre-issuance
  P3: 'p3', P4: 'p4', P5: 'p5', P6: 'p6',
  // permits — issued time-bucketed
  P7a: 'p7a', P7b: 'p7b', P7c: 'p7c', P7d: 'p7d',
  // permits — active + revised
  P8: 'p8', P18: 'p18', P19: 'p19', P20: 'p20',
  // permits — active sub-stage aggregate (P9-P17 sum)
  'P9-P17': 'p9_p17_agg',
  // orphans
  O1: 'o1', O2: 'o2', O3: 'o3',
  // CoA (no namespace collision with permits — permits never store P1/P2)
  P1: 'coa_p1', P2: 'coa_p2',
};

// Build Zod schema dynamically — every phase contributes a min/max key.
// Bands are integer row counts; .int() rejects accidental fractional operator
// edits (e.g. 500.5) that would otherwise round-trip through DECIMAL silently.
const _bandShape = {};
for (const suffix of Object.values(PHASE_TO_LOGIC_VAR_SUFFIX)) {
  _bandShape[`lifecycle_band_${suffix}_min`] = z.coerce.number().finite().nonnegative().int();
  _bandShape[`lifecycle_band_${suffix}_max`] = z.coerce.number().finite().nonnegative().int();
}

const LOGIC_VARS_SCHEMA = z.object({
  lifecycle_unclassified_max: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_stalled_threshold: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_active_inspection_threshold: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_issued_threshold: z.coerce.number().finite().nonnegative().int(),
  ..._bandShape,
}).passthrough().superRefine((data, ctx) => {
  // Operator-hotfix guard: a min > max pair would silently make the
  // band un-matchable and the assertion would PASS on a dead phase.
  for (const suffix of Object.values(PHASE_TO_LOGIC_VAR_SUFFIX)) {
    const min = data[`lifecycle_band_${suffix}_min`];
    const max = data[`lifecycle_band_${suffix}_max`];
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `lifecycle_band_${suffix}: min (${min}) > max (${max}) — band would never match`,
      });
    }
  }
});

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
  const stalledThreshold = logicVars.lifecycle_cross_stalled_threshold;
  const activeInspectionThreshold = logicVars.lifecycle_cross_active_inspection_threshold;
  const issuedThreshold = logicVars.lifecycle_cross_issued_threshold;

  // Resolve the per-phase distribution bands from logic_variables.
  // Spec 47 §R4 — no hardcoded thresholds; operator-tunable via Spec 86 Control Panel.
  const EXPECTED_BANDS = {};
  for (const [label, suffix] of Object.entries(PHASE_TO_LOGIC_VAR_SUFFIX)) {
    EXPECTED_BANDS[label] = {
      min: logicVars[`lifecycle_band_${suffix}_min`],
      max: logicVars[`lifecycle_band_${suffix}_max`],
    };
  }
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
  // WF3 2026-05-08 — silent-failure-mode hardening (Spec 84 §3.5 + Spec 47 §10.3 + Spec 85 §3.5):
  //   - `lifecycle_stalled IS NOT TRUE` (NULL-safe; consistent with cross-checks #2/#3 below)
  //   - `LOWER(enriched_status)` (case-insensitive; consistent with the CoA unclassified
  //      query at ~L195 which uses `lower(trim(...))` on `decision`)
  // Today `lifecycle_stalled` is `BOOLEAN NOT NULL DEFAULT false` (mig 085) and the
  // legacy classifier only writes `'Stalled'` — neither variant manifests in current
  // data. The fix regression-locks the query against any future schema relaxation or
  // operator-driven case drift, before downstream consumers (Spec 85 trade-forecast
  // engine) compound on bad state.
  const { rows: crossCheck1 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE LOWER(enriched_status) = 'stalled' AND lifecycle_stalled IS NOT TRUE`,
  );
  const crossStalled = crossCheck1[0].n;
  const stalledStatus = crossStalled === 0
    ? 'PASS'
    : crossStalled < stalledThreshold ? 'WARN' : 'FAIL';
  auditRows.push({
    metric: 'cross_check_stalled',
    value: crossStalled,
    threshold: `< ${stalledThreshold} (WARN), >= ${stalledThreshold} (FAIL)`,
    status: stalledStatus,
  });
  if (crossStalled >= stalledThreshold) {
    failures.push(
      `${crossStalled} permits have enriched_status=Stalled but lifecycle_stalled=false (exceeds ${stalledThreshold} threshold)`,
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
  // WF3 2026-05-08 — `LOWER(enriched_status)` for the same case-insensitivity reason
  // as cross-check #1 (sibling concern, same root cause).
  const { rows: crossCheck2 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE LOWER(enriched_status) = 'active inspection'
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
    threshold: `< ${activeInspectionThreshold} (WARN), >= ${activeInspectionThreshold} (FAIL)`,
    status: crossActive === 0 ? 'PASS' : crossActive < activeInspectionThreshold ? 'WARN' : 'FAIL',
  });
  if (crossActive >= activeInspectionThreshold) {
    failures.push(
      `${crossActive} permits with enriched_status=Active Inspection are not in P9-P18/O1-O3 (exceeds ${activeInspectionThreshold} threshold)`,
    );
  } else if (crossActive > 0) {
    warnings.push(
      `${crossActive} permits with enriched_status=Active Inspection are not in P9-P18/O1-O3 (Strangler Fig drift — legacy column is less accurate)`,
    );
  }

  // Cross-check 3: same orphan inclusion + IS NULL guard as cross-check 2.
  // WF3 2026-05-08 — `LOWER(enriched_status)` (sibling concern from cross-check #1).
  const { rows: crossCheck3 } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits
      WHERE LOWER(enriched_status) = 'permit issued'
        AND (lifecycle_phase NOT IN ('P7a','P7b','P7c','P7d','P8','P18',
             'O1','O2','O3')
             OR lifecycle_phase IS NULL)`,
  );
  const crossIssued = crossCheck3[0].n;
  auditRows.push({
    metric: 'cross_check_permit_issued',
    value: crossIssued,
    threshold: `< ${issuedThreshold} (WARN), >= ${issuedThreshold} (FAIL)`,
    status: crossIssued === 0 ? 'PASS' : crossIssued < issuedThreshold ? 'WARN' : 'FAIL',
  });
  if (crossIssued >= issuedThreshold) {
    failures.push(
      `${crossIssued} permits with enriched_status=Permit Issued are not in P7a/b/c/d/P8/P18/O1-O3 (exceeds ${issuedThreshold} threshold)`,
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
