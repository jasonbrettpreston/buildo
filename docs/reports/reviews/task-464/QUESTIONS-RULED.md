# task-464 plan panel, round 1: questions ruled by the plan grounder (Cairn-Ground-P464)

Authority:
- RR-0475 item 1 (decision-257; MORNING-DECISIONS.md:2481-2482). Operator verbatim: "1. y 2.y 3. y but which increment 4. y 5. please explain 6. y". The ruling is at :2482: "Q1 yes: one small card adds top-level generator scripts to the rule-list table so 454 can launch." The question it answers is at :2472: "Q1: may one small card add top-level generator scripts to the rule-list table so 454 can launch?"
- RR-0392 (:1975-1976): "Ruled (RR-0392): ... (2) no other infrastructure is needed beyond this."
- :1476: the grounder resolves "as long as the result is compliant".

Basis: board head 62dc1206e. Everything was read with git show, git ls-files, ls and grep. The table was run in memory on a copy with the glob added (resolveTask, validateTable, renderPage, checkTasks) and the real gate function planGateErrors was rehearsed on the folded text. No test runner was run and nothing was written.

## The six points
1. Census (counted by running).
   - scripts/generate-* has 18 top-level files: 11 .mjs and 7 .js. The Description's "9 of them .mjs" is wrong. Fold pair 2 (Description) and pairs 5, 8, 9, 10, 11, 12, 16 and 23 to 24 correct the plan.
   - The 7 .js are generate-assert-data-bounds-descriptor, generate-assert-global-coverage-descriptor, generate-assert-parcel-sanity-descriptor, generate-assert-schema-probe-lists, generate-ingest-batch, generate-sharing-phase and generate-stream-catalog-json.
   - The test's literal list of 11, to be written out in full and not read from the folder:
     - scripts/generate-bylaw-handbook.mjs
     - scripts/generate-bylaw-layer2-input.mjs
     - scripts/generate-bylaw-provisions.mjs
     - scripts/generate-db-docs.mjs
     - scripts/generate-lineage-docs.mjs
     - scripts/generate-logic-variable-effect.mjs
     - scripts/generate-logic-variable-groups.mjs
     - scripts/generate-logic-vars-docs.mjs
     - scripts/generate-script.mjs
     - scripts/generate-step-handbook.mjs
     - scripts/generate-system-map.mjs
   - Top-level scripts/*.mjs is 17. The other 6 are ai-env-check, audit_all_specs, harvest-tests, proxy-relay, task-init and wf8-worktree, so the widening in choice C1 (b) would reach 6 non-generators, not 8. The check-tasks arithmetic (102 / 205 to 103 / 204) is correct as run.
2. The real refusal text (rule-lists.mjs:273, exit 3 at :817): "refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: <path> (add a row to the table, or fix the Files line); no silent "no rules apply"". The plan's "matched by no row: <path>" never occurs. The test asserts status 3 and that stderr contains "matched by no row of scripts/analysis/rule-lists.json" and the path, for the red case and for the ai-env-check control (pairs 12 and 14).
3. The appended why sentence, final (it starts with a full stop because the earlier sentences of the row are joined that way, and the row's text ends without one):
   ". task-464 (PROC.GENROW; RR-0475 item 1, decision-257): also the top-level generator scripts scripts/generate-*.mjs, added by that ruling so that a Files line naming one resolves (the .js generators were already matched by scripts/*.js); the rule that bears on a generator is the generator drift guard of engineering standards section 5 (generated doc and its generator)"
   - It cites only RR-0475 item 1 (decision-257) and docs/specs/00_engineering_standards.md:130, "generated doc ↔ its generator (the drift guard", which is in section 5.
   - It drops section 9. The Rule line of 9.1 (00_engineering_standards.md:178) reads "Pipeline scripts (`scripts/*.js`) that write to the database MUST wrap multi-row mutations in explicit transactions". That is not the .mjs generators, and the plan cited :177, which is the 9.1 heading.
   - It drops Spec 132 x-tooling.1 (132_step_standard_handbook.md:448, "and runs every generator `--check`"). .husky/pre-commit runs only 6 of the 11 .mjs generators (lines 25, 28, 29, 39, 40, 43). The other 5 (db-docs, lineage-docs, logic-variable-effect, script, system-map) are only in package.json. Pair 4 says so in the plan.
4. The three by-law generators (generate-bylaw-handbook, generate-bylaw-layer2-input, generate-bylaw-provisions) get step-132, eng-back and eng-shared, not bylaw-133.
   - Ruled: the simplest compliant outcome is to accept it and record it. The bylaw row reads protected-paths.json layer23 (rule-lists.json:94), which names none of them (git grep: 0). Putting a glob on that row is a second row edit, and RR-0475 item 1 and the Description say one existing row gains one glob. RR-0392 says no more infrastructure.
   - The same overlap already exists: the by-law resolver script resolves to step-132, eng-back, eng-shared and bylaw-133 (run).
   - The gap is recorded in the plan itself, in section 5 (pair 16, after "no open card names one"), with "Giving them bylaw-133 is a later card if the operator wants it". No dated note is used, because a Notes edit changes the Plan hash after the grounder wrote it (the hash covers the whole body).
5. Work commit and close are separate commits. scripts/hooks/check-lane-close.mjs:764-765 reads: "self-edit: the check, its table, its helper, the review tool and the hooks may not change in a commit that also closes a task". rule-lists.json is a protected path (rule-lists.json:23), so the close is a later records-only commit. The precedent is task-460: 77286d717, then 35272295e. The plan already says so (section 5); nothing to fold.
6. The Files line: KEEP all three entries. The plan's own statement was only partly right.
   - Run on the table with the glob: the Files line resolves to the same six lists (agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol, inc-S, ms-S) with the page entry and without it. Dropping it gains nothing, and the lines of the card stay as the orchestrator wrote them.
   - The AC says "the rule-lists page is current", and .husky/pre-commit:44 runs page --check. renderPage prints only the six kinds, and the page is byte-equal with the glob (7222 characters).
   - If a spec edit lands on the board before the build and moves a character count the page prints, page --write regenerates it in the same work commit, and the Files line already names the page. Pairs 17 and 18 say this in the plan. The plan's claim "It resolves to lane-tools, tests and generated-reports" was not shown, so it is replaced by the run.

## The plan's open choices
- C1, the glob. Ruled (a) `scripts/generate-*.mjs`. RR-0475 item 1 says "top-level generator scripts", and the Description says "a glob for the top-level generator .mjs scripts". Choice (b) `scripts/*.mjs` would add 6 non-generators, which 124a:992 refuses: "adds no scope its ruling did not name". Not an operator question.
- C2, the host row. Ruled (a) step-pipeline. Its glob `scripts/*.js` already holds the 7 .js generators (rule-lists.json:87), and the Description says "one existing row gains a glob". lane-tools would be a different list set, and a new row is refused by RR-0392. Not an operator question.
- C3, the acceptance check on task-454. Ruled (a), the read-only check-tasks run (it is the same function the launch gate uses; I ran it: 103 / 204 and task-454 gets 9 compliance references). A suite case that reads a live card would tie the suite to a card that may change.

## The plan's UNVERIFIED items
- "No test was run, so red and green are shown by simulation": settled as far as reading can: I ran resolveTask on all 11 files with and without the glob (refused, then step-132, eng-back, eng-shared, plan-protocol, inc-S, ms-S) and ai-env-check stays refused. The red and green runs themselves are the lane's job.
- "I did not run backlog-lane.mjs --dry-run for task-454": left to the orchestrator at launch (a launch step, not this card; deepseek#4 REJECTED).
- "I did not run gate J": settled in part: gates/generated-docs.mjs only runs page --check, and renderPage with the glob is byte-equal.
- "type: fix may change the compliance references": settled. The front matter already carries type: fix, and check-tasks (run) prints 9 references for task-454 and none new for task-464 beyond what is on the card.

## The plan's NOTES OWED
- The type, the untracked file and the dated note are stale or already done: the card holds type: fix, the task file is tracked at 62dc1206e, and the orchestrator's note of 2026-11-25 already quotes RR-0475. Pairs 19 to 21 make the plan say so.
- The close check wants references to GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat files on the task: the orchestrator runs `backlog task edit task-464 --add-ref <path>` for each. Front matter is outside the Plan hash.

## Operator
No operator question. RR-0475 item 1 and the Description cover the change.
