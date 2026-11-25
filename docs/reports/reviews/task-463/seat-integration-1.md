# Seat: integration: task-463 plan (PLAN-463-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 9de5c2129 (wf2/board; working tree shows only the task file modified and the review dir untracked). Read: the task file and FINDINGS-PLAN.md, the brief, mobile/package.json, Spec 98 (headings and lines 105-135), src/tests/hooks-composition.infra.test.ts (lines 1-40 and 520-570), scripts/analysis/rule-lists.mjs (usage header and the `page` branch at 859-867), rule-lists.json:44, the rule-lists page rows, .github/workflows, .husky/*, and mobile/eas.json, mobile/maestro, mobile/scripts. No file written and no test run. Grep was repo-wide excluding node_modules, .git, .next, backlog and reviews.

Checked and clean:
- Readers of the phone lint script: the only `lint` text in mobile/package.json is line 13. No mobile/.eslintrc* or mobile/eslint.config* exists. No `lint` or `eslint` text in mobile/eas.json, mobile/maestro, mobile/scripts or mobile/package-lock.json. This closes the planner's unverified EAS item and the deepseek#1 and #6 concerns. Root package.json:10 `lint` is `next lint`, and root package.json has no `--prefix mobile` call.
- Workflows: mobile-ci.yml has no lint step. The only lint steps are test.yml:63 (web, root) and pipeline-lint.yml (`npx eslint scripts/`). The pre-commit lint at line 55 is root `npm run lint`. No Makefile reads it.
- Other mobile references: the only repo-wide hit with "mobile" plus "lint" outside backlog and reports is Spec 98 itself.
- Test code against real imports: `fs`, `path`, `REPO_ROOT` (line 23, `path.resolve(__dirname, '../../')`) and `expect` and `it` are all in scope. tsconfig has `strict` and `noUncheckedIndexedAccess`, so `[1]!` and `[0]!` are needed and present. The `as { scripts: Record<string, string> }` cast on JSON.parse is fine. The describe `task-424 — one list of pre-push checks` exists, and its LIST_LINES already pin the mobile-typecheck and mobile-tests lines. The new case compiles as written.
- Section split: Spec 98 has exactly one `## 5. ` (line 113, "## 5. Continuous Integration (CI)") and one `## 6. ` (line 127). The task-462 note at line 125 sits inside section 5, and the lint bullet at line 118 is inside it. This closes deepseek#2 and #3. The strings `## 5. ` and `## 6. ` appear nowhere else, so no earlier substring match.
- Regenerate command: `page [--write|--check]` is real (rule-lists.mjs:13, 859-867). `--write` writes one file, docs/reports/generated/rule-lists-by-kind.md (line 862, `const PAGE`, line 541). The `--check` failure message names the same command. This closes deepseek#5 and the planner's unverified item.
- Page row: line 42 reads `mobile-98 | ... | whole file | 11,801 | 1`. The spec is 11,857 bytes, so the count is in characters. Net change is about +190 characters (the note) minus 30 (the bullet), which the planner's "count delta unverified" already covers.
- Other generated files and pins: mobile-98 appears in rule-lists.json:44 (path only, no hash). The only test naming Spec 98 is backlog-lane.logic.test.ts:594, which checks the path string. 122_split_manifest.json:165 lists the path; its sha256 covers only moved blocks, and Spec 98 holds none. system_map:128 carries only the title. No test pins the task-462 note text. The mobile-core review pack (line 2, "98_mobile_testing_protocol.md:1-139") is a stale snapshot citing line ranges, not read by any gate. Spec 98 is 139 lines.
- lint-staged in package.json (lines 62-72) covers only src paths, so the mobile/package.json edit triggers nothing there.
- mobile/package-lock.json: no lint text, so it does not change.
- Pre-push pin at :551-552 is static text in .husky/pre-push-checks.sh and does not read mobile/package.json scripts (deepseek#6 clean).
- Files line: Spec 98 section 5's "EAS Build runs the above sequence" stays true after the bullet is gone.

## in#1 NIT: the planner's "resolve --task task-463 refuses" item is a wrong flag, not a parser fault
Plan: (E) last-but-one bullet, "`rule-lists.mjs resolve --task task-463` refuses with 'no Files: line' even though the task file has one at :22 … the close gate may need this looked at".
Evidence: scripts/analysis/rule-lists.mjs:8 gives the usage as `resolve --files "<Files line>" [--type t] [--letter L]`, with no `--task` flag. The refusal text at :263, "refused: the task has no Files: line, so no rule lists can be attached", is what an empty `--files` gives. The task file's own line is well-formed (task-462 uses the same `Files: a, b, c` form at its line 45).
Fix: in (E), replace that bullet with "resolve takes --files, not --task; run it with the Files line from the task". The builder then does not trace a phantom parser bug (this also settles deepseek#4).

## in#2 NIT: the new case sits in the describe named for task-424 and its title is long
Plan: (B) step 1, "Add one `it` to the `describe('task-424 — one list of pre-push checks')` block".
Evidence: src/tests/hooks-composition.infra.test.ts:529 `describe('task-424 — one list of pre-push checks', ...)`. The block's cases are about the pre-push list (T1, T2, T3, ...), while the new case reads mobile/package.json and Spec 98 and uses none of the block's helpers (`checksIn`, `execLines`, `LIST_LINES`).
Fix: optional. Say in (B) step 1 that the case is placed after the last `it` of that block so it lands next to the phone gate pin, or accept the placement as the plan states. No code change needed.

STATUS: 2 findings (0 CRITICAL, 0 HIGH, 0 MED, 0 LOW, 2 NIT); the plan matches the real codebase: no reader of the phone lint script, no generated file, pin or count beyond the one regenerated page, and the test code compiles as written.
