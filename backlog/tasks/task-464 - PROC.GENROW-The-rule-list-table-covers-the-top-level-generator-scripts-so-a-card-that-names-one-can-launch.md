---
id: TASK-464
title: >-
  PROC.GENROW The rule-list table covers the top-level generator scripts, so a
  card that names one can launch
status: WAITS
assignee: []
created_date: '2026-11-25T12:31:00Z'
updated_date: '2026-11-25T12:37:00Z'
labels:
  - ProcessImprovement
milestone: m-1
dependencies: []
references:
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
type: fix
ordinal: 158210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-25 by the orchestrator from RR-0475 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481, operator answer 1: yes). Source: plan grounder Cairn-Ground-P454, operator question 2 (docs/reports/reviews/task-454/QUESTIONS-RULED.md). The launch gate refuses task-454 because its Files line names scripts/generate-logic-variable-groups.mjs and no row of scripts/analysis/rule-lists.json matches a top-level scripts/*.mjs file (rule-lists.mjs:273; the step-pipeline row covers scripts/*.js only). 18 top-level scripts/generate-* files exist, 9 of them .mjs. Smallest change: one existing row gains a glob for the top-level generator .mjs scripts (the planner names the row and the exact glob from the table and the specs that govern those scripts); no new list, no new row unless the plan shows the existing rows cannot hold it. The rule-lists page is regenerated. Not planned yet. Blocks task-454.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The launch gate resolves a Files line that names scripts/generate-logic-variable-groups.mjs (task-454's line resolves with no unmatched path), a test locks it and was red first, and the rule-lists page is current
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
Planner: Cairn-Plan-464
Plan id: PLAN-464-v1

Head read: wf2/board at eb8bbd768. Everything was read-only. The only commands run were `rule-lists.mjs page --check`, `check-tasks` (it prints to the console and writes nothing) and node -e simulations that held the table in memory. No file was written.

1. RULE QUOTED FIRST
- RR-0475, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481-2482: "1. y ..." gives "Q1 yes: one small card adds top-level generator scripts to the rule-list table so 454 can launch."
- The question it answers, docs/reports/reviews/task-454/QUESTIONS-RULED.md (Operator questions, item 2): "may one small card add scripts/generate-*.mjs to a row before this card launches (recommended)?"
- RR-0392, MD:1975-1976: "I don't think we need any other infastrcuture beyond this" means no new row, list, field or tool.
- The refusal, scripts/analysis/rule-lists.mjs:273: "refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json".
- The table's own grammar, rule-lists.json:5: "A row maps path globs to lists ... Several rows may match: the lists are the union."
- What governs the scripts:
  - docs/specs/00_engineering_standards.md:175 "## 9. Pipeline & Script Safety"; :177 "Pipeline scripts (`scripts/*.js`) ..."
  - :130 "generated doc ↔ its generator (the drift guard ...)" (section 5, eng-shared).
  - docs/specs/01-pipeline/132_step_standard_handbook.md:448, x-tooling.1 (section "4. Cross-cutting", list step-132): "Pre-commit ... runs every generator `--check`".
- DoD rules:
  - 08_agents.md:497 "Every lock is proven in BOTH directions".
  - 124a:992 R-IZ (1) "no change adds a tool, field or rule its card or ruling did not name".
  - .cursor/MCBYLAWS-QUEUE.md:107 "Quote the rule first".

2. WHAT EXISTS AND IS REUSED
- Row step-pipeline (rule-lists.json:85-91). Its glob `scripts/*.js` already covers the 9 top-level .js generators (generate-assert-*-descriptor.js, generate-ingest-batch.js, generate-sharing-phase.js, generate-stream-catalog-json.js and the rest). It gives them step-132, eng-back and eng-shared. The .mjs generators are the same kind of file in the same folder, and the same row can hold them.
- The glob matcher scripts/analysis/mcbylaws/paths.mjs:77-102 (`*` matches inside one path segment, so `scripts/generate-*.mjs` matches top-level files only).
- validateTable (rule-lists.mjs:150) already refuses a literal glob that matches no tracked file.
- resolveTask, milestoneLetter and checkTasks (rule-lists.mjs:243, :203, :512).
- Test pattern: rule-lists.logic.test.ts:381-386, "the paths that matched no row on 2026-11-20 now resolve". The new case sits beside it in the same shape.

3. THE CHANGE, FILE BY FILE, IN BUILD ORDER
(a) src/tests/backlog/rule-lists.logic.test.ts. Add one `it` inside the describe that holds :381, after :386. Section 5 has the details. It is red first.
(b) scripts/analysis/rule-lists.json, one row, two edits:
  - :87, step-pipeline `globs`. Old: "scripts/*.js", "scripts/**/*.descriptor.json", ... New: "scripts/*.js", "scripts/generate-*.mjs", "scripts/**/*.descriptor.json", ... This inserts the single glob `scripts/generate-*.mjs`.
  - :90, step-pipeline `why`. Append one provenance sentence, as every earlier table card did:
    " task-464 (PROC.GENROW; RR-0475 item 1, MORNING-DECISIONS.md:2481): also the top-level generator scripts scripts/generate-*.mjs (the .js generators were already matched by scripts/*.js), governed by engineering standards section 9 and the generator drift guard (section 5) and Spec 132 x-tooling.1 (every generator --check at pre-commit); a task-454 Files entry matched no row"
  - Nothing else changes: no lists, no `not`, no exempt, no kinds.
