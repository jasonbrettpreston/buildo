---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-gate-context.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-run.mjs
- src/tests/mcbylaws-loop-gate-context.logic.test.ts
- src/tests/mcbylaws-loop-gate-eval.logic.test.ts
- src/tests/mcbylaws-loop-gate-run.logic.test.ts
---
# MB-68 O6 - three defects the real-data run found (DeepSeek)
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes; no console.log. One fix plus its test each; run the three test files after each.
1. **Prereg lookup is hard-coded to MB-68** (`loop-gate-context.mjs` ~line 238: `prereg-MB-68-${round}.json`). Replace by: among the preregs listed at `rev`, the file whose name matches `/prereg-MB-\d+-<round>\.json$/` (round = the record's `round`) AND whose parsed `increment` equals the record's increment; if several match, the one whose `increment` matches, else null. Test: a prereg `prereg-MB-99-1.json` is found for round 1 / increment '1'; one with another increment is not.
2. **Commit mode reads the prereg from the staged index, but the prereg is committed BEFORE the round** (it must come from the parent tree, MB-67 rule: HEAD at commit time). In commit mode read the prereg listing and file from `HEAD` (`base`), not `:index`. Test with a throw-away repo: prereg committed in HEAD, round staged -> `ctx.prereg` is found.
3. **Commit mode runs only the fast groups, but `evaluateGate` declares the ids of ALL groups** (`declaredIds: activeIds(cur)` in `loop-gate-eval.mjs` ~line 157), giving `ran_fewer_than_declared:496` and `case_missing` for every other group. `computeRun` must return `ranGroups` (ids of the groups it actually ran; add it in `loop-gate-run.mjs`), and `evaluateGate` declares only the active ids of those groups (when `ran_groups` is absent, all groups, as before). Also `checkCasesPresent`/the record-vs-run comparison must only consider cases of ran groups. At push all groups run, so nothing is skipped there. Test: commit-mode run of group g-a only, with g-b declared and present in the record, is green; a push-mode run missing g-b cases is still `ran_fewer_than_declared`.
Finish when the three test files and `npx vitest run src/tests/mcbylaws-loop` (apart from `mcbylaws-loop-realdata`, which is another brief's) pass and tsc is clean for mcbylaws-loop files.
