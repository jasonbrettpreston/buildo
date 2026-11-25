# Review context for task-464 (no plan id) written 2026-11-25 by backlog-brief.mjs (round 3)

## Task
task-464 PROC.GENROW The rule-list table covers the top-level generator scripts, so a card that names one can launch
status: RUNNING · milestone: m-1 · assignee: @lane-BL-GENROW · labels: ProcessImprovement

## Description
Card opened 2026-11-25 by the orchestrator from RR-0475 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481, operator answer 1: yes). Source: plan grounder Cairn-Ground-P454, operator question 2 (docs/reports/reviews/task-454/QUESTIONS-RULED.md). The launch gate refuses task-454 because its Files line names scripts/generate-logic-variable-groups.mjs and no row of scripts/analysis/rule-lists.json matches a top-level scripts/*.mjs file (rule-lists.mjs:273; the step-pipeline row covers scripts/*.js only). 18 top-level scripts/generate-* files exist, 11 of them .mjs (the other 7 are .js and already match scripts/*.js). Smallest change: one existing row gains a glob for the top-level generator .mjs scripts (the planner names the row and the exact glob from the table and the specs that govern those scripts); no new list, no new row unless the plan shows the existing rows cannot hold it. The rule-lists page is regenerated. Not planned yet. Blocks task-454.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md

## Acceptance criteria
- #1 The launch gate resolves a Files line that names scripts/generate-logic-variable-groups.mjs (task-454's line resolves with no unmatched path), a test locks it and was red first, and the rule-lists page is current

## Implementation Plan
Planner: Cairn-Plan-464
Plan id: PLAN-464-v1

Head read: wf2/board at eb8bbd768 (the plan grounder re-read it at 62dc1206e: no rule-lists file moved between the two, last touch 74b06e6be). Everything was read-only. The only commands run were `rule-lists.mjs page --check`, `check-tasks` (it prints to the console and writes nothing) and node -e simulations that held the table in memory. No file was written.

1. RULE QUOTED FIRST
- RR-0475, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481-2482: "1. y ..." gives "Q1 yes: one small card adds top-level generator scripts to the rule-list table so 454 can launch."
- The question it answers, docs/reports/reviews/task-454/QUESTIONS-RULED.md (Operator questions, item 2): "may one small card add scripts/generate-*.mjs to a row before this card launches (recommended)?"
- RR-0392, MD:1975-1976: "I don't think we need any other infastrcuture beyond this" means no new row, list, field or tool.
- The refusal, scripts/analysis/rule-lists.mjs:273: "refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json".
- The table's own grammar, rule-lists.json:5: "A row maps path globs to lists ... Several rows may match: the lists are the union."
- What governs the scripts:
  - docs/specs/00_engineering_standards.md:178 (section 9.1, its Rule line) scopes the rule to the `scripts/*.js` pipeline scripts that write to the database; it does not govern the .mjs generators, so the appended `why` does not cite section 9 for them
  - :130 "generated doc ↔ its generator (the drift guard ...)" (section 5, eng-shared).
  - docs/specs/01-pipeline/132_step_standard_handbook.md:448, x-tooling.1 (section "4. Cross-cutting", list step-132): "Pre-commit ... runs every generator `--check`". Only 6 of the 11 .mjs generators are in .husky/pre-commit (bylaw-provisions, logic-variable-groups, logic-vars-docs, step-handbook, bylaw-handbook, bylaw-layer2-input); the other 5 run from package.json scripts and are not in .husky, so the appended `why` does not cite x-tooling.1.
- DoD rules:
  - 08_agents.md:497 "Every lock is proven in BOTH directions".
  - 124a:992 R-IZ (1) "no change adds a tool, field or rule its card or ruling did not name".
  - .cursor/MCBYLAWS-QUEUE.md:107 "Quote the rule first".

2. WHAT EXISTS AND IS REUSED
- Row step-pipeline (rule-lists.json:85-91). Its glob `scripts/*.js` already covers the 7 top-level .js generators (generate-assert-*-descriptor.js, generate-ingest-batch.js, generate-sharing-phase.js, generate-stream-catalog-json.js and the rest). It gives them step-132, eng-back and eng-shared. The .mjs generators are the same kind of file in the same folder, and the same row can hold them.
- The glob matcher scripts/analysis/mcbylaws/paths.mjs:77-102 (`*` matches inside one path segment, so `scripts/generate-*.mjs` matches top-level files only).
- validateTable (rule-lists.mjs:126, the per-glob line :150) already refuses a literal glob that matches no tracked file.
- resolveTask, milestoneLetter and checkTasks (rule-lists.mjs:243, :203, :512).
- Test pattern: rule-lists.logic.test.ts:381-386, "the paths that matched no row on 2026-11-20 now resolve". The new case sits beside it in the same shape.

3. THE CHANGE, FILE BY FILE, IN BUILD ORDER
(a) src/tests/backlog/rule-lists.logic.test.ts. Add one `it` inside the describe that holds :381, after :386. Section 5 has the details. It is red first.
(b) scripts/analysis/rule-lists.json, one row, two edits:
  - :87, step-pipeline `globs`. Old: "scripts/*.js", "scripts/**/*.descriptor.json", ... New: "scripts/*.js", "scripts/generate-*.mjs", "scripts/**/*.descriptor.json", ... This inserts the single glob `scripts/generate-*.mjs`.
  - :90, step-pipeline `why`. Append one provenance sentence, as every earlier table card did:
    ". task-464 (PROC.GENROW; RR-0475 item 1, decision-257): also the top-level generator scripts scripts/generate-*.mjs, added by that ruling so that a Files line naming one resolves (the .js generators were already matched by scripts/*.js); the rule that bears on a generator is the generator drift guard of engineering standards section 5 (generated doc and its generator)"
  - Nothing else changes: no lists, no `not`, no exempt, no kinds.
