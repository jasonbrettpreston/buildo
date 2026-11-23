---
id: TASK-423
title: >-
  PROTOCOL.SIMPLE One compliance review on the plan and one on the output,
  against rules sections; no review of paperwork
status: BUILT
assignee:
  - '@lane-BL-SIMPLE423'
created_date: '2026-11-21T16:43:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix
  - McFix V2
  - McFixReborn
milestone: m-1
dependencies:
  - TASK-419
references:
  - docs/reports/reviews/task-423/GROUNDER-PLAN.md
  - docs/reports/reviews/task-423/TRIAGE-PLAN.md
  - docs/reports/reviews/task-423/seat-integration-1.md
  - docs/reports/reviews/task-423/seat-reality-check-1.md
  - docs/reports/reviews/task-423/seat-regression-1.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-21/BL-SIMPLE423/REPORT.md
  - docs/reports/lanes/2026-11-21/BL-SIMPLE423/GROUNDER.md
  - docs/reports/lanes/2026-11-21/BL-SIMPLE423/TRIAGE.md
type: build
ordinal: 123012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (RR-0363, verbatim: "We just need the rules for deepseek.  Teh solution maybe just creating a rules section in the spec which is small.  There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done.  Unless the output was revealing to have critical or high faults and a second review of the output maybe required.  That's it.  No review of paperwork. ... LEt's correct these issues and get this working right?"; RR-0361 objective, verbatim: "the objective is an effective compliance review on the plan and the output.  It isn't 17"; yesterday, MORNING-DECISIONS.md:1546, verbatim: "Just deliver the priority compliance item or the comprehensive summary that fits - files too large to review even when split. or split smaller"). Why: a 15-line task (task-419) took about five hours: nine compliance review calls on the plan and nine on the output (one call per rule document, because whole documents are sent and one call holds 120,000 characters, scripts/deepseek-review.js:35), each finding ruled singly, and every review made stale by any later commit. The six issues to correct, as he pasted them back: (1) any change after a review makes every review stale; (2) the same finding is ruled many times; (3) the process mostly reviews its own paperwork; (4) rules attach by file path alone (a generated-numbers refresh drew 58 reviews and 313 findings); (5) plan findings are ruled twice (copied into the lane folder and re-ruled by the output grounder); (6) "suite passed" did not mean "push will pass" (the push gate has checks the station suite does not run). Wanted: the tooling and the spec text brought to his shape, by the smallest change, reusing what exists. The plan (written read-only, reviewed before any build) names the design, the slices and the Files line. Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, scripts/analysis/backlog-brief.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/backlog-brief.logic.test.ts, src/tests/backlog/backlog-brief-context.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 (a) Joined input, offline: lens-input --list rules --lists <the nine ids> on the real table with the plan material of task-419 writes at most 3 files; the stitched list parts equal the whole text of the nine lists in table order; an input with a part shortened or edited is refused at close (control: the untouched set is accepted); with --max small the parts are more and every part is under the bound.
- [ ] #2 (b) Close and gate: a joined output set is accepted; a per-list set is accepted (control); a folder holding both for one phase, a joined set with a gap, and a joined set for a different resolved list are refused; the plan gate accepts joined or per-list plan evidence.
- [ ] #3 (c) Plan once: a lane folder with no plan-*.txt closes when GROUNDER-PLAN.md at L is non-empty with a Plan line; no Ruled line and no plan finding id is demanded; GROUNDER-PLAN.md absent at L with no plan-*.txt, or an empty one, is refused; absent at L with plan-*.txt present keeps the old rule (control).
- [ ] #4 (d) A table list named rules is refused by validate; the page check passes after regeneration; the brief names the joined command and no longer says to copy plan-*.txt.
- [ ] #5 (e) Counts pinned in rule-lists.logic.test.ts as at most: the tooling kind and the task-419 Files line 3 compliance files at the plan (material 12,400) and 3 at the output (diff 29,700); the task-412 Files line 3 and 3.
- [ ] #6 (f) Replay, a lane runs DeepSeek (5 calls): the task-412 plan stage as one joined compliance call set plus plan-review and error-paths; REPORT.md records the calls, the findings, whether plan-compliance-queue-137#1 (HIGH) is re-found and at least 80 percent of the distinct CONFIRMED compliance findings of docs/reports/reviews/task-412/GROUNDER-PLAN.md.
- [ ] #7 (g) The Pre-Review Self-Checklist is in REPORT.md; the four test files are green; git diff --stat shows only the Files line paths, the page and the task and review records.
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
# PLAN-423-v3: join the whole rule lists into one compliance call set per stage, rule the plan findings once (card A of two); card B and the station edit are listed at the end

Planner v2, folded by the separate plan grounder Cairn-Ground-P423 on the board head 36a2c2d63: docs/reports/reviews/task-423/GROUNDER-PLAN.md rules 129 findings (91 of the eleven DeepSeek plan outputs and 38 of the three seat reports). Read-only until the launch. Hours are MEASURED where they carry a lane source and GUESS where they do not. UNVERIFIED is marked. Every file:line cite of this plan is at board head 36a2c2d63; the fold of task-419 (700db70f0) moved some: check-lane-close.mjs after :641 by 21 lines (:688 is :709, :726 to :763 are :747 to :784), rule-lists.mjs after :425 by 1, 137_mcqueue.md after :141 by 2, and the test files (check-lane-close.logic.test.ts after :452 by 7 and more, rule-lists.logic.test.ts after :587 by 40, backlog-lane.logic.test.ts after :380 by 27 and more), so a test is found by its name and a script line by its quote.
Operator words are cited by entry and line of ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. The objective, verbatim: "the objective is an effective compliance review on the plan and the output.  It isn't 17" (:1711; the entry has no RR number, and the earlier cite RR-0361 is wrong: decision-146 rules the old findings of task-386). RR-0363 (:1718, decision-148): "It doesnt need to be a summary we can consolidate the specs awell as an option.  We just need the rules for deepseek." and "No review of paperwork.". RR-0364 (:1723, decision-149): "1. yes 2. yes". "the ruling are included as well" (:1731). "I am just adding to or understanding the existing plan. We hare not making a whole new approach here." (:1735). RR-0366 (:1744, decision-151): "Each of the five tasks is pre-approved to get this to work right" and "let's limit the output reviews to csomething reasonable".

