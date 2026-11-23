# Seat: reality-check: task-441 plan (PLAN-441-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file; no word of the findings below is the orchestrator's.

Basis: board head 18cc2752e (the plan read 81882a1e3). `git diff --stat 81882a1e3..HEAD -- src mobile docs/specs/00_engineering_standards.md eslint.config.mjs biome.json` is empty, so every number below holds at the current head. Read: the task card and plan; docs/specs/00_engineering_standards.md (:14-20, :35-48, :104-127, :304-346); src/tests/script-source-scan.ts, resolve-db-adoption.logic.test.ts, surfaces/surface-conformance.logic.test.ts, maxbld-web-pages.logic.test.ts:191-193, gate-mobile-compliance.infra.test.ts; scripts/analysis/gates/mobile-never-do.mjs; eslint.config.mjs and its resolved config; biome.json; docs/reports/reviews/task-440/RULE-CHECKS.md; FINDINGS-PLAN.md (not repeated here).

Checked and TRUE (re-measured with read-only node scripts and git):
- 0 calls to alert, confirm or prompt in src (bare, window., globalThis., self.; AST walk over 400 files, and `git grep` for the bare and bracket forms). The only text hits are the two comments at src/components/admin/FlightCenterTool.tsx:9 and :102.
- src/components/ui holds exactly Badge.tsx and ScoreBadge.tsx. `git grep` for fetch, useContext, useQuery, `use(` and tanstack there: 0 hits. Neither file has an import line or a hook call.
- Scan sizes: 400 src files and 135 mobile files, 535 in all, using the plan's own exclusions and the SKIP regex copied from mobile-never-do.mjs:20.
- Non-null assertions with the TypeScript parser already in node_modules: 177 total, 166 undocumented (own line or the line above), 60 files, 148 in 49 src files, 18 in 11 mobile files. 177 - 166 = 11 pass, as the plan says. All match the plan exactly.
- Rule text in the plan matches the standards doc word for word: §1.2 :18, §2.1 :38-39, §2.3 :46-47, §12.7 :343-344. Section 12 status :306 and the dated note :308 ("This note rules nothing on §12.7") are right.
- Pattern cites that hold: resolve-db-adoption.logic.test.ts:63-76 (the not-vacuous KNOWN_BAD case), script-source-scan.ts:33-45 (FENCED, `export const FENCED = {}` at :45, empty today), surface-conformance.logic.test.ts:36-38 (the pin comment) with the pin at :38, mobile-never-do.mjs:14 (TypeScript import) and :20 (SKIP). The module's `main()` is guarded on the last line, so importing it has no side effect.
- Plant check: the resolved ESLint config for a src/components/ui file has no `no-alert`, no non-null rule and no floating-promise rule. `biome explain noAlert` shows no "This rule is recommended" line (default severity info). So the plan's "ESLint and Biome rules exist but are not turned on" is true for noAlert, and the plan's UNVERIFIED on it is now settled.

## rc#1 MED: §2.3 is not "none": Biome's recommended non-null rule already runs on two of the folders
Plan: section 0 "eslint.config.mjs:22-36 has no ... non-null-assertion rule" and the "Search for existing checks" list name only Biome `noAlert`. The task card's premise is "a rule that has none".
Evidence: `node_modules/.bin/biome explain noNonNullAssertion` prints "Default severity: warn ... This rule is recommended". biome.json:17-18 sets `"recommended": true` for src/features/leads and src/lib/observability (the only override that turns it off is src/app/api, biome.json :37-47, `"recommended": false`). `biome lint --only=style/noNonNullAssertion` over the configured folders reports 30 warnings at this head. lint-staged runs `biome check` on those folders at pre-commit, so a warning shows but does not refuse the commit.
What goes wrong: the plan's section 0 and section 4 read as if nothing in the repo looks at `!`. In fact §2.3 is partly checked today (warn only, two folders, every `!` counted whether it has a comment or not). The two checks give different answers (see rg#1).
Fix: add the Biome rule to the plan's list of existing checks, say it is warn-level and scoped to two folders, and keep the test (it is still the only check of "document why").

