'use strict';
// scripts/lib/dead-tuple-ratio.js — the ONE fleet dead-tuple measurement (Spec 124 R-CG, S2 F3-3, operator
// 2026-10-13; Spec 122a:391-396 "one measurement, one threshold name"). Pure: no I/O. Its own module so a
// compute (assert_engine_health) can share it WITHOUT requiring the runner's maintenance executor
// (scripts/lib/step/plausibility.js), which would pull runner DDL/txn code into the compute's purity closure.
//
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CG)

/** dead / (live + dead), rounded to 4 decimals; 0 when both are 0. */
function deadTupleRatio(live, dead) {
  const l = Number(live) || 0;
  const d = Number(dead) || 0;
  return (l + d) > 0 ? Math.round((d / (l + d)) * 10000) / 10000 : 0;
}

module.exports = { deadTupleRatio };