## 0. What changed from PLAN-423-v2, on evidence
| Adjustment | v2 | Now |
|---|---|---|
| 1 the rules to the reviewer | cut rule lines with `lines` and `count`, three table trims, exempt tested before rows | Card A: the resolved lists are joined whole, in table order, into one virtual list and packed by size. Nothing is cut, nothing is trimmed, no table key is added, no operator question is needed. |
| 2 no review of paperwork | exempt globs, exempt before rows | Card B: decided by the task type (record, db-go) and by the changed paths, in the close check. No glob, no resolver change. |
| 3 plan findings ruled once | kept | Card A, with a stronger replacement for the plan-evidence test (section 2e). |
| 4 medium outcome | kept, then replaced by RR-0369 (MORNING-DECISIONS.md:1781) | Card B: output round 1 fixes mediums with the highs and criticals, from output round 2 a medium is recorded with a reason. |
| 5 a review stays valid, a fix is reviewed on the fix diff | range stamps and round files | Not built. Adjustment 5 is not built: today's whole-range check already keeps a review valid unless the covered code changes, and the fix-diff-only part is task-414 (RR-0336 item 7, approved), which stays open and unchanged. |
| 6 the station runs the gate | one line, or card D into the repo | The one line in ~/Buildo-scratch/push-station/station.sh, by the orchestrator, with its two proving runs recorded; no card. Moving the station into the repo needed the operator to name it (the infra-freeze named list, MORNING-DECISIONS.md:745); RR-0370 (:1787, decision-155) has since ruled option C, one list of push checks kept in the repo and used by the hook and the station (task-424), plus the one line today. |

Why adjustment 1 changed. Nothing is cut: every resolved list is joined whole, in table order, and packed by size; the dated notes that amend the rules travel with them. Measured at 36a2c2d63: Spec 137 holds 3,430 characters of Rule lines and 15,110 with its dated notes and bullets (of 32,996); Spec 08 section 7 holds 3,825 characters of numbered rules and 9,539 with its dated notes (of 9,567). The amendments live in the dated notes (137_mcqueue.md:98 is Rule 3, :100 is its two-commit-close note), so a rule-line cut shows the reviewer superseded text and hides this plan's own notes. The operator's rulings keep the lists whole (MORNING-DECISIONS.md:1285 "compliance means the handbooks", RR-0336 items 4 and 5 answered No, rule-lists.json:4 "never a hand-picked clause", README.md:156); a cut would reverse them, a join does not. The operator's other form, a small rules section written into each spec, is his option and RR-0368 (MORNING-DECISIONS.md:1768, decision-153) orders it as tasks 427 and 425.
Why the three trims are dropped. The tests row attaches the engineering standards whole (eng-all, 46,076 characters), so the v2 figure of 87,000 characters did not hold: card A's own Files line resolves the same nine lists as the tooling kind, 194,255 characters, and the trims would have bought one call per stage at the price of three lost rule sets (doc-17, Spec 08 section 5.3, engineering standards sections 1, 3, 4, 6, 7, 8, 10, 12, 13).

