---
id: TASK-387
title: >-
  RULES.ACC Rule accuracy: retire list to the operator, conflicts C1 to C5
  written in his words, by-law checked count corrected
status: RUNNING
assignee:
  - '@lane-BL-RULESACC'
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix
  - McFix E
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-RULESACC/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-RULESACC/FINDINGS.md
type: build
ordinal: 87012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section E2. Retire candidates (grounder-verified stale): Spec 90 :46 and :71, 08_agents :343 and :19/:28: retiring is the operator's ruling. C1 to C5 (docs/reports/lanes/2026-11-20/BL-VERIFYC/VERIFY.md; BL-GROUND/VERDICTS-SUMMARY-2.md) written as dated notes only after his words; Spec 126:810 against Spec 100:123 resolved by his C2 answer. By-law handbook count: report-only is not counted as enforced. Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: docs/specs/03-mobile/90_mobile_engineering_protocol.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md, docs/specs/00-architecture/08_agents.md, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, scripts/surfaces/_schema/bindings.json, src/tests/surfaces/rules-acc-notes.logic.test.ts, backlog/decisions/**, backlog/tasks/task-370*, backlog/tasks/task-348*, docs/specs/02-web-admin/136_mcfrontend_handbook.md, scripts/surfaces/_schema/surface-rule-map.json
<!-- SECTION:DESCRIPTION:END -->

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
PLAN task-387 RULES.ACC (lane BL-RULESACC). Smallest change, existing mechanisms only. Principles served: standardized, understandable, simple. Rule: Spec 135 header "Operator verbatim = the operator's own words"; Spec 137 rule 10 (137_mcqueue.md:109) "The operator's words are copied exactly, with the date, the row id and the queue, and the prior row text is kept."; Spec 00 section 14 (00_engineering_standards.md:463) a behaviour-changing ruling updates all cited specs in the same commit; 08_agents.md section 7 rule 4 and section 11.1.

