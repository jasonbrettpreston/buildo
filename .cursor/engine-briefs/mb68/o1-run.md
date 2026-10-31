---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-record.mjs
- scripts/analysis/mcbylaws-loop/loop-gate-run.mjs
- src/tests/mcbylaws-loop-record.logic.test.ts
- src/tests/mcbylaws-loop-gate-run.logic.test.ts
- src/tests/mcbylaws-loop-gate-commands.logic.test.ts
---
# MB-68 O1 (output panel O68-01, O68-07, O68-19, plus the pin/data freshness of O68-02) - the run speaks gate statuses, ids are group-qualified - DeepSeek
Tools: `read_file`, `edit_file`, `grep_files`, `run_command` (`npx vitest run <path>`, `npx tsc --noEmit`). Never git add/commit. Small `edit_file` changes only (all files are long). Do not leave console.log. Do not touch other files; other tests that break outside your scope will be fixed by the next brief, but the three test files above and `src/tests/mcbylaws-loop-gate-e2e.logic.test.ts` is NOT yours: ignore it.
Read `scripts/analysis/mcbylaws-loop/loop-gate-run.mjs` (CLASS_STATUS, recordFor, casesFromRows, computeRun, pinInputs, runCommand).

## Changes
1. **One status vocabulary (O68-01).** Move `CLASS_STATUS` and a pure `statusOf(cls)` (`CLASS_STATUS[cls] || 'pending'`; the map: MATCH, ANSWERED, BY-LAW CHANGED, NOT SCORABLE, DATA -> `pass`; DIFFER, NO ANSWER, NOT MODELLED, OWED -> `fail`) into `loop-record.mjs` and export them (loop-gate-run imports them; keep `CLASS_STATUS` re-exported from loop-gate-run for existing importers). In `casesFromRows` set `status = statusOf(row.class)` and keep the scorer class in a new field `class`; `got_sha` is still `gotSha` of `{status: row.class, value, reason}` (unchanged, so hashes stay stable). In `computeRun`, `curRows` use `status: <class>` (the prereg totals are by CLASS) — keep them as classes. `recordFor` takes `c.status` as is when already `pass|fail|accepted|pending`, and a case named in an accepted finding becomes `accepted` only if its status was `fail` (a finding on a passing case does not change it).
2. **Group-qualified ids (O68-07).** `casesFromRows(groupId, rows)` makes `id = "<groupId>|<notice>|<n>"`; `curRows` ids and everything downstream use the same form. Update `--write-ids` accordingly (it writes the qualified ids). Do NOT regenerate real data files.
3. **Pin keys per group (O68-19).** `pinInputs` writes `pin / <groupId> / <key>` for every pinned group, so two groups cannot overwrite each other.
4. **Freshness inputs (O68-02).** `computeRun` also returns `inputsFresh`: an object with the recomputed values of every key `runCommand --write` puts into `inputs` that is NOT a git path: `data:<group>` (the content hash of the group's notices file, as `--write` computes it) and `pin / <group> / <key>`. `runCommand --write` must put exactly those values (share one helper).
5. Update the three test files for the new ids/keys/statuses and add: one test per change (statusOf for every class incl. an unknown class -> `pending`; ids start with the group; two groups with the same notice|n give different ids; pin keys qualified; `inputsFresh` equals what `--write` stored in `inputs`; a finding on a passing case leaves it `pass`).
Finish when those three test files pass (`npx vitest run` them) and `npx tsc --noEmit` prints no error naming these files. Report the output.