(c) docs/reports/generated/rule-lists-by-kind.md does NOT change. renderPage (rule-lists.mjs:545-571) prints only the six `kinds`, and none of them names a generator. I checked this in memory: the page rendered with the new glob is byte-equal to the committed page, and `page --check` passes today. The lane runs `page --check`, which pre-commit also runs (.husky/pre-commit:44). That meets the AC words "the rule-lists page is current". No `--write` diff is expected.

What each candidate glob would newly match (17 top-level scripts/*.mjs; today all 17 match no row):
- `scripts/generate-*.mjs` (recommended) matches 9 files:
  - generate-bylaw-handbook, generate-bylaw-layer2-input, generate-bylaw-provisions
  - generate-db-docs, generate-lineage-docs
  - generate-logic-variable-effect, generate-logic-variable-groups, generate-logic-vars-docs
  - generate-script, generate-step-handbook, generate-system-map
- Each of the 9 then gets step-132 and eng-back + eng-shared from step-pipeline, plus the every-task, increment and milestone lists (plan-protocol, inc-S, ms-S).
- None of the 9 is matched by another row. lane-tools covers scripts/analysis/**, not the top level. The bylaw layer23 globs name no top-level generator, even the bylaw ones. None is in `exempt`, and none is in step-pipeline's `not`.
- `scripts/*.mjs` would match all 17. The extra 8 are ai-env-check, audit_all_specs, harvest-tests, proxy-relay, task-init, wf8-worktree and the two counted above. They would get step-132 too, but they are lane and dev tools, not generators, and the ruling names generator scripts only. Not recommended.

4. TESTS FIRST
New case in rule-lists.logic.test.ts: "task-464 (RR-0475 item 1): a Files line naming a top-level generator script resolves (step-pipeline); a non-generator top-level .mjs is still refused".
- Input: `script(CLI, ['resolve', '--files', 'scripts/generate-logic-variable-groups.mjs', '--type', 'fix', '--letter', 'S'])`.
- Expected: status 0, and the list ids contain step-132, eng-back, eng-shared, plan-protocol, inc-S and ms-S.
- Red today: exit 3, stderr "matched by no row: scripts/generate-logic-variable-groups.mjs" (confirmed by simulation). This is AC #1, "the launch gate resolves a Files line that names scripts/generate-logic-variable-groups.mjs".
- In the same case, for each of the 9 files listed above (literal names), expect status 0 and the list ids to contain step-132. This is red today for all 9.
- Control in the same case: `scripts/ai-env-check.mjs` gives status 3 before and after the edit. This locks the narrow glob, so a widening to `scripts/*.mjs` is caught. Stated as survive-the-fix: it is green both before and after.
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
- The plan adds no row, list, kind or field (RR-0392). It does not touch the other 8 top-level .mjs scripts, which still match no row; no open card names one (I grepped the backlog). It does not touch docs/reports/red-evidence/.
- check-tasks output moves in two ways:
  - The open count goes from resolve 102 / not yet 205 to 103 / 204. task-454 leaves the "matches no row" group.
  - task-395 stays in that group, but its reason shrinks to "docs/reports/red-evidence/task-395/" only. task-411 is unchanged.
  - A new compliance-references command is printed for task-454: 9 `--add-ref compliance:...` entries. That belongs to the orchestrator's task-454 work, not this card.
  - No other open card's resolution changes.
- Self-edit rule (check-lane-close.mjs:764-765): rule-lists.json is a protected_path, so the commit that edits it cannot also move task-464 to a finished status. Land the work commit first and close in a later commit, as task-460 did (77286d717, then 35272295e).
- The F10 path (check-lane-close.mjs:852) judges this task by its own branch table, because the Files line names the table. Every key that decides what is reviewed stays pinned to the board's values. This edit changes none of those keys.
- If a later card edits task-454's Files line, nothing in the suite breaks, because the lock uses a literal path, not the card.
- The card's DoD cites old line numbers: 08_agents.md:462 is now :497, :490 is now :525, 124a:988 is now :992, 137_mcqueue.md:84 is now :98. I noted this; this card does not fix them.

6. NOTES OWED (backlog CLI only, never a hand edit)
- The card has no `type:`.
  - The launch gate's plan check runs only for build or fix (backlog-lane.mjs:89-90), and plan-prep review refuses any other type (rule-lists.mjs:643).
  - The close check refuses a code commit by a task that has no lane assignee and is not build, fix or check (check-lane-close.mjs:828).
  - So it needs one. Follow the task-463 precedent: `backlog task edit task-464 --type fix`. It is a fix, so the plan-prep review sends the plan lenses only (rule-lists.mjs:663).
- The task-464 file is untracked on the board today (git status shows "??"). The launch gate reads task files at HEAD (backlog-lane.mjs), so the file must be committed by the board commit job or the orchestrator before launch.
- After the type is set, check-tasks prints a compliance-reference command for task-464. Run that printed command verbatim. It is today's line plus anything the type changes; today's line: `backlog task edit task-464 --add-ref 'compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md' ... --add-ref 'compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md'`.
- A dated note on task-464 quoting RR-0475 item 1 verbatim, with `backlog task edit task-464 --append-notes "..."` (DoD #5).
- Files line confirmed unchanged, three entries, exactly:
  `Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md`
  The page stays on the line so that `page --check` evidence covers it. It resolves to lane-tools, tests and generated-reports (simulated: it resolves with nothing missing).

7. OPEN CHOICES (not decided here)
- C1, the glob:
  - (a) `scripts/generate-*.mjs`: 9 files, exactly what the ruling and the question named (QUESTIONS-RULED.md item 2).
  - (b) `scripts/*.mjs`: 17 files, of which 8 are not generators and would get the step handbook, a reach the ruling does not name (R-IZ (1), 124a:992).
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
- I ran no tests, so red and green are shown by simulation only (resolveTask in memory with the glob added: before refused, after ok for all 9).
- I did not run `backlog-lane.mjs --dry-run` for task-454. Besides list resolution, task-454's launch may still need the compliance references the orchestrator owes for it.
- I did not run gate J (generated-docs.mjs); the page is byte-equal, so no change is expected.
- I did not check whether setting `type: fix` changes task-464's compliance-reference set beyond today's printed line.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/backlog/rule-lists.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/docs/reports/generated/rule-lists-by-kind.md
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/hooks/check-lane-close.mjs
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25 (orchestrator): opened from RR-0475 item 1. Operator, verbatim (MORNING-DECISIONS.md:2481): "1. y 2.y 3. y but which increment 4. y 5. please explain 6. y"; item 1 answers the question at :2473 (may one small card add top-level generator scripts to the rule-list table so 454 can launch). Plan PLAN-464-v1 by Cairn-Plan-464 written on the card; type set to fix as task-463.
<!-- SECTION:NOTES:END -->