## 1. Measured cost today and after card A
Measured at 36a2c2d63 with the repo's own buildLensInputs over the resolved lists of each kind of task (lens-compliance.md, 120,000 character bound, rulings context 4,620 characters, plan material 12,400 characters, diff material 29,700 characters; the figures for the final virtual-list code are UNVERIFIED within one call). Compliance calls per stage:
| kind of task | lists | today | after card A, plan | after card A, output |
|---|---|---|---|---|
| tooling (card A's own Files line) | 9, 194,255 chars | 9 | 3 | 3 (a 48,000 character diff: 5) |
| spec only | 7, 149,280 | 7 | 2 to 3 | 3 (48,000: 4) |
| pipeline step | 10, 197,241 | 10 | 3 to 4 | 4 |
| McFrontend web | 15, 679,426 | 17 to 19 | 9 to 11 | 12 to 14 |
| phone | 15, 766,416 | 17 to 20 | 10 to 13 | 14 to 16 |
| storage | 13, 569,670 | 15 to 16 | 8 to 10 | 11 |
One compliance call per stage is not reached: tooling and spec tasks draw 2 to 3 compliance calls per stage, pipeline 3 to 4, web 9 to 12, phone 10 to 14, storage 7 to 11. The reason is arithmetic: one call holds 120,000 characters (scripts/deepseek-review.js:35), the rules alone are 149,000 to 766,000, and the join only removes the unfilled space of the per-list calls.
Whole tasks. task-419 (165 changed lines): plan 11 calls and output 11 become 5 and 5 (3 compliance plus plan-review and error-paths; 3 plus code-review and error-paths), 22 become 10, and a whole-range re-run after a fix costs 5 where it cost 11 (33 become 15). task-412: 22 become 10. Paperwork lanes (BL-SCORE421, 58 calls on 49 generated files; BL-MIG334, 13 calls on a 3-line queue row) become 0 by card B.
Why the cost is what it is: resolveTask (rule-lists.mjs:218) returns every list; planPrep and the brief run one lens-input per list; listProof (check-lane-close.mjs:380) demands one output per list per phase; the grounder re-rules the plan findings at the output. Surface, phone and storage tasks keep 7 to 16 calls per stage after card A; the operator's own option, a small rules section in each large spec, is what takes them lower, and RR-0368 (MORNING-DECISIONS.md:1768, decision-153) orders it: the rules index check and the sections for Spec 137 and Spec 08 are task-427, the sections for the engineering standards and the orchestrator rules are task-425, each with its own plan stage after this task.

## 2. Card A, the design (task-423: adjustments 1 and 3)
Reuse what exists: buildLensInputs, renderLensInput, parseLensInput, listProof, reviewErrors, splitUnits and the part/chunk stamps stay as they are. The join is a virtual list the existing code reads like any table list.

### 2a. The joined list (scripts/analysis/rule-lists.mjs)
- `joinLists(table, ids)` returns a copy of the table with one extra list `rules`: `{ file: 'the <n> resolved lists (<ids>)', generated_by: 'joined', whole: true, members: [each member list with its id] }`. A table list may not be named `rules` (one line in validateTable, :108).
- `listBlocks` (:98): a list with `members` returns the blocks of each member in the given order, labelled `<member id>: <label>`. The packing is the existing partsFor (:374): units are cut at headings only when a block is over the room, packed in order, never trimmed. No `lines` key, no `count` key and no table trim is built: a rule or a dated note added to a spec is in the next review without any table edit.
- `renderLensInput` (:342): for a list with `members` the head reads `RULE LIST rules (<n> lists: <ids>)`; the stamp is unchanged.
- CLI `lens-input` (:775): `--list rules --lists a,b,c` builds the virtual list from those ids (each must be in the table) and writes `in-<phase>-compliance-rules[-pN].txt` through the same code.
- `planPrep` (:549): for a build task one lens-input call with the resolved ids (inputArgv :620, the dry-run lines :623-625, the job list :634 reads `in-plan-compliance-rules(-pN)?.txt`). Any failed call still removes every output and the phase is run again (:641 "nothing is kept, run the phase again"); the REVIEW header and VERDICT line test (:645) still catches a cut-off reply.

### 2b. The close and the launch gate accept the joined set (scripts/hooks/check-lane-close.mjs)
- One helper decides the form per phase from the files in the folder: any `<phase>-compliance-rules*` file means the joined form, any `<phase>-compliance-<list id>*` file means the per-list form (today's, kept), a folder holding both forms for one phase is refused, neither is refused naming the joined file first. The joined proof is the existing listProof (:380) with `l = { id: 'rules' }` and the table returned by joinLists, so the stamp, the whole-list recompute (:408), the chunk coverage and the prompt hash are the existing ones; the recomputed text comes from the lists the task resolves now, so a shortened or edited joined text is refused. The Spec 137 task-410 note (137_mcqueue.md:136, a chunk, an input or an output hash that does not match is refused) stays true under the join: the joined input is stamped and recomputed as any list input.
- Used at the three sites that loop `r.lists`: closeErrors (a) (:477), planGateInner (:591) and the lane-brief text. No table key changes, so the lane table pin (check-lane-close.mjs:688, base_ref, finished_statuses, protected_paths, exempt) refuses no open lane; the evidence form decides, per phase, so a task launched before card A closes the old way and nothing already BUILT is re-gated. Card A's own lane may close with either form. The per-list path is removed in a later cleanup once no open lane uses it (no card now).
- `compliance:<list id>` references on the task stay one per list (RR-0343, backlog-lane.mjs:129, rule-lists.mjs:452).

### 2c. The brief (scripts/analysis/backlog-lane.mjs, backlog-brief.mjs)
- The per-list sentence (backlog-lane.mjs:183, matched again at :223) becomes one sentence for the joined lists naming the ids and the one command, with the files `out-compliance-rules[-pN].txt`; the merge test at :223 matches the new sentence. The grounder sentence (:184) stops telling the lane to copy plan-*.txt into the lane folder and to list plan findings: plan evidence is on the board.
- backlog-brief.mjs:177 drops "the lane still runs at least one plan-stage lens of its own and rules its findings in its own GROUNDER.md"; the test at backlog-brief.logic.test.ts:72 changes with it.

### 2d. Findings and the page
- Finding ids stay `<file stem>#N`, so the joined files give `out-compliance-rules#N` and `out-compliance-rules-p2#N`; the Ruled lines of the grounder name the joined files.
- The page docs/reports/generated/rule-lists-by-kind.md keeps its per-list numbers (parts of one list alone); it is regenerated in the docs commit because the specs change. It is not named on the Files line: naming it would attach the generated-reports row lists (policy-124-s2-s5 is not among the nine) and the launch gate would demand plan evidence for it; a docs commit with no code staged is not held to the Files line by check-task-files.mjs:49, and docs/reports/ is allowed by the close check (check-lane-close.mjs:453).

### 2e. Adjustment 3: plan findings are ruled once
- closeErrors reads only `out-*.txt` for findings and for the Ruled lines (the lensFiles filter, :520) when the plan evidence is on the board: GROUNDER-PLAN.md at the launch commit L is non-empty and holds a `Plan: <this task id> sha256:<12 hex>` line (read in check() with `git show L:docs/reports/reviews/<id>/GROUNDER-PLAN.md`, L as derived at :729-734; the launch gate, which refuses before the take, put it there). The exact hash is not compared at close: the take appends a note to the task body at L, so the hash of the body at L is not the hash the gate computed.
- The requirement of at least one `plan-*.txt` in the lane folder (:516) applies only when GROUNDER-PLAN.md is absent at L (a task launched before the launch gate, or taken by hand): then the old requirement and the old ruling of plan findings stand. A task launched under the gate that also holds plan-*.txt in its lane folder (task-419) simply has them ignored.
- The brief grounder sentence (2c) and README items 4 and 5 are changed to say so; the grounder rules out- findings only.

## 3. Card A, order of work and tests
0. The Pre-Review Self-Checklist (00_engineering_standards.md:287, always applies, every WF): 5 to 10 items from the plan sections 2 and 3, PASS or FAIL each, written in REPORT.md before the first test run and again before the review.
1. Tests first, red, then green (src/tests/backlog/). Changed because the plan changes what they lock: check-lane-close.logic.test.ts (the per-list and -pN output tests at :181-205, "no plan-stage output" at :191 and :309-312, plan finding ids at close :236-237, the Ruled line per plan output :265, the layout text :303-324, the every_task and milestone lists :376-399), rule-lists.logic.test.ts (lens-input :244-300, :304, the real-task resolutions and the page :331-370 and :447-475), backlog-lane.logic.test.ts (the per-list lens line :211, :234, :294, :310, :322, :432; the plan-prep writes :545-597), backlog-brief.logic.test.ts:72. Controls that stay green byte for byte: check-lane-close.logic.test.ts :217-264 (grounder not the lane, verdict form, quote on the cited line), :330-368, :355 (self-edit), :500 (a build task whose range is empty is refused), :528-560 (the table read from the range base), :571-607, :631-749, :911-1002 (the launch gate); rule-lists.logic.test.ts :67, :121-215, :633-640.
2. rule-lists.mjs (section 2a), then check-lane-close.mjs (2b, 2e), then the two brief files (2c). One commit of work and tests, with a dated line on the task file (the commit-msg hook needs the task file in a code commit; the status is not moved).
3. A docs commit with no code staged: the dated notes of section 4, README items 3 to 5, and the regenerated page (`node scripts/analysis/rule-lists.mjs page --write`).
4. The two-commit close (Spec 137 Rule 3 as amended): the closing commit holds records only (lane report directory, review context directory, task file, decision record).
Run the four changed test files with the project's test command (npm run test, restricted to those four files) and the pre-commit hooks; never --no-verify.
Acceptance (observable; the orchestrator writes these onto the task as its acceptance criteria with the fold, so the brief's Done-condition is not empty):
(a) Joined input, offline: `lens-input --list rules --lists <the nine ids of card A's Files line>` on the real table with the plan material of task-419 writes at most 3 files; the stitched list parts equal the whole text of the nine lists in table order; an input with a part shortened or edited is refused at close (control: the untouched set is accepted); with `--max` small the parts are more and every part is under the bound.
(b) Close and gate: a joined output set is accepted; a per-list set (the old form) is accepted (control); a folder holding both for one phase, a joined set with a gap, and a joined set for a different resolved list are refused; the plan gate accepts joined or per-list plan evidence.
(c) Plan once: a lane folder with no plan-*.txt closes when GROUNDER-PLAN.md at L is non-empty with a Plan line; no Ruled line and no plan finding id is demanded; GROUNDER-PLAN.md absent at L with no plan-*.txt in the lane folder, or an empty one, is refused; absent at L with plan-*.txt present keeps the old rule (control).
(d) A table list named `rules` is refused by validate; the page check passes after regeneration; the brief names the joined command and no longer says to copy plan-*.txt.
(e) Counts, measured on the real table and pinned in rule-lists.logic.test.ts as at most: the tooling kind and the task-419 Files line, 3 compliance files at the plan (plan material 12,400) and 3 at the output (diff 29,700); the task-412 Files line, 3 and 3.
(f) Replay, a lane runs DeepSeek (5 calls): the task-412 plan stage as one joined compliance call set plus plan-review and error-paths. Recorded in REPORT.md: the calls (5, where 11 were made), the findings, and whether the joined set re-finds plan-compliance-queue-137#1 (HIGH, the Spec 137 Rule 3 note; docs/reports/reviews/task-412/GROUNDER-PLAN.md) and at least 80 percent of the distinct CONFIRMED compliance findings of that file. Not a pass bar on the count of findings.
(g) The Pre-Review Self-Checklist is in REPORT.md; the four test files are green; git diff --stat shows only the Files line paths, the page and the task and review records.

## 4. Spec sentences amended in card A (dated notes in the M-246 form, prior text kept, each citing the operator by entry and line)
- docs/specs/00-architecture/08_agents.md, Section 5.3: one dated note after the task-410 note (:231) and its correction (:233): the compliance lens runs once per stage over the resolved lists joined whole and packed by size, one output set per stage (`out-compliance-rules[-pN].txt`), where the notes at :229 and :231 say once per list; the per-list set is still accepted for a task launched before card A. The sentence "never trimmed" of :229 stays true. RR-0363 (:1718), "We just need the rules for deepseek." and the objective (:1711).
- 08_agents.md, section 7 rule 4: one dated note under the rule-4 note (:348): the same one-sentence statement, plus: the plan findings are ruled once, at the plan, and the lane close reads only the output findings when the plan evidence is on the board. Rule 6 is not changed in card A.
- docs/specs/00-architecture/137_mcqueue.md: one dated note after the task-410 note (:136): one compliance lens output set per stage (the note at :134 says one per rule list); the close reads GROUNDER-PLAN.md at the launch commit for the plan evidence. Cross-Spec Dependencies: the coupling is rule-lists.mjs and check-lane-close.mjs only; no new table key couples a spec to rule-lists.json, so no Cross-Spec Dependencies row changes in either spec.
- .claude/review-templates/README.md items 3, 4 and 5 (:158-:160): item 3 "The lens line: one compliance run per list" becomes one run over the joined lists; item 4 says a finding is a BUG or DEFER line of an out- lens output (plan findings are ruled at the plan); item 5 says one joined output set or the per-list set. README.md:156 ("never a hand-picked clause") and the table $comment stay true: nothing is cut.
- Not touched: Spec 08 section 11.2 and CLAUDE.md :139 and :143 describe the cross-read pass after a fold (task-419's scope), not the number of compliance outputs; each stays true as written.
The amendments are graded against the amended text by the output compliance call, because the lens reads the lane's tree; the output grounder reads the diff of the notes against their prior text.

## 5. Not done, and risks
- Not done in card A: adjustments 2 and 4 (card B), adjustment 5 (task-414, unchanged), a rules section or consolidation of the large specs (tasks 427 and 425, RR-0368), deleting the packs under .claude/review-templates/packs/ (nothing reads them; the lane-tools row globs `.claude/**`, but a row attaches rule lists and the review material is the diff, so the packs are sent only if a change touches them), committing fewer in- files, a counted cap on fix rounds (the brief's max_fix_rounds: 2, backlog-brief.mjs:169, stays a stated rule; RR-0339 rules rounds bounded, not endless; RR-0371, MORNING-DECISIONS.md:1803, sets two review rounds on a plan and three on the output as a starting setting, counted by no card of this plan), a duplicate-finding verdict word (add only if the replay of acceptance (f) shows more than 2 findings ruled twice).
- Risk: a call over the bound or a cut-off reply. The existing phase fails closed: any failed call removes every output and the phase is run again (rule-lists.mjs:641), and a reply without the REVIEW header and VERDICT line is refused (:645). A joined part is larger than a single list, so a reply can be longer; the same test applies.
- Risk: the whole-list recompute reads the lane's tree, so a spec edit merged in after the review stales the joined set exactly as it stales a per-list set today; unchanged, and the lane merges the board before the review.
- Risk: both forms stay accepted until a cleanup removes the per-list path; the brief tells a lane launched after card A to use the joined form, so the choice is the lane's cost, not a gap.
- Risk: the figures of section 1 are measured on the tool's packing over a joined text, UNVERIFIED for the final virtual-list code within one call; acceptance (e) pins them.

## 6. Cards: card A as built here, card B ready, the station edit
All code cards are type build, milestone m-1, two-commit close. Each protected path (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs) may not change in the closing commit. Cards A and B edit the same functions, so they run in order, not in parallel. Order: A first (it changes every code task: 22 calls become 10 on task-419 and task-412), then B (it removes 58 and 13 calls from paperwork lanes and is the smaller, lower-risk change, planned under A's joined form so its own plan stage is cheaper). Neither can go first with less risk than A without leaving B's plan stage at the old 11 calls.

### Card A: task-423 (adjustments 1 and 3)
Title: PROTOCOL.SIMPLE One compliance call set per stage by joining the whole rule lists; plan findings ruled once.
Description: as on the task. RR-0363 (:1718, decision-148) "We just need the rules for deepseek.", the objective (:1711) "the objective is an effective compliance review on the plan and the output.  It isn't 17", RR-0366 (:1744) "let's limit the output reviews to csomething reasonable".
Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, scripts/analysis/backlog-brief.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/backlog-brief.logic.test.ts
Depends on: task-419 BUILT (same two protected files). The Files line resolves the same nine lists as the plan evidence holds (no new list, so no new plan compliance output).
Acceptance: section 3 (a) to (g).

### Card B (open it after card A is BUILT; text ready): adjustments 2 and 4
Title: PROTOCOL.RECORDS A medium finding may be recorded from output round 2; a paperwork task gets a grounder record check and no review.
Description: RR-0364 (:1723, decision-149), verbatim "1. yes 2. yes", put to him as: "1. Medium and low findings after the output grounding. My recommendation: they are recorded with a reason and not fixed, so they never trigger another review." and "2. Paperwork tasks, such as the queue row. No review, as you ruled. My recommendation: a separate grounder still checks the row is true before the fold, which is one short read, not a review round."; RR-0363 (:1718) "No review of paperwork.". RR-0369 (:1781, decision-154) replaces RR-0364 item 1 for medium findings, verbatim "Let's make this easy the first round of MEdiums on the outputs are corrected with Highs and criticals and then the second round is just highs and criticals."; RR-0367 (:1760, decision-152) holds fix-only re-review and says important medium findings are fixed. Source: GROUNDER-PLAN.md of task-423 (adjustments 2 and 4).
Design (smallest, no glob, no resolver change, no table key):
- outcomeErrors close mode (check-lane-close.mjs:188-193, refusal text :203): under RR-0369, in output round 1 a MED closes as today (fixed or ruling, task for a DEFER) with the CRITICAL and HIGH; from output round 2 only CRITICAL and HIGH must be fixed, and a MED may close by pile or wontfix with a reason of 30+ characters (LOW and NIT by any form, as today); plan mode is unchanged (RR-0364 item 1 said after the output grounding, and RR-0369 speaks of the outputs); the Final Summary line per CRITICAL, HIGH or MED stays (08_agents.md:351); how the close knows its output round (the file name out-<lens>-rN or the round line of the Final Summary) is decided in card B's own plan stage. The severity is the grounder's word in the first 40 characters of its reason, as for LOW today.
- closeErrors: `paper` is true when the board copy of the task has type record or db-go and every changed path of the range is under docs/reports/generated/, docs/reports/lanes/, docs/reports/reviews/, backlog/tasks/, backlog/decisions/ or is .cursor/*QUEUE*.md (an allow-list constant in check-lane-close.mjs; anything else, including docs/specs, backlog/docs, backlog/milestones, backlog/config.yml, scripts, src and an empty range, is not paperwork and takes today's full proof). For paper: no compliance or lens output, plan or out, is required; GROUNDER.md of a separate grounder (the existing header, clash and quote tests of grounderErrors) holds at least one `record#N CONFIRMED <path>:<line> "<quote>"` line for the claims of REPORT.md, and a record line that is REJECTED or CONFLICT refuses the close.
- Brief text (backlog-lane.mjs lensLine): for type record and db-go the brief says no review, the record lines, and that a path outside the paperwork list restores the full set.
- Spec notes: 08_agents.md section 7 rule 6 (MED pile and wontfix from output round 2, Final Summary line kept; RR-0369) and 137_mcqueue.md (paperwork gets a grounder record check only); README item 5.
Files: scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
Acceptance: (1) offline: the range of BL-SCORE421 (49 generated files, type db-go) and of BL-MIG334 (the queue row, type record) need no lens output and need record lines (58 and 13 calls become 0, plus one short grounder read); control: the same range plus one scripts/ file takes the full set; a record task with no record line, or with a REJECTED one, is refused; an empty range of a build task is still refused (check-lane-close.logic.test.ts:500 stays green); (2) in output round 1 a MED closed by pile is refused (control: fixed or ruling is accepted); from round 2 a MED closed by pile with 30+ characters is accepted; in plan mode it is refused; a HIGH closed by pile is refused; a MED with no outcome is refused; (3) the type is read from the board copy (a lane that retypes its task is refused, as today); (4) the Pre-Review Self-Checklist is in REPORT.md. Depends on: card A BUILT.

### Not a card
- Adjustment 5 is not built; task-414 stays open and unchanged. After card A a re-run after a fix costs the joined set (5 calls on task-419), not 11; from output round 2 (card B, RR-0369) only a CRITICAL or HIGH finding must be fixed; fix-only re-review is held (RR-0367).
- Adjustment 6 (RR-0370, :1787: option C is task-424, plus the one line today): the orchestrator adds one line to `suite` in ~/Buildo-scratch/push-station/station.sh, after the tip check: `step mcbylaws-gate node scripts/analysis/mcbylaws/gate.mjs --ci --base "origin/$br"` (gate.mjs:613 reads --ci and --base; .husky/pre-push:41 runs the gate first; the station already stops at `git rev-parse origin/$br` if the upstream is absent). Proof to run and record when the line is added (not run by this plan, UNVERIFIED until then): the gate prints GATE OK on 21adfde8a (BL-MIG334 REPORT.md item 2 ran it by hand) and stops with `id-no-row` on 0f6ba8225, where the migration 334 queue row is missing. It does not cover the interactive y that `gate.mjs --push` asks on the tty, which stays the operator's.

### Hours (elapsed, including the plan stage, the review and the two-commit close)
MEASURED on the lane folders: task-418 (550 changed lines in the same two protected files) 76 minutes from plan evidence to close; task-419 (165 lines) 77 minutes from the context file, plan stage about 30 minutes; task-412 (41 lines) about 20 minutes. Card A: about 200 lines of code plus tests plus three spec files, so 75 to 100 minutes of lane after the launch, plus the orchestrator's grounder, landing and close about 30 minutes: about 2 hours after launch (GUESS from the three measures); its own plan stage is this round. Card B: about 60 lines, a plan stage of about 30 minutes (under card A's joined form), a lane of 40 to 60 minutes and the close: about 1.5 hours (GUESS). The station line: 10 minutes (GUESS). Both cards, plan stages and closes: about 3.5 to 4 hours of elapsed time, where PLAN-423-v2 said 33 to 39. The v2 figure had no source; this one rests on the three measures above.

## 7. Questions ruled by the grounder; what the operator has ruled since
Ruled (QUESTIONS-RULED.md holds the grounds): 1 the station stays in ~/Buildo-scratch (the one-line edit now); 2 the three table trims are not made (they reversed three rulings and a join does not need them); 3 a rules section per spec is not built in card A or B.
Grounded: the operator has answered the three questions that were left to him, in the decision records of the board. Recommendation (checked against those records by the grounder, not by a DeepSeek round: UNVERIFIED by a review): the move of the station into the repo (the infra-freeze named list, MORNING-DECISIONS.md:745) is ruled by RR-0370 (:1787, decision-155) as option C, task-424, plus the one line today; the small rules sections are ordered by RR-0368 (:1768, decision-153) as tasks 427 and 425; the dropping of adjustment 5 is held by RR-0367 (:1760, decision-152, fix-only re-review held) and task-414 stays open and unchanged; the caps of RR-0371 (:1803) are two review rounds on a plan and three on the output. Nothing here is an open operator item of card A.

Plan review round 1: 101 folded, 0 task, 0 ruling, 0 wontfix, 8 pile; grounder docs/reports/reviews/task-423/GROUNDER-PLAN.md; triage docs/reports/reviews/task-423/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 MED folded one dated note after
plan-compliance-agents-s5-1to3#2 MED folded and no table trim is
plan-compliance-agents-s5-1to3#4 MED folded Design (smallest, no
plan-compliance-agents-s5-1to3#5 MED folded The tests row attach
plan-compliance-agents-s5-1to3#6 MED folded The one line in ~/Bu
plan-compliance-agents-s5-1to3#7 MED folded Surface, phone and s
plan-compliance-eng-all#3 MED folded Spec notes: 08_agent
plan-compliance-eng-all#4 MED folded The Pre-Review Self-
plan-compliance-eng-all#5 MED folded Surface, phone and s
plan-compliance-eng-all#7 MED folded stays open and uncha
plan-compliance-five-words#1 HIGH folded The tests row attach
plan-compliance-five-words#2 MED folded and no table trim is
plan-compliance-five-words#3 MED folded the trims would have
plan-compliance-five-words#4 MED folded a counted cap on fix
plan-compliance-five-words#5 MED folded anything else, inclu
plan-compliance-five-words#6 MED folded duplicate-finding ve
plan-compliance-inc-S#2 HIGH folded The tests row attach
plan-compliance-inc-S#3 MED folded Design (smallest, no
plan-compliance-inc-S#4 MED folded The one line in ~/Bu
plan-compliance-inc-S#6 MED folded Surface, phone and s
plan-compliance-inc-S#7 MED folded stays open and uncha
plan-compliance-ms-S#1 HIGH folded The tests row attach
plan-compliance-ms-S#3 MED folded stays open and uncha
plan-compliance-ms-S#4 MED folded Surface, phone and s
plan-compliance-ms-S#5 MED folded Design (smallest, no
plan-compliance-ms-S#6 MED folded The operator's other
plan-compliance-orchestrator-doc17#2 MED folded stays open and uncha
plan-compliance-orchestrator-doc17#3 MED folded 5 is not built: toda
plan-compliance-orchestrator-doc17#5 MED folded Design (smallest, no
plan-compliance-plan-protocol#1 MED folded Surface, phone and s
plan-compliance-plan-protocol#2 MED folded The one line in ~/Bu
plan-compliance-plan-protocol#3 MED folded stays open and uncha
plan-compliance-plan-protocol#4 MED folded Hours are MEASURED w
plan-compliance-plan-protocol#5 MED folded 5 is not built: toda
plan-compliance-plan-protocol#6 MED folded Source: GROUNDER-PLA
plan-error-paths#2 MED folded Design (smallest, no
plan-error-paths#3 MED folded anything else, inclu
plan-error-paths#4 MED folded at the launch commit
plan-error-paths#5 MED folded a counted cap on fix
plan-error-paths#7 MED folded and no table trim is
plan-error-paths#8 MED folded a folder holding bot
plan-plan-review-deepseek#1 MED folded 5 is not built: toda
plan-plan-review-deepseek#2 MED folded the evidence form de
plan-plan-review-deepseek#5 MED folded 5 is not built: toda
plan-plan-review-deepseek#6 MED folded and no table trim is
plan-plan-review-deepseek#7 MED folded the trims would have
plan-plan-review-deepseek#8 MED folded Design (smallest, no
plan-plan-review-deepseek#9 MED folded a counted cap on fix
plan-plan-review-deepseek#13 MED folded and no table trim is
plan-compliance-agents-s7-s11#1 MED folded Design (smallest, no
plan-compliance-agents-s7-s11#2 HIGH folded Nothing is cut: ever
plan-compliance-agents-s7-s11#4 MED folded 5 is not built: toda
plan-compliance-agents-s7-s11#5 MED folded Grounded: the operat
plan-compliance-agents-s7-s11#6 MED folded 5 is not built: toda
plan-compliance-agents-s7-s11#7 MED folded the orchestrator wri
plan-compliance-queue-137#1 MED folded stays true under the
plan-compliance-queue-137#3 MED folded stays open and uncha
plan-compliance-queue-137#4 MED folded Grounded: the operat
int#1 HIGH folded The tests row attach
int#2 HIGH folded Nothing is cut: ever
int#3 HIGH folded Design (smallest, no
int#4 HIGH folded No table key changes
int#5 HIGH folded the evidence form de
int#6 MED folded returns a copy of th
int#7 MED folded Files: scripts/analy
int#8 MED folded Design (smallest, no
int#9 MED folded output round 1 a MED
rg#1 HIGH folded Nothing is cut: ever
rg#2 MED folded stay true: nothing i
rg#3 MED folded Design (smallest, no
rg#4 HIGH folded anything else, inclu
rg#5 HIGH folded Design (smallest, no
rg#6 HIGH folded anything else, inclu
rg#7 MED folded 5 is not built: toda
rg#8 MED folded 5 is not built: toda
rg#9 MED folded the Final Summary li
rg#11 MED folded the trims would have
rg#12 MED folded It is not named on t
rc#1 HIGH folded Nothing is cut: ever
rc#2 HIGH folded The tests row attach
rc#3 MED folded call per stage is no
rc#4 MED folded MEASURED on the lane
rc#5 MED folded Nothing is cut: ever
rc#6 MED folded 80 percent of the di
rc#7 MED folded For paper: no compli
rc#8 MED folded Design (smallest, no
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-21 (M-246, prior text kept; RR-0364 · task-423 · Backlog; operator, verbatim: "1. yes 2. yes")

Dated note 2026-11-21 (M-246, prior text kept; RR-0365 · task-423 · Backlog; operator, verbatim: "yes cut the plan and have the panel review the plan - review - ground - present the plan with tasks ready to execute")

2026-11-21 (M-246) Plan put on the task by the orchestrator: PLAN-423-v2 (sha256 fc2dc2c9d913…), written read-only by a separate planner, the cut version ordered by the operator (RR-0365, verbatim: "yes cut the plan and have the panel review the plan - review - ground - present the plan with tasks ready to execute"). The plan field carries the WHOLE plan (six adjustments, cards A to D) so the panel reviews it whole; this task is card A (adjustments 1 and 3) and the Files line is card A's. Cards B, C and D are opened only after the operator has seen the grounded plan. His nine steps are his understanding of the existing process, not a new plan (his correction of the same day). Nothing is built before he has seen the grounded plan.

Dated note 2026-11-21 (M-246, prior text kept; RR-0366 · task-423 · Backlog; operator, verbatim: "Each of the five tasks is pre-approved to get this to work right.  Theses tasks are pre approved but let's limit the output reviews to csomething reasonable")

Dated note 2026-11-21 (M-246, prior text kept; RR-0367 · task-423 · Backlog; operator, verbatim: "1 y 2 med gets fixed in the plan if verified and for the output - I guess it depends on how serious med concerns are? If they are important then they should be fixed too.  3. y 4. hold 5. tools live in the repo is there another option")

Dated note 2026-11-21 (M-246, prior text kept; RR-0368 · task-423 · Backlog; operator, verbatim: "fine 1")

2026-11-21 (M-246) Plan review round 1 of this task, the third made with plan-prep (tasks 418 and 419 before it): 11 plan review outputs written by plan-prep review (nine per-list compliance, plan-review, error-paths), the Integration, Reality-Check and Regression seats on the plan, ruled by the separate grounder Cairn-Ground-P423: 129 findings (91 and 38), 113 CONFIRMED (16 HIGH, 72 MED, 23 LOW, 2 NIT), 16 REJECTED, 0 CONFLICT; 105 folded into the plan by 9 section edits (FOLD-423.json as the grounder wrote it, applied mechanically), 8 to the review pile; block and references added by plan-prep post. The plan v2 was found unsafe in adjustments 1 and 2 (the rule-line cut drops the dated notes that amend the rules; the tests row attaches the engineering standards whole so the one-call arithmetic failed; exempt before rows drops lists and widens exemption; an empty range would match the paperwork branch; hours 8 to 15 times too high against the lane times of 412, 418 and 419) and is replaced by PLAN-423-v3: card A (adjustments 1 and 3) joins the whole resolved lists into one virtual list packed by size, nothing cut (tooling 9 calls become 3 per stage; task-419 22 become 10, 33 become 15 with a round 2; task-412 22 become 10; web, phone and storage 7 to 16 per stage, not one); card B (adjustments 4 and 2: medium recorded in close mode, paperwork by task type and an allow-list of changed paths with a grounder record check) is opened after card A is BUILT; adjustment 5 is not built (today's whole-range check already keeps a review valid unless the covered code changes; the fix-diff part is task-414, which stays open); adjustment 6 is one line in the station by the orchestrator. Ten open questions ruled by the grounder with grounds (docs/reports/reviews/task-423/QUESTIONS-RULED.md) and reported to the operator: Q1 the station stays in ~/Buildo-scratch (OPERATOR: only he adds a tool to the freeze named list); Q2 the three table trims are not made; Q3 a rules section per spec or consolidated specs for surface, phone and storage (OPERATOR, his option, not built); Q4 adjustment 5 not built (OPERATOR to confirm); Q5 the paperwork allow-list; Q6 both evidence forms accepted; Q7 GROUNDER-PLAN.md at L non-empty with a Plan line; Q8 plan-stage medium unchanged; Q9 the RR-0361 and RR-0365 cites corrected by entry and line; Q10 the assumed lane name BL-SIMPLE423. Hours: card A about 2 hours, card B about 1.5, the station line 10 minutes (measured on 412, 418 and 419).

2026-11-21 (M-246) Scope of this task after the operator's later rulings (RR-0367 decision-152, RR-0368 decision-153; MORNING-DECISIONS.md entries "ORDERS the rules section done right" and "fine 1"): this task builds what the grounded round-1 plan says and nothing more: the join of the resolved rule lists into one compliance review packed by size, and plan findings ruled once. The rules index sections (Spec 137, Spec 08, the engineering standards), the check that keeps them true and the table switch are NEW cards after this one, each with its own reviewed plan (planner draft: ~/Buildo-scratch/lanes-20261119/inc1b/proto423/PLAN-423-v3.md, not reviewed). Card B (paperwork allow-list, medium outcome) follows as written in section 6 of the plan. Fix-only re-review is held (task-414 unchanged). The fold below was applied mechanically from the grounder's FOLD-423.json by the orchestrator.

Dated note 2026-11-21 (M-246, prior text kept; RR-0369 · task-423 · Backlog; operator, verbatim: "Let's make this easy the first round of MEdiums on the outputs are corrected with Highs and criticals and then the second round is just highs and criticals.")

2026-11-21 (M-246) Plan review round 2 of this task (a re-run of two lists, after the fold of task-419 changed Spec 08 and Spec 137 and staled their compliance outputs; the cap of RR-0371 is two review rounds on a plan, so there is no third): the orchestrator re-made plan-compliance-agents-s7-s11 and plan-compliance-queue-137 on the same context-r1.md (7 findings: 5 HIGH, 2 MED; and 6: 3 HIGH, 1 MED, 2 LOW; the other seven outputs stand), the separate grounder Cairn-Ground-P423 ruled them against the plan as it will be: 13 findings, 11 CONFIRMED (1 HIGH, 8 MED, 2 LOW), 2 REJECTED (agents-s7-s11#3: the launch gate does rule every plan finding; queue-137#2: the launch gate skips every type but build and fix). Whole file after round 2: 127 findings (89 of the plan outputs and 38 of the seats), 109 CONFIRMED (15 HIGH, 71 MED, 21 LOW, 2 NIT), 18 REJECTED, 0 CONFLICT; 101 folded, 8 pile. Every verdict quote is on its line at the board head (11 lens quotes and 4 seat quotes re-pointed after the task-419 fold, 1 re-quoted: eng-all#2). The plan is edited by 16 sentence edits (FOLD-423-r2.json, F10 to F25, applied mechanically): cites dated to 36a2c2d63 with the shifts the fold made; the later-cards text brought to the operator's later rulings (RR-0367 decision-152, RR-0368 decision-153, RR-0369 decision-154, RR-0370 decision-155, RR-0371 decision-156): the rules sections are tasks 427 and 425, the station is task-424 plus the one line, card B's medium rule is round 1 fixed and round 2 recorded (RR-0369), the caps; the task-410 note of Spec 137 stays true under the join; section 7 states what the operator has ruled in the Grounded and Recommendation form. No open operator item for card A. Fix-only re-review is held (task-414 unchanged). The old Plan review round block is replaced by plan-prep post.

2026-11-21 taken on the board at lane launch (lane BL-SIMPLE423, worktree /Users/brettpreston_macmini/Buildo-wt-simple423, branch wf1/inc1b-simple423), RR-0240

2026-11-21 (M-246) BL-SIMPLE423 stage 1 build: tests first (the four test files), red at the designed assertions, then the build of card A (joinLists, the joined set in the close and the launch gate, GROUNDER-PLAN.md at L, the brief sentences).

2026-11-21 (M-246) BL-SIMPLE423 acceptance on real inputs. Commits: red (21 failing assertions at the designed places, red.out), work 740ade03d (hooks and the four test files green: 305 passed, commit.out), docs f5ca453ff (dated notes in Spec 08 5.3 and rule 4, Spec 137, README items 3 to 5, page regenerated). (a) lens-input --list rules --lists <the nine ids of task-419's Files line> --material-from docs/reports/reviews/task-419/context-r2.md writes 3 files (in-plan-compliance-rules-p1..p3); with --max 60000 it writes 10 files, each under 60000 characters (rule-lists.logic.test.ts: stitched list parts equal the whole text of the nine lists in table order; a part cut by 50 characters fails its stamp; check-lane-close.logic.test.ts: an edited joined input is refused, the untouched set accepted). (b) check-lane-close.logic.test.ts task-423 (b): a joined output set accepted, the per-list set accepted (control), both forms for one stage refused, a gap refused, a joined set for a different resolved list refused, neither form refused naming the joined file first; the plan gate accepts joined or per-list plan evidence (FOLD-CHECK.md carried by the fixture). (c) task-423 (c): no plan-*.txt closes when GROUNDER-PLAN.md at the launch commit is non-empty with a Plan line; absent, empty, without a Plan line or for another task is refused; absent with plan-*.txt keeps the old rule. (d) validate refuses a table list named rules (test); 'rule-lists: ok 55 lists, 23 rows'; 'page --check': 'rule-lists-by-kind.md is current'; backlog-lane.logic.test.ts: the brief names 'lens-input --list rules --lists <ids>' and no longer says 'copy plan-*.txt'. (e) pinned at most 3 compliance files at 12,400 (plan) and 29,700 (output) for the tooling kind, the task-419 and the task-412 Files lines (rule-lists.logic.test.ts task-423 (e), green). (f) and (g) follow in REPORT.md.

2026-11-22 (M-246) BL-SIMPLE423 fix round 1 (RR-0374): order of work: the changed and new tests first (red-fix1.out), then the code. Acceptance (f) is NOT met (5 of 12 distinct confirmed findings, the HIGH queue-137#1 missed: ACCEPTANCE-F.md of the grounder); the per-document form is the default again, the join stays an accepted form.

2026-11-22 (M-246) fix round 1 code (RR-0374): the brief orders the per-document compliance review at the output stage only and names the joined run as an accepted form that is not the default; no plan lens, plan review line or plan-<lens>.txt in the brief (D2); plan-prep produces the per-list form again; a joined round file (-rN, -rN-pN) is read as joined (D1); the stale header comment of check-lane-close.mjs (p8#4) fixed.

2026-11-22 (M-246) DEVIATION (grounder ruling, FIXCHECK.md item A): the Files line of the Description is widened by one entry at the end, src/tests/backlog/backlog-brief-context.logic.test.ts, because that test pins the plan review command that backlog-brief.mjs:178 orders and RR-0374 step 1 stops; check-task-files refused the commit otherwise. The resolver gives the same 9 rule lists with and without the entry (grounder drove it). Plan, Acceptance and the rest of the Description are unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Task-423 built (card A): plan findings ruled once; the brief runs no plan lens and orders the per-document compliance review (default); the joined form is an accepted form nothing orders (RR-0374); joined round files read as joined. Code commits 740ade03d, a7e366cbb, 5d554f459; notes f5ca453ff, c5f627212. Acceptance (f) NOT met, moved to the later comparison (RR-0374). Records: docs/reports/lanes/2026-11-21/BL-SIMPLE423 (REPORT.md, GROUNDER.md, TRIAGE.md).

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 34 pile; grounder docs/reports/lanes/2026-11-21/BL-SIMPLE423/GROUNDER.md; triage docs/reports/lanes/2026-11-21/BL-SIMPLE423/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
