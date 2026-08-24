#!/usr/bin/env node
/**
 * RETIRED 2026-08-23 (S0, Spec 122 §10). This generator no longer runs.
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md
 *
 * WHY IT EXISTED. It generated a programme active-task from
 * `.cursor/queued_task_step_opt_programme.md`, so the 235-line plan was never
 * hand-transposed (Spec 121 measured ~60% citation error at that boundary).
 *
 * WHY IT IS RETIRED — two independent reasons, either sufficient:
 *
 *   1. ITS SOURCE IS GONE. `PLAN` pointed at
 *      `.cursor/queued_task_step_opt_programme.md`, which was promoted on
 *      2026-08-23 and is now a 7-line pointer stub. The programme's single
 *      source of record is `.cursor/active_task.md` (Spec 122 §10).
 *
 *   2. RETARGETING WOULD NOT WORK. The v2 plan is hand-maintained BY DESIGN —
 *      it carries the operator-ratified rulings R1-R6 / V1-V6, a two-track
 *      shape, and per-stage prose that no `| **S1** | what | claims | wf |
 *      entry |` row can hold. Every hard-coded assumption this file makes about
 *      the plan's shape (the five-column stage table, one heading per stage,
 *      claim counts stated as bare integers in a cell) is false against it.
 *      Pointing `PLAN` at `.cursor/active_task.md` would parse ZERO stages and
 *      then hard-fail totality on the whole checklist as unattributed — a
 *      loud failure dressed up as a working tool.
 *
 * ⚠️ AND POINTING IT AT `.cursor/active_task.md` WOULD BE A GOVERNANCE ACTION.
 *      That is why `TASK` was `active_task_programme.md` and never
 *      `active_task.md`: writing the latter seizes the GOD MODE slot and stamps
 *      whatever Status the plan carries. Measured — it once locked out the
 *      in-flight authorised task and blocked the very edit that fixed this
 *      generator. Retirement preserves that fence permanently.
 *
 * WHAT REPLACES IT. Nothing generates the programme plan. It is maintained by
 * hand at `.cursor/active_task.md`, and the drift it used to guard is now held
 * by the two generators that survived:
 *
 *   node scripts/violations/plan-claims.mjs   docs/reports/generated/123-claim-plan.md
 *   node scripts/violations/map-categories.mjs docs/reports/generated/122-category-coverage.md
 *
 * STUBBED, NOT DELETED. Spec 122 §10 documents this path; a stub gives a
 * self-explaining exit 1, a deletion gives `MODULE_NOT_FOUND` and a dangling
 * citation. Nothing in `package.json`, `src/tests/`, or CI referenced it —
 * verified 2026-08-23 — so no caller breaks either way. The v1 body is in git
 * history (last live version: this file at `623a1ce8`).
 */
'use strict';

const NOTICE = [
  'scripts/violations/build-active-task.mjs is RETIRED (2026-08-23, S0).',
  '',
  'Its source — .cursor/queued_task_step_opt_programme.md — was promoted and is now a pointer stub.',
  'The programme plan is hand-maintained at .cursor/active_task.md (Spec 122 §10).',
  'It is NOT generated, and this tool must not write it: doing so seizes the GOD MODE slot.',
  '',
  'The drift guards that survived:',
  '  node scripts/violations/plan-claims.mjs    docs/reports/generated/123-claim-plan.md',
  '  node scripts/violations/map-categories.mjs docs/reports/generated/122-category-coverage.md',
].join('\n');

console.error(NOTICE);
process.exitCode = 1;
