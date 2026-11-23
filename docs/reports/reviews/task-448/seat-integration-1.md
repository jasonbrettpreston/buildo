# Seat: integration: task-448 plan (PLAN-448-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board, branch wf2/board, head daf3f7201. The plan was read at a75713110, and the only commit since adds the task file, so every line number in the plan holds. Files read: the task file in full, .husky/pre-commit, .husky/commit-msg, .husky/pre-push-checks.sh, .husky/prepare-commit-msg, scripts/hooks/{validate-commit-msg.sh, check-lesson-routing.sh, check-spec-diff.mjs, check-backlog-task.mjs, check-task-files.mjs, check-partial-staging.sh, check-lane-close.mjs (:268-280, :498-504, :700-892), check-integrate-verification.mjs}, scripts/analysis/mcbylaws/{gate.mjs, cite-arms.mjs, db-target.mjs}, mcbylaws/protected-paths.json, scripts/analysis/{policy-checks.mjs, policy-checks/chk3-nothing-new.mjs, spec-split-check.mjs, gates/generated-docs.mjs, backlog-lane.mjs (:60-110, :180-195), rule-lists.mjs (:140-160, :263)}, scripts/analysis/rule-lists.json, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md (:354-358, :484-492), docs/specs/00-architecture/137_mcqueue.md (:134-138), and the three test files plus check-lane-close.logic.test.ts. I ran in-memory node scripts that load the table, apply the 3.1 `not`, lists and glob edits, and call resolveTask and validateTable. I ran no test runner and wrote nothing.

Verdict: One HIGH finding: as ordered, the work commit fails pre-commit at `page --check`. Reordering the steps fixes it. Everything else I checked in the hooks and gates passes.

## Checked, no finding
- Red attempt, order of stages (.husky/pre-commit:16-56). The staged files are three `src/tests/backlog/*.test.ts` files and the task file.
  - Partial staging passes, because the table is not yet edited. The gate `--staged` fires only on layer23 and frontend paths (mcbylaws/protected-paths.json), none of which are staged.
  - Every `--check` generator is unchanged. `page --check` (:44) passes because rule-lists.json is untouched. spec-split-check passes because no spec is staged.
  - lint-staged matches only src/features/leads, src/lib/observability and src/app/api (package.json), so it does nothing here.
  - Typecheck and lint are before the related run (:50-51). The edits are plain `for`/`expect` lines, and `handbookOnly` and `FOUR` still exist (rule-lists-table.logic.test.ts:335-340).
  - RELATED_FILES (:52) matches the three test files, so `vitest related` runs them and goes red at the designed assertions. The commit-msg hooks are never reached.
- check-task-files.mjs:42-72 on the work commit.
  - The Files line holds 8 entries, and the staged set is task file, 3 tests, rule-lists.json, backlog-lane.mjs, the page and two specs. Each is an exact path in the Files line, or the always-allowed task file or lanes dir.
  - Resolving that Files line with the CLI gives agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, policy-124-s2-s5, five-words, plan-protocol, inc-S, ms-S. That is the plan's 10 lists. The output stage drops policy-124 once generated-reports is cut to eng-all, giving 9.
- Protected path rule-lists.json in a work commit. check-lane-close.mjs:748 `if (moves.length === 0) return 0;` returns before :753, because RUNNING is not in finished_statuses (BUILT, DONE, MERGED). :753 only bites on a commit that also moves a task to a finished status, so the work commit passes.
- Records-only close. check-lane-close.mjs:821-824 `rec()` allows the lane's report dir, docs/reports/reviews/task-448/, task files and decisions. It judges with `ownsTable` (:840-842): branch table with exempt, base_ref, finished_statuses and protected_paths pinned, and every_task from the range base. The plan's account of :753 and :836-842 is right. check-lane-close.logic.test.ts F7 control (:568) shows a lane that edits the table without touching the pinned keys closes.
- Commit-msg.
  - validate-commit-msg.sh:28 accepts `feat(08_agents): ...`.
  - check-lesson-routing fires only on lines starting CRITICAL or HIGH.
  - check-backlog-task wants a `Task: task-448` trailer plus the task file staged. Both are in the plan.
  - check-spec-diff is not triggered (TRIGGER_RES is scripts/steps, scripts/lib/compute and .descriptor.json), so the `Spec-diff:` trailer is harmless.
  - check-integrate-verification fires only on `integrate-N` branches.
  - policy-checks CHK.3 needs a new client component, a new dependency key or binding-sources, and none is present. No Operator-Ruling trailer is needed because no ledger row is added.
  - gate `--commit-msg`: no layer23 or frontend path is staged, and 08_agents.md and 137_mcqueue.md are not in the `protected` list (mcbylaws/protected-paths.json). Its cite arm (the `McBylaws-Task`/`McFrontend-Task` trailer check) is not triggered, so no prereg, id or cite arm applies to rule-lists.json, backlog-lane.mjs or those two specs. The `docs/specs/**/124a|133|69a|131|135` entries are the protected specs; 08 and 137 are not among them.
