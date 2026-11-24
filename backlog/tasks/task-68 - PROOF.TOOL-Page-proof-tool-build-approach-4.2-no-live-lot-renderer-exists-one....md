---
id: TASK-68
title: >-
  PROOF.TOOL Page-proof tool (build-approach 4.2: no live-lot renderer exists):
  one...
status: BUILT
assignee:
  - '@lane-BL-PROOF2'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T14:42:00Z'
due_date: '2026-11-26'
labels:
  - S
  - plan:PROOF.TOOL
  - unverified
  - McFixReborn
  - dead
milestone: m-1
dependencies:
  - TASK-62
  - TASK-66
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/PROOF.TOOL
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L711
    sha256=a551450e6f8d
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/build-approach/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-PROOF/PLAN.md
  - docs/reports/lanes/2026-11-19/BL-PROOF/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-PROOF/TRIAGE.md
  - docs/reports/lanes/2026-11-19/BL-PROOF2/REPORT.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2005
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: PROOF.TOOL Page-proof tool (build-approach 4.2: no live-lot renderer exists): one script that, for a slice id and a lot list, renders the scenario page through the existing REPORT renderer on the test stack / admin preview route, saves a screenshot per lot, extracts every main and See-details element, asserts number-or-"Not yet evaluated", compares to the McProof key, runs the storage probes (open once, stale stamp recomputed, no unopened-lot record) and prints the compliance rows. Reuses the group F checks (CHK.4 no client maths, CHK.5 McStorage, CHK.6 design fit: it runs them, it does not rebuild them), the 1.6 harness, scripts/surfaces/report-checks.mjs, report-capture.ts and the admin report-preview; no new library or component kind; no hand-written screen

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 2 day (no measured source; size at the build pass)

Plan text at the snapshot: PLANNED (approved: S1/S2/Q-H4 a, 2026-11-18)
landingPush: none (evidence files; no repo change beyond the tool in PROOF.TOOL)
slicePart: SUPPORT S3 proof and answer keys
planNote: holistic-r1: status PLANNED (approved: S1/S2/Q-H4 a, 2026-11-18) (operator answers 2026-11-18 on the answer page (MORNING-DECISIONS.md, "Operator answers saved on the answer page": Q-H1 a, Q-H2 a, Q-H3 a, Q-H4 a, Q-H5 a, S1 a, S2 a))
who (plan text): one lane; claim an ID by mkdir before it starts (ID ledger)

