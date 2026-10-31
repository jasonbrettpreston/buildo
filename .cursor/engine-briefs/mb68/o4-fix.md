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
# MB-68 O4 fix - the O4 run left 36 tests failing; make module and tests agree (DeepSeek)
Tools: read_file, edit_file, grep_files, run_command (npx vitest run, npx tsc --noEmit). Never git add/commit. Small edit_file changes; no console.log.
The O4 contract is in `.cursor/engine-briefs/mb68/o4-floors-prereg.md` (read it). Typical causes: (a) fixtures still build a prereg without `increment` (now a required string) or join it by round instead of by FILE NAME `prereg-MB-<digits>-<round>.json` + same `increment`; (b) the honest fixtures of the eval and context tests have moves/totals that do not match any more: the prereg totals compare ONLY the prereg's group (default coa172), and when `baseRows` is null moves are NOT checked (no `missing_move`); (c) the e2e test about the real set fails because `regression-set.json` hashes must equal the ids files (the ids files were regenerated: do NOT edit the ids files; the set's `ids_sha256` must be what `idsSha(ids)` gives: if they differ, recompute the two hashes in `regression-set.json` ONLY via a one-off `node -e` that you run... you cannot run node; instead ask for it in your report and make the test report the exact mismatching group); (d) `loop-gate-eval.mjs` must call `preregNotes(prereg, run.baseRows)` and push its notes into `notes`; (e) type errors in the prereg test (increment in a typed literal).
Work one failing file at a time. Failures:
 FAIL  gate-context.logic.test.ts > buildContext: commit mode > reads the index: nameStatus, commits, the classes of the base policy, the new record and the bound catalogue
AssertionError: expected null to be 'scripts/analysis/bylaw-validation/coa…' // Object.is equality
 FAIL  gate-context.logic.test.ts > buildContext: push and ci mode > push over two commits: commits per commit, base explicit, preregHistory present
AssertionError: expected null not to be null
 FAIL  gate-context.logic.test.ts > buildContext: push and ci mode > ci: computeRun may answer null and the ctx still carries every fact
AssertionError: expected undefined to be 1 // Object.is equality
 FAIL  gate-context.logic.test.ts > buildContext -> evaluateGate (end to end) > the honest round has no violations; an empty reason is accept_without_reason
AssertionError: expected [ 'increment_not_one_id:prereg', …(2) ] to deeply equal []
 FAIL  gate-e2e.logic.test.ts > the real regression set (mcbylaws/loop/regression-set.json + its ids files) > holds coa172 (698 ids) and coa4d (496 ids), every hash matches its list, and
AssertionError: expected false to be true // Object.is equality
 FAIL  gate-eval.logic.test.ts > evaluateGate: the pure composition returns { violations, notes } > the honest factory is green: no violations, no notes