- Spec size budgets. 08 and 137 are not in SPEC_FILES (spec-split-check.mjs:111-150) and not in the manifest `budgets` (68, 69, 122, 123, 124, 131, 134), so there is no byte budget on them.
- Gate J. `rule-lists-by-kind.md` is registered with `has_check: true` (gates/generated-docs.mjs:53).
- Table text edits (3.1).
  - Every old string in 3.1 and 3.2 occurs exactly once in rule-lists.json at the head. The only exceptions are the `["agents-s5-1to3", ..., "orchestrator-doc17"]` lists line (3 occurrences, which is why the plan anchors it with the globs line) and the :146/:152 `gets them through ...` text (2, both replaced). The $comment text at :6 is unique.
  - Applying the `not` lines, the empty lists and the panel-records glob in memory gives `validateTable(t, root)` returning `[]`. The `**` form works: prereg-MF-96-1.json resolves to five-words, plan-protocol, inc-S, ms-S, and prereg-MB-18-1.json keeps bylaw-133.
  - Both `not` insert points follow a line that already ends in a comma (rule-lists.json:93 for bylaw, :162 for lane-tools).
  - Both pre-registration files are tracked.
- why-text insertions. The tests pin only 'nearest lists, no governing spec: operator ruling owed' (table test :45), 'no governing spec found: operator ruling owed' (:50), 'left out for Increment 1·B' (:104), 'The client is just glass' (:106) and 'one API route' (:107). The plan only appends text, so all stay. The two phrases it replaces, 'gets them through' and the record-only $comment, are pinned by no test (grep of src/tests and scripts).
- 3.3 brief sentence. The old text occurs once (backlog-lane.mjs:188). The new text has no backtick and no `${`, and its double quotes are safe inside the template literal. The parity pins (backlog-lane.logic.test.ts:290 and :298) need `out-<lens>[-<list id>]-rN.txt`, which the new text keeps. LAYOUT_NAMES sits earlier in the same literal. Nothing pins 'each finding needs a verdict' or 'round-1 file stays'. check-lane-close.mjs:274-275 counts `Review round N:` lines in the Final Summary, so the brief and the close agree.
- Launch (backlog-lane.mjs:66-110). Status LATER passes. The Files entries are tracked. No refusal fires for a Files line that names a protected path or backlog-lane.mjs. The plan gate then needs the plan evidence (not my lens).
- Spec insert anchors. 08_agents.md:354-356 are the three dated notes and :357 is `5. **Panel sizing`. :489 is the task-419 note under 11.2, with a blank at :490 and `### 11.3` at :491. 137_mcqueue.md:136 is the task-439 note.
  - No test pins the new insert positions. The `08_agents.md:NNN` citations in the DoD and in test comments are not machine-checked (grep over src/tests, scripts and .husky).
  - spec-notes-1b.logic.test.ts only checks the task-444 note in the queue files and 69a M-506.

## in#1 HIGH: page --write is run before the notes that change the page's character counts, so `page --check` refuses the work commit
Plan: Section 7 Commit 1, steps 4 then 5: "4. `node scripts/analysis/rule-lists.mjs page --write`, then `--check`. 5. The three dated notes (3.4-3.6)."
Evidence: The page prints the character count of each list "as the review receives it" (docs/reports/generated/rule-lists-by-kind.md:5). It prints three counts for lists made of text this task edits:
- `| agents-s7-s11 | docs/specs/00-architecture/08_agents.md | 7. Rules & economics; 11. Grounded Verification Protocol | 43,639 |` (:94 and :111)
- `| queue-137 | docs/specs/00-architecture/137_mcqueue.md | whole file | 37,633 |` (:95 and :110)
- `agents-s5-1to3` (:93) is not changed, since the notes sit in §7 rule 4 and §11.2.
The lane-tools row keeps these lists. The 3.4 note goes inside section 7 and the 3.5 note inside 11.2, both in agents-s7-s11, and 3.6 goes into the whole of 137. Adding them after step 4 changes those counts. .husky/pre-commit:44 runs `node scripts/analysis/rule-lists.mjs page --check` against the worktree, and check-partial-staging makes the worktree equal the index. The page written at step 4 is therefore stale, the check exits 1 at stage 44, and no commit happens. This is a refusal of the work commit, not a style point.
Fix: Reorder section 7. Put the three dated notes (3.4-3.6) and the brief sentence before the page step, and make `page --write` then `page --check` the last edit before `git add`. The order becomes: tests, table, brief, notes, page, task file. Add to section 7 that any later edit to rule-lists.json, 08_agents.md, 137_mcqueue.md or a list document means re-running `page --write`.

## in#2 NIT: Section 3.6 insert position leaves the blank-line count ambiguous
Plan: 3.6 "insert after 137_mcqueue.md:136, with a blank line after".
Evidence: 137_mcqueue.md:136 is the task-439 note and :137 is already a blank line before `Dated note 2026-11-20 (M-246 ... task-410` at :138. Inserting "after :136 with a blank line after" can leave either no blank before the new note or two blanks after it.
Fix: State it as "insert a blank line and the note between :136 and :137, so :137's blank line follows it."

STATUS: 2 findings (1 HIGH, 1 NIT); the work commit as ordered fails `page --check` because the page is written before the spec notes change the list counts, and the order swap fixes it.