Files: scripts/analysis/proof-slice.mjs, scripts/analysis/proof-slices.json, src/tests/proof-slice.logic.test.ts, docs/specs/02-web-admin/127_surface_conversion_procedure.md
(Files line: comma-separated for scripts/hooks/check-task-files.mjs; stage 2 scope: minimum tool for slice S; the Spec 127 entry is conditional on check-spec-diff.mjs asking. Stage 1 plan: docs/reports/lanes/2026-11-19/BL-PROOF/PLAN.md)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [x] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [x] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [ ] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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
1. (AC#1) Stage 2 step 0: run ids check.mjs for the worktree (no id kind expected); pre-register the expected moves (the three files above, nothing else) in one commit alone.
2. (AC#2) Failing tests T1-T7 are written into this plan (docs/reports/lanes/2026-11-19/BL-PROOF/PLAN.md section 5) and were reviewed at plan altitude in review round r1 (TRIAGE.md).
3. (AC#3) write_scope for stage 2: scripts/surfaces/proof-slice.mjs, scripts/surfaces/proof-slices.json, src/tests/surfaces/proof-slice.logic.test.ts, this task file; conditional Spec 127 paragraph.
4. (AC#4) Plan review run once with the plan template (r1-plan.txt); every finding KEPT or REJECTED with file:line (TRIAGE.md).
5. (AC#5) The orchestrator grounder re-executes the measured claims in PLAN.md section 2 (surface-validate, three golden --check runs, policy-checks --all, all green on head 8e0742142).
6. (AC#6) Build red first: commit attempt with only the test and task files staged (red.out), then the runner and data file (green.out) through the real hooks, on the origin tip; typecheck allowed; the push station suite and push are the operator's.
7. (AC#7) Output review record committed with the work (lane report copy in docs/reports/lanes/<date>/BL-PROOF/).
8. (AC#8) Not applicable: not a McFrontend build, no queue row.
Minimum tool: one runner for slice S that CALLS the existing checks and prints one table (PASS, FAIL, NOT BUILT, GAP; evidence file per row; exit 0/1/2/3). Not built now: screenshot per lot, element extraction, McProof key compare, storage probes (need 1.3 W task-123, ST.P1 task-265, a rehearsed test-stack job), design fit (task-345, task-67; RR-0306), browser driver, any DB code.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): dependency fixed: depends-on was 62, 65, 66, 67; now 62, 66, 67. TASK-65 CHK.4 is DROPPED (decision-69 'drop INFRA.2 guard.mjs and CHK.4', duplicate of report-no-maths MF-16; RR-0152); TASK-66 CHK.5 is BUILT and TASK-67 CHK.6 is LATER (kept); TASK-62 push 6 kept (the tool runs on the test stack after push 6, plan dependsOn 6.43). The description still says 'Reuses ... CHK.4': read it as the report-no-maths check MF-16, not a task. Proof task: no designed element (supporting function: PROOF slice S). Plan status 'approved S1/S2/Q-H4 a'; panel and build pass owed (readiness).

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-68 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-342 (PROOF.TOOL and CHK.6); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.

Dated note 2026-11-19 (M-246, prior text kept; RR-0303 · task-68 · Backlog; operator, verbatim: "if it needs to be produced at some point - we should do it now - if it isnt a big job")

2026-11-19 (R14, task-344, RR-0303): PROOF.TOOL note: the design-elements file CHK.6 (task-67) needs now has a build task, task-345 (CHK.6a, m-0, LATER); task-67 depends on it. Until it lands the design-fit row is a GAP as task-342 says.

Dated note 2026-11-19 (M-246, prior text kept; RR-0306 · task-68 · Backlog; operator, verbatim: "I would agree")

Scope now: runs the group F checks that exist and prints the design-fit check as not built (RR-0306); it does not build or wait for CHK.6

2026-11-19 taken on the board at lane launch (lane BL-PROOF, worktree /Users/brettpreston_macmini/Buildo-wt-proof, branch wf2/inc1b-proof), RR-0240

2026-11-19 stage 1 (lane BL-PROOF): the measured minimum plan for slice S is done and reviewed once (r1, TRIAGE.md). Measured today on head 8e0742142: surface-validate, the search, lot map and semi golden --check runs and policy-checks --all are green; CHK.5 prints WAITS (no record table named); the customer report read returns null (src/lib/parcels/report-page.ts:23-26); no 1.6 harness code exists (task-206 merged into draft-15). Minimum tool: one runner over the existing checks, about 300 lines in 3 files, 1 day GUESS. Later stages with their unblockers: screenshots and element check (task-123, task-265, test-stack GO), key compare (task-123, key file), storage probes (task-265, table migration), design fit (task-345 then task-67). One operator draft (D1, accept the four report-page proofs as GAP for 1·B) is in PLAN.md section 6 for the orchestrator. stage 1 plan done; stage 2 build waits on the orchestrator

2026-11-19 taken on the board at lane launch (lane BL-PROOF2, worktree /Users/brettpreston_macmini/Buildo-wt-proof2, branch wf1/inc1b-proof2), RR-0240

Stage 2 (lane BL-PROOF2, 2026-11-19): building the minimum runner per PLAN.md section 5. Red: T1-T7 in src/tests/surfaces/proof-slice.logic.test.ts committed alone first (red.out). Step 0 ids check: only FAIL is round-195 (prereg-MF-91-1.json, another lane's commit in 78f552fbb..67dd69222); this task adds no id kind (ids.out). Mobile jest row: PLAN gives no way to measure it without the runner call lane rule 18 refuses, so it is a NOT BUILT row ('not run by this tool') and no --with-mobile flag is built.

2026-11-19 stage 2: the tool lives under scripts/analysis/ (a runner of checks, not a surface); deviation from PLAN.md section 5 paths, orchestrator decision, flagged to the operator.

Output review r2 (lane BL-PROOF2): triage in docs/reports/lanes/2026-11-19/BL-PROOF2/TRIAGE.md; KEPT defects fixed in the fix commit (expect line = positive proof of a run, key whitelist, notbuilt null, head check, error in evidence).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
BUILT for the minimum only: scripts/analysis/proof-slice.mjs + proof-slices.json + src/tests/proof-slice.logic.test.ts (commits e641ff7be, fix 0918e53a8; hooks green, 36 tests). Slice S table on committed head: PASS 5, FAIL 0, NOT BUILT 10, GAP 1, exit 3 (docs/reports/lanes/2026-11-19/BL-PROOF2/TABLE.md). Caller: the PROOF.S lane (task-268) runs it as its acceptance command. Later stages and unblockers: design fit task-345 then task-67; loading task-266, task-267; load-failure task-317; report read, key match task-123; screenshots and element check task-123, task-265; storage probes task-265. AC #1 and #8 are generic criteria that do not apply (no by-law step, no McFrontend row); #4 and #5 not re-verified in stage 2.
<!-- SECTION:FINAL_SUMMARY:END -->
