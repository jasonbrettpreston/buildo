---
id: TASK-423
title: >-
  PROTOCOL.SIMPLE One compliance review on the plan and one on the output,
  against rules sections; no review of paperwork
status: LATER
assignee: []
created_date: '2026-11-21T16:43:00Z'
updated_date: '2026-11-21T22:01:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies:
  - TASK-419
type: build
ordinal: 123012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (RR-0363, verbatim: "We just need the rules for deepseek.  Teh solution maybe just creating a rules section in the spec which is small.  There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done.  Unless the output was revealing to have critical or high faults and a second review of the output maybe required.  That's it.  No review of paperwork. ... LEt's correct these issues and get this working right?"; RR-0361 objective, verbatim: "the objective is an effective compliance review on the plan and the output.  It isn't 17"; yesterday, MORNING-DECISIONS.md:1546, verbatim: "Just deliver the priority compliance item or the comprehensive summary that fits - files too large to review even when split. or split smaller"). Why: a 15-line task (task-419) took about five hours: nine compliance review calls on the plan and nine on the output (one call per rule document, because whole documents are sent and one call holds 120,000 characters, scripts/deepseek-review.js:35), each finding ruled singly, and every review made stale by any later commit. The six issues to correct, as he pasted them back: (1) any change after a review makes every review stale; (2) the same finding is ruled many times; (3) the process mostly reviews its own paperwork; (4) rules attach by file path alone (a generated-numbers refresh drew 58 reviews and 313 findings); (5) plan findings are ruled twice (copied into the lane folder and re-ruled by the output grounder); (6) "suite passed" did not mean "push will pass" (the push gate has checks the station suite does not run). Wanted: the tooling and the spec text brought to his shape, by the smallest change, reusing what exists. The plan (written read-only, reviewed before any build) names the design, the slices and the Files line. Files: scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
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
# PLAN-423-v2: the existing process, adjusted in five places, plus the station step

Planner, read-only. v1 is left as it was. Evidence: ~/Buildo-wt-board (wf2/board dccd4f371), the lane folders of task-419, task-412, BL-SCORE421, BL-MIG334, MORNING-DECISIONS.md to the last entry (RR-0365). Hours are ESTIMATES. UNVERIFIED is marked.
Operator, verbatim (RR-0365): "I am just adding to or understanding the existing plan. We hare not making a whole new approach here." So nothing below replaces a tool. Each adjustment is the fewest lines in the scripts that exist.

## 0. His understanding against today (only where they differ)
| His nine-step understanding | Today | Differs |
|---|---|---|
| 1 right documents to the compliance reviewer | one call per rule list, each list whole (9 calls for a tooling task) | yes: adjustment 1 |
| rulings go with them | already: every lens template has {{SPECS}}; the tool fills it with the Task, Description, Acceptance, Decisions naming this task and Implementation Notes sections of context-rN.md (CONTEXT_SECTIONS, review-template.js:115; passed at the plan by rule-lists.mjs:616 and at the output by the brief). 4,620 chars on task-419, 2,270 on task-412. Proof: prompt_sha256 recomputed at close | no |
| 2 plan panel, 3 grounded, 4 plan updated, 5 built | same (plan-prep, seats, separate grounder, fold, fold check, launch gate) | no |
| 6 output review by a smaller panel | compliance, code-review, error-paths (ux, security by Files); no seats | no, except the call count |
| 7 grounded | the grounder rules out- findings AND the plan findings again | yes: adjustment 3 |
| 8 code corrected: critical and high fixed, medium and low recorded | medium must be fixed or ruled; only low and nit are piled | yes: adjustment 4 |
| 9 loop on critical or high | any fix commit makes every output stale; all outputs re-run | yes: adjustment 5 |
| no review of paperwork | records and generated files are reviewed by every attached list (58 calls on 49 generated files; 13 on a 3-line row) | yes: adjustment 2 |
| suite passed means push passes | station suite omits the McBylaws gate the pre-push hook runs first | yes: adjustment 6 |

