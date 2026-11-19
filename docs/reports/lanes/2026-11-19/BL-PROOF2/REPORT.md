# REPORT.md: BL-PROOF2, task-68 PROOF.TOOL stage 2 (minimum), 2026-11-19

## Five plain lines for the operator
1. The tool is built and committed: one runner (`node scripts/analysis/proof-slice.mjs --slice S --out <dir>`) calls the existing search, lot-map and semi checks plus CHK.3 and CHK.5, reads the push-station pass file, and prints one table with an evidence file per row. Its 36 tests pass through the real hooks.
2. Slice S, measured on the committed head: 5 PASS, 0 FAIL, 10 NOT BUILT, 1 GAP, exit 3 (table in TABLE.md; the GAP is the suite row, which needs a station pass file for this commit).
3. Who calls it: the PROOF.S lane (task-268) runs it as its acceptance command, as the plan states. No hook, station step or CI job calls it (infra freeze; not measured). The three golden capture checks now have a caller only through that command.
4. Left for later, with unblockers: design fit (tasks 345 then 67); loading screen from the pick (266, 267); load-failure page (317); report opens and key match (123); screenshots and element check (123, 265); storage probes (265); mobile jest (not run by this tool: duration unmeasured and the lane rule refuses the runner call). The task is BUILT for the minimum only.
5. Unproven: the push station suite on this commit, the mobile jest duration, and anything on a real lot (the customer read returns null until task-123).

## Orchestrator decision (to be logged for the operator, six criteria)
The tool lives under scripts/analysis/ and src/tests/, not scripts/surfaces/: the first commit attempt at the surface paths was refused (`FAIL:C:no-mf-task`, `FAIL:P:no-record`, commit.out of the first attempt). The orchestrator ruled: a runner of checks is not a surface; no MF id, no prereg. I confirmed in mcbylaws/protected-paths.json that none of the three new paths matches any list (layer23, frontend, protected, literal_scope; matcher run over all string globs: `matches: 0`). This is a deviation from PLAN.md section 5 paths, flagged on the task as a dated note.

## What landed
- e641ff7be feat(126_maxbld_surface_standard): the runner, the data file, tests T1-T7 (red.out: typecheck refusal `TS2307 Cannot find module '../../scripts/analysis/proof-slice.mjs'` at the new location; green commit.out: `Tests 28 passed (28)`, `GATE OK`, rc=0).
- 0918e53a8 fix(...): review r2 KEPT findings (commit-fix.out: `Tests 36 passed (36)`, `GATE OK`, rc=0).
- The final commit (reports, task close) follows this report.
- Mobile jest row: the plan's stage-2 step names no way to measure it without the runner call lane rule 18 refuses, so it is a NOT BUILT row with that reason and no `--with-mobile` flag exists.

## Checks (checks.out): before, after the move, after the fix: all four rc=0
surface-validate `--check`, `scripts/analysis/gates/consumer-registry.mjs --check`, `generate-target-files.mjs --check`, `scripts/violations/generate-surface-registry.mjs --check`. Neither generator moved.

## Output review (one lens), triage
r2-output.txt, TRIAGE.md: 16 findings, 6 KEPT and fixed (an `expect` output line is now required for the six check rows, so a clean exit with no line is GAP; unknown keys refused; waits/expect only on argv rows; notbuilt null; empty HEAD exits 2; error text in evidence), 10 REJECTED with reasons.

## For the orchestrator
- Step-0 ids check (ids.out) exits 1 with this exact line, from other lanes' commits in 78f552fbb..67dd69222, not fixed: `FAIL no-ledger-dir round-195  (new scripts/analysis/bylaw-validation/coa-expected/prereg-MF-91-1.json)` / `IDS FAIL: 1 of 1 id(s) not claimed by this branch or lane`. This task adds no id kind.
- docs/reports/reviews/task-68/context-2026-11-19.md was already modified when the lane started (7 insertions, 102 deletions in the first commit); it is committed with the review section appended, as the brief says.
- Stages 3-5 (screenshots and elements, key compare, storage probes) have no task of their own; the plan leaves that to the orchestrator (PLAN section 6, D1).

## UNVERIFIED
- The push station suite on the tool's commits; the suite row stays GAP until the operator runs the station and passes `--suite-pass`.
- Whether check-spec-diff asks for a Spec 127 note: the hooks did not ask on either commit (no note added).
- The mobile jest duration and which pushes trigger mobile-ci.yml.
- The suite row's PASS path was tested only with injected pass-file text, never against a real station pass file.
- Task AC #1, #4, #5, #8 are left unchecked: #1 and #8 are imported generic criteria that do not apply (no by-law step, no McFrontend row); #4 and #5 are stage-1 panel matters not re-verified here.

STATUS: ready (minimum only)
