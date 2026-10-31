---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-gate-run.mjs
- scripts/analysis/mcbylaws-loop/loop-prereg.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-context.mjs
- mcbylaws/loop/regression-set.json
- src/tests/mcbylaws-loop-gate-run.logic.test.ts
- src/tests/mcbylaws-loop-prereg.logic.test.ts
- src/tests/mcbylaws-loop-gate-context.logic.test.ts
- src/tests/mcbylaws-loop-gate-e2e.logic.test.ts
- scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs
- src/tests/mcbylaws-loop-gate-eval.logic.test.ts
---
# MB-68 O4 (O68-03, O68-04, O68-05) - floors per group, totals per group, prereg join - DeepSeek
Tools: `read_file`, `edit_file`, `grep_files`, `run_command` (`npx vitest run <path>`, `npx tsc --noEmit`). Never git add/commit. Small `edit_file` changes; no console.log left. Work item by item and run the touched tests after each.
1. **O68-03 a group with no floors file is red forever.** A group's `producer.floors` is either a path or the string `"none"`. In `loop-gate-run.mjs` `floorsOf`: `"none"` means this group has no percent floors (skip percent-floor evaluation for the group entirely, no per-article rule, `violations: []`, `owed: []`); an UNSET `floors` throws `Error('producer_floors_unset: <group>')` (exit 2 upstream: a group must say). Set `mcbylaws/loop/regression-set.json` group `coa4d` producer `"floors": "none"` (edit only that one line, do not touch ids or hashes). In `src/tests/mcbylaws-loop-gate-e2e.logic.test.ts` the test that asserts coa4d is red (about line 208) must be REPLACED by one asserting the real 172+4d run has `floorsOk` true and exactly one OWED line `article 10.5.40 accuracy`; a test never asserts a red floor (M-360).
# MB-68 O4 fix 2 - 20 tests still fail (DeepSeek)
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes; no console.log. Contract: `.cursor/engine-briefs/mb68/o4-floors-prereg.md`. Diagnosis already made by the orchestrator, FIXTURES are wrong, not the modules (change a module only if a failing assertion proves it disagrees with the contract):
1. Context test fixtures: the prereg file name must be `scripts/analysis/bylaw-validation/coa-expected/prereg-MB-<digits>-<N>.json` where N EQUALS the record's `round`; its JSON must carry `increment` equal to the record's increment (string) . The fixtures currently name the prereg with a different round than the record, so `prereg` comes back null.
2. Eval test honest factory: the prereg needs `increment` and a `group`; give the factory `run.baseRows` equal to `run.curRows` (so moves are checked and none exist) which keeps `notes: []`; the totals in the prereg must equal the class totals of the prereg's group rows of `curRows`.
3. Then re-run everything and fix what is left one failure at a time.
Failures:
 FAIL  gate-context.logic.test.ts > buildContext: commit mode > reads the index: nameStatus, commits, the classes of the base policy, the new record and the bound catalogue
AssertionError: expected null to be 'scripts/analysis/bylaw-validation/coa…' // Object.is equality
 FAIL  gate-context.logic.test.ts > buildContext: push and ci mode > push over two commits: commits per commit, base explicit, preregHistory present
AssertionError: expected null not to be null
 FAIL  gate-context.logic.test.ts > buildContext: push and ci mode > ci: computeRun may answer null and the ctx still carries every fact
AssertionError: expected undefined to be 1 // Object.is equality
 FAIL  gate-context.logic.test.ts > buildContext -> evaluateGate (end to end) > the honest round has no violations; an empty reason is accept_without_reason
AssertionError: expected [ 'increment_not_one_id:prereg', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > evaluateGate: the pure composition returns { violations, notes } > the honest factory is green: no violations, no notes
AssertionError: expected { violations: [ …(2) ], notes: [] } to deeply equal { violations: [], notes: [] }
 FAIL  gate-eval.logic.test.ts > stage 1: a range that touches no code, oracle or generated path is out of scope > one code path in the same range puts it back in scope (records are dema
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 2: checkRecordsAddOnly, checkOracleFirst, recordMissing > a NEW oracle file (A) beside code is allowed: the green twin
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 2: checkRecordsAddOnly, checkOracleFirst, recordMissing > a prerun range (push) that adds its record is green: the green twin of record_missing
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > a corrected, re-bound record is the green twin of record_binding_mismatch
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > O68-02: a changed generated regression-set.json is NOT demanded in the reco
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > O68-02: a recorded data: hash the record does not carry a blob for is fine 
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > O68-02: a fresh pin value that moved gives stale_green:pin / <group> / <key
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > a registered move is the green twin of unexpected_move
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 4: the regression ratchet, floor edits, the OWED ratchet and the run report > a count floor raised is the green twin of floor_lowered_without_rulin
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 4: the regression ratchet, floor edits, the OWED ratchet and the run report > an OWED line unchanged against its baseline is the green twin
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > the same move covered by an accepted finding is the green twin
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > a record that matches the run exactly is the green twin
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > O68-01: a run case carrying a printed class is matched by its gate status (
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > O68-01: a printed class where a status belongs is still judged through the 
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > a run that satisfies every check is the green twin of run_missing
AssertionError: expected [ …(2) ] to deeply equal []
Finish when `npx vitest run src/tests/mcbylaws-loop` is clean and tsc is clean for mcbylaws-loop files.
