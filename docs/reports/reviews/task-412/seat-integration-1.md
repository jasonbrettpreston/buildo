# Seat: integration — task-412 plan (PLAN-412-v1)

Head checked: wf2/board 4a70b85ca, worktree ~/Buildo-wt-board. Read-only; I ran validate, page --check and resolve, not the test runner.

### int#1 MED: same Files line as task-413, which also edits the table and the same test file

Plan: "Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts" and "Placed after panel-records."

Evidence: `grep -n "Files:" backlog/tasks/task-413*.md` shows task-413 (LATER, GOLDEN.EXEMPT) carries the identical Files line `scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts`. Its body edits the exempt key (rule-lists.json:218) and will append its own describe to the same test file. Other open tasks naming the table: task-366 (RUNNING) and task-406 (RUNNING), whose Files lines both list rule-lists.json; task-404 (LATER, Files: rule-lists.mjs, rule-lists.json); task-403 (LATER, rule-lists.json + rule-lists.logic.test.ts, text says SUPERSEDED by V2.LIST, recommend DROPPED). Panel-records is rule-lists.json:188-193; the next row (specs-docs) starts at :194, so an insert between them is where any later row-adding task will also land.

What would go wrong: two branches both appending a describe at the end of rule-lists-table.logic.test.ts, and both inserting or editing in adjacent lines of the table, conflict at merge. Nothing in the plan orders 412 against 413, 404 or 403. Both are protected-path commits (rule-lists.json), so each is two commits, and a conflict resolution on the table is itself a protected-path change.

Smallest correction: add to ORDER "Land after or before task-413 and task-404 one at a time (same table, same test file); rebase the branch on the board before commit A; insert the row directly after panel-records and append the describe at the end of the file."

### int#2 LOW: acceptance (b) hard-codes "23 rows" and "55 lists"

Plan: "(b) `node scripts/analysis/rule-lists.mjs validate` prints "rule-lists: ok 55 lists, 23 rows"."

Evidence: `node scripts/analysis/rule-lists.mjs validate` at this head prints `rule-lists: ok 55 lists, 22 rows` (rule-lists.mjs:766 prints the live counts). The only test that touches the line is src/tests/backlog/rule-lists.logic.test.ts:20, `toMatch(/rule-lists: ok \d+ lists, \d+ rows/)`, so no test pins 22. Any of task-366, 406, 404 or 403 landing a row first makes "23" false even when 412 is right.

What would go wrong: a correct build is read as failing acceptance (or someone edits a count to match).

Smallest correction: "(b) validate prints `ok 55 lists, N+1 rows`, where N is the row count of the table the branch started from (22 at 4a70b85ca), and exits 0."

### int#3 NIT: panel-records line range is off by one

Plan: "Shape row, panel-records (:187-192)".

Evidence: `grep -n '"id": "panel-records"' scripts/analysis/rule-lists.json` gives :188; the row ends at :193 (specs-docs at :194).

What would go wrong: nothing; the shape described is right.

Smallest correction: ":188-193".

## Checked, no finding

- Other paths resolving differently: the new glob is the literal `docs/reports/review_followups.md`; resolve matches rows by matchesAny on each Files candidate (rule-lists.mjs:244), so only that exact path gains the row. No existing row globs it (generated, policy, panels, reference are all subdirectories; `exempt` lists docs/reports/lanes and reviews only, rule-lists.json:218). Verified today: `resolve --files docs/reports/review_followups.md --type build --letter S` exits 3 "matched by no row"; a nonexistent sibling path exits 3 the same way, so the planted-defect case works in a temp repo without the file present.
- validate: `node scripts/analysis/rule-lists.mjs validate` exits 0 now; the literal glob check (rule-lists.mjs:129) passes because `git ls-files docs/reports/review_followups.md` lists the file; list agents-s7-s11 is defined at rule-lists.json:45; row ids are checked unique (new id "review-followups" does not exist); `why` is required and the plan gives one.
- Generated page: `page --check` exits 0, "rule-lists-by-kind.md is current". The page is built from table.kinds only (rule-lists.mjs:500-510; kinds at rule-lists.json:242-249: pipeline, web, phone, storage, tooling, spec), none of whose files is review_followups.md, so a row does not change it.
- Tests counting rows or lists: grep of rule-lists.logic.test.ts and rule-lists-table.logic.test.ts for counts finds only the regex at rule-lists.logic.test.ts:20 and the globs_from key list at :29 (counts rows with globs_from only, unaffected). No test pins 22 or 55.
- Plan's test-shape claims: lists() at test:11-16, table() at :17, task-384 describe at :177, resolveIn with --root and --table at :181-192 all match.
- Spec 08 rule 6: docs/specs/00-architecture/08_agents.md:350 reads "6. Findings triage (WF6): BUG -> WF3 before Green Light; DEFER -> review_followups.md with reasons", inside section 7 (heading at :342, section 7b at :361), which the list agents-s7-s11 covers.
- Hooks and Files line: check-lane-close.mjs:680-682 (self-edit, protected_paths includes scripts/analysis/rule-lists.json at rule-lists.json:22) and :767 (ownsTable) are as quoted; two commits is right. check-task-files.mjs matches staged files to the Files line by prefix/glob; both Files paths are literal entries, and the task file and docs/reports/reviews/task-412/ are always allowed.
- Consumers of review_followups outside the spec: grep of scripts/, .husky/, src/tests/, mcbylaws/ finds only comments and descriptor text (no code reads the table for this file); no open task other than 399/375/412 mentions the file, and none has it in a Files line.
- Resolve additions: every_task (five-words, plan-protocol), inc-S, ms-S added by resolve itself (rule-lists.mjs:251 onward); not by a row.
- Task-375 dependency: task-375 is RUNNING and edits rule-lists.mjs and check-lane-close.mjs, which the plan cites by line; lines :681-682 and :767 are correct at this head and may shift after it lands (not a finding).

UNVERIFIED: did not run the new test red/green (runner forbidden); did not confirm the exact resolve output order after the row exists (no edit allowed); did not diff the other open tasks' planned table edits beyond their Files lines and cards.
