---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-decide.mjs
- src/tests/mcbylaws-loop-decide.logic.test.ts
---
# MB-68 B4b - loop-decide.mjs (accept / revert, findings, empty run, canary) - DeepSeek, red first, LEAVE UNCOMMITTED
Tools: `read_file`, `write_file`/`edit_file`, `run_command` (only `npx vitest run <path>`). Never git add/commit. ESM `.mjs`, 2-space indent, no `process.env`, no `process.exit`, no network. Pure functions return `string[]` of violation codes (empty = green); a code with a detail is `code:detail`. The test is a vitest file in TypeScript, plainly typed (no `any`), header with two `// SPEC LINK:` lines, `const ROOT = path.resolve(__dirname, "../..")` and `await import(path.join(ROOT, "scripts/analysis/mcbylaws-loop/<module>.mjs"))`. Every red case has a green twin. Order: (1) write the test, run `npx vitest run <test>`, it must FAIL (module missing); (2) write the module, run again, it must PASS; report both outputs. A `rulings` argument is a `Map(id -> status)` as `parseRulings` returns; authority = status `RATIFIED` or `RULED`.
Rules: plan sections 2, 5, 6; G68-03 (finding_id must be a register row); PR-68-8 (canary run by the gate, never stored); PR-68-10 (rounds_since_thresholds computed); the operator's 20-character accept reason (batch al).

## Contract
- `checkDecision(rec, rulings, cardExists = () => false)`:
  - `rec.decision` not accept|revert -> `decision_missing`.
  - accept with `reason` shorter than 20 characters after trim -> `accept_without_reason`.
  - every item of `rec.accepted_findings`: no `case` -> `finding_case_missing`; `reason` shorter than 20 trimmed -> `finding_reason_short:<case>`; `finding_id` neither (an `M-<digits>` id that exists as a key of `rulings`) nor (a string for which `cardExists(id)` is true) -> `finding_id_not_in_register:<case>`. (The executed hole: `finding_id: "zzz", reason: "k"` must be red; `finding_id: "M-322"` with a 20+ character reason green.)
  - accept while some `rec.cases` entry has status `fail` -> `accept_with_failing_case:<id>`; a case with status `accepted` that has no `accepted_findings` entry with the same `case` -> `accepted_case_without_finding:<id>`.
  - revert needs no reason rule.
- `checkRun({ declaredIds, cases, skipped = 0, canary })` (`cases` = `[{id, status, got_sha}]` the gate computed; `canary` = `{ id, observed }`): `declaredIds` empty -> `empty_set`; fewer cases than declared (count of declared ids with a case) -> `ran_fewer_than_declared:<missing count>`; `skipped > 0` or any case with status `skipped` -> `cases_skipped:<n>`; `!canary || canary.observed !== 'fail'` -> `canary_not_red`; a case that is not `pending` without a `got_sha` -> `case_without_computed_value:<id>`; a declared id with no case -> `case_missing:<id>`.
- `mutateExpected(v)`: number -> `v + 1`; string -> `v + '~'`; boolean -> `!v`; null/undefined -> `'canary'`; array -> copy with element 0 mutated (empty array -> `['canary']`); object -> copy with its first key (sorted) mutated.
- `runCanary(cases, compare)`: `cases` = `[{id, expected, got}]`, `compare(expected, got)` returns a status string. Picks the first case for which `compare(expected, got) === 'pass'`; none -> `{ id: null, observed: 'none' }`; otherwise `{ id, observed: compare(mutateExpected(expected), got) === 'fail' ? 'fail' : 'pass' }`.
- `roundsSinceThresholds(records)` (records chronological `[{decision, green}]`): number of records after the last one with `decision === 'accept' && green === true` (all of them when none). A revert counts. (Definition is the builder's reading of PR-68-10; the card itself is MB-27's.)

## Tests
Every code red and green twin; the hole above; mutateExpected for every type; runCanary green (observed fail), canary stays green when compare ignores the expected value (observed pass), no passing case (none); roundsSinceThresholds with a revert in the middle.
