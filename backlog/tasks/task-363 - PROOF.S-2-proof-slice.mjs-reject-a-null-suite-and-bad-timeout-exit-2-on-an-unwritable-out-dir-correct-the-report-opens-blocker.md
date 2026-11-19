---
id: TASK-363
title: >-
  PROOF.S-2 proof-slice.mjs: reject a null suite and bad timeout, exit 2 on an
  unwritable out dir, correct the report-opens blocker
status: RUNNING
assignee:
  - '@lane-BL-PROOF3'
created_date: '2026-11-19T22:30:00Z'
updated_date: '2026-11-19T22:34:00Z'
labels:
  - S
  - plan:PROOF.S
milestone: m-1
dependencies:
  - TASK-68
references:
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md
type: build
project: McIncrement
ordinal: 63012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: the proof runner scripts/analysis/proof-slice.mjs rejects a null suite and a badly typed timeout with exit 2, an unwritable --out directory exits 2 (not the FAIL code 1), and the report-opens row names its true blocker. Findings CR-7, CO-S3 (second half) of docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md. The first half of CO-S3 is FALSE: the design-fit row blocked by task-345 and task-67 is what RR-0306 means (the proof tool does not wait; the row prints NOT BUILT).

In plain words: a typo in the proof list can crash the runner instead of reporting "bad data file", and one row of the list says the report waits for the read module (task-123) when that is built and the real wait is the live switch.

Cause (opened on head f65b64674): scripts/analysis/proof-slice.mjs checkSpec: `r?.suite !== undefined && !(Array.isArray(r.suite.suite_files) ...)` throws a TypeError for "suite": null (read, not run: the lane rule refuses a runner call); `timeoutMs` is in KEYS (:24) but never type-checked; main() calls io.mkdir(outDir) unguarded, so an unwritable --out dies with Node's uncaught-exception exit 1, the code the file documents as FAIL (header :11 "exit ... 1 any FAIL ... 2 usage or bad data file"). scripts/analysis/proof-slices.json row report-opens: "blockedBy": ["task-123"] while task-123 is BUILT and W returns null until MAXBLD_WEB_LIVE flips (report-page.ts:54; task-287, task-348).
Rule: the file's own header exit-code table (proof-slice.mjs:11); RR-0306 (design-fit row stays as is).

Files: scripts/analysis/proof-slice.mjs, scripts/analysis/proof-slices.json, src/tests/proof-slice.logic.test.ts, docs/reports/lanes/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/tests/proof-slice.logic.test.ts: a red-first case where a row has "suite": null; checkSpec returns a problem string and main returns 2 (no TypeError)
- [ ] #2 Same file: a row with "timeoutMs": "5" or -1 returns a problem and exit 2
- [ ] #3 Same file: main with an io.mkdir that throws returns 2 and prints one proof-slice: line
- [ ] #4 scripts/analysis/proof-slices.json row report-opens blockedBy is exactly ["task-287"] instead of ["task-123"] (git grep proof-slices.json src/tests: no pin on the old value found by me, UNVERIFIED until the hook run); the design-fit row is unchanged (RR-0306)
- [ ] #5 The header exit table (proof-slice.mjs:11) is updated to say an unwritable --out is exit 2; node scripts/analysis/proof-slice.mjs --slice S --out <dir> still prints the table with exit 3 on the real file (PASS rows unchanged)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-PROOF3, worktree /Users/brettpreston_macmini/Buildo-wt-proof3, branch wf1/inc1b-proof3), RR-0240
<!-- SECTION:NOTES:END -->