## 1. Measured cost today
- task-419 (165 changed lines): plan 11 calls, output 11, round 2 another 11 = 33 calls, 123 findings. Compliance inputs alone: 9 files, 307,177 chars at the plan.
- BL-SCORE421 (49 generated files, one count row each): 58 calls, 313 findings. BL-MIG334 (3-line queue row): 13 calls, 67 findings.
- Why: `resolveTask` (rule-lists.mjs:218) returns every list; `planPrep` and the brief run one `lens-input --list L` each; `listProof` (check-lane-close.mjs:380) demands one output per list per phase; the whole-range diff hash (`diffOf`) stales every output on any covered commit; the lane folder copies plan outputs and `closeErrors` rules them again. 120,000 chars per call is real (deepseek-review.js:33-35).
- The packs under .claude/review-templates/packs/ (45 files, 1.0 MB) are one-time copies for tasks 365 and 369; nothing reads them. Not used here.

## 2. The six adjustments, each at its smallest
For each: v1 design, the smallest form, what v1 had extra and is struck, hours.

### Adjustment 1: one compliance call per stage on the rule lines
Smallest form (about 60 lines of code):
- `joinLists`: the resolved lists' blocks joined in table order, each headed "list id, file, section", given to the existing `buildLensInputs` as ONE list (id `rules`). The existing part-splitting cuts by size only when over the bound, never per document. `planPrep`, the brief text and `listProof`/`planGateInner` call it once instead of looping `r.lists`.
- `lines` (regex) on a list, applied to its blocks, for the two specs that already hold one rule per line: Spec 137 section 4 (14 lines `**Rule N.**`, 3.4k of 33k) and Spec 08 section 7 (10 numbered lines, 3.9k of 9.6k). No spec text is written.
- `count` beside `lines` (about 8 lines in `validateTable`): the number of lines the regex must match. KEPT for correctness: without it a rule added to the spec is silently invisible to the reviewer.
- Table-only trims, each with what is lost (OPEN QUESTION 2): (a) drop doc-17 from the lane-tools rows (31.6k; it is the register of orchestrator readings; lost: the reviewer no longer sees "readings are not rulings" text); (b) Spec 08 section 5.3 dropped from agents-s5-1to3 (11.5k procedure text; 5.1 and 5.2 stay; lost: round-2 procedure detail, the rule itself stays in section 7 rule 4); (c) for the lane-tools and specs rows engineering standards narrowed from whole (46k) to sections 2, 5, 9, 11, 14 (about 17k; lost: sections 12 and 13 tooling and observability, not about scripts or hooks).
- Arithmetic, measured: tooling kind rules today 194k. With `lines` only: about 160k = 2 plan calls. With the trims: about 87k. One plan call then is 87k + rulings 4.6k + plan sections 12.0k + template about 4k = about 108k (task-419; about 100k on task-412), under 120k. One output call = 87 + 4.6 + 4 = about 96k, leaving about 24k for the diff; a larger diff is cut at file boundaries (existing), one call per chunk, each with all the rules and the rulings. Surface, phone and pipeline kinds still draw several calls (rules lines for 126, 128, mobile, Airtight do not exist; a later card). Honest: the one-call target is met for tooling and spec tasks only.
- Transition with no key: the close and launch checks accept EITHER a complete joined output (`plan-compliance.txt`, `out-compliance.txt`, parts `-pN`) OR a complete per-list set. The evidence form decides, so a task launched before this lands closes the old way and nothing already BUILT is re-gated. The old per-list code stays until no open task uses it (cleanup card, not now).
Struck from v1 and lost: written "Rules for review" sections in Specs 08 and doc-17 plus the pointer-quote test (lost: rules in 08 section 11 and 5.x stay whole prose, not one-liners; they stay in the list as whole sections); a `protocol: 2` key and its pinning (not needed: evidence form decides); the plan-stage error-paths lens drop (not one of the adjustments; lost saving: 1 call per plan); the seat-report RR-id check (rulings reach the DeepSeek lenses already; seats have no hash; lost: no proof the seats read rulings, not in his words); the spec section rewrites for consolidation.
Hours: v1 16-20; v2 9-12 (join and once-calls 4, `lines`/`count` and table edits 2, tests red-first 3, notes 1; no spec writing).