AssertionError: expected { violations: [ …(3) ], notes: [] } to deeply equal { violations: [], notes: [] }
 FAIL  gate-eval.logic.test.ts > stage 1: a range that touches no code, oracle or generated path is out of scope > one code path in the same range puts it back in scope (records are dema
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 2: checkRecordsAddOnly, checkOracleFirst, recordMissing > a NEW oracle file (A) beside code is allowed: the green twin
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 2: checkRecordsAddOnly, checkOracleFirst, recordMissing > a prerun range (push) that adds its record is green: the green twin of record_missing
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > a corrected, re-bound record is the green twin of record_binding_mismatch
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > O68-02: a changed generated regression-set.json is NOT demanded in the reco
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > O68-02: a recorded data: hash the record does not carry a blob for is fine 
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > O68-02: a fresh pin value that moved gives stale_green:pin / <group> / <key
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > a move nobody registered is unexpected_move
AssertionError: expected false to be true // Object.is equality
 FAIL  gate-eval.logic.test.ts > stage 3: record shape, binding, decision, one increment, skip-ahead, prereg > a registered move is the green twin of unexpected_move
AssertionError: expected [ 'missing_move:10.20.40.70', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 4: the regression ratchet, floor edits, the OWED ratchet and the run report > a count floor raised is the green twin of floor_lowered_without_rulin
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 4: the regression ratchet, floor edits, the OWED ratchet and the run report > an OWED line unchanged against its baseline is the green twin
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > the same move covered by an accepted finding is the green twin
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > a record that matches the run exactly is the green twin
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > O68-01: a run case carrying a printed class is matched by its gate status (
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > O68-01: a printed class where a status belongs is still judged through the 
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 5: the run is honest (checkRun, regen, value registry, record == run) > a run that satisfies every check is the green twin of run_missing
AssertionError: expected [ 'missing_move:10.20.40.71', …(2) ] to deeply equal []
 FAIL  gate-eval.logic.test.ts > stage 6: an accept names every not-green reason > the violations are de-duplicated and keep first-seen order
AssertionError: expected -1 to be greater than or equal to 0
 FAIL  gate-run.logic.test.ts > computeRun: the groups a mode runs > push runs every group
 FAIL  gate-run.logic.test.ts > computeRun: the groups a mode runs > ci skips the external groups and returns null when no group is left
 FAIL  prereg.logic.test.ts > checkPreregFile: a prereg is the coa-round form and names its task > the committed MB-68 prereg has no violation
AssertionError: expected [ Array(1) ] to deeply equal []
 FAIL  prereg.logic.test.ts > checkPreregFile: a prereg is the coa-round form and names its task > a task that is not MB-<digits> is refused; a well-formed task is not
AssertionError: expected [ 'prereg_task_missing', …(1) ] to deeply equal [ 'prereg_task_missing' ]
 FAIL  prereg.logic.test.ts > checkPreregFile: a prereg is the coa-round form and names its task > O68-04: group is optional and must be a string when named
AssertionError: expected [ Array(1) ] to deeply equal []
 FAIL  prereg.logic.test.ts > checkPreregMoves: expected against actual, a surprise is a finding (M-321) > no move and the registered totals: green
AssertionError: expected [ …(3) ] to deeply equal []
 FAIL  prereg.logic.test.ts > checkPreregMoves: expected against actual, a surprise is a finding (M-321) > an unregistered DIFFER->MATCH is named by notice, item and move
AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]
 FAIL  prereg.logic.test.ts > checkPreregMoves: expected against actual, a surprise is a finding (M-321) > a registered move that happens is green; the totals are moved with it
AssertionError: expected [ 'missing_move:10.20.40.70(3)', …(2) ] to deeply equal []
 FAIL  prereg.logic.test.ts > checkPreregMoves: expected against actual, a surprise is a finding (M-321) > a registered move that does not happen is missing, by clause
AssertionError: expected [ 'missing_move:10.20.40.70(3)', …(3) ] to deeply equal [ 'missing_move:10.20.40.70(3)' ]
 FAIL  prereg.logic.test.ts > checkPreregMoves: expected against actual, a surprise is a finding (M-321) > a totals line reading 401 against 400 is a finding, printed in full
AssertionError: expected [ 'missing_move:10.20.40.70(3)', …(2) ] to deeply equal [ Array(1) ]
 FAIL  prereg.logic.test.ts > checkPreregMoves: expected against actual, a surprise is a finding (M-321) > with no baseline the moves are not checked; the totals still are
AssertionError: expected [ …(2) ] to deeply equal []
 FAIL  prereg.logic.test.ts > checkPreregMoves: expected against actual, a surprise is a finding (M-321) > O68-04: the totals are of the prereg group only; another group's rows are not c
AssertionError: expected [ …(3) ] to deeply equal []
 FAIL  prereg.logic.test.ts > checkPreregMoves: expected against actual, a surprise is a finding (M-321) > O68-04: moves are diffed inside the prereg group only, so another group is neve
AssertionError: expected [ …(3) ] to deeply equal []
Type errors:
src/tests/mcbylaws-loop-prereg.logic.test.ts(60,36): error TS2353: Object literal may only specify known properties, and 'increment' does not exist in type 'Partial<Pre>'.
src/tests/mcbylaws-loop-prereg.logic.test.ts(64,36): error TS2353: Object literal may only specify known properties, and 'increment' does not exist in type 'Partial<Pre>'.
Finish when `npx vitest run src/tests/mcbylaws-loop` is clean (apart from item c if you cannot recompute) and tsc is clean for mcbylaws-loop files.