## rc#2 MED: the §2.1 skip reasoning leans on a reading the standards table contradicts, and one cite is off by one
Plan: section 2 item 3 "The suffix does not mark an integration test. The same standard assigns `*.infra.test.ts` to parity batteries (:111) and names assert-data-bounds.infra.test.ts as its DB-replay example (:108)."
Evidence: 00_engineering_standards.md:107 defines `*.infra.test.ts` as "API routes, DB queries, external calls ... New API route / DB mutation (unhappy path first, §5.3)", and :127 lists `*.infra.test.ts (no DB)` as "API envelope / query shape / error paths". The assert-data-bounds example is at :109, not :108 (:108 is the `*.security.test.ts` row). Parity batteries at :111 are real but are one row among several. `git ls-files | grep -c '\.infra\.test\.ts$'` gives 307, as the plan says.
What goes wrong: the standard does treat `.infra.test.ts` as its integration suffix. The honest reason to skip is the second half of the plan's argument (what counts as "forces an error in the deepest layer" is a reading of the test body), not that the suffix is ambiguous. A grounder who opens :107 will see the first reason fail.
Fix: restate the skip on the "deepest layer" judgment only, cite :107 and :127 as the suffix evidence, and correct :108 to :109. The skip is otherwise honest: a name or assertion scan cannot see where an error was forced, and the plan says so.

## rc#3 LOW: script-source-scan.ts cite for the `git ls-files` pattern is wrong in section 3
Plan: section 3 header and 3.1 "Reuse" cite `script-source-scan.ts:15-21` for the `execFileSync('git', ['ls-files', ...])` listing; section 0 cites ":6-24, :94-101".
Evidence: script-source-scan.ts:15-21 is the middle of the long comment ("the `/localhost:5432/` pattern matched..."). The listing call is in `trackedScriptFiles` at :94-101 (`execFileSync('git', ['ls-files', '--', 'scripts/'], { cwd: ROOT, stdio: 'pipe' })` at :95).
Fix: change both cites to :94-101. The plan contradicts itself between section 0 and section 3.

## rc#4 LOW: "SKIP is already imported by a test" is only half true
Plan: section 0 "The mobile scope regex `export const SKIP` (mobile-never-do.mjs:20), already imported by a test (src/tests/gate-mobile-compliance.infra.test.ts:7)."
Evidence: gate-mobile-compliance.infra.test.ts:7 is `import * as gateC from '.../mobile-never-do.mjs'`. The file only uses `gateC.scan` (:35) and `gateC.ROWS` (:37, :40); it never reads `gateC.SKIP`. So the import of that module works in a test and tsc accepts it (allowJs, :9 of tsconfig), but no existing test uses SKIP itself.
What goes wrong: nothing breaks. The claim "works the way an existing test does it" is true for the module import, not for the SKIP value.
Fix: reword. Optionally add one control case that a known mobile path (for example `mobile/node_modules/x.ts`) matches SKIP, so a rename of the export fails loudly.

## rc#5 NIT: the plan counts mobile tests out by path and name; confirmed, but say how
Evidence: `git ls-files mobile` test files are under `mobile/__tests__/` (for example accountDeletion.coverage.test.ts) and no tracked `*.test.*` sits elsewhere in src outside src/tests. The plan's exclusions (`mobile/__tests__/**`, `*.test.*`) reproduce 135 mobile files and the 18 / 11 split exactly.
Fix: none needed.

UNVERIFIED (not checked by this seat):
- The per-file top counts (19, 17, 12, 12, 11) and the full 60-file pin list; only the totals were re-measured.
- The section 2 item 3 measures (125, 234, 34, 13 .infra files); only the 307 total was re-measured.
- Whether the lane's own comment-range implementation gives 166; mine did (own line or line above, leading and trailing ranges), but it is a separate piece of code.
- The task-440 RULE-CHECKS rows were read for rank only, not re-derived.
- Run time of parsing 535 files inside the 4-fork related run.