### Adjustment 2: paperwork is not reviewed; a short grounder record-true check (RR-0364 item 2)
Smallest form (about 25 lines):
- Reuse `exempt`. Add globs: `docs/reports/*-assessment.md` (proving check: step-validate.mjs --all --fast, station step 1; UNVERIFIED that a stale block fails it), `docs/reports/generated/**` (each page names its generator --check), `backlog/**` (task-file hooks), `.cursor/*QUEUE*.md` (queue-check in the McBylaws gate). The existing test already refuses an exempt glob with no named check.
- `resolveTask` (:239-243): test exempt candidates BEFORE rows (3 lines). A Files entry that is all exempt resolves to no lists, so the brief tells the lane "no review".
- Close check: when the range's covered, non-exempt paths are empty, no compliance or lens output is required; instead GROUNDER.md (grounder not the lane) with one `record#N CONFIRMED <path>:<line> "<quote>"` line per claim of REPORT.md checked. Existing verdict parser and quote check are reused.
- Not paperwork: docs/specs/**, scripts/**, src/**, mobile/**, migrations/**. Task types do not decide; the diff does.
Struck from v1 and lost: a new `paperwork` key (same job as `exempt`); resolving the output-stage lists from the changed paths instead of the Files line (lost: a task with a broad Files line still attaches lists for it; the fix is narrower Files lines, e.g. `docs/reports/*-assessment.md` not `docs/reports/`, written in the card).
Hours: v1 5-6; v2 4-5 (close-check branch and tests are the driver).

### Adjustment 3: plan findings are not re-ruled at the output
Smallest form (about 15 lines): `closeErrors` reads only out-*.txt for findings and Ruled lines (the `isLensOutput` filter at the `lensFiles` line); the requirement "at least one plan-*.txt in the lane folder" (:550) becomes "docs/reports/reviews/<id>/GROUNDER-PLAN.md exists at the launch commit L" (`git cat-file -e`, 3 lines), so a hand launch still has to leave plan evidence. The brief text (backlog-lane.mjs, the `grounder` string) stops saying "copy plan-*.txt ... into the lane folder".
Struck from v1: calling the whole `planGateErrors` at L (lost: the close does not re-prove the plan evidence's content; the launch gate, the last refusal before the take, already did).
Hours: v1 2; v2 2 (tests: plan files absent accepted, plan ids not demanded, no GROUNDER-PLAN at L refused).

### Adjustment 4: only critical and high force a fix; medium and low are recorded with a reason (RR-0364 item 1)
Smallest form (about 6 lines): in `outcomeErrors` close mode, MED may close by `pile:"<reason>"` or `wontfix:"<reason>"` (30+ chars, existing check) as LOW and NIT already may; CRITICAL and HIGH still close by fixed or ruling. Spec 08 section 7 rule 6 notes amended.
Struck from v1: a severity-triggered "round 2 required" rule in the close check. Not needed: the loop is carried by adjustment 5 (a fix to covered code needs its fix diff reviewed). Lost: nothing; medium and low never change code, so they start no round.
Hours: v1 2; v2 1.5.

### Adjustment 5: a review stays valid unless the code it covered changes; a fix is re-reviewed on the fix diff only (bound 2)
Smallest form (about 60 lines, the largest piece):
- `renderLensInput` adds `range <from12>..<to12>` to the stamp; `lens-input --range`; the material is `git diff from to -- covered paths`. Round 1: from = L, to = the commit the lane reviewed.
- Close check: each round's diff is recomputed for its own range (the existing `diffOf` takes from and to); round k starts where k-1 ended; after the last `to`, `git diff to HEAD -- covered non-exempt paths` must be empty. A commit touching only records, generated or exempt paths never stales a review. A covered change after the last review needs one more round on that delta (compliance once, code-review, error-paths). The bound is the brief's max_fix_rounds 2 (backlog-brief.mjs:169), a stated rule, not counted by the hook (lost: no hard stop in the hook; the lane and grounder stop it and a critical or high still open after round 2 goes to the operator).
- Rounds are filed `out-<lens>-rN.txt` (the brief's layout already names the form); the check learns to read them instead of "every output equals the whole-range diff at HEAD".
Struck from v1: the `fixed:<sha>` exemption for post-review edits (lost: even a one-line voluntary fix draws a small fix-diff review, about 3 small calls; safer than trusting a cite); chunk-level hashing (task-414). SUPERSEDED: task-414 ("re-run only the chunks that changed") is delivered by this, so it is closed as superseded by a records lane with a dated note; it was approved by the operator (RR-0336 item 7) so the hand-off tells him.
Hours: v1 5; v2 6-8 (stamp, tiling and round files in the close check, and a test for each direction).

### Adjustment 6: the station suite runs the read-only gate first
Smallest form: one line in `suite` of ~/Buildo-scratch/push-station/station.sh: `step mcbylaws-gate node scripts/analysis/mcbylaws/gate.mjs --ci --base "origin/$br"`. The gate was run by hand on 21adfde8a and printed GATE OK; BL-MIG334 measured the failing case (id-no-row at HEAD~1, none at HEAD). It does not cover the interactive y that `gate.mjs --push` asks on /dev/tty, which stays his.
Struck from v1: moving the station into the repo and a test (extra; his earlier rule is that tools live in the repo, so it is OPEN QUESTION 1; lost if declined: the file that says "ready" stays outside the hooks and tests).
Hours: v1 2-3; v2 0.5 in place (+2 if moved, card D).

## 3. Honest total
v1 32-39 h. v2 about 24-30 h of build and test, plus about 3 h per code card for the plan review, grounder, fold and two-commit close (9 h) = about 33-39 h elapsed work. The minimum is still large because every change is in the checker, its table or its helper (protected paths), each must be proven in both directions with a planted defect and a control, and each card must pass the process it is changing. Struck items saved about 8-10 h of the build, not of the process.

## 4. Spec sentences amended (dated notes citing RR-0363, RR-0364, RR-0365, prior text kept)
- Spec 08 section 7 rule 4 (2026-11-19 note: "the lane brief written by `backlog-lane.mjs` names the lenses by task type; one Claude grounder adjudicates every finding as round 2"): add: compliance is one call per stage on the joined rule lines. (card A)
- Spec 08 section 7 rule 6, third note: "A fix round does not file `out-<lens>-rN.txt`: the close requires every in- input and out- output to equal the diff of the whole range at HEAD, so after any fix commit every input is re-made ... (re-running only the changed chunks is task-414)." Replace: a review is bound to its range; a fix is reviewed on the fix diff; task-414 superseded. Same note: MED may be piled with a reason. (card B)
- Spec 137 note at :134 ("one compliance lens output per rule list the task attaches"): one compliance output per stage; paperwork gets a grounder record check only. (cards A, C)
- .claude/review-templates/README.md:158 ("The lens line: one compliance run per list") and :160. (cards A, B)
- Spec 08 section 11.2 and CLAUDE.md lines 139 and 143 stay with task-419 and the CLAUDE.md order; not touched.

## 5. Not done, and risks
- Not done: rules lines for Specs 126, 127, 128, mobile, Airtight and the increment documents (surface, phone, pipeline tasks keep several calls); consolidating specs; committing fewer in- files (1.15 MB for task-419); deleting the packs; a duplicate-finding verdict word (add only if the replay shows more than 2 findings ruled twice).
- A rule not on a matched line is invisible to the reviewer. Cover: `count`, the grounders and seats read full specs, 08 section 11 stays whole.
- Fewer lists seen (the trims) means fewer rules checked by DeepSeek; the grounder and seats still read the full specs.
- Evidence-form acceptance keeps old code alive; a cleanup card removes it.

## 6. Cards, ready to execute (3 code cards, 1 optional)
Why this split: adjustments 1, 3, 4, 5, 2 all edit rule-lists.mjs and check-lane-close.mjs (and the brief), so they cannot run in parallel branches without conflicts; they are ordered. Three cards keep each plan review under one reviewer's attention: A = what is sent and ruled once, B = fix loop, C = paperwork. The station line is independent.
All three are type build, milestone m-1 (as task-423). Protected paths touched by each: scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json (scripts/deepseek-review.js and review-template.js are NOT touched). Each is a two-commit close: commit 1 = work and tests; commit 2 = records only (lane report folder, review context folder, task file, decision record), because a commit that changes a protected path may not also move a task to finished.

### Card A: task-423 (holds adjustments 1 and 3) [~11-14 h]
Title: PROTOCOL.SIMPLE One compliance call per stage on the rule lines; plan findings ruled once.
Description: RR-0363 verbatim ("We just need the rules for deepseek ... There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done ... No review of paperwork."), RR-0361 ("It isn't 17"), RR-0365 ("We hare not making a whole new approach here"). Join the resolved lists' rule lines into one compliance input per stage (cut by size only when over 120,000 characters), add `lines` and `count` to the table for Spec 137 section 4 and Spec 08 section 7, apply the table trims of OPEN QUESTION 2 if approved, stop copying plan outputs into the lane folder, and accept either joined or per-list evidence. Spec notes per section 4.
Files: scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
Depends on: task-419 folded (same two protected files). Order: first.
Acceptance (observable):
1. Replay of task-419's plan and output (throwaway worktree, a lane runs DeepSeek): plan 11 calls become 3 (compliance once, plan-review, error-paths), output round 1 11 become 3; whole 33 become 9 (6 if no round 2); findings counted before (123) and after in REPORT.md. Second named task: task-412, 22 calls become 6.
2. Planted rule breaks caught by the single call at plan and output, 2 of 2 runs each, control clean twice: a Spec 137 Rule 3 break (task moved to DONE without a status-line edit), an engineering standards section 11 break (API route plan with no try-catch and logError), a Spec 08 section 7 rule 6 break (a BUG finding deferred with no reason). The finding names the rule line.
3. Rulings still reach the reviewer: on a fixture task plant a plan sentence contradicting a ruling in its "Decisions naming this task" section (task-419's RR-0351, "Gap 3 we dont need the cross check": plan says "a cross-read adversary pass is required before the build"); the compliance call flags it with the quote, 2 of 2 runs; control clean.
4. Mechanical, red first then green: a spec rule line added without a `count` update fails `validate`; a joined input over the bound yields `-pN` parts sized by room (parts = ceil); a shortened joined text is refused at close (control accepted); per-list evidence of an earlier task is still accepted; plan-*.txt absent from the lane folder is accepted while no GROUNDER-PLAN.md at L is refused; plan finding ids are not demanded in GROUNDER.md.

### Card B (new): adjustments 4 and 5 [~8-10 h]
Title: PROTOCOL.FIXLOOP A review stays valid unless its code changes; a fix is re-reviewed on the fix diff only; medium and low are recorded.
Description: RR-0363 ("Unless the output was revealing to have critical or high faults and a second review of the output maybe required"), RR-0364 item 1 ("1. yes": medium and low confirmed findings are recorded with a reason, not fixed, never trigger another review). Range-stamped reviews; round files out-<lens>-rN; MED closes by pile or wontfix with a reason; supersedes task-414.
Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
Depends on: card A folded. Order: second.
Acceptance: (1) on task-419's range replayed: the round-2 whole re-run (11 calls) becomes one round on the fix diff only (3 small calls); if only medium and low were confirmed, no round 2 (0 calls). (2) Red first: a commit touching only docs/reports after the review leaves it valid (control: a covered path edited after the review with no new round is refused); a round whose material is not its fix diff is refused; a MED closed by pile with 30+ chars accepted (control: HIGH closed by pile refused). (3) Round files are read by the close check. (4) task-414 closed as superseded.

### Card C (new): adjustment 2 [~4-5 h]
Title: PROTOCOL.PAPER No review of paperwork; the grounder checks the record is true.
Description: RR-0363 ("No review of paperwork"), RR-0364 item 2 ("2. yes": a separate grounder still checks the record is true before the fold). Exempt globs for generated and record paths each naming its proving check; exempt tested before rows; a paperwork range needs GROUNDER.md record lines and no lens outputs.
Files: scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
Depends on: card B folded (same functions). Order: third.
Acceptance: (1) offline, no DeepSeek: task-421's Files narrowed to `docs/reports/*-assessment.md` resolves to no lists and its 49-file diff needs no lens output (58 calls become 0, plus one short grounder read); task-422's queue-row diff the same (13 calls become 0). (2) Red first: the same diff plus one scripts/ file attaches lists and needs the reviews (control); a record task with no GROUNDER.md record line is refused; an unmatched path still refuses; the golden-exempt test still passes.

### Card D (optional, new, parallel to all): adjustment 6 moved into the repo [~2-3 h]
Only if OPEN QUESTION 1 is yes. Title: STATION.REPO The push station lives in the repo and runs the read-only gate first. Files: scripts/push-station/station.sh, src/tests/backlog/push-station.logic.test.ts. Depends on: none. Acceptance: replay of 0f6ba8225 stops at the gate step with id-no-row (control: 21adfde8a passes). Not a protected path. If OPEN QUESTION 1 is no, adjustment 6 is the one-line edit of the scratch file, done by the orchestrator, no card.

Parallel: D with any card. A, B, C run in order (shared files).

## 7. OPEN QUESTIONS (only what his words do not settle)
1. Move the push station into the repo as scripts/push-station/station.sh (card D), instead of editing the copy in ~/Buildo-scratch? Recommendation: yes. Grounds: your rule that tools live in the repo; the file that decides "ready" is today outside every hook and test; state files stay in scratch.
2. To get ONE compliance call for tooling and spec tasks, may the table drop doc-17 from the lane-tools rows, drop Spec 08 section 5.3 from agents-s5-1to3, and narrow engineering standards to sections 2, 5, 9, 11 and 14 for those rows (what is lost is stated in adjustment 1)? Recommendation: yes. Grounds: your objective "an effective compliance review ... It isn't 17"; without the trims it is 2 calls; the grounder and seats still read the full specs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-21 (M-246, prior text kept; RR-0364 · task-423 · Backlog; operator, verbatim: "1. yes 2. yes")

Dated note 2026-11-21 (M-246, prior text kept; RR-0365 · task-423 · Backlog; operator, verbatim: "yes cut the plan and have the panel review the plan - review - ground - present the plan with tasks ready to execute")

2026-11-21 (M-246) Plan put on the task by the orchestrator: PLAN-423-v2 (sha256 fc2dc2c9d913…), written read-only by a separate planner, the cut version ordered by the operator (RR-0365, verbatim: "yes cut the plan and have the panel review the plan - review - ground - present the plan with tasks ready to execute"). The plan field carries the WHOLE plan (six adjustments, cards A to D) so the panel reviews it whole; this task is card A (adjustments 1 and 3) and the Files line is card A's. Cards B, C and D are opened only after the operator has seen the grounded plan. His nine steps are his understanding of the existing process, not a new plan (his correction of the same day). Nothing is built before he has seen the grounded plan.

Dated note 2026-11-21 (M-246, prior text kept; RR-0366 · task-423 · Backlog; operator, verbatim: "Each of the five tasks is pre-approved to get this to work right.  Theses tasks are pre approved but let's limit the output reviews to csomething reasonable")

Dated note 2026-11-21 (M-246, prior text kept; RR-0367 · task-423 · Backlog; operator, verbatim: "1 y 2 med gets fixed in the plan if verified and for the output - I guess it depends on how serious med concerns are? If they are important then they should be fixed too.  3. y 4. hold 5. tools live in the repo is there another option")
<!-- SECTION:NOTES:END -->
