---
write_scope:
- scripts/analysis/cloud-pre-dispatch.mjs
- src/tests/cloud-pre-dispatch.logic.test.ts
- docs/specs/01-pipeline/123_step_opt_assessment_validation.md
---
# WF2 hygiene H7 — `--only` filter + `ci_green_for_sha` row in cloud-pre-dispatch.mjs — STOP BEFORE COMMIT

## Goal
`scripts/analysis/cloud-pre-dispatch.mjs` (read it fully first) is only run by hand. The orchestrator will call it from each `.github/workflows/chain-*.yml` (you never touch workflows) as `node scripts/analysis/cloud-pre-dispatch.mjs --dry --only=seed_rows_present,migrations_missing,declared_guards_present,ci_green_for_sha`. Operator ruling D2: add ONE row so a chain never dispatches on a SHA whose CI is not green.

## Red first — `src/tests/cloud-pre-dispatch.logic.test.ts`
Add to the typed `cloudPre` shape and write tests (use existing `healthyPool`/`fakeDescriptors`):
- `parseArgs(['--only=a,b', '--sha=abc'])` → `only: ['a','b']`, `sha: 'abc'`; absent → `only: null`, `sha: null`.
- `buildReport(pool, { only: ['seed_rows_present','migrations_missing'], ... })` → exactly those rows, in DECLARATION order (migrations_missing first); an unselected check never runs (assert via `pool.calls` that no stranded-rows query text was issued).
- `only: ['nope']` → rejects with an Error whose message contains `nope` and lists the known ids.
- `checkCiGreenForSha({ sha: 'abc', listCiRuns })` with `listCiRuns` a stub returning `[{workflowName,status,conclusion}]` (newest first): both `Test Suite` and `DB Integration Tests` completed/success → severity `INFO`; one `failure` → `FAIL`; one `in_progress` (conclusion '') → `FAIL`; a required workflow absent → `FAIL` (value names it `missing`); stub throws → `FAIL` with the error text in `value`; empty sha → `FAIL`. Only the NEWEST run per workflow counts (an older success under a newer failure → FAIL).
- Every EXISTING `buildReport` call gets `listCiRuns: greenCi` (a stub returning two success runs) so no test spawns `gh`; the "declaration order" test becomes seven ids ending `ci_green_for_sha` (rename its title "all seven checks").

## Fix — `cloud-pre-dispatch.mjs`
1. `export const CHECK_IDS` = the seven ids in declaration order; `export const REQUIRED_CI_WORKFLOWS = ['Test Suite', 'DB Integration Tests']` (the `name:` of `.github/workflows/test.yml` and `db-tests.yml`).
2. `export async function checkCiGreenForSha({ sha, listCiRuns })` → one `row('ci_green_for_sha', ...)`; value `{ sha, workflows: { <name>: 'success'|'failure'|'in_progress'|'missing'|... } }` (or `{ sha, error }`); limit text `every required CI workflow's newest run for this SHA = success`; `why`: Spec 124 §5 R-BA 11(e) CI is the backstop; a chain on a red/unverified SHA is a wasted or wrong dispatch (operator D2, 2026-09-27).
3. Default `listCiRuns(sha)`: `spawnSync('gh', ['run','list','--commit',sha,'--json','workflowName,status,conclusion','--limit','100'], {encoding:'utf8'})`; non-zero/`error` → throw with stderr. No shell.
4. `buildReport(pool, opts)`: `opts.only` (null = all), validated first (unknown id → throw); run ONLY selected checks, in `CHECK_IDS` order; `opts.sha` default `process.env.GITHUB_SHA` then `git rev-parse HEAD` (spawnSync; failure → empty string, which the check FAILs).
5. `parseArgs`: `--only=<csv>` (trimmed, empty entries dropped), `--sha=<sha>`; `main()` passes both. `usage()` documents both. Header comment: "Seven checks"; add row 7 description; keep everything else.

## Spec
Spec 123 row `| A5 |`: replace `six checks, one row-derived verdict, run against the live cloud DB before every dispatch.` with `seven checks (the seventh, \`ci_green_for_sha\`, refuses a SHA whose newest \`Test Suite\`/\`DB Integration Tests\` run is not \`success\` — operator D2, 2026-09-27), one row-derived verdict; each \`chain-*.yml\` runs \`--only=seed_rows_present,migrations_missing,declared_guards_present,ci_green_for_sha\` after \`migrate.js --verify\`, so a FAIL stops the job before any step runs (WF2 hygiene H7).` edit_file only.

## Gate answers
No descriptor field/logic variable/check limit/emits/counters — a CLI audit script (rows via `deriveVerdict`, Rule 10 unchanged); no Spec 124 §5 R-BA gate reads it.

## Green
`npx vitest run src/tests/cloud-pre-dispatch.logic.test.ts`; `npx eslint scripts/analysis/cloud-pre-dispatch.mjs src/tests/cloud-pre-dispatch.logic.test.ts`; `npx tsc --noEmit`; `node scripts/analysis/spec-split-check.mjs --check`.

## Stop
UNCOMMITTED. No git_commit. Report the diff.

## Round 2 (orchestrator, after run 20260928T022159Z-5cbd836e — work is in the tree; do NOT redo it)
Two holes, nothing else:
1. `only: []` (e.g. `--only=` or `--only=,`) runs ZERO checks and the verdict passes — a gate that selects nothing must not pass. In `buildReport`, after the unknown-id check: `if (only !== null && only.length === 0) throw new Error('--only selected no checks — known ids: ' + CHECK_IDS.join(', '))`. Test: `only: []` rejects with `selected no checks`.
2. The header line `Exit 1 on FAIL, 0 otherwise, 0 on --dry.` is false (`main()` returns 1 on FAIL with or without `--dry`, and the chain workflows rely on that). Replace it with `Exit 1 on FAIL, 0 otherwise — with or without --dry (--dry only skips writing the report files; the chain-*.yml gate relies on the FAIL exit).` Add a test: read the script text and assert `main` returns `report.verdict === 'FAIL' ? 1 : 0` outside any `opts.dry` branch — simplest: `expect(src).toMatch(/return report\.verdict === 'FAIL' \? 1 : 0;/)`.
Green as before.
