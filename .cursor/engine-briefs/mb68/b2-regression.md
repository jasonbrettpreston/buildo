---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-regression.mjs
- src/tests/mcbylaws-loop-regression.logic.test.ts
---
# MB-68 B2 - loop-regression.mjs (the regression set ratchet) - DeepSeek, red first, LEAVE UNCOMMITTED
Tools: `read_file`, `write_file`/`edit_file`, `run_command` (only `npx vitest run <path>`). Never git add/commit. ESM `.mjs`, 2-space indent, no `process.env`, no `process.exit`, no network. Pure functions return `string[]` of violation codes (empty = green); a code with a detail is `code:detail`. The test is a vitest file in TypeScript, plainly typed (no `any`), header with two `// SPEC LINK:` lines, `const ROOT = path.resolve(__dirname, "../..")` and `await import(path.join(ROOT, "scripts/analysis/mcbylaws-loop/<module>.mjs"))`. Every red case has a green twin. Order: (1) write the test, run `npx vitest run <test>`, it must FAIL (module missing); (2) write the module, run again, it must PASS; report both outputs. A `rulings` argument is a `Map(id -> status)` as `parseRulings` returns; authority = status `RATIFIED` or `RULED`.
Rules: plan `~/Buildo-scratch/mcbylaws/MB-68/plan.md` section 3; PR-68-2 (R-KI extended); G68-01 case_missing; G68-02 ruling lookup.

## Data shapes
A regression set in memory: `{ groups: [{ id, introduced_in, kind, producer, fast, external, split, ids_sha256, ids: string[] }], pending: [{ id, group, reason, owner_task, since }], removals: [{ ruling, group, ids: string[] }] }`. On disk: `mcbylaws/loop/regression-set.json` (everything except each group's `ids`, and `removals` may be absent) and `mcbylaws/loop/data/ids-<group>.json` (a single-line JSON array of ids).

## Contract
- `idsSha(ids)` -> sha256 hex (node:crypto) of `JSON.stringify(ids)`.
- `loadRegression(root, readText = (p) => fs.readFileSync(p, 'utf8'))` -> the in-memory set (reads the file and each group's ids file, `root`-relative). A missing file throws `Error('data_missing: <path>')`. `removals` defaults to `[]`, `pending` to `[]`.
- `checkRegression(base, cur, rulings)` (`base` may be `null`: only the internal checks run):
  - per group in `cur`: `idsSha(ids) !== ids_sha256` -> `ids_sha_mismatch:<group>`; a repeated id inside the group -> `duplicate_id:<group>|<id>`.
  - an id that is active in a group AND listed in `pending` (same group) -> `case_both_active_and_pending:<id>`.
  - against `base`: a base group missing from `cur` -> `regression_group_removed:<group>`; a group whose ids count fell -> `regression_count_fell:<group>`; each base active id absent from the same `cur` group (including one moved to pending) -> `regression_case_removed:<group>|<id>`, EXCEPT ids named by a NEW `cur.removals` entry (entries beyond `base.removals.length`) whose `ruling` is authority. A new removals entry whose ruling is not authority -> `ruling_not_authority:<ruling>` (and its ids stay reported as removed). If `cur.removals` is shorter than `base.removals` -> `removals_history_shortened`. When ids are excused by a removal the count-fell and sha checks still apply to the new lists (count may fall by exactly the excused ids).
- `checkCasesPresent(cur, recordCaseIds)` -> `case_missing:<id>` for each active id of every group not in `recordCaseIds`.
- `removeCases(cur, groupId, ids, ruling, rulings)` -> `{ set, violations }`: ruling not authority -> `ruling_not_authority:<ruling>` and `set` is `cur` unchanged; an id not in the group -> `remove_unknown_id:<id>`; otherwise `set` is a deep copy with the ids removed from the group, `ids_sha256` recomputed, and `{ruling, group, ids}` appended to `removals`. This is the only door.
- `saveRegression(root, set)`: writes `regression-set.json` (without `ids`, 2-space JSON plus trailing newline) and each `data/ids-<group>.json` (single line `JSON.stringify(ids)` plus newline), creating directories.

## Tests
idsSha stable and order-sensitive; load/save round trip in a temp dir (clean up with afterAll); load of a missing root throws `/data_missing/`. checkRegression: green identical sets; green id added; red id dropped; red id moved to pending (removed + both... only removed when absent from active); red whole group dropped; red count fell; red sha mismatch after a hand edit of ids; red duplicate id; red id both active and pending; removal with authority ruling (use a rulings Map with `M-322` -> `RULED`) is green while `RULED-FAKE-999` (absent) gives `ruling_not_authority`; shortened removals history. checkCasesPresent red and green. removeCases: authority ruling removes, hash recomputed, appended to removals and a following checkRegression(base, result.set, rulings) is green; fake ruling returns violations and the unchanged set; unknown id.
