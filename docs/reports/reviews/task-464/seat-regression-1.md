# Seat: regression: task-464 plan (PLAN-464-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 62dc1206e (wf2/board). The plan's own "head read" says eb8bbd768; I read the working tree at 62dc1206e. Files read: the task-464 file, FINDINGS-PLAN.md, the brief, MD:2473-2490, rule-lists.json (rows, exempt, finished_statuses), rule-lists.mjs:241-273, check-lane-close.mjs:845-860, mcbylaws/protected-paths.json (layer23), Spec 132 head and x-tooling.1, engineering standards section 9, rule-lists.logic.test.ts:378-390, the task-395, 372 and 454 files. Git: log -L on the step-pipeline row, show cb026342c and 181e0e344, and a diff of every local and remote branch not merged into HEAD against the four table and test files. Not run: any test, any dry-run (UNVERIFIED).

Checked and clean:
- History of the row. The step-pipeline row was born in task-366 COMPLY.2 (cb026342c, 2026-11-20) with `scripts/*.js` and no `.mjs`. Its `why` there (cb026342c:56) says nothing about .mjs.
  - No row, commit message or spec I found says top-level .mjs scripts are excluded on purpose.
  - Task-406 V2.LIST (181e0e344) added the rows for unmatched paths: scripts/steps, scripts/lib, scripts/seeds, scripts/ast-grep-rules, scripts/board and others. It did not discuss top-level .mjs. The omission looks like an oversight, not a ruling.
  - COMPLY.2 8c8e5fe99 carved the review CLIs out of the row as lane tools. That is the only top-level script classification on record, and the plan keeps it.
- Spec lines that say what Spec 132 covers. Spec 132 is a generated reading surface (head lines 5-15); I found no scope sentence naming `scripts/*.js` or excluding .mjs. The plan's `why` text contradicts no spec line. See rg#2 for the one weak citation.
- Retroactivity of the close check. check-lane-close.mjs:854-856 judges a task by the range-base table, except a task whose own Files line names the table, which is judged by its branch table with pinned keys.
  - Finished cards use their own base table, so the new glob changes nothing for them.
  - `finished_statuses` is BUILT, DONE, MERGED (rule-lists.json:22).
  - Among open cards, only task-454 names a top-level generate-*.mjs in its Files line. A scan of every backlog/tasks Files line found no other. Task-454 already gets step-132 through scripts/seeds, so its list set does not change.
  - Task-395's Files line holds 5 generate-* mentions. They are not top-level .mjs generators, and I did not find which entries they are (UNVERIFIED).
- Other open work. Every unmerged local and remote branch was diffed (HEAD...branch) over rule-lists.json, rule-lists.mjs, rule-lists.logic.test.ts, rule-lists-by-kind.md and check-lane-close.mjs. No branch differs, so there is no conflict and no different judgment from unlanded work.
- Earlier cards that edited the generators. Task-395 (29912ef52) and task-372 (2744b12df) both edited scripts/generate-logic-variable-groups.mjs on 2026-11-20. Task-372's Files line (src/lib/report-projection/project.ts, format.ts, seeds/logic_variables.json) did not name it; task-395's visible Files entries do not either. The generator edits were not on a Files line, so no earlier Files line was refused for it. Task-454 is the first card to name it.
- Pins: nothing in src/tests asserts the step-pipeline globs. The only src/tests mention is a comment at rule-lists-table.logic.test.ts:259. The plan's pin list holds.

## rg#1 MED: the three bylaw generators are given the step handbook, not the by-law handbook that governs them
Plan: section 3, "Each of the 9 then gets step-132 and eng-back + eng-shared"; "The bylaw layer23 globs name no top-level generator, even the bylaw ones."
Evidence: mcbylaws/protected-paths.json layer23 lists `scripts/resolve-bylaws.js` but no scripts/generate-bylaw-*.mjs, so the plan's sentence is true. The row `bylaw` (rule-lists.json:93-97) maps layer23 to `bylaw-133` only. rule-lists.json:30 and :40 (the 181e0e344 diff) say bylaw-133 is `"generated_by": "scripts/generate-bylaw-handbook.mjs"`. scripts/generate-bylaw-provisions.mjs:1-8 cites Spec 68 and 69, the McBylaw standard.
Effect: a later card that edits generate-bylaw-handbook.mjs, generate-bylaw-provisions.mjs or generate-bylaw-layer2-input.mjs would be reviewed against Spec 132 (steps) and never against bylaw-133. This is the same wrong-fit the table already fixed for step shells. generate-db-docs, generate-lineage-docs and generate-system-map are not steps either, but no other row fits them.
Fix: pick one.
(a) Record the gap as a dated note naming the three bylaw generators. Do not widen the card, since RR-0392 and R-IZ (1) forbid extra lists.
(b) State in the plan that overlap is accepted. There is precedent: scripts/resolve-bylaws.js gets both `bylaw` and `step-pipeline`.

## rg#2 LOW: the cited spec text scopes the rule to `.js`, so it is weak support for adding .mjs
Plan: section 1, "docs/specs/00_engineering_standards.md:175 '## 9. Pipeline & Script Safety'; :177 'Pipeline scripts (`scripts/*.js`) ...'".
Evidence: docs/specs/00_engineering_standards.md:177 reads "Pipeline scripts (`scripts/*.js`) that write to the database MUST wrap multi-row mutations in explicit transactions". Section 9 binds `.js` pipeline scripts that write to the database. The .mjs generators are doc and fixture generators.
Effect: the only real basis for the glob is RR-0475 item 1. The `why` sentence to be appended says the scripts are "governed by engineering standards section 9". A reader of the table would take that as a spec-backed claim, and it is not.
Fix: change the appended `why` to say the .mjs generators are added by ruling RR-0475 item 1 so the launch gate resolves them. Cite only Spec 132 x-tooling.1 and the section 5 drift guard (both true), not section 9.

## rg#3 LOW: the plan says the row "already covers the 9 top-level .js generators"; the real count is 7
Plan: section 2, "scripts/*.js already covers the 9 top-level .js generators"; the card says 18 files, 9 of them .mjs.
Evidence: `ls scripts/generate-*` gives 18 files: 7 .js (4 generate-assert-*, ingest-batch, sharing-phase, stream-catalog-json) and 11 .mjs. This extends plan lens finding 1 (9 vs 11) to the .js side.
Effect: the count also feeds the 102 to 103 check-tasks arithmetic. The "red for all N files" loop must use the real 11, or nothing is red.
Fix: build the literal test list from `ls scripts/generate-*.mjs` (11 names) and correct the .js figure to 7 in the note.

## rg#4 NIT: the Spec 132 reading-surface line promises a pre-commit `--check` the table card cannot verify
Plan: section 3(b), the appended `why` ends "Spec 132 x-tooling.1 (every generator --check at pre-commit)".
Evidence: 132_step_standard_handbook.md:448 says "runs every generator `--check`", but several named generators (generate-db-docs, which needs Postgres, and generate-script) may not run in pre-commit. I did not check .husky/pre-commit for each (UNVERIFIED).
Fix: drop the parenthetical from the `why` text, or confirm each of the 11 is in the pre-commit list before keeping it.

No standing operator word is dropped. RR-0475 item 1 (MD:2481) says "1. y" and the plan's glob stays inside it. RR-0392 holds: no row, list or field is added.

STATUS: 4 findings (0 CRITICAL, 0 HIGH, 1 MED, 2 LOW, 1 NIT); no existing lock, finished card or open branch is broken, and the main residue is that the bylaw generators get the wrong handbook.
