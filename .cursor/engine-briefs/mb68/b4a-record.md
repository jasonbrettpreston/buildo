---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-record.mjs
- src/tests/mcbylaws-loop-record.logic.test.ts
---
# MB-68 B4a - loop-record.mjs (the loop record, canonical JSON, binding) - DeepSeek, red first, LEAVE UNCOMMITTED
Tools: `read_file`, `write_file`/`edit_file`, `run_command` (only `npx vitest run <path>`). Never git add/commit. ESM `.mjs`, 2-space indent, no `process.env`, no `process.exit`, no network. Pure functions return `string[]` of violation codes (empty = green); a code with a detail is `code:detail`. The test is a vitest file in TypeScript, plainly typed (no `any`), header with two `// SPEC LINK:` lines, `const ROOT = path.resolve(__dirname, "../..")` and `await import(path.join(ROOT, "scripts/analysis/mcbylaws-loop/<module>.mjs"))`. Every red case has a green twin. Order: (1) write the test, run `npx vitest run <test>`, it must FAIL (module missing); (2) write the module, run again, it must PASS; report both outputs. A `rulings` argument is a `Map(id -> status)` as `parseRulings` returns; authority = status `RATIFIED` or `RULED`.
Rules: plan section 2 (record trimmed, G68-01; binding R4-10; got_sha G68-11; add-only G68-06), PR-68-1.

## Contract
- `canon(o)` -> canonical JSON string: recursively sorted object keys, arrays in order, no whitespace; `undefined` values dropped.
- `sha256(x)` -> hex of a string (utf8) or of `canon(x)` for non-strings.
- `gotSha({ status, value, reason })` -> `sha256` of canon of `{ reason, status, value }` with missing members as `null` (key order fixed by canon).
- `RECORD_RE` = `/^docs\/reports\/loop-records\/([^/]+)\/round-(\d+)\.json$/`.
- `recordPath(increment, n)` -> `docs/reports/loop-records/<increment>/round-<nn>.json`, `nn` zero-padded to 2.
- `nextRound(existingPaths, increment)` -> max round number (parsed with `parseInt(x, 10)`, so `round-09` < `round-10`) among paths of that increment, plus 1; 1 when none.
- `bindRecord(rec)` -> copy of `rec` with `binding: { sha256: sha256(canon of rec without binding) }`.
- `checkRecordShape(rec)` -> `record_shape:<what>` codes: `schema` must be `loop-record-v1`; `increment` string; `round` positive integer; `decision` in accept|revert; `reason` a string; `accepted_findings` an array of objects; `cases` an array of `{ id: string, status in pass|fail|accepted|pending, got_sha: 64 hex }`; `inputs` an object whose values are strings; an UNKNOWN top-level key -> `record_shape:unknown_field:<key>` (the v1 fields floors, canary, counts, moves, groups, artifacts, parent_commit, made_pass, increment_green, rounds_since_thresholds, red_twins, prereg_check are never stored); `binding.sha256` that is not equal to the recomputed one -> `record_binding_mismatch`.
- `checkBound({ inputs, treeBlobs, changedBound })` (`inputs` record map path->blob id, `treeBlobs` map path->blob id of the tree being checked, `changedBound` array of changed bound paths) -> per path: absent from `inputs` -> `input_not_bound:<path>`; present with a different blob than `treeBlobs[path]` (or the path gone from the tree) -> `stale_green:<path>`.
- `checkRecordsAddOnly(nameStatus)` (`[{s, p}]`) -> `record_modified_or_deleted:<p>` for every `p` under `docs/reports/loop-records/` whose `s` is not `A`.
- `writeRecordExclusive(root, rec)`: writes `recordPath(rec.increment, rec.round)` under `root` as `JSON.stringify(rec, null, 2)+"\n"` with `fs.writeFileSync(..., { flag: 'wx' })`, creating directories; an existing file throws (the add-only door). Returns the relative path.

## Tests
canon order independence and arrays; sha256 string vs object; gotSha identical for key-order permutations and different for any of the three members changed, and numbers are not re-formatted; recordPath/nextRound including `round-09`/`round-10` and another increment ignored; bindRecord then shape green; a hand edit of any field after binding -> `record_binding_mismatch`; each shape code red; unknown key red for `floors` and `canary`; checkBound all three outcomes; add-only red for M and D, green for A; writeRecordExclusive in a temp dir twice (second throws), clean up in afterAll.