(c) docs/reports/generated/rule-lists-by-kind.md does NOT change. renderPage (rule-lists.mjs:545-571) prints only the six `kinds`, and none of them names a generator. I checked this in memory: the page rendered with the new glob is byte-equal to the committed page, and `page --check` passes today. The lane runs `page --check`, which pre-commit also runs (.husky/pre-commit:44). That meets the AC words "the rule-lists page is current". No `--write` diff is expected: the plan grounder ran renderPage with the new glob in memory and the page is byte-equal to the committed page. If `page --check` says stale at build time (a spec edit landed on the board and moved a character count the page prints), `page --write` regenerates it in the same work commit.

What each candidate glob would newly match (17 top-level scripts/*.mjs; today all 17 match no row):
- `scripts/generate-*.mjs` (recommended) matches 11 files (git ls-files scripts/generate-*.mjs, counted by the plan grounder; the 18 top-level generate-* files are these 11 and 7 .js):
  - generate-bylaw-handbook, generate-bylaw-layer2-input, generate-bylaw-provisions
  - generate-db-docs, generate-lineage-docs
  - generate-logic-variable-effect, generate-logic-variable-groups, generate-logic-vars-docs
  - generate-script, generate-step-handbook, generate-system-map
- Each of the 11 then gets step-132 and eng-back + eng-shared from step-pipeline, plus the every-task, increment and milestone lists (plan-protocol, inc-S, ms-S).
- None of the 11 is matched by another row. lane-tools covers scripts/analysis/**, not the top level. The bylaw layer23 globs name no top-level generator, even the bylaw ones. None is in `exempt`, and none is in step-pipeline's `not`.
- `scripts/*.mjs` would match all 17. The extra 6 are ai-env-check, audit_all_specs, harvest-tests, proxy-relay, task-init and wf8-worktree (11 + 6 = 17). They would get step-132 too, but they are lane and dev tools, not generators, and the ruling names generator scripts only. Not recommended.

4. TESTS FIRST
New case in rule-lists.logic.test.ts: "task-464 (RR-0475 item 1): a Files line naming a top-level generator script resolves (step-pipeline); a non-generator top-level .mjs is still refused".
- Input: `script(CLI, ['resolve', '--files', 'scripts/generate-logic-variable-groups.mjs', '--type', 'fix', '--letter', 'S'])`.
- Expected: status 0, and the list ids contain step-132, eng-back, eng-shared, plan-protocol, inc-S and ms-S.
- Red today: exit 3 (die(3, r.error), rule-lists.mjs:817) with stderr beginning "refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: scripts/generate-logic-variable-groups.mjs" (rule-lists.mjs:273; confirmed by the integration seat running resolve). Assert status 3 and that stderr contains "matched by no row of scripts/analysis/rule-lists.json" and the path. This is AC #1, "the launch gate resolves a Files line that names scripts/generate-logic-variable-groups.mjs".
- In the same case, for each of the 11 files listed above (their literal names, written out in the test, not read from the folder), expect status 0 and the list ids to contain step-132. This is red today for all 11.
- Control in the same case: `scripts/ai-env-check.mjs` gives status 3 before and after the edit. Its stderr is asserted too: it contains "matched by no row of scripts/analysis/rule-lists.json" and the path scripts/ai-env-check.mjs, so a refusal for another cause does not pass. This locks the narrow glob, so a widening to `scripts/*.mjs` is caught. Stated as survive-the-fix: it is green both before and after.
- Order: run the case and record red; make edit (b); run green. Also run `node scripts/analysis/rule-lists.mjs validate` (expect ok), `page --check` (expect current), and the three suites rule-lists.logic, rule-lists-table.logic and backlog-lane.logic.
- Acceptance that task-454's own line resolves: run `node scripts/analysis/rule-lists.mjs check-tasks`. That call is resolveTask with the task's type and milestone letter, in memory, and writes nothing. I simulated it with the new glob:
  - task-454 resolves (type fix, letter S). Its lists are step-132, surface-136, mobile-90, mobile-98, mobile-99, eng-all, plan-protocol, inc-S, ms-S, and verifyResolved returns nothing missing.
  - Those are the same lists task-454 already gets without the generator entry: scripts/seeds/logic_variables.json already brings step-132 through step-pipeline. So task-454's ruled plan review needs no new list.
  - The lane pastes the before and after lines into its report.
- Pins checked, none moves:
  - rule-lists.logic.test.ts:1150-1153 pins 12 FILES (6 kinds + 6). Kinds are unchanged.
  - :453-457 matches the count line with \d+.
  - rule-lists-table.logic.test.ts pins no step-pipeline glob. Its eng-side checks (:282-292) use scripts/steps and scripts/lib/compute, which are unchanged.
  - backlog-lane.logic.test.ts uses scripts/analysis/thing.mjs (lane-tools), which is unchanged.
  - check-lane-close.logic.test.ts uses fixture tables.
  - hooks-composition.infra.test.ts:343 only requires that `page --check` is run.

5. LIMITS, AND HOW IT COULD FAIL OR SURPRISE
- The plan adds no row, list, kind or field (RR-0392). It does not touch the other 6 top-level .mjs scripts (ai-env-check, audit_all_specs, harvest-tests, proxy-relay, task-init, wf8-worktree), which still match no row; no open card names one (I grepped the backlog). The same refusal would fire for a card that names one of them (or a top-level script of another kind, such as a .py, .ts or .sh file) until a card names one; no dated note is added for it, this sentence is the record. The three by-law generators (generate-bylaw-handbook, generate-bylaw-layer2-input, generate-bylaw-provisions) get step-132, eng-back and eng-shared and not bylaw-133: the bylaw row reads its globs from mcbylaws/protected-paths.json layer23, which names none of them, and a glob on that row would be a second row edit, which RR-0392 and RR-0475 item 1 do not give; scripts/resolve-bylaws.js already carries both rows the same way. Giving them bylaw-133 is a later card if the operator wants it. It does not touch docs/reports/red-evidence/.
- check-tasks output moves in two ways:
  - The open count goes from resolve 102 / not yet 205 to 103 / 204. task-454 leaves the "matches no row" group.
  - task-395 stays in that group, but its reason shrinks to "docs/reports/red-evidence/task-395/" only. task-411 is unchanged.
  - A new compliance-references command is printed for task-454: 9 `--add-ref compliance:...` entries. That belongs to the orchestrator's task-454 work, not this card.
  - No other open card's resolution changes.
- Self-edit rule (check-lane-close.mjs:764-765): rule-lists.json is a protected_path, so the commit that edits it cannot also move task-464 to a finished status. Land the work commit first and close in a later commit, as task-460 did (77286d717, then 35272295e).
- The F10 path (check-lane-close.mjs:853) judges this task by its own branch table, because the Files line names the table. Every key that decides what is reviewed stays pinned to the board's values. This edit changes none of those keys.
- If a later card edits task-454's Files line, nothing in the suite breaks, because the lock uses a literal path, not the card.
- The card's DoD cites old line numbers: 08_agents.md:462 is now :497, :490 is now :525, 124a:988 is now :992, 137_mcqueue.md:84 is now :98. I noted this; this card does not fix them.

6. NOTES OWED (backlog CLI only, never a hand edit)
- The card had no `type:` when it was planned; it is `type: fix` now.
  - The launch gate's plan check runs only for build or fix (backlog-lane.mjs:89-90), and plan-prep review refuses any other type (rule-lists.mjs:643).
  - The close check refuses a code commit by a task that has no lane assignee and is not build, fix or check (check-lane-close.mjs:828).
  - So it needs one. Follow the task-463 precedent: `backlog task edit task-464 --type fix`. It is a fix, so the plan-prep review sends the plan lenses only (rule-lists.mjs:663).
- The task-464 file was untracked on the board when the plan was written; it is tracked at 62dc1206e. The launch gate reads task files at HEAD (backlog-lane.mjs), so the file must be committed by the board commit job or the orchestrator before launch.
- After the type is set, check-tasks prints a compliance-reference command for task-464. Run that printed command verbatim. It is today's line plus anything the type changes; today's line: `backlog task edit task-464 --add-ref 'compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md' ... --add-ref 'compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md'`.
- The dated note quoting RR-0475 item 1 verbatim (DoD #5) is already on task-464: the orchestrator's note of 2026-11-25 in Implementation Notes. Add none: a note edit moves the Plan hash after the grounder wrote it.
- Files line confirmed unchanged, three entries, exactly:
  `Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md`
  The page entry stays. With it or without it the Files line resolves to the same six lists (agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol, inc-S, ms-S; run by the plan grounder), so dropping it buys nothing; it is the file the AC words name ("the rule-lists page is current"), and `page --check` evidence covers it.

7. OPEN CHOICES (not decided here)
- C1, the glob:
  - (a) `scripts/generate-*.mjs`: 11 files, exactly what the ruling and the question named (QUESTIONS-RULED.md item 2).
  - (b) `scripts/*.mjs`: 17 files, of which 6 are not generators and would get the step handbook, a reach the ruling does not name (R-IZ (1), 124a:992).
  - Recommend (a).
- C2, the host row:
  - (a) step-pipeline: the .js generators already live there, and its lists (step-132, eng-back, eng-shared) are the ones the specs above name for scripts and generators.
  - (b) lane-tools: it gives Spec 08 sections and eng-all, but these are not lane tools.
  - (c) a new row: refused by RR-0392, and not needed because (a) holds them.
  - Recommend (a).
- C3, the acceptance check on task-454:
  - (a) the read-only `check-tasks` line in the lane report.
  - (b) also a suite case that reads task-454's file. That ties the suite to a live card that may change.
  - Recommend (a).

8. OPERATOR QUESTIONS
None. RR-0475 item 1 covers the change.

9. UNVERIFIED
- I ran no tests, so red and green are shown by simulation only (resolveTask in memory with the glob added: before refused, after ok for all 11).
- I did not run `backlog-lane.mjs --dry-run` for task-454. Besides list resolution, task-454's launch may still need the compliance references the orchestrator owes for it.
- I did not run gate J (generated-docs.mjs); the page is byte-equal, so no change is expected.
- I did not check whether setting `type: fix` changes task-464's compliance-reference set beyond today's printed line.

#### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/backlog/rule-lists.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/docs/reports/generated/rule-lists-by-kind.md
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/hooks/check-lane-close.mjs

Plan review round 1: 16 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder docs/reports/reviews/task-464/GROUNDER-PLAN.md; triage docs/reports/reviews/task-464/TRIAGE-PLAN.md
plan-error-paths#1 MED folded matches 11 files (gi
plan-plan-review-deepseek#1 MED folded for each of the 11 f
in#1 MED folded 11 of them .mjs (the
rc#1 MED folded 11 then gets step-13
rg#1 MED folded The three by-law gen

## Implementation Notes
2026-11-25 (orchestrator): opened from RR-0475 item 1. Operator, verbatim (MORNING-DECISIONS.md:2481): "1. y 2.y 3. y but which increment 4. y 5. please explain 6. y"; item 1 answers the question at :2473 (may one small card add top-level generator scripts to the rule-list table so 454 can launch). Plan PLAN-464-v1 by Cairn-Plan-464 written on the card; type set to fix as task-463.

2026-11-25 taken on the board at lane launch (lane BL-GENROW, worktree /Users/brettpreston_macmini/Buildo-wt-genrow, branch wf2/genrow), RR-0240

2026-11-25 build started (lane BL-GENROW) on PLAN-464-v1 as ruled (C1 a scripts/generate-*.mjs, C2 a step-pipeline, C3 a check-tasks line in the report). Red test first: the task-464 case in src/tests/backlog/rule-lists.logic.test.ts written before the table edit.

2026-11-25 red: the commit attempt with only the test and task files staged was refused by the pre-commit related run (task-464 case: exit 3, refused: Files path(s) matched by no row ... scripts/generate-logic-variable-groups.mjs; 1 failed, 107 passed). Edit (b) as planned: step-pipeline gains the glob scripts/generate-*.mjs and one why sentence; no row, list, kind or field added. validate: ok 58 lists, 23 rows; page --check: current (the page does not change). check-tasks: before resolve 102, not yet 205 (task-454: a Files path matches no row: scripts/generate-logic-variable-groups.mjs); after resolve 103, not yet 204, task-454 resolves. Work commit only: status stays RUNNING (rule-lists.json is a protected path); the close is a later records-only commit.

2026-11-25 station PASS on work commit 4b47e5119 (pass file ~/Buildo-scratch/push-station/pass/4b47e51196435f81b9d3251c7f9a7b684f379f4c.pass; output ~/Buildo-scratch/lanes-20261125/station-4b47e5119.out), run by the orchestrator per RR-0467.

## References
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
- docs/reports/reviews/task-464/GROUNDER-PLAN.md
- docs/reports/reviews/task-464/TRIAGE-PLAN.md
- docs/reports/reviews/task-464/seat-integration-1.md
- docs/reports/reviews/task-464/seat-reality-check-1.md
- docs/reports/reviews/task-464/seat-regression-1.md

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
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
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
- RR-0419 The rule-list table edit is approved as one task
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
- RR-0429 Dated notes are kept short
- RR-0430 The six unlabelled running tasks join McFixReborn
- RR-0431 McFixReborn: each set of files reviewed once, output only
- RR-0432 McFixReborn: fold the six first; progress in the orchestrator's table
- RR-0433 The six fold as they are; the group review is their one output review
- RR-0434 McFixReborn proceeds as per the status table
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0435 The orchestrator may do the merge edits and the test fix for the six
- RR-0436 Option 1 confirmed for the remaining folds
- RR-0437 Task 388 left out of the folds; nine paperwork notes approved
- RR-0438 Task 349 D3: the public web report page is wired at launch
- RR-0439 McFixReborn review calls: 120,000 characters; each list reads only its own files
- RR-0440 plan to drop the planning and process lists from reviews
- RR-0441 McFixReborn reading seats: reality check and integration run, code review dropped
- RR-0442 the search opens a lot on an exact match
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses
- RR-0444 fold the McFixReborn findings
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks
- RR-0448 the search-fix cards are created as 8 merged tasks
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles
- RR-0452 tooling plan approved; the three questions are not added
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once
- RR-0149 Increment 1·A tooling location
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests
- RR-0461 Card 461 clean seat report: run a fresh integration seat
- RR-0462 Phone checks quick plan approved; a dead card carries only the label dead
- RR-0463 Task 458 haptic feedback moves to Increment 1C
- RR-0464 Task 460: no separate security review at output; the validating grounder reads the sensitive files
- RR-0465 task 455 (a confidence word per reading) moves to Increment 1·D beside task 76
- RR-0466 task 452 limit screen keeps the notice box, first line emphasised, new wording
- RR-0150 Infra freeze named list
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review — "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2424)
- RR-0468 task 452 failed-read notice on the limit screen: Something went wrong on our side. Please try again.
- RR-0469 task 452 the limit screen's own code file WallBinding.tsx is confirmed
- RR-0471 iPhone run: free Apple account, phone may reach the Mac on the home Wi-Fi, GO for a read-only test database check
- RR-0472 GO: bring the local test database up to the current migrations
- RR-0473 Yes: install CocoaPods and copy the Google settings file, local only
- RR-0474 External drive left alone; tasks 463, 456 and 454 worked overnight
- RR-0475 answers to the six morning questions — "1. y 2.y 3. y but which increment 4. y 5. please explain 6. y" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481)
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
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review (names RR-0467) — "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2424)
- RR-0475 answers to the six morning questions (names RR-0475) — "1. y 2.y 3. y but which increment 4. y 5. please explain 6. y" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481)

## Prior reviews and lane reports
### task-464 (this task)
- docs/reports/reviews/task-464/FINDINGS-PLAN.md
- docs/reports/reviews/task-464/FOLD-CHECK.md
- docs/reports/reviews/task-464/GROUNDER-PLAN.md
- docs/reports/reviews/task-464/QUESTIONS-RULED.md
- docs/reports/reviews/task-464/TRIAGE-PLAN.md
- docs/reports/reviews/task-464/seat-integration-1.md
- docs/reports/reviews/task-464/seat-reality-check-1.md
- docs/reports/reviews/task-464/seat-regression-1.md

## Dependencies
- (none)
