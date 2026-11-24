---
id: TASK-453
title: >-
  SEARCHFIX.5 Review tooling: the two planning lists turned off for output
  reviews, the close check's fail-open paths closed, review-tool fixes
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-24T15:06:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies: []
type: fix
ordinal: 150030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 10 (FIX.LISTS-OFF), 11 (FIX.CLOSE-CHECK) and 12 (FIX.REVIEW-TOOLS), merged because 10 and 11 write the same protected files; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: (1) the two planning lists (five-words, plan-protocol) are switched off for output reviews by one data line; plan reviews keep them (RR-0440, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2265; RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290; plan section 6: about 15 lines of code and 40 of tests). (2) The close check no longer passes a task with no review when the branch has no rule table or during a merge; seat findings need evidence; the helper file backlog-lib.mjs joins the protected list. (3) Review tools: the proof row for CHK.3 reads not built, the ticket text says two commits, the next round number is the highest plus one, an empty acceptance block warns, README corrected.

Order inside the card: the lists switch first, then the close check, then the review tools.

Orchestrator reading, to be grounded at the plan stage: the lists go off for output reviews only (the plan's recommendation); off for plan reviews too would remove a lock made to fail closed.

Findings folded: G4 S1, S2, S3, S4, S5, S9, T1, T2, T3, T4 (git stack part), T6, T7, T8, T9, T10, T11, T12; ST4, ST5.

PROTECTED FILES this card names (RR-0419, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2150): scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs.

Dated notes owed: Spec 08 section 7 rule 4 (short; RR-0429 cap); task-448; task-268 (the proof row).

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, scripts/analysis/backlog-brief.mjs, scripts/lib/review-template.js, scripts/analysis/proof-slice.mjs, scripts/analysis/proof-slices.json, .claude/review-templates/README.md, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-brief.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md, migrations/334_precommit_budget_registry_repin.sql
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A build task closes without output reviews for the two planning lists; a fix task with no plan-stage output for them is refused
- [ ] #2 Emptying the output_off line turns the lists back on
- [ ] #3 A branch with no rule table still reads the board; during a merge only merge-only staging is skipped
- [ ] #4 A seat finding needs a quote, a cited line and a reason
- [ ] #5 A lane closing after an edit to backlog-lib.mjs is refused unless its card names the file
- [ ] #6 The CHK.3 proof row reads notbuilt with its reason; the next round number is the highest plus one
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
Planner: Cairn-Plan-453
Plan id: PLAN-453-v1

(This version includes RR-0452: the five-principles list goes off and nothing replaces it. Nothing is added for the three questions and plan-protocol.md is not edited.)

## 1. Rules this plan rests on
- RR-0452, MD:2337: "Plan approved with one change - do not add the addiitonal 3 questions"; MD:2339: "five principles off - confirm the plan below". Ruled: "The five-principles list is turned off and nothing replaces it."
- RR-0450, MD:2325: "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive" ... "Are these minor changes? We just want to turn off or change the text etc?" Ruled: "The changes are to be switches or text changes only."
- RR-0440, MD:2266: "Let's plan to drop the planning and process lists".
- RR-0444, MD:2290: "we also want to turn off the lists - please determine the size?"
- RR-0392, MD:1975: no new mechanism; RR-0419, MD:2150: a protected file goes through a lane on its own card.
- GQ G4 S3 (mcfixreborn-g3/GROUNDER-QUESTIONS.md:46): "The conventional safe default is to narrow the skip and fail closed."
- Card task-453 AC #1 to #6 and its Files line. FOLD-PLAN.md section 2 (tasks 11 and 12) and section 6.

## 2. What already exists and is reused
- every_task is a data line (rule-lists.json:236), attached at rule-lists.mjs:270 and verified at rule-lists.mjs:290-294 (verifyResolved, shared by validate, check-tasks, launch and close).
- The fail-closed guards: rule-lists.mjs:156-157 (validate), :293-294 (verifyResolved) and check-lane-close.mjs:489. All three only refuse an empty or missing every_task. Once five-words is gone, plan-protocol is still in every_task, so the guards pass unchanged.
- The plan-stage per-list proof is check-lane-close.mjs:633-652 (cands and planProof, build only). The output-stage set is :518-522. Note that `build` at :465 means build OR fix.
- plan-prep picks its plan lists at rule-lists.mjs:654 (`type === 'build' ? r.lists : []`).
- F10 pins the keys that decide what is reviewed for a task that owns the table (check-lane-close.mjs:839-842).
- The self-edit rule on protected_paths is at :752-753. The Files-against-the-diff check is at :494-496.
- The test scenario builder (check-lane-close.logic.test.ts:85-128) already supports `laneDelete`, `tableEdit` and `staged`.
- proof-slices.json already allows a `notbuilt` row with a reason (proof-slice.mjs:63-66).
- The plan-protocol.md body is pinned by a hash (rule-lists-table.logic.test.ts:63-68). This plan does not touch that file.

## 3. Per item: kind of change and size

**Item 1. Plan-protocol off for output reviews, kept for plan reviews: (c) code.** About 11 lines of code, about 30 of tests, 1 data line.
Why it is code: there is no switch today. The card names one data line, `output_off`, and AC #2 makes emptying it the way to turn the lists back on. Something has to read that line.
- rule-lists.json, after :236: `"output_off": ["plan-protocol"],`, plus one $comment line quoting RR-0440, RR-0450 and RR-0452.
- rule-lists.mjs:
  - after :157, one validate line: output_off, if present, is an array, and every id in it is in every_task (fails closed on a typo);
  - one exported helper: `outputLists(table, lists) = lists.filter((l) => !(table.output_off ?? []).includes(l.id))`;
  - :654 plan-prep: a fix task also gets the output_off lists at the plan stage (`type === 'build' ? r.lists : r.lists.filter(l => off.includes(l.id))`).
- check-lane-close.mjs:
  - :521, for a build or fix task, the out-stage `ls` goes through outputLists;
  - :633-653, move cands and planProof above the `if`, and in the fix branch (:653-658) add complianceSetErrors for the output_off lists with phases ['plan'];
  - :842, pin `output_off: baseTable.output_off` next to every_task in the ownsTable judge.
- backlog-lane.mjs:183, filter the output-stage `ids` through outputLists, and add one sentence to the `per` text: "plan-protocol is a plan-stage list only".
- Fold plan correction: section 6 says build uses ['out'] and fix uses ['plan','out']. That is wrong. Both use ['out'] (:465, :518), and a fix task's plan gate checks no per-list output today. AC #1's fix half therefore needs the plan-gate and plan-prep lines above.

**Item 2. Five-words off (RR-0452): (a) one data line, plus test expectations.** 0 lines of code, about 14 test lines edited, about 8 text lines.
- Option A, recommended: rule-lists.json:236 becomes `"every_task": ["plan-protocol"]`.
  - This turns five-words off at both stages, plan and output.
  - The three guards stay as they are and still pass.
  - The list definition at :24 stays (dead data). Several tests use it as a sample id (rule-lists.logic :354, :965, :993, :1105), and turning it back on is putting the id back in the line.
- Option B: put five-words in output_off. It would stay on for plan reviews. That contradicts "five principles off", so B is not recommended. Size is the same, but it keeps calls the operator called useless.
- Plan stage: the five principles are still named in plan-protocol.md:7 ("standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"). That text is pinned by rule-lists.logic.test.ts:358 and is left as it is.
- Test lines that name five-words in an expected set (drop the id):
  - rule-lists-table.logic.test.ts :30, :37, :38, :44, :49, :168, :210, :243;
  - rule-lists.logic.test.ts :72, :346 (becomes ['plan-protocol']), :377;
  - rule-lists.logic.test.ts :391-392: the planted case drops plan-protocol instead of five-words;
  - rule-lists.logic.test.ts :465: the page regex is matched on plan-protocol.
- Text that says "the five words and the plan protocol" (b, wording only): rule-lists.mjs :12, :156, :270, :287, :293, :543; check-lane-close.mjs :12, :486, :489.
- The generated page docs/reports/generated/rule-lists-by-kind.md is regenerated by the builder (rule-lists.mjs page --write).

**Item 3. queue-137 and orchestrator-doc17 off the lane-tools row: (a) one data line.** 2 test lines.
- rule-lists.json:165 becomes `["agents-s5-1to3", "agents-s7-s11", "eng-all"]`, plus a short dated clause in the row's why citing RR-0450.
- Every other place checked: no other row names either list. no_files_default (:231) points at queue-records, which has lists []. kinds (:254-261) only changes the page. every_task and milestone_docs do not name them. The two list definitions (:44, :47) stay (dead data, switch back = put the id back).
- Tests:
  - backlog-lane.logic.test.ts:684 and :686: the stub name `plan-compliance-queue-137` becomes `plan-compliance-agents-s7-s11`. The fixture copies the real table and resolves scripts/analysis/thing.mjs through lane-tools.
  - rule-lists-table.logic.test.ts:372 only checks that the lists are absent and stays green. Its comment at :229 is a text fix.
  - check-lane-close.logic.test.ts:761 is only a test name on the fixture table. No change.

**Item 4. The step handbook list (step-132): no change.**
- It is attached by two rows only: step-pipeline (:88) and compute-import (:140). No other row, every_task or kind names it.
- One open choice is in section 8: step-pipeline's globs also cover migrations/**, scripts/seeds/** and scripts/*.js. This card's own migrations/334 entry pulls in step-132, eng-back and eng-shared.

**Item 5. Close check, fold task 11: (c) code.** About 25 lines of code, about 55 of tests, 2 data lines.
- S2, :722-727: today the check returns 0 when neither the working tree nor HEAD has the table. New: return 0 only when the board ref has no table either. When the branch lacks it and the board has it, `table = boardTable` after :731, so the close is judged by the board copy. About 4 lines.
- S3, :720-721: remove the early return on MERGE_HEAD. In the moves loop (:736-745), during a merge, skip a move only when its staged blob equals `MERGE_HEAD:<f>`. That is a close made on the merged branch and checked there. Everything else is checked. About 4 lines.
- S1: add one helper, seatFindings(seats) → [{id, line}] (SEAT_LINE). Add its findings to `findings` at :577 and :665, so the quote, cited-line and 30-character reason checks of grounderErrors (:359-376) also run on seat findings. About 3 lines.
- S4, :147: the SEAT_LINE id becomes `[a-z0-9-]+`. One edit.
- S5, :144: anchor reasonSev to the start of the reason, `/^\W*(CRITICAL|...)\b/`. "NIT" deep inside a reason no longer lowers the severity. One edit.
- S9, :735: accept `backlog/(archive/)?tasks/task-\d+(\.\d+)*`. An archived move is checked. A subtask is refused by the existing id-versus-number check (:791). One edit.
- ST4 (a): add `"scripts/analysis/backlog-lib.mjs"` to protected_paths at rule-lists.json:22.
- T2 (a): add `"scripts/gemini-review.js"` to the lane-tools globs at rule-lists.json:163.
- T9, backlog-lane.mjs:109: when `taken && fs.existsSync(wt)`, the fail line also prints `git -C <board> worktree remove <wt>` and `git -C <board> branch -D <branch>`. One edit.
- T10, rule-lists.mjs:
  - :134 and :141: skip a null list or row with a problem line;
  - :558: the catch keeps the error text and prints it in the cell;
  - :582: `CALL_MS = (Number(process.env.DEEPSEEK_REVIEW_TIMEOUT_MS) || 900000) + 10000`;
  - :600: add `timeout: 120000` to sh;
  - :753: `first(e.stderr || e.stdout || e.error?.message, 3)`.
  - About 6 lines in all.
- T12 (b, text):
  - :139, :199 and :200 cite Spec 08 rule 3 as 08_agents.md:350 and rule 6 at its line after the Spec 08 note lands (:360 once the note goes in below rule 4's notes; :359 today).
  - S6: the "20+ characters" refusal adds "(a double quote inside the quote ends it; quote a part without one)".
  - D6 SPEC LINK: only review-template.js:14 is on the Files line (fold task 12).
- T11 tests (section 5).

**Item 6. Review tools, fold task 12: about 6 lines of code, 1 data line, 1 doc edit, about 20 test lines.**
- T1 (b), backlog-brief.mjs:176: for a build or fix task, print the amended Rule 3: "Rule 3 as amended (Spec 137 Rule 3 note 2026-11-20): the work lands first; the closing commit carries only the lane report dir, the review context dir, the task file and the decision record". :187 says "two commits". About 3 lines.
- T8 (c), backlog-brief.mjs:172: with `ac.length === 0`, print `  (none found in <task file>)`. One line.
- T7 (c), review-template.js:138: the next round is the highest N plus 1 (Math.max over the context-rN numbers). One line.
- T4 (c), proof-slice.mjs:146: `head: (spawnSync(...).stdout ?? '').trim()`. One line. The exit-code half stays with task-343.
- ST5 (a), proof-slices.json:9: replace argv, waits and expect with `"notbuilt": {"blockedBy": [], "reason": "CHK.3 reads the staged diff; --all gives it no input"}` (GROUNDER-SEATS J :75).
  - OUTSIDE FILES LINE: src/tests/proof-slice.logic.test.ts:228 pins `expect` on chk3-nothing-new, so the id must leave that array. One edit.
- T3 (b), README fixes:
  - .claude/review-templates/README.md:27-28, :109-111, :122, :127-135, :151, :158-159, :165 and delete :87.
  - The fixes are exactly those in GROUNDER-A D1, GROUNDER-B 3 and GROUNDER-C 1-3.
- T6 (b): the exemption note goes in the README, not Spec 08. It says the strict-format lens templates are closed by their VERDICT line (GROUNDER-A D5; RR-0429 cap).
- T12 migration 334 (b): add the pre-334 description to the commented DOWN line. It is a comment only. If validate-migrations.sh or check-migration-down-comments.sh refuses it, the note moves to the runbook (fold plan).

## 4. Build order inside the card
1. Lists: items 3 and 2 (data), then item 1 (output_off). Plus the Spec 08 section 7 rule 4 dated note.
2. Close check: S2, S3, S1, S4, S5, S9, ST4, T2, T10, T9.
3. Messages: T12 citations, set after the Spec 08 note has moved the line numbers.
4. Review tools: T1, T8, T7, T4, ST5, README, T6, migration 334.
5. Regenerate rule-lists-by-kind.md last.

What can split off if the grounder finds the card too large:
- (i) Step 4 has no protected file and can be its own card (fold task 12 as it was).
- (ii) T10, T9 and T12 are wording and robustness only and can wait.
- Steps 1 and 2 must stay together: they write the same protected files (fold-plan reason).

## 5. Tests first (red, then green)
check-lane-close.logic.test.ts:
- `output_off control`: tableEdit `output_off: ['ev']` with no out-compliance-ev → passes (AC #1). The old control at :405-408 stays for the empty line.
- `output_off emptied`: `output_off: []` with no out-compliance-ev → refused /ev/ (AC #2).
- `output_off typo`: `output_off: ['nope']` → refused at validate (rule-lists.logic) (AC #2).
- `fix plan gate`: planGateErrors for a fix task, output_off ['ev'], with no plan-compliance-ev → refused naming ev. With it → ok (AC #1).
- `S2`: scenario({laneDelete: ['scripts/analysis/rule-lists.json']}) → refused (today 0). `table: 'never'` still 0 (AC #3).
- `S3`: a MERGE_HEAD file plus a staged BUILT move whose blob differs from MERGE_HEAD → refused. Same blob → 0 (AC #3).
- `S1`: a seat finding with verdict `REJECTED a:1 ""` → refused /quote/. A short reason → refused /30/ (AC #4).
- `S4`: a seat finding `reality-check#2 CRITICAL` with no verdict → refused.
- `S5`: reason "NIT-picking aside ..." with pile on a CRITICAL → refused. :733's "LOW: cosmetic only" still passes.
- `S9`: a staged `backlog/archive/tasks/task-7 - Lane work.md` set BUILT → checked (refused without a report).
- `ST4`: the fixture TABLE gets backlog-lib.mjs in protected_paths; staged `scripts/analysis/backlog-lib.mjs` plus a close → refused /protected/. A range edit to it with Files not naming it → refused /outside the task's Files/ (AC #5).
- `S11`: tighten :656 `not.toBeNull()` to the exact value, and tighten the alternations at :367, :376, :380, :384-385 to one message each.

rule-lists.logic.test.ts:
- the five-words edits listed under item 2;
- validate refuses an output_off id that is not in every_task;
- `outputLists` drops plan-protocol;
- T10: null list → problem line, not a TypeError.

rule-lists-table.logic.test.ts:
- the five-words edits;
- new: lane-tools lists equal ['agents-s5-1to3','agents-s7-s11','eng-all'];
- `scripts/gemini-review.js` resolves through lane-tools (T2).

backlog-lane.logic.test.ts:
- :684 and :686 renamed;
- D4 at :564-565: add the exit status assert;
- D16: a brief stub that exits 1 → exit 1, "FAILED at", the undo command plus the worktree and branch lines (T9);
- the brief's out-stage ids exclude plan-protocol.

backlog-brief.logic.test.ts:
- a build task's ticket names the two-commit close (T1);
- a task with no AC block prints "(none found" (T8).

review-templates.logic.test.ts:
- context-r2 only → next round 3 (T7, AC #6);
- the T4 head with a stub spawn returning stdout undefined → exit 2 with no stack. That case goes in the proof-slice test, OUTSIDE FILES LINE.

proof-slice.logic.test.ts:228 (OUTSIDE FILES LINE): CHK.3 row has notbuilt.reason (AC #6).

## 6. Limits and surprises
- Not done:
  - no three questions;
  - no plan-protocol.md edit;
  - no edit to deepseek-review.js or check-task-files.mjs (D6 SPEC LINK; protected or off the Files line);
  - not D5 (DB test) and not D7 (review-lens-template.infra.test.ts), both off the Files line;
  - not T5 (task-375) and not the T4 exit code (task-343);
  - S8 and S10 left as recorded.
- F10: this card owns the table, so it is judged with the board's every_task and, with the new pin, its output_off. Its own output review still needs five-words and plan-protocol. queue-137 and doc-17 are off for it, because rows come from the branch table. The builder must expect this.
- protected_paths is pinned to the board (:759). This card's own close is refused until the board carries the new backlog-lib line, so fold first, close later (RR-0433 practice). The build detects it as a close refusal naming protected_paths.
- Adding the Spec 08 note moves rule 5 and rule 6 down one line. The T12 citations are written after the note, and a test greps 08_agents.md for the cited heading text.
- S2 with the board table: an old branch may lack list files. resolveTask then refuses with the path named, which fails closed.
- S3 changes behaviour for real merges that stage a moved task file with a different blob. The orchestrator's fold merges would then be checked.
- The fix-task plan gate now asks for plan-compliance-plan-protocol. A fix card launched before this lands without it is refused at launch only; RUNNING cards are not re-gated.

## 7. Notes owed (backlog CLI only, never a hand edit)
- task-453 (`backlog task edit 453 --append-notes`): RR-0452 verbatim. The three questions are dropped, plan-protocol.md leaves the Files line, and five-words is off at both stages.
- Spec 08 section 7 rule 4 dated note, short: five-words is off and plan-protocol is plan-stage only, RR-0440/0450/0452. This is a spec file edit in the work commit, not the CLI.
- task-448: the lane-tools lists and the backlog-lib protected line.
- task-268: the CHK.3 row is now notbuilt.
- The owners named by the grounders: task-358 (README), task-375 (T7, T8), task-363 (T4), task-418 (T9, T10), task-410 (T1).

## 8. Open choices (not decided here)
1. Five-words: (A) every_task drop, off at both stages, or (B) output_off only. RR-0452 MD:2339 "five principles off". Recommend A.
2. S2: judge the close by the board table, or refuse "merge the board first". GQ:46 "fail closed". Recommend the board table (AC #3 "still reads the board").
3. Pin output_off under F10 (:842): yes or no. F10's own comment says every field that decides what is reviewed stays the range base's. Recommend yes.
4. Migration 334 note: keep it on the card, or move it to the runbook. Moving it drops migrations/** from the Files line, and with it step-132, eng-back and eng-shared from this card's review (operator: step handbook "compute only", MD:2325). Recommend the runbook.
5. step-pipeline row scope for step-132 (migrations, seeds, scripts/*.js): leave as it is, which is the orchestrator reading of RR-0450, or narrow it later. Recommend leave as it is.
6. SPEC LINK (D6) on deepseek-review.js and check-task-files.mjs: out of this card, or add them to the Files line. Recommend out (minimal).

## 9. UNVERIFIED
- That a MERGE_HEAD scenario can be built inside the test harness's git (not run).
- Whether validate-migrations.sh or check-migration-down-comments.sh refuse a comment-only edit to 334.
- That review-templates.logic.test.ts already drives review-template.js contextRound (read by name only).
- The exact README line contents beyond the grounders' citations.
- The page counts after regeneration (generator not run).
- No tests were run (brief).

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.json
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/hooks/check-lane-close.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/backlog/check-lane-close.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/backlog/rule-lists-table.logic.test.ts
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24: scope added by the operator's ruling RR-0450 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325, verbatim: "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive."): (a) the queue-137 and orchestrator-doc17 lists come off the lane-tools row of scripts/analysis/rule-lists.json; (b) the step handbook list stays on the compute rows only (orchestrator reading: already so, the plan confirms); (c) the five-principles list is replaced by three focused questions asked at the plan stage: is this the simplest design; are we adding infrastructure and complexity for small gains; is the scope limited (RR-0449, /Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2320). Switches and text changes only. Also on the Files line by this note: docs/specs/00-architecture/plan-protocol.md.

2026-11-24: RR-0452 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2336, operator verbatim: "Plan approved with one change - do not add the addiitonal 3 questions"): item (c) of the note above is withdrawn. The five-principles list is turned off and nothing replaces it; no three questions; docs/specs/00-architecture/plan-protocol.md is not edited for them.
<!-- SECTION:NOTES:END -->
