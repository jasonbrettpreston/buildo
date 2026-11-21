# Review context for task-423 (no plan id) written 2026-11-21 by backlog-brief.mjs (round 1)

## Task
task-423 PROTOCOL.SIMPLE One compliance review on the plan and one on the output, against rules sections; no review of paperwork
status: LATER · milestone: m-1 · assignee: none · labels: McFix, McFix V2

## Description
Card opened 2026-11-21 by the orchestrator, Spec 137 rule 2, on the operator's order (RR-0363, verbatim: "We just need the rules for deepseek.  Teh solution maybe just creating a rules section in the spec which is small.  There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done.  Unless the output was revealing to have critical or high faults and a second review of the output maybe required.  That's it.  No review of paperwork. ... LEt's correct these issues and get this working right?"; RR-0361 objective, verbatim: "the objective is an effective compliance review on the plan and the output.  It isn't 17"; yesterday, MORNING-DECISIONS.md:1546, verbatim: "Just deliver the priority compliance item or the comprehensive summary that fits - files too large to review even when split. or split smaller"). Why: a 15-line task (task-419) took about five hours: nine compliance review calls on the plan and nine on the output (one call per rule document, because whole documents are sent and one call holds 120,000 characters, scripts/deepseek-review.js:35), each finding ruled singly, and every review made stale by any later commit. The six issues to correct, as he pasted them back: (1) any change after a review makes every review stale; (2) the same finding is ruled many times; (3) the process mostly reviews its own paperwork; (4) rules attach by file path alone (a generated-numbers refresh drew 58 reviews and 313 findings); (5) plan findings are ruled twice (copied into the lane folder and re-ruled by the output grounder); (6) "suite passed" did not mean "push will pass" (the push gate has checks the station suite does not run). Wanted: the tooling and the spec text brought to his shape, by the smallest change, reusing what exists. The plan (written read-only, reviewed before any build) names the design, the slices and the Files line. Files: scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts

## Acceptance criteria

## Implementation Plan
#### PLAN-423-v2: the existing process, adjusted in five places, plus the station step

Planner, read-only. v1 is left as it was. Evidence: ~/Buildo-wt-board (wf2/board dccd4f371), the lane folders of task-419, task-412, BL-SCORE421, BL-MIG334, MORNING-DECISIONS.md to the last entry (RR-0365). Hours are ESTIMATES. UNVERIFIED is marked.
Operator, verbatim (RR-0365): "I am just adding to or understanding the existing plan. We hare not making a whole new approach here." So nothing below replaces a tool. Each adjustment is the fewest lines in the scripts that exist.

#### 0. His understanding against today (only where they differ)
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

#### 1. Measured cost today
- task-419 (165 changed lines): plan 11 calls, output 11, round 2 another 11 = 33 calls, 123 findings. Compliance inputs alone: 9 files, 307,177 chars at the plan.
- BL-SCORE421 (49 generated files, one count row each): 58 calls, 313 findings. BL-MIG334 (3-line queue row): 13 calls, 67 findings.
- Why: `resolveTask` (rule-lists.mjs:218) returns every list; `planPrep` and the brief run one `lens-input --list L` each; `listProof` (check-lane-close.mjs:380) demands one output per list per phase; the whole-range diff hash (`diffOf`) stales every output on any covered commit; the lane folder copies plan outputs and `closeErrors` rules them again. 120,000 chars per call is real (deepseek-review.js:33-35).
- The packs under .claude/review-templates/packs/ (45 files, 1.0 MB) are one-time copies for tasks 365 and 369; nothing reads them. Not used here.

#### 2. The six adjustments, each at its smallest
For each: v1 design, the smallest form, what v1 had extra and is struck, hours.

