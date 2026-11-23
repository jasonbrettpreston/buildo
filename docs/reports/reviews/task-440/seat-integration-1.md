# Seat: integration: task-440 plan (PLAN-440-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 77d54ecc7. Read: check-lane-close.mjs (:385-440 listProof and complianceSetErrors, :461-580 closeErrors, :610-620 plan gate, :730-820 commit-msg arm); backlog-lane.mjs (:55-80, :170-200); rule-lists.mjs (lensSet :183-191, resolveTask :235-285) and rule-lists.json (`every_task`, `exempt`, `milestone_docs`); .husky/commit-msg and validate-commit-msg.sh, check-backlog-task.mjs, check-task-files.mjs, check-lesson-routing.sh, check-spec-diff.mjs, policy-checks/lib.mjs trailerCheck; Spec 137 :22-23, :60-85, :98-100, :109, :125, :136-138; the cards of tasks 367, 441, 442, 446, 445, 439, 424; MORNING-DECISIONS.md :1905-1935 and :1972-1996; the front matter of task-440 (milestone m-1, which is group [S]).

Verdict: no commit would be refused as written. Checked: subject `docs(137_mcqueue): ...` passes validate-commit-msg.sh; the `Task:` and `Operator-Ruling:` trailers are harmless (trailerCheck acts only on ledger rows the commit adds); G3 and CHK.1 return early with no code file staged; the mcbylaws arm reads `FE-\d+` only (cite-parse.mjs:31), so `fe.NN` is safe; `finished_statuses` is BUILT, DONE, MERGED; there is no hook on Definition of Done boxes (grep of scripts/hooks and src/tests/backlog finds none).

## in#1 LOW: Q5 is answerable from the repo; the plan leaves it UNVERIFIED
Plan: "Which stage the outputs must hold when every Files path is exempt is UNVERIFIED (Q5)"; section 12 "The resolved list set for this task".
Evidence: check-lane-close.mjs:518 `const phases = build ? ['out'] : ['plan', 'out']`; listProof's refusal says "write ${phases.join(' or ')}-${seat}-${l.id}.txt" and its loop accepts a list when ANY phase is valid; `if (ph === 'out' && expected.length)` skips the chunk check when no non-exempt path changed (expected is empty here). Resolution: Files is exempt-only, so rowHits is 0 and no error for type record (the error at rule-lists.mjs:~268 is for build/fix only); lists = every_task [five-words, plan-protocol] + increment_docs[S] + milestone_docs[S] = inc-S and ms-S; all four are compliance seat (no eng-all), so the joined file `plan-compliance-rules.txt` (or `out-`) with its `in-` input suffices.
What goes wrong: nothing breaks; the lane may over-build (both stages, per-list files) because the plan does not say.
Fix: state the answer in section 8: one stage (plan or out), joined or per-list, four lists, `in-` input beside it, `context-r1.md` committed, `TASK` file holding `task-440`.

## in#2 MED: nothing orders tasks 367, 441, 442 after task-440
Plan: "The output feeds task-367 (group 1), task-441 (group 2) and task-442 (group 3)" (section 1); section 10 gives only the 446 and 439 order.
Evidence: tasks 367, 441, 442 all have `dependencies: []`; backlog-lane.mjs has no `dependencies` read (grep finds none). The only order is the orchestrator's reading in MORNING-DECISIONS.md RR-0393 "430, 445, 439, 440, the tests (367, 441, 442), 424, 386".
What goes wrong: a launch of 441 or 442 (cards: "as ranked by FINAL.5") can pass the launch gate before RULE-CHECKS.md exists.
Fix: add `dependencies: [task-440]` to the three cards in the landing commit (or say the order is by hand).

## in#3 MED: what task-367 needs is wider than group 1, and part of it exists on the board
Plan: "Its card's '8 OWED' (task-367 description (d)) is now 21 or 22. The look's group 1 table replaces that list."
Evidence: task-367 card items (a) route-side compute reach (Spec 132 purity), (b) numbers in mobile code vs core.8, (c) Spec 90 section 5 never-do list, (d) the OWED locks. (a)-(c) are not handbook rules, so they are in none of the three groups. The board already holds those report-only gates: scripts/analysis/gates/compute-reach.mjs, mobile-literals.mjs, mobile-never-do.mjs and src/tests/gate-mobile-compliance.infra.test.ts (commit 6513119b0, an ancestor of HEAD). Plan section 0 says gates A and B "are not on the board". RR-0386 parks the branch wf1/inc1b-gates, which is a later revision; the stage 1 files are on wf2/board. Task-367's own AC#1 is an operator-confirmed gate list.
What goes wrong: the look gives 367 a group 1 list only; if 367 still carries (a)-(c) it gets nothing for them, and the plan's statement about the board is wrong (see rg#1).
Fix: say 367's input is its (d) only (RR-0386 restarts it as handbook rule tests), say (a)-(c) are out of the look, and correct the "not on the board" sentence.

## in#4 LOW: task-442 asks for "every number on a screen"; the look gives it rules
Evidence: task-442 title and card: "every number on a screen is bound to a database field and available"; plan group 3 rows are rules (24 listed).
What goes wrong: 442 receives which rules lack a Bound or Available check, not which displayed numbers do. That may be all the card needs (it says "as ranked by FINAL.5"), but the plan does not say so.
Fix: one sentence in section 1 that group 3 is rule-level and the number-level inventory is 442's own first step.

## in#5 LOW: collisions with open tasks
- 445 (Files include scripts/analysis/rule-lists.mjs and the check-lane-close tests): lensSet gates on `code` (rule-lists.mjs:184, :190-191) and 445's change is under `sec`, so a record task is unaffected. Order puts 445 first. No collision.
- 439 (rule-lists.json rows): the exempt set and every_task are untouched by its card; order puts 439 first.
- 446: adds fe.58, so counts become 58/22; the plan handles both cases.
- 424 (.husky/pre-push, new .husky/pre-push-checks.sh): lands after 440 by RR-0393; if the reorder happens, the "Wired" reading of .husky/pre-push changes. The plan pins S, so this is safe; say the pin also fixes the hook text.
No Files overlap with 445, 446, 439 or 424 (the 440 Files are exempt report paths).

## in#6 LOW: one commit trap, body lines starting HIGH or CRITICAL
Evidence: check-lesson-routing.sh:21 `grep -qE '^(CRITICAL|HIGH)( |:|—|-)'` on the message body, then demands `Lesson-routing:`.
What goes wrong: a closing message that lists findings with a line starting "HIGH -" is refused. The planned subject and two trailers are fine.
Fix: one line in section 8: do not start a body line with HIGH or CRITICAL.

## in#7 NIT: DONE vs BUILT
Spec 137 :63-82 defines BUILT as "committed locally; not yet pushed". Precedent: task-422 (laned record) closed BUILT; tasks 316, 326, 327 (laned records) closed DONE in the commit that landed the reports. Both pass check-lane-close. The plan says DONE; say why (no code, nothing to land).

What fits and was checked: type record resolves compliance-only (backlog-lane.mjs:190, `code` false); no launch plan gate (check-lane-close.mjs:616 returns early for non build/fix); with no `@lane-` assignee the close returns [] (:468-472) and the lane report is then not in the repo (plan recommends (b), fine); with a lane assignee the changed paths are all under docs/reports or backlog so the Files check is satisfied (:490-496); GROUNDER.md in the lane dir is required only when a lens output holds a finding (:574), and is separate from GROUNDER-LOOK.md; REPORT and GROUNDER references are build-only (:508-514); the one-commit rule: Spec 137 :100 and :138 limit the two-commit close to lane build and fix tasks.
