# Seat: reality-check: task-464 plan (PLAN-464-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head 62dc1206e. The plan says it read eb8bbd768, and `git diff --stat eb8bbd768 HEAD` on rule-lists.json, rule-lists.mjs, rule-lists.logic.test.ts and rule-lists-by-kind.md is empty, so those files did not change between the two heads. Read: the task-464 file, RR-0475 (MD:2469-2482), the PLAN-SEAT-BRIEF, scripts/analysis/rule-lists.mjs (resolveTask, checkTasks, renderPage), rule-lists.json (step-pipeline row, lines 85-91), the task-454 Files line, and rule-lists.logic.test.ts:381-386. I ran in-memory node -e only, importing readTable, trackedFiles, resolveTask, validateTable, checkTasks and renderPage. The table copy was edited in memory with `structuredClone`. Nothing was written, no test runner was run, no database or dotenv was touched.

## Checked and clean
- Top-level scripts/*.mjs: the true count is 17, as the plan says. The list is ai-env-check, audit_all_specs, generate-bylaw-handbook, generate-bylaw-layer2-input, generate-bylaw-provisions, generate-db-docs, generate-lineage-docs, generate-logic-variable-effect, generate-logic-variable-groups, generate-logic-vars-docs, generate-script, generate-step-handbook, generate-system-map, harvest-tests, proxy-relay, task-init, wf8-worktree.
- All 17 are matched by no row today (resolveTask refused each one). Each of the 11 generators gets step-132, eng-back, eng-shared, plan-protocol, inc-S and ms-S after the edit, with type fix and letter S.
- The 6 other .mjs files (ai-env-check, audit_all_specs, harvest-tests, proxy-relay, task-init, wf8-worktree) stay refused after the edit.
- Control scripts/ai-env-check.mjs exists and stays refused before and after (REFUSED/REFUSED).
- task-454's Files line (file at line 41) is refused today with "matched by no row ... scripts/generate-logic-variable-groups.mjs". After the edit it resolves with unmatched [] and the lists step-132, surface-136, mobile-90, mobile-98, mobile-99, eng-all, plan-protocol, inc-S, ms-S.
- Today's table with the generator entry removed from the 454 line gives the identical list set, so the set is "same as today minus the generator entry".
- validateTable returns [] for the edited table. The unedited table also passes, both through the CLI (`validate`: "ok 58 lists, 23 rows") and through the function.
- renderPage with the edited table is byte-equal to the committed rule-lists-by-kind.md. `page --check` passes today ("is current").
- checkTasks goes from resolve 102 / notYet 205 to resolve 103 / notYet 204, with bad 0 before and after. The only newly resolving card is task-454 and no card is lost.
- The only notYet changes are task-454 (it leaves the list) and task-395. task-395 shrinks from "scripts/generate-logic-variable-groups.mjs, docs/reports/red-evidence/task-395/" to "docs/reports/red-evidence/task-395/" only. No other open card changes. This matches the plan.
- The step-pipeline row has `not` listing only the review tool CLIs, so no `not` entry excludes a generator.
- The test-pattern anchor at rule-lists.logic.test.ts:381 exists, and `it` at :386 closes the block. The new case fits after it.

## rc#1 MED: the plan's generator count is 9, but the true count is 11, and the planned literal-name test would leave 2 generators unlocked
Plan: section 3(b) says "`scripts/generate-*.mjs` (recommended) matches 9 files" and then lists 11 names. Section 4 says "for each of the 9 files listed above (literal names), expect status 0 and ... step-132". The card Description also says "9 of them .mjs".
Evidence: `ls scripts/generate-*` gives 18 files, of which 7 are .js (assert-data-bounds, assert-global-coverage, assert-parcel-sanity, assert-schema-probe-lists, ingest-batch, sharing-phase, stream-catalog-json) and 11 are .mjs. In memory, the glob gives "generate-*.mjs 11", and all 11 go from REFUSED to step-132, eng-back, eng-shared, plan-protocol, inc-S, ms-S. The plan's 11 listed names are the true list. Only the number 9 is wrong.
Fix: say 11 in section 3 and section 4. Make the test loop over all 11 literal names, or over a readdirSync filter of `generate-*.mjs`. A 9-name list would leave 2 generators unlocked.

## rc#2 LOW: the "extra 8" and the "9 .js generators" are also off
Plan: section 3 says `scripts/*.mjs` "would match all 17. The extra 8 are ai-env-check, audit_all_specs, harvest-tests, proxy-relay, task-init, wf8-worktree and the two counted above." Section 2 says "scripts/*.js already covers the 9 top-level .js generators".
Evidence: 17 minus 11 is 6 extra, and the plan names exactly 6 (the "two counted above" are not extra). `ls scripts/generate-*.js` shows 7 .js generators, not 9. 7 + 11 = 18 matches the card's 18 generate-* files.
Fix: write "extra 6" and "7 .js generators". Under C1(b) the widening would be 17 files, of which 6 are not generators.

## rc#3 NIT: the plan's expected "red today" output is right, but the test should assert it for the new name too
Plan: section 4, "Red today: exit 3 ... (confirmed by simulation)".
Evidence: in memory the refusal for scripts/generate-logic-variable-groups.mjs reads "refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: scripts/generate-logic-variable-groups.mjs". resolveTask returns {error}, and the CLI exit code was not run here (UNVERIFIED: the "exit 3" figure, since no CLI call was made for the red case).
Fix: none needed. Just keep the red proof in the lane report.

UNVERIFIED: the exit code 3 for refused CLI calls. I did not run `resolve` through the CLI for a refused path. The test-green runs and the `backlog-lane --dry-run` for 454 are also not run.

STATUS: 3 findings (0 CRITICAL, 0 HIGH, 1 MED, 1 LOW, 1 NIT); the plan's mechanics, counts 102/205 to 103/204, the 454 resolution and the byte-equal page are all real, but the generator count is 11 not 9 and the planned literal-name test must cover all 11.