#### Adjustment 1: one compliance call per stage on the rule lines
Smallest form (about 60 lines of code):
- `joinLists`: the resolved lists' blocks joined in table order, each headed "list id, file, section", given to the existing `buildLensInputs` as ONE list (id `rules`). The existing part-splitting cuts by size only when over the bound, never per document. `planPrep`, the brief text and `listProof`/`planGateInner` call it once instead of looping `r.lists`.
- `lines` (regex) on a list, applied to its blocks, for the two specs that already hold one rule per line: Spec 137 section 4 (14 lines `**Rule N.**`, 3.4k of 33k) and Spec 08 section 7 (10 numbered lines, 3.9k of 9.6k). No spec text is written.
- `count` beside `lines` (about 8 lines in `validateTable`): the number of lines the regex must match. KEPT for correctness: without it a rule added to the spec is silently invisible to the reviewer.
- Table-only trims, each with what is lost (OPEN QUESTION 2): (a) drop doc-17 from the lane-tools rows (31.6k; it is the register of orchestrator readings; lost: the reviewer no longer sees "readings are not rulings" text); (b) Spec 08 section 5.3 dropped from agents-s5-1to3 (11.5k procedure text; 5.1 and 5.2 stay; lost: round-2 procedure detail, the rule itself stays in section 7 rule 4); (c) for the lane-tools and specs rows engineering standards narrowed from whole (46k) to sections 2, 5, 9, 11, 14 (about 17k; lost: sections 12 and 13 tooling and observability, not about scripts or hooks).
- Arithmetic, measured: tooling kind rules today 194k. With `lines` only: about 160k = 2 plan calls. With the trims: about 87k. One plan call then is 87k + rulings 4.6k + plan sections 12.0k + template about 4k = about 108k (task-419; about 100k on task-412), under 120k. One output call = 87 + 4.6 + 4 = about 96k, leaving about 24k for the diff; a larger diff is cut at file boundaries (existing), one call per chunk, each with all the rules and the rulings. Surface, phone and pipeline kinds still draw several calls (rules lines for 126, 128, mobile, Airtight do not exist; a later card). Honest: the one-call target is met for tooling and spec tasks only.
- Transition with no key: the close and launch checks accept EITHER a complete joined output (`plan-compliance.txt`, `out-compliance.txt`, parts `-pN`) OR a complete per-list set. The evidence form decides, so a task launched before this lands closes the old way and nothing already BUILT is re-gated. The old per-list code stays until no open task uses it (cleanup card, not now).
Struck from v1 and lost: written "Rules for review" sections in Specs 08 and doc-17 plus the pointer-quote test (lost: rules in 08 section 11 and 5.x stay whole prose, not one-liners; they stay in the list as whole sections); a `protocol: 2` key and its pinning (not needed: evidence form decides); the plan-stage error-paths lens drop (not one of the adjustments; lost saving: 1 call per plan); the seat-report RR-id check (rulings reach the DeepSeek lenses already; seats have no hash; lost: no proof the seats read rulings, not in his words); the spec section rewrites for consolidation.
Hours: v1 16-20; v2 9-12 (join and once-calls 4, `lines`/`count` and table edits 2, tests red-first 3, notes 1; no spec writing).

