# Review context for task-453 (no plan id) written 2026-11-24 by backlog-brief.mjs (round 1)

## Task
task-453 SEARCHFIX.5 Review tooling: the two planning lists turned off for output reviews, the close check's fail-open paths closed, review-tool fixes
status: LATER · milestone: m-1 · assignee: none · labels: SEARCHFIX-PRIORITY

## Description
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 10 (FIX.LISTS-OFF), 11 (FIX.CLOSE-CHECK) and 12 (FIX.REVIEW-TOOLS), merged because 10 and 11 write the same protected files; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: (1) the two planning lists (five-words, plan-protocol) are switched off for output reviews by one data line; plan reviews keep them (RR-0440, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2265; RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290; plan section 6: about 15 lines of code and 40 of tests). (2) The close check no longer passes a task with no review when the branch has no rule table or during a merge; seat findings need evidence; the helper file backlog-lib.mjs joins the protected list. (3) Review tools: the proof row for CHK.3 reads not built, the ticket text says two commits, the next round number is the highest plus one, an empty acceptance block warns, README corrected.

Order inside the card: the lists switch first, then the close check, then the review tools.

Orchestrator reading, to be grounded at the plan stage: the lists go off for output reviews only (the plan's recommendation); off for plan reviews too would remove a lock made to fail closed.

Findings folded: G4 S1, S2, S3, S4, S5, S9, T1, T2, T3, T4 (git stack part), T6, T7, T8, T9, T10, T11, T12; ST4, ST5.

PROTECTED FILES this card names (RR-0419, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2150): scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs.

Dated notes owed: Spec 08 section 7 rule 4 (short; RR-0429 cap); task-448; task-268 (the proof row).

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, scripts/analysis/backlog-brief.mjs, scripts/lib/review-template.js, scripts/analysis/proof-slice.mjs, scripts/analysis/proof-slices.json, .claude/review-templates/README.md, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-brief.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md, migrations/334_precommit_budget_registry_repin.sql

## Acceptance criteria
- #1 A build task closes without output reviews for the two planning lists; a fix task with no plan-stage output for them is refused
- #2 Emptying the output_off line turns the lists back on
- #3 A branch with no rule table still reads the board; during a merge only merge-only staging is skipped
- #4 A seat finding needs a quote, a cited line and a reason
- #5 A lane closing after an edit to backlog-lib.mjs is refused unless its card names the file
- #6 The CHK.3 proof row reads notbuilt with its reason; the next round number is the highest plus one

## Implementation Plan
Planner: Cairn-Plan-453
Plan id: PLAN-453-v1

(This version includes RR-0452: the five-principles list goes off and nothing replaces it. Nothing is added for the three questions and plan-protocol.md is not edited.)

#### 1. Rules this plan rests on
- RR-0452, MD:2337: "Plan approved with one change - do not add the addiitonal 3 questions"; MD:2339: "five principles off - confirm the plan below". Ruled: "The five-principles list is turned off and nothing replaces it."
- RR-0450, MD:2325: "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive" ... "Are these minor changes? We just want to turn off or change the text etc?" Ruled: "The changes are to be switches or text changes only."
- RR-0440, MD:2266: "Let's plan to drop the planning and process lists".
- RR-0444, MD:2290: "we also want to turn off the lists - please determine the size?"
- RR-0392, MD:1975: no new mechanism; RR-0419, MD:2150: a protected file goes through a lane on its own card.
- GQ G4 S3 (mcfixreborn-g3/GROUNDER-QUESTIONS.md:46): "The conventional safe default is to narrow the skip and fail closed."
- Card task-453 AC #1 to #6 and its Files line. FOLD-PLAN.md section 2 (tasks 11 and 12) and section 6.

#### 2. What already exists and is reused
- every_task is a data line (rule-lists.json:236), attached at rule-lists.mjs:270 and verified at rule-lists.mjs:290-294 (verifyResolved, shared by validate, check-tasks, launch and close).
- The fail-closed guards: rule-lists.mjs:156-157 (validate), :293-294 (verifyResolved) and check-lane-close.mjs:489. All three only refuse an empty or missing every_task. Once five-words is gone, plan-protocol is still in every_task, so the guards pass unchanged.
- The plan-stage per-list proof is check-lane-close.mjs:633-652 (cands and planProof, build only). The output-stage set is :518-522. Note that `build` at :465 means build OR fix.
- plan-prep picks its plan lists at rule-lists.mjs:654 (`type === 'build' ? r.lists : []`).
- F10 pins the keys that decide what is reviewed for a task that owns the table (check-lane-close.mjs:839-842).
- The self-edit rule on protected_paths is at :752-753. The Files-against-the-diff check is at :494-496.
- The test scenario builder (check-lane-close.logic.test.ts:85-128) already supports `laneDelete`, `tableEdit` and `staged`.
- proof-slices.json already allows a `notbuilt` row with a reason (proof-slice.mjs:63-66).
- The plan-protocol.md body is pinned by a hash (rule-lists-table.logic.test.ts:63-68). This plan does not touch that file.

#### 3. Per item: kind of change and size

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

#### 4. Build order inside the card
1. Lists: items 3 and 2 (data), then item 1 (output_off). Plus the Spec 08 section 7 rule 4 dated note.
2. Close check: S2, S3, S1, S4, S5, S9, ST4, T2, T10, T9.
3. Messages: T12 citations, set after the Spec 08 note has moved the line numbers.
4. Review tools: T1, T8, T7, T4, ST5, README, T6, migration 334.
5. Regenerate rule-lists-by-kind.md last.

What can split off if the grounder finds the card too large:
- (i) Step 4 has no protected file and can be its own card (fold task 12 as it was).
- (ii) T10, T9 and T12 are wording and robustness only and can wait.
- Steps 1 and 2 must stay together: they write the same protected files (fold-plan reason).

#### 5. Tests first (red, then green)
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

#### 6. Limits and surprises
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

#### 7. Notes owed (backlog CLI only, never a hand edit)
- task-453 (`backlog task edit 453 --append-notes`): RR-0452 verbatim. The three questions are dropped, plan-protocol.md leaves the Files line, and five-words is off at both stages.
- Spec 08 section 7 rule 4 dated note, short: five-words is off and plan-protocol is plan-stage only, RR-0440/0450/0452. This is a spec file edit in the work commit, not the CLI.
- task-448: the lane-tools lists and the backlog-lib protected line.
- task-268: the CHK.3 row is now notbuilt.
- The owners named by the grounders: task-358 (README), task-375 (T7, T8), task-363 (T4), task-418 (T9, T10), task-410 (T1).

#### 8. Open choices (not decided here)
1. Five-words: (A) every_task drop, off at both stages, or (B) output_off only. RR-0452 MD:2339 "five principles off". Recommend A.
2. S2: judge the close by the board table, or refuse "merge the board first". GQ:46 "fail closed". Recommend the board table (AC #3 "still reads the board").
3. Pin output_off under F10 (:842): yes or no. F10's own comment says every field that decides what is reviewed stays the range base's. Recommend yes.
4. Migration 334 note: keep it on the card, or move it to the runbook. Moving it drops migrations/** from the Files line, and with it step-132, eng-back and eng-shared from this card's review (operator: step handbook "compute only", MD:2325). Recommend the runbook.
5. step-pipeline row scope for step-132 (migrations, seeds, scripts/*.js): leave as it is, which is the orchestrator reading of RR-0450, or narrow it later. Recommend leave as it is.
6. SPEC LINK (D6) on deepseek-review.js and check-task-files.mjs: out of this card, or add them to the Files line. Recommend out (minimal).

#### 9. UNVERIFIED
- That a MERGE_HEAD scenario can be built inside the test harness's git (not run).
- Whether validate-migrations.sh or check-migration-down-comments.sh refuse a comment-only edit to 334.
- That review-templates.logic.test.ts already drives review-template.js contextRound (read by name only).
- The exact README line contents beyond the grounders' citations.
- The page counts after regeneration (generator not run).
- No tests were run (brief).

#### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.json
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/hooks/check-lane-close.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/backlog/check-lane-close.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/backlog/rule-lists-table.logic.test.ts

## Implementation Notes
2026-11-24: scope added by the operator's ruling RR-0450 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325, verbatim: "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive."): (a) the queue-137 and orchestrator-doc17 lists come off the lane-tools row of scripts/analysis/rule-lists.json; (b) the step handbook list stays on the compute rows only (orchestrator reading: already so, the plan confirms); (c) the five-principles list is replaced by three focused questions asked at the plan stage: is this the simplest design; are we adding infrastructure and complexity for small gains; is the scope limited (RR-0449, /Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2320). Switches and text changes only. Also on the Files line by this note: docs/specs/00-architecture/plan-protocol.md.

2026-11-24: RR-0452 (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2336, operator verbatim: "Plan approved with one change - do not add the addiitonal 3 questions"): item (c) of the note above is withdrawn. The five-principles list is turned off and nothing replaces it; no three questions; docs/specs/00-architecture/plan-protocol.md is not edited for them.

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
- RR-0336 Items 0 to 8 approved for task-399 and task-375
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
- RR-0351 The cross-read adversary pass is not needed
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
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
- RR-0406 McFixReborn label on the tasks that process covers
- RR-0407 next push as soon as possible; does not wait for task-442
- RR-0408 McFixReborn in merged groups by shared files; map validated before anything proceeds
- RR-0409 McFixReborn map: the three hand-written schema files are reviewed; a plan is needed for the oversized files
- RR-0410 McFixReborn map: the script with no rule-list row is not reviewed
- RR-0411 McFixReborn label stays on task 349; merged groups move forward
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows
- RR-0414 task 442 re-makes only its three changed lists; five McFixReborn map decisions
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0415 McFixReborn group reviews outside a lane: liked, to be grounded; tasks 442 and 367 to be running
- RR-0416 Operator pre-approves removing lane work folders to free disk space
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions
- RR-0418 Rule lists per task are cut down by turning lists off in the table
- RR-0419 The rule-list table edit is approved as one task — "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2149)
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward
- RR-0424 Task 448 also corrects the close check's refusal-message sentence
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0425 Push order: 442 and 367 first, task 448 later
- RR-0426 Task 448: stale launch-script comment fixed; by-law pre-registrations unchanged
- RR-0427 DONE record moves for the pushed tasks, as one batch
- RR-0428 The seven pushed tasks stay BUILT; no review for the DONE word
- RR-0429 Dated notes are kept short — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0430 The six unlabelled running tasks join McFixReborn
- RR-0431 McFixReborn: each set of files reviewed once, output only
- RR-0432 McFixReborn: fold the six first; progress in the orchestrator's table
- RR-0433 The six fold as they are; the group review is their one output review — "x" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2225)
- RR-0434 McFixReborn proceeds as per the status table
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0435 The orchestrator may do the merge edits and the test fix for the six
- RR-0436 Option 1 confirmed for the remaining folds
- RR-0437 Task 388 left out of the folds; nine paperwork notes approved
- RR-0438 Task 349 D3: the public web report page is wired at launch
- RR-0439 McFixReborn review calls: 120,000 characters; each list reads only its own files
- RR-0440 plan to drop the planning and process lists from reviews — "Which reviewers caught the most issues? Let's plan to drop the planning and process lists" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2265)
- RR-0441 McFixReborn reading seats: reality check and integration run, code review dropped
- RR-0442 the search opens a lot on an exact match
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses
- RR-0444 fold the McFixReborn findings — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles — "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325)
- RR-0452 tooling plan approved; the three questions are not added — "Plan approved with one change - do not add the addiitonal 3 questions" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2336)
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
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped (names RR-0387) — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0419 The rule-list table edit is approved as one task (names RR-0419) — "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2149)
- RR-0429 Dated notes are kept short (names RR-0429) — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0433 The six fold as they are; the group review is their one output review (names RR-0433) — "x" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2225)
- RR-0440 plan to drop the planning and process lists from reviews (names RR-0440) — "Which reviewers caught the most issues? Let's plan to drop the planning and process lists" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2265)
- RR-0444 fold the McFixReborn findings (names RR-0444) — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks (names RR-0447) — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks (names RR-0448) — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles (names task-453, RR-0450) — "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325)
- RR-0452 tooling plan approved; the three questions are not added (names task-453, RR-0452) — "Plan approved with one change - do not add the addiitonal 3 questions" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2336)

## Prior reviews and lane reports
### task-453 (this task)
- (none)

## Dependencies
- (none)