(1) RULING RECORDS (scripts/analysis/backlog-decision.mjs, ids from RR-0315, quote checked against its MORNING-DECISIONS.md line by the tool). One record per distinct ruling, from the six entries headed "Operator RULES" / "APPROVES" of 2026-11-20 (MORNING-DECISIONS.md:1383, :1397, :1407, :1420, :1425, :1430): plan go, fold, d, e (:1384); C2, C3, D13, C5, D1, semi cache (:1399, fragments "1 a", "2 b", "3 a", "4 a", "5 c", "6 accept"); phone retries and web search (:1409, "Phone retires yes", "web search yes"; the meaning of each is the orchestrator's reading, recorded as a reading in the text, never in the quote field); page conversion approved and app-not-in-use (:1422); task 370 and the six-row table (:1427, meaning is the orchestrator reading :1428); McFrontend row for a fix and the meter location (:1432, "1 a" and "2. y"). The rulings register ~/Buildo-scratch/plan-gen/rulings-register.json is outside the lane write scope: the rows are drafted in the lane dir for the orchestrator to add with add-ruling.mjs (not written by this lane).
Status moves: no tool moves a status from a ruling record (backlog-decision.mjs only appends the dated note, backlog-status-check.mjs is read-only). The sanctioned route is a lane commit that sets the status word with the backlog CLI and quotes the ruling (Spec 137 section 3, 137_mcqueue.md:21 and :84 "DROPPED ... The ruling is quoted"). task-370 LATER to DROPPED (ruling: line, quote "Task 370 yes . approved", marked with the orchestrator reading); task-348 OPERATOR to DONE-as-answered with the record id; both through the CLI in this commit. If the hooks refuse, stop and report.
(2) DATED NOTES, prior text kept (M-246): Spec 126 after :810: C2 correction (error screen with Try again, not counted; "closed reason" sentence of the 2026-11-20 note is overturned for the failed compute; phone 3 retries is the orchestrator reading) and C4 at :990 (in-app sheet rests on the 2026-11-11 "1-12 yes", not on the "Linking.openURL" description; Android Done and silent failure residuals stated). Spec 100 after :123: C2 stands, C5 (every paying user at once; gate stays the switch alone; D-1 now ruled), C1 as verified (engineering matter, no operator words: the buildable lock is a test that the core's closure never reads run_at or descriptor; nothing built here), the meter (counts only when a report is produced; counted in the lookup route; location ruled "2. y"). Spec 135 FE-39 row: dated note C5 (a) via the Spec 135 row text; the Spec 136 handbook is regenerated by its generator if it renders the row. scripts/surfaces/_schema/bindings.json $comment: a dated note that the 48 px is the operator's ruling "3 a" (the earlier wording kept). C3 is not repeated (task-389).
(3) RETIRE LIST as an OPERATOR DRAFT file only (Spec 90 :46 and :71, 08_agents :19 :28 :343): nothing retired, no edit to specs 90 or 08.
(4) BY-LAW CHECKED COUNT: computed from Spec 133; the figure lives in dated lane reports, not in a script: drafted, nothing changed.
TEST (red first, through the real hooks): src/tests/surfaces/rules-acc-notes.logic.test.ts asserts the notes exist with the operator quote, the bindings note names the operator ruling, and the retire/count draft file exists. Extend the task Files line (CLI) for the files this needs.
Not done by this lane: grounder (owed), push, DB, register edit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operator ruling 2026-11-20, verbatim: "1 a 2 b 3 a 4 a 5 c 6 accept" (the six decisions; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entry "Operator RULES on the six decisions"). To write as dated notes citing those words, AFTER task-376 folds (same spec files): C2 (a) error screen with Try again, not counted: correct Spec 126:810, Spec 100:123 stands; C3 (b) legal line at the bottom of the phone search page (the build is its own task); D13 (a) 48 px on the semi page Continue and Try again is now an operator ruling (bindings.json touch_targets note says orchestrator decision: correct it); C5 (a) every paying user at once when the web switch flips: dated note on FE-39 through the register generator (with task-388). Semi page cache write accepted as built. C1 and C4 as verified in BL-VERIFYC. STILL OPEN for the operator: the phone's 3 retries before the error screen.

Operator ruling 2026-11-20, verbatim: "Phone retires yes and web search yes" (MORNING-DECISIONS.md entry "phone retries and the web search legal line"). C2 addition: the phone keeps its 3 retries before the error screen shows (orchestrator reading of 'Phone retires yes': the recommendation put was to keep them).

Operator 2026-11-20, verbatim: "Task 370 yes . approved" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1427; the table put to him is quoted in that entry). Also in this task: enter the operator rulings of 2026-11-20 into the rulings register and the Backlog decisions with scripts/analysis/backlog-decision.mjs (next id after RR-0314), each with its verbatim quote and MORNING-DECISIONS.md line: the six decisions; phone retries and web search; the conversion approval; the plan rulings (go on A and B, fold, d, e); task-370 dropped and task-348 answered (:1427), so those two statuses move by the ruling record, not by hand.

2026-11-20 taken on the board at lane launch (lane BL-RULESACC, worktree /Users/brettpreston_macmini/Buildo-wt-rulesacc, branch wf1/inc1b-rulesacc), RR-0240

Dated note 2026-11-20 (M-246, prior text kept; RR-0315 · task-387 · Backlog; operator, verbatim: "1. yes. add the tasks to incr 1b and remove the ones we dont need")

Dated note 2026-11-20 (M-246, prior text kept; RR-0316 · task-387 · Backlog; operator, verbatim: "2. fold")

Dated note 2026-11-20 (M-246, prior text kept; RR-0317 · task-387 · Backlog; operator, verbatim: "d. just add the review enforcement not the others.")

Dated note 2026-11-20 (M-246, prior text kept; RR-0318 · task-387 · Backlog; operator, verbatim: "e. fine")

Dated note 2026-11-20 (M-246, prior text kept; RR-0319 · task-387 · Backlog; operator, verbatim: "1 a")

Dated note 2026-11-20 (M-246, prior text kept; RR-0320 · task-387 · Backlog; operator, verbatim: "2 b")

Dated note 2026-11-20 (M-246, prior text kept; RR-0321 · task-387 · Backlog; operator, verbatim: "3 a")

Dated note 2026-11-20 (M-246, prior text kept; RR-0322 · task-387 · Backlog; operator, verbatim: "4 a")

Dated note 2026-11-20 (M-246, prior text kept; RR-0323 · task-387 · Backlog; operator, verbatim: "5 c")

Dated note 2026-11-20 (M-246, prior text kept; RR-0324 · task-387 · Backlog; operator, verbatim: "6 accept")

Dated note 2026-11-20 (M-246, prior text kept; RR-0325 · task-387 · Backlog; operator, verbatim: "Phone retires yes")

Dated note 2026-11-20 (M-246, prior text kept; RR-0326 · task-387 · Backlog; operator, verbatim: "web search yes")

Dated note 2026-11-20 (M-246, prior text kept; RR-0327 · task-387 · Backlog; operator, verbatim: "approved")

Dated note 2026-11-20 (M-246, prior text kept; RR-0328 · task-387 · Backlog; operator, verbatim: "remember the app is not beign used - we are in development")

Dated note 2026-11-20 (M-246, prior text kept; RR-0329 · task-387 · Backlog; operator, verbatim: "Task 370 yes")

Dated note 2026-11-20 (M-246, prior text kept; RR-0330 · task-387 · Backlog; operator, verbatim: ". approved")

Dated note 2026-11-20 (M-246, prior text kept; RR-0331 · task-387 · Backlog; operator, verbatim: "2. y")

Dated note 2026-11-20 (M-246, prior text kept; RR-0332 · task-387 · Backlog; operator, verbatim: "1 a")

2026-11-20 lane BL-RULESACC: ready, grounder owed; commits 893528a4b and the ruling-records commit; report docs/reports/lanes/2026-11-20/BL-RULESACC/REPORT.md

2026-11-20 fold round after GROUNDER.md (verdict: fold after named fixes): handbook regenerated, test cut to 5 cases, notes re-attributed, reading records relabelled; lens set not rerun.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder, 2026-11-20 (the lane verifies each cited fact before building): follow-ups: (a) delete the C1 sentence at Spec 100:125 (the card allows dated notes only after his words; C1 stays in BL-VERIFYC VERIFY.md and the lock stays owed on task-377). (b) task-370 stays DROPPED (the row he answered at MD:1426 says "dropping it from this increment"; Spec 137:84). (c) decisions 110, 111, 114, 115 get source: reading in their headers (RR-0190), UNVERIFIED whether a status check rejects that value: check first; backlog-decision.mjs:69 hard-codes source: operator and needs a reading kind.

Step 4 audit by a separate grounder 2026-11-20 (file ~/Buildo-scratch/lanes-20261119/inc1b/retro/STEP4-LEDGER.md, sha256 d88e7548d70f…): of this task CONFIRMED and CONFLICT findings, 79: 24 fixed, 32 not fixed with a written reason (mostly holds for the operator that no task or decision tracks), 6 resolved by the operator, 17 UNADDRESSED (vacuous test guards deleted, not replaced; Spec 126/100 cited by line number; RETIRE-DRAFT row 1; no Spec 96 rows; the C1 lock names task-377 as owner but task-377 has no lock text; no OPERATOR task created; four CONFLICTs open). The ledger lists every id. Not complete until each has an outcome.
<!-- SECTION:NOTES:END -->