#### Adjustment 2: paperwork is not reviewed; a short grounder record-true check (RR-0364 item 2)
Smallest form (about 25 lines):
- Reuse `exempt`. Add globs: `docs/reports/*-assessment.md` (proving check: step-validate.mjs --all --fast, station step 1; UNVERIFIED that a stale block fails it), `docs/reports/generated/**` (each page names its generator --check), `backlog/**` (task-file hooks), `.cursor/*QUEUE*.md` (queue-check in the McBylaws gate). The existing test already refuses an exempt glob with no named check.
- `resolveTask` (:239-243): test exempt candidates BEFORE rows (3 lines). A Files entry that is all exempt resolves to no lists, so the brief tells the lane "no review".
- Close check: when the range's covered, non-exempt paths are empty, no compliance or lens output is required; instead GROUNDER.md (grounder not the lane) with one `record#N CONFIRMED <path>:<line> "<quote>"` line per claim of REPORT.md checked. Existing verdict parser and quote check are reused.
- Not paperwork: docs/specs/**, scripts/**, src/**, mobile/**, migrations/**. Task types do not decide; the diff does.
Struck from v1 and lost: a new `paperwork` key (same job as `exempt`); resolving the output-stage lists from the changed paths instead of the Files line (lost: a task with a broad Files line still attaches lists for it; the fix is narrower Files lines, e.g. `docs/reports/*-assessment.md` not `docs/reports/`, written in the card).
Hours: v1 5-6; v2 4-5 (close-check branch and tests are the driver).

#### Adjustment 3: plan findings are not re-ruled at the output
Smallest form (about 15 lines): `closeErrors` reads only out-*.txt for findings and Ruled lines (the `isLensOutput` filter at the `lensFiles` line); the requirement "at least one plan-*.txt in the lane folder" (:550) becomes "docs/reports/reviews/<id>/GROUNDER-PLAN.md exists at the launch commit L" (`git cat-file -e`, 3 lines), so a hand launch still has to leave plan evidence. The brief text (backlog-lane.mjs, the `grounder` string) stops saying "copy plan-*.txt ... into the lane folder".
Struck from v1: calling the whole `planGateErrors` at L (lost: the close does not re-prove the plan evidence's content; the launch gate, the last refusal before the take, already did).
Hours: v1 2; v2 2 (tests: plan files absent accepted, plan ids not demanded, no GROUNDER-PLAN at L refused).

#### Adjustment 4: only critical and high force a fix; medium and low are recorded with a reason (RR-0364 item 1)
Smallest form (about 6 lines): in `outcomeErrors` close mode, MED may close by `pile:"<reason>"` or `wontfix:"<reason>"` (30+ chars, existing check) as LOW and NIT already may; CRITICAL and HIGH still close by fixed or ruling. Spec 08 section 7 rule 6 notes amended.
Struck from v1: a severity-triggered "round 2 required" rule in the close check. Not needed: the loop is carried by adjustment 5 (a fix to covered code needs its fix diff reviewed). Lost: nothing; medium and low never change code, so they start no round.
Hours: v1 2; v2 1.5.

#### Adjustment 5: a review stays valid unless the code it covered changes; a fix is re-reviewed on the fix diff only (bound 2)
Smallest form (about 60 lines, the largest piece):
- `renderLensInput` adds `range <from12>..<to12>` to the stamp; `lens-input --range`; the material is `git diff from to -- covered paths`. Round 1: from = L, to = the commit the lane reviewed.
- Close check: each round's diff is recomputed for its own range (the existing `diffOf` takes from and to); round k starts where k-1 ended; after the last `to`, `git diff to HEAD -- covered non-exempt paths` must be empty. A commit touching only records, generated or exempt paths never stales a review. A covered change after the last review needs one more round on that delta (compliance once, code-review, error-paths). The bound is the brief's max_fix_rounds 2 (backlog-brief.mjs:169), a stated rule, not counted by the hook (lost: no hard stop in the hook; the lane and grounder stop it and a critical or high still open after round 2 goes to the operator).
- Rounds are filed `out-<lens>-rN.txt` (the brief's layout already names the form); the check learns to read them instead of "every output equals the whole-range diff at HEAD".
Struck from v1: the `fixed:<sha>` exemption for post-review edits (lost: even a one-line voluntary fix draws a small fix-diff review, about 3 small calls; safer than trusting a cite); chunk-level hashing (task-414). SUPERSEDED: task-414 ("re-run only the chunks that changed") is delivered by this, so it is closed as superseded by a records lane with a dated note; it was approved by the operator (RR-0336 item 7) so the hand-off tells him.
Hours: v1 5; v2 6-8 (stamp, tiling and round files in the close check, and a test for each direction).

#### Adjustment 6: the station suite runs the read-only gate first
Smallest form: one line in `suite` of ~/Buildo-scratch/push-station/station.sh: `step mcbylaws-gate node scripts/analysis/mcbylaws/gate.mjs --ci --base "origin/$br"`. The gate was run by hand on 21adfde8a and printed GATE OK; BL-MIG334 measured the failing case (id-no-row at HEAD~1, none at HEAD). It does not cover the interactive y that `gate.mjs --push` asks on /dev/tty, which stays his.
Struck from v1: moving the station into the repo and a test (extra; his earlier rule is that tools live in the repo, so it is OPEN QUESTION 1; lost if declined: the file that says "ready" stays outside the hooks and tests).
Hours: v1 2-3; v2 0.5 in place (+2 if moved, card D).

#### 3. Honest total
v1 32-39 h. v2 about 24-30 h of build and test, plus about 3 h per code card for the plan review, grounder, fold and two-commit close (9 h) = about 33-39 h elapsed work. The minimum is still large because every change is in the checker, its table or its helper (protected paths), each must be proven in both directions with a planted defect and a control, and each card must pass the process it is changing. Struck items saved about 8-10 h of the build, not of the process.

#### 4. Spec sentences amended (dated notes citing RR-0363, RR-0364, RR-0365, prior text kept)
- Spec 08 section 7 rule 4 (2026-11-19 note: "the lane brief written by `backlog-lane.mjs` names the lenses by task type; one Claude grounder adjudicates every finding as round 2"): add: compliance is one call per stage on the joined rule lines. (card A)
- Spec 08 section 7 rule 6, third note: "A fix round does not file `out-<lens>-rN.txt`: the close requires every in- input and out- output to equal the diff of the whole range at HEAD, so after any fix commit every input is re-made ... (re-running only the changed chunks is task-414)." Replace: a review is bound to its range; a fix is reviewed on the fix diff; task-414 superseded. Same note: MED may be piled with a reason. (card B)
- Spec 137 note at :134 ("one compliance lens output per rule list the task attaches"): one compliance output per stage; paperwork gets a grounder record check only. (cards A, C)
- .claude/review-templates/README.md:158 ("The lens line: one compliance run per list") and :160. (cards A, B)
- Spec 08 section 11.2 and CLAUDE.md lines 139 and 143 stay with task-419 and the CLAUDE.md order; not touched.

#### 5. Not done, and risks
- Not done: rules lines for Specs 126, 127, 128, mobile, Airtight and the increment documents (surface, phone, pipeline tasks keep several calls); consolidating specs; committing fewer in- files (1.15 MB for task-419); deleting the packs; a duplicate-finding verdict word (add only if the replay shows more than 2 findings ruled twice).
- A rule not on a matched line is invisible to the reviewer. Cover: `count`, the grounders and seats read full specs, 08 section 11 stays whole.
- Fewer lists seen (the trims) means fewer rules checked by DeepSeek; the grounder and seats still read the full specs.
- Evidence-form acceptance keeps old code alive; a cleanup card removes it.

#### 6. Cards, ready to execute (3 code cards, 1 optional)
Why this split: adjustments 1, 3, 4, 5, 2 all edit rule-lists.mjs and check-lane-close.mjs (and the brief), so they cannot run in parallel branches without conflicts; they are ordered. Three cards keep each plan review under one reviewer's attention: A = what is sent and ruled once, B = fix loop, C = paperwork. The station line is independent.
All three are type build, milestone m-1 (as task-423). Protected paths touched by each: scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json (scripts/deepseek-review.js and review-template.js are NOT touched). Each is a two-commit close: commit 1 = work and tests; commit 2 = records only (lane report folder, review context folder, task file, decision record), because a commit that changes a protected path may not also move a task to finished.

#### Card A: task-423 (holds adjustments 1 and 3) [~11-14 h]
Title: PROTOCOL.SIMPLE One compliance call per stage on the rule lines; plan findings ruled once.
Description: RR-0363 verbatim ("We just need the rules for deepseek ... There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done ... No review of paperwork."), RR-0361 ("It isn't 17"), RR-0365 ("We hare not making a whole new approach here"). Join the resolved lists' rule lines into one compliance input per stage (cut by size only when over 120,000 characters), add `lines` and `count` to the table for Spec 137 section 4 and Spec 08 section 7, apply the table trims of OPEN QUESTION 2 if approved, stop copying plan outputs into the lane folder, and accept either joined or per-list evidence. Spec notes per section 4.
Files: scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
Depends on: task-419 folded (same two protected files). Order: first.
Acceptance (observable):
1. Replay of task-419's plan and output (throwaway worktree, a lane runs DeepSeek): plan 11 calls become 3 (compliance once, plan-review, error-paths), output round 1 11 become 3; whole 33 become 9 (6 if no round 2); findings counted before (123) and after in REPORT.md. Second named task: task-412, 22 calls become 6.
2. Planted rule breaks caught by the single call at plan and output, 2 of 2 runs each, control clean twice: a Spec 137 Rule 3 break (task moved to DONE without a status-line edit), an engineering standards section 11 break (API route plan with no try-catch and logError), a Spec 08 section 7 rule 6 break (a BUG finding deferred with no reason). The finding names the rule line.
3. Rulings still reach the reviewer: on a fixture task plant a plan sentence contradicting a ruling in its "Decisions naming this task" section (task-419's RR-0351, "Gap 3 we dont need the cross check": plan says "a cross-read adversary pass is required before the build"); the compliance call flags it with the quote, 2 of 2 runs; control clean.
4. Mechanical, red first then green: a spec rule line added without a `count` update fails `validate`; a joined input over the bound yields `-pN` parts sized by room (parts = ceil); a shortened joined text is refused at close (control accepted); per-list evidence of an earlier task is still accepted; plan-*.txt absent from the lane folder is accepted while no GROUNDER-PLAN.md at L is refused; plan finding ids are not demanded in GROUNDER.md.

#### Card B (new): adjustments 4 and 5 [~8-10 h]
Title: PROTOCOL.FIXLOOP A review stays valid unless its code changes; a fix is re-reviewed on the fix diff only; medium and low are recorded.
Description: RR-0363 ("Unless the output was revealing to have critical or high faults and a second review of the output maybe required"), RR-0364 item 1 ("1. yes": medium and low confirmed findings are recorded with a reason, not fixed, never trigger another review). Range-stamped reviews; round files out-<lens>-rN; MED closes by pile or wontfix with a reason; supersedes task-414.
Files: scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
Depends on: card A folded. Order: second.
Acceptance: (1) on task-419's range replayed: the round-2 whole re-run (11 calls) becomes one round on the fix diff only (3 small calls); if only medium and low were confirmed, no round 2 (0 calls). (2) Red first: a commit touching only docs/reports after the review leaves it valid (control: a covered path edited after the review with no new round is refused); a round whose material is not its fix diff is refused; a MED closed by pile with 30+ chars accepted (control: HIGH closed by pile refused). (3) Round files are read by the close check. (4) task-414 closed as superseded.

#### Card C (new): adjustment 2 [~4-5 h]
Title: PROTOCOL.PAPER No review of paperwork; the grounder checks the record is true.
Description: RR-0363 ("No review of paperwork"), RR-0364 item 2 ("2. yes": a separate grounder still checks the record is true before the fold). Exempt globs for generated and record paths each naming its proving check; exempt tested before rows; a paperwork range needs GROUNDER.md record lines and no lens outputs.
Files: scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
Depends on: card B folded (same functions). Order: third.
Acceptance: (1) offline, no DeepSeek: task-421's Files narrowed to `docs/reports/*-assessment.md` resolves to no lists and its 49-file diff needs no lens output (58 calls become 0, plus one short grounder read); task-422's queue-row diff the same (13 calls become 0). (2) Red first: the same diff plus one scripts/ file attaches lists and needs the reviews (control); a record task with no GROUNDER.md record line is refused; an unmatched path still refuses; the golden-exempt test still passes.

#### Card D (optional, new, parallel to all): adjustment 6 moved into the repo [~2-3 h]
Only if OPEN QUESTION 1 is yes. Title: STATION.REPO The push station lives in the repo and runs the read-only gate first. Files: scripts/push-station/station.sh, src/tests/backlog/push-station.logic.test.ts. Depends on: none. Acceptance: replay of 0f6ba8225 stops at the gate step with id-no-row (control: 21adfde8a passes). Not a protected path. If OPEN QUESTION 1 is no, adjustment 6 is the one-line edit of the scratch file, done by the orchestrator, no card.

Parallel: D with any card. A, B, C run in order (shared files).

#### 7. OPEN QUESTIONS (only what his words do not settle)
1. Move the push station into the repo as scripts/push-station/station.sh (card D), instead of editing the copy in ~/Buildo-scratch? Recommendation: yes. Grounds: your rule that tools live in the repo; the file that decides "ready" is today outside every hook and test; state files stay in scratch.
2. To get ONE compliance call for tooling and spec tasks, may the table drop doc-17 from the lane-tools rows, drop Spec 08 section 5.3 from agents-s5-1to3, and narrow engineering standards to sections 2, 5, 9, 11 and 14 for those rows (what is lost is stated in adjustment 1)? Recommendation: yes. Grounds: your objective "an effective compliance review ... It isn't 17"; without the trims it is 2 calls; the grounder and seats still read the full specs.

## Implementation Notes
Dated note 2026-11-21 (M-246, prior text kept; RR-0364 · task-423 · Backlog; operator, verbatim: "1. yes 2. yes")

Dated note 2026-11-21 (M-246, prior text kept; RR-0365 · task-423 · Backlog; operator, verbatim: "yes cut the plan and have the panel review the plan - review - ground - present the plan with tasks ready to execute")

2026-11-21 (M-246) Plan put on the task by the orchestrator: PLAN-423-v2 (sha256 fc2dc2c9d913…), written read-only by a separate planner, the cut version ordered by the operator (RR-0365, verbatim: "yes cut the plan and have the panel review the plan - review - ground - present the plan with tasks ready to execute"). The plan field carries the WHOLE plan (six adjustments, cards A to D) so the panel reviews it whole; this task is card A (adjustments 1 and 3) and the Files line is card A's. Cards B, C and D are opened only after the operator has seen the grounded plan. His nine steps are his understanding of the existing process, not a new plan (his correction of the same day). Nothing is built before he has seen the grounded plan.

## References
- (none)

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375 — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1557)
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed — "Gap 3 we dont need the cross check." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1647)
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved — "We should use the old findings and ground them and then include them in the new pass." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1697)
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork — "There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done.  Unless the output was revealing to have critical or high faults and a second review of the output maybe required.  That's it.  No review of paperwork." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1718)
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review — "1. yes 2. yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1723)
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready — "yes cut the plan and have the panel review the plan - review - ground - present the plan with tasks ready to execute" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1740)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0140 Operator: faster pushes and GOs asked
- RR-0141 Operator: Q-LT-1
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0147 Operator answer NAME-1
- RR-0149 Increment 1·A tooling location
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0336 Items 0 to 8 approved for task-399 and task-375 (names RR-0336) — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1557)
- RR-0351 The cross-read adversary pass is not needed (names RR-0351) — "Gap 3 we dont need the cross check." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1647)
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved (names RR-0361) — "We should use the old findings and ground them and then include them in the new pass." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1697)
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork (names RR-0363) — "There shold be the plan reviews - the grounding - the fold (no other reviews) - the build - the review of the output - grounding and then the fold and then we are done.  Unless the output was revealing to have critical or high faults and a second review of the output maybe required.  That's it.  No review of paperwork." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1718)
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review (names task-423, RR-0364) — "1. yes 2. yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1723)
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready (names task-423, RR-0365) — "yes cut the plan and have the panel review the plan - review - ground - present the plan with tasks ready to execute" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1740)

## Prior reviews and lane reports
### task-423 (this task)
- (none)
### task-419 (dependency)
- docs/reports/reviews/task-419/FINDINGS-PLAN.md
- docs/reports/reviews/task-419/FOLD-CHECK.md
- docs/reports/reviews/task-419/GROUNDER-PLAN.md
- docs/reports/reviews/task-419/QUESTIONS-RULED.md
- docs/reports/reviews/task-419/TRIAGE-PLAN.md
- docs/reports/reviews/task-419/seat-integration-1.md
- docs/reports/reviews/task-419/seat-reality-check-1.md
- docs/reports/reviews/task-419/seat-regression-1.md

## Dependencies
- task-419 LAUNCH.GAPS The fold check leaves a record and a one-file review keeps one name · status: RUNNING
  final summary: (none yet)
