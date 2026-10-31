---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-gate-run.mjs
- scripts/analysis/mcbylaws-loop/loop-record.mjs
- scripts/analysis/mcbylaws-loop/loop-regression.mjs
- src/tests/mcbylaws-loop-gate-commands.logic.test.ts
- src/tests/mcbylaws-loop-record.logic.test.ts
- src/tests/mcbylaws-loop-regression.logic.test.ts
---
# MB-68 O9 (output panel O68-10, O68-14, O68-18, O68-21) - DeepSeek
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes; no console.log left. One fix plus its red and green test each, run the touched tests after each. Update old assertions that encode the old behaviour and name them in your report.
1. **O68-10 verify echoes the record.** In `verifyCommand`, `cases[].status` must come from the FRESH run (`freshById`, already built and unused), not from the record; add `record_says` beside it when the record's status differs. Test: a record with every case hand-set to `pass` over a run where some fail reports the fresh `fail` statuses and `record_says: 'pass'`.
2. **O68-14 path traversal.** `run --write` rejects an `--increment` that is not in the closed set of `increments.json` (`loadIncrements`); `recordPath` (loop-record.mjs) throws on any increment or id that does not match `^[A-Za-z0-9._-]+$` or equals `.`/`..`; `saveRegression`/`loadRegression` (loop-regression.mjs) throw the same way for a group id; `writeRecordExclusive` asserts the resolved path stays under `root` (`path.relative`). Tests: `../../escape` for each.
3. **O68-18 one register parser.** `removeCommand` (and anything else in loop-gate-run.mjs) uses `parseRulings` from `scripts/analysis/bylaw/universe.mjs` (the reader `acceptFloors` uses), not the local `parseRulingsOf`; delete `parseRulingsOf`. Test: a RULED id from the real register removes; a PROPOSED one is refused.
4. **O68-21 atomic writes.** `writeRecordExclusive`: write to a temp name in the same directory then `fs.linkSync` (fails with EEXIST if the round exists) then unlink the temp; never leave a zero-length `round-NN.json`. `saveRegression`: write the ids files BEFORE the set file, each through temp + rename. Test: an existing round file still throws and no temp file is left behind.
Finish when the three test files plus `npx vitest run src/tests/mcbylaws-loop` pass and tsc is clean for mcbylaws-loop files.
