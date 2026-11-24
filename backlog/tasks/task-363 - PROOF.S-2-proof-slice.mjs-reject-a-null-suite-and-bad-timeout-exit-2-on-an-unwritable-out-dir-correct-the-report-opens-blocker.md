---
id: TASK-363
title: >-
  PROOF.S-2 proof-slice.mjs: reject a null suite and bad timeout, exit 2 on an
  unwritable out dir, correct the report-opens blocker
status: BUILT
assignee:
  - '@lane-BL-PROOF3'
created_date: '2026-11-19T22:30:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - plan:PROOF.S
  - McFixReborn
  - dead
milestone: m-1
dependencies:
  - TASK-68
references:
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md
  - docs/reports/lanes/2026-11-19/BL-PROOF3/REPORT.md
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
- [x] #1 src/tests/proof-slice.logic.test.ts: a red-first case where a row has "suite": null; checkSpec returns a problem string and main returns 2 (no TypeError)
- [x] #2 Same file: a row with "timeoutMs": "5" or -1 returns a problem and exit 2
- [x] #3 Same file: main with an io.mkdir that throws returns 2 and prints one proof-slice: line
- [x] #4 scripts/analysis/proof-slices.json row report-opens blockedBy is exactly ["task-287"] instead of ["task-123"] (git grep proof-slices.json src/tests: no pin on the old value found by me, UNVERIFIED until the hook run); the design-fit row is unchanged (RR-0306)
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Red first: add tests for suite null, timeoutMs string/-1, throwing io.mkdir (AC1-3). 2. checkSpec: reject non-object suite, validate timeoutMs as positive integer (AC1,2). 3. main: guard io.mkdir in try/catch, print one proof-slice: line, return 2 (AC3). 4. proof-slices.json report-opens blockedBy -> [task-287]; design-fit row untouched (AC4). 5. Header exit table says unwritable --out is exit 2; real run still exit 3 (AC5). 6. Lenses compliance, code-review, error-paths at plan and output; adjudicate in TRIAGE.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-PROOF3, worktree /Users/brettpreston_macmini/Buildo-wt-proof3, branch wf1/inc1b-proof3), RR-0240

Lane BL-PROOF3: suite null, timeoutMs, mkdir guard and report-opens blocker fixed with tests; read-only existing --out dir still exits 1 via writeFile (leftover).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
6f7bed541: guards, mkdir exit 2, report-opens task-287; hook run 40 passed. AC5 header says 'cannot be created'; read-only existing --out still exit 1 (leftover).
<!-- SECTION:FINAL_SUMMARY:END -->
