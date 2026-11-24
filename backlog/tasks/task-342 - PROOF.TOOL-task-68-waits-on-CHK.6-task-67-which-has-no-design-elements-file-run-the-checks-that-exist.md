---
id: TASK-342
title: >-
  PROOF.TOOL (task-68) waits on CHK.6 (task-67), which has no design-elements
  file: run the checks that exist?
status: DONE
assignee: []
created_date: '2026-11-19T20:13:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - scripts/analysis/report-schema.mjs
  - docs/reports/lanes/2026-11-19/BL-R9/REPORT.md
priority: low
type: decision
ordinal: 42012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In plain words: the page-proof tool (task-68 PROOF.TOOL) is meant to run all the automatic checks on a search page, including a "design fit" check (task-67 CHK.6) that does not exist yet because it needs a list of the designed report elements that no task is asked to write. The question is whether the proof tool waits for that check or runs the checks that exist and says plainly that design fit is not yet built.

Grounded: yes. task-68 depends on task-62 (DONE), task-66 CHK.5 (BUILT) and task-67 CHK.6 (LATER, m-0); task-268 PROOF.S depends on 12, 69, 267 and 68. task-68 text: "CHK.6 design fit: it runs them, it does not rebuild them". task-67 note: blocked on the report-design-elements file, "no task in the eleven produces that file" (docs/reports/lanes/2026-11-19/BL-R9/REPORT.md:13). RS-12 does not exist: scripts/analysis/report-schema.mjs gates are RS-0 to RS-9 and RS-11 (header :25-28; gate('RS-9') :346, gate('RS-11') :360; there is no RS-10 gate; no report-design-elements file in the repo or in ~/Buildo-scratch, find to depth 4). CHK.6's design is ~/Buildo-scratch/lanes-20261117/checks/repo-drafts/DESIGN.md:18 (D1-D5 over the designed report elements; the file is "a design task, GUESS 0.5 d" on task-67). Slice S already allows a design-fit row that is not automatic: task-268 "(e) compliance rows marked AUTO-PASS, REVIEWED-PASS or GAP ... GAP not accepted by the operator means not DONE"; ~/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md:159-163. CHK.6 checks the report declaration, and the search pages are not report declarations, so for slice S the row is reviewed either way. task-68's text still names the dropped CHK.4; read it as the report-no-maths check MF-16 (task-68 note, R10).

Recommendation: PROOF.TOOL runs the checks that exist (CHK.5, the report checks, the harness, the key compare, the storage probes) and prints the design-fit row as GAP "CHK.6 not built"; drop task-68's dependency on task-67 once you approve. PROOF.S then needs a REVIEWED-PASS by a fresh reviewer for that row or your acceptance of the GAP (its own rule). task-67 stays LATER and separate; no new task is created now. Pulls forward: nothing. Cost: the design-fit row of PROOF.S is manual until CHK.6 exists. Alternative (not recommended): first a task to fill report-design-elements.json (0.5 d design task needing your confirmation of the design references), then RS-12, then PROOF.TOOL; that pulls a group F (1·A) design task into 1·B. Verified by review r1 of task-339 (docs/reports/lanes/2026-11-19/BL-R13/r1-review.txt, TRIAGE.md).
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-19 (M-246, prior text kept; RR-0303 · task-342 · Backlog; operator, verbatim: "if it needs to be produced at some point - we should do it now - if it isnt a big job")

2026-11-19 ANSWER (R14, task-344; operator question RR-0303, MORNING-DECISIONS.md:1160).
In plain words: WHERE does it come from? The list of designed report elements already exists as 117 rows in docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json (each with a name and a pointer into the design: path:line); the Elements tables in backlog/docs/increments/doc-4 and doc-2 are printed from that same file (doc-4 line 10). A 17-line check function and an empty file shell are drafted in ~/Buildo-scratch/lanes-20261117/checks/repo-drafts (design-fit.mjs, report-design-elements.json with 0 elements). DOES IT HAVE TO BE PRODUCED? Yes, for CHK.6 (task-67) to run; nothing in the repo has it (git ls-files shows only task files). HOW BIG? About 117 elements, 198 rendered report fields to match to them (report-v2.decl.json), 5 files, one lane, GUESS 0.5 to 1 day. The easy part is generated by a small script; the human part is matching 74 of the 117 elements to declaration fields (their text names no declared field) and re-pointing 63 design references that cite the old REPORT-LAYOUT-BRIEF-v4.md to the approved report.
Grounded: elements-by-inc.json: 257 rows, report side 192 rows / 117 unique ids, all 117 with src path:line, 63 cite REPORT-LAYOUT-BRIEF-v4.md, 12 flagged nofield; report-v2.decl.json: 199 fields (198 rendered), not_in_report 0; report-schema.mjs gates RS-0..RS-9, RS-11 (RS-9 :346), report-schema.mjs --check PASS today; design-fit.mjs:3-5 defines D1-D5; DESIGN.md:18; task-67 description (GUESS 0.5 d). Search pages (65 rows, key S) are not report declarations and stay out of RS-12.
Recommendation: produce now, as one build task, task-345 (CHK.6a, m-0, LATER, depends on task-62; task-67 now depends on it): part A (generator and the 117 rows) is not blocked; part B (the 74 field matches and the 63 design references) needs your word because design is yours (RR-0233). If you read 0.5 to 1 day in one lane as small, RR-0303 applies and task-345 can be launched; PROOF.TOOL need not wait for it (the GAP row in the Recommendation above stays valid until it lands). Verified by review r1 of task-344 for the direction, the size measure and the task text (docs/reports/lanes/2026-11-19/BL-R14/TRIAGE.md); UNVERIFIED: that design-fit.mjs runs (never executed here), the day estimate (a GUESS), and which approved-design lines the 63 references should point to.

2026-11-19 task-345 (CHK.6a) is held, not built, by the operator's words: "That's a large build." (MORNING-DECISIONS.md, last entry). Decision on this task owed.

Dated note 2026-11-19 (M-246, prior text kept; RR-0306 · task-342 · Backlog; operator, verbatim: "I would agree")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decision-91 (RR-0306), 2026-11-19: operator, verbatim: "I would agree" (MORNING-DECISIONS.md:1178). PROOF.TOOL (task-68) runs the checks that exist and does not wait for CHK.6 (task-67) or its elements file (task-345); a missing field is seen on the page. Both stay LATER.
<!-- SECTION:FINAL_SUMMARY:END -->
