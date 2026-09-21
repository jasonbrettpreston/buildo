# Active Task: Green the live-DB test suite (`npm run test:db`) and stop the rot
**Status:** Implementation
**Domain Mode:** Backend/Pipeline (`scripts/`, `src/tests/db/`, `package.json`, `.github/workflows/`) — read `scripts/CLAUDE.md`
**Workflow:** WF3 (one root cause per commit)

## Context
* **Goal:** `npm run test:db` is red — **74 failed / 610 passed / 14 skipped across 118 files** (measured
  2026-09-21, branch `wf2/deep-scrapes-restore-l0` @ `8da69140`). CI `db-tests.yml` has been red on
  **every run since 2026-08-27** (16 consecutive failures, run `33041067445` was the last green). Cluster
  the reds by root cause, fix them, and close the gate hole that let a whole suite rot for 25 days.
* **Target Spec:** `docs/specs/01-pipeline/124_step_standard_policy.md` (Rule 13, **R-AG** gate placement) ·
  `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §8.2 (frozen step shape) ·
  `docs/specs/00_engineering_standards.md` §12.9 (live-DB tier) ·
  `docs/specs/01-pipeline/65_enrich_parcels.md` + `78_optimal_lot_configuration.md` (the converted step)
* **Key Files:**
  * `scripts/enrich-parcels.js` (41-line shim — exports `{descriptor, compute, run}` only)
  * `scripts/lib/compute/enrich-parcels.js` (~2,330 lines — where the 5 pass functions now live)
  * `src/tests/db/enrich-parcels*.db.test.ts` (10 files), `src/tests/db/optconfig-staleness.db.test.ts`
  * `src/tests/db/assert-data-bounds-halt.db.test.ts`, `scripts/lib/compute/assert-data-bounds.js`
  * `scripts/lib/step/index.js` (`stepCtx` @ `:4505`, `STEP_CTX_KEYS` @ `:101`, defer branch @ `:3110-3130`)
  * `package.json` `scripts.test:db`, `.github/workflows/db-tests.yml`
  * `src/tests/step-conformance.infra.test.ts:2439-2519` (locks `test:db` ↔ `test` `--exclude` lockstep)

### Measured baseline (executed, not claimed)
| Fact | Value | How measured |
|---|---|---|
| Suite wall time (local, testcontainer) | **319.11s** (5m19s) | `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=2 npx vitest run … --no-file-parallelism` |
| Suite wall time (CI, service container) | **63.47s** | run `35657064290` |
| CI job wall time incl. setup | **2m10s–2m34s** (timeout 10m) | `gh run list --workflow=db-tests.yml` |
| Migrations applied in harness | 244 applied, 0 skipped | globalSetup log |
| Seeds | 276/577 `logic_variables` inserted, 301 preserved | globalSetup log |
| Local vs CI failure set | **identical** (74 / 13 files) | both logs compared |

> **`npm run test:db` has NEVER run on Windows.** The script is `BUILDO_TEST_DB=1 vitest run …` — a POSIX
> env prefix that npm executes via `cmd.exe`, producing `'BUILDO_TEST_DB' is not recognized…`. It is the
> **only** script in `package.json` using that form, and the prefix has been there since `e70cc300`
> (2026-04-08, the script's birth). The operator's only local path to this suite has never worked. This
> is the deepest cause of the rot, and it is why C1 is first.

## Technical Implementation
* **New/Modified Components:** no `src/` product code; test files, one analysis script, `package.json`.
* **Data Hooks/Libs:** `scripts/lib/compute/enrich-parcels.js` (read-only — the call surface tests retarget).
* **Database Impact:** NO. No migration. The testcontainer applies the existing 244.

### Cluster table (root cause → count → type), each PROVEN by reading code
| # | Root cause | Count | Type | Proof |
|---|---|---|---|---|
| **C-A** | ENRICHER conversion retired the legacy **function-export surface**. `scripts/enrich-parcels.js` is now a 41-line `pipeline.step()` shim; the 5 passes moved to `scripts/lib/compute/enrich-parcels.js` as `runPass1..runPass5`. | **59** | **TEST** | `node -e "Object.keys(require('./scripts/enrich-parcels.js'))"` → `descriptor,compute,run`; `enrichMaxBuild` is `undefined`. Signature `TypeError: <name> is not a function`. |
| **C-B** | Same conversion, **source-text + export drift**: `enrich-parcels-incremental.db.test.ts` `readFileSync`s the shim (`:43`) and `require`s it (`:271`, `:419`) to assert on strings/exports that now live in the compute module. | **5** | **TEST** | grep counts — `consumed_at IS NULL` shim=0/compute=10; `opt_aor_without_max_gfa` 0/6; `zero_link_ghost` 0/9; `buildDecisionScopeWhere` 0/3. **The behaviour shipped; the tests point at the wrong file.** |
| **C-C** | `assert-data-bounds-halt.db.test.ts`'s hand-built ctx **omits `descriptor`**, which `compute()` now reads (`assert-data-bounds.js:563` → `ctx.descriptor.identity.name`). | **4** | **TEST** | Real runner DOES supply it: `stepCtx` @ `index.js:4505` sets `descriptor`, and `'descriptor'` is in the `STEP_CTX_KEYS` closed list @ `:101`. Live step unaffected. |
| **C-D** | **Behavioural — UNPROVEN.** ③ prior run's unconsumed `enrich_parcels_pass3_scope` rows not consumed; ⑦a defer marker absent from `records_meta`. | **2** | **REAL-DEFECT CANDIDATE** | Mechanism **exists**: `consumePendingScope`/`computeDeferScope`/`countUnconsumedBacklog` in compute; runner defer branch emits `matched.defer_scope` @ `index.js:3110-3130`. Failure is either threshold/fixture-seeding drift or a genuine wiring defect. **Must be premise-verified before code.** |
| **C-E** | **Cascade fixture collisions** — `duplicate key … zoning_bylaw_areas_source_id_key` / `parcels_parcel_id_key`, `current transaction is aborted`. Secondary: C-A throws before the test's own cleanup/ROLLBACK runs, leaving fixture rows behind. | **4** | **TEST (secondary)** | Same files as C-A; errors appear only *after* a C-A `TypeError` in the same file. **Do not fix directly — re-measure after C-A.** |
| | **Total** | **74** | | |

### REAL (non-test) defects — the ones that matter
1. **PROVEN — `scripts/analysis/wf3-cost-coherence-sanity.js` is broken at runtime.** It calls four retired
   exports on the shim: `ep.enrichParcels` (`:53`), `ep.enrichMaxBuild` (`:54`), `ep.enrichExistingStructure`
   (`:55`), `ep.enrichOptimalConfig` (`:57`). It throws `TypeError` on first use. It was **touched in the
   conversion commit `d79191cf` (2026-09-21) without being fixed**. Severity: MED — a re-runnable operator
   reality-check tool, not in `manifest.json` or `docs/runbook/`, so nothing in a chain breaks. Its header
   comment (`Dev DB … localhost:5432/buildo`) is also stale post-P0-resolver.
   *This is the class no test covers: the conversion's non-test callers were never swept.*
2. **UNPROVEN ×2 — cluster C-D.** Treated as real until a premise-verifier says otherwise (C5).

Everything else is a test or harness defect. **No evidence any converted step is broken in production**:
the live runner supplies every ctx key the tests omit, and the batch-2 conversions carry panel review +
cloud acceptance.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes. Test files only, plus one analysis script.
* **Unhappy Path Tests:** each commit's own red→green proof is the unhappy path; C4 additionally adds a
  both-directions lock (§4.4 "a rule without a lock is not yet a rule").
* **logError Mandate:** N/A — no new catch blocks in `src/`.
* **UI Layout:** N/A.
* **Rule 2 / Rule 13:** no compute is edited; `step:validate` is untouched. C1 must preserve
  `package.json`'s `--exclude` spellings or `step-conformance.infra.test.ts:2455/:2460` reds.

## Resolved by Spec 124 (adjudicated — NOT raised as Asks)
| Candidate decision | Clause that settles it | Ruling applied |
|---|---|---|
| Add a `vitest related` subset for staged `.db` tests to **pre-commit** | **R-AG**: live-DB tests "run **ONLY** under `npm run test:db` — structurally excluded … **never merely conditional**"; pre-commit is fixed at stages 1–8 + `typecheck` + `lint` + `vitest related` | **REJECTED.** Not proposed. Also reds `hooks-composition.infra.test.ts` ("contains all 8 stage-1-8 commands, unchanged"). |
| Add `npm run test:db` to **pre-push** | **R-AG**, same clause + its measured cost rationale (the whole ruling moved cost *off* the per-commit path) | **REJECTED.** Pre-push already runs the full suite at ONE fork; adding 319s + a container boot + 244 migrations inverts R-AG. |
| Is CI the right **home** for the DB tier? | **Spec 123 §7 items 1 & 2 (both CLOSED)** — `db-tests.yml` exists with a `scripts/**` path filter since `1996aed8`; `00_engineering_standards.md` §12.9 names it | **SETTLED — no change.** The mechanism exists and is correctly placed. Not a placement question. |
| May `package.json`'s `test:db` be edited (the Windows fix)? | **Rule 13 / R-AG** cite it as the named mechanism; `step-conformance.infra.test.ts:2439-2519` locks its arg list ↔ `test`'s `--exclude` list both directions | **ALLOWED as an ordinary fix**, provided the file list and every `--exclude` spelling are preserved byte-for-byte. Not an Ask. |
| Must each fix carry a lock? | **§4.4** — "A rule without a lock is not yet a rule" | **APPLIED** — C4 extends the LW-D11 harness-fidelity lock; C1 adds a Windows-runnability lock. |
| Who may adjudicate C-D's premise? | **§4.2 (R-I.3)** — discoverer ≠ adjudicator | **APPLIED** — C5 routes premise verification to a separate lean roster, not this pass. |

## Asks for the operator (Spec 124 genuinely does not resolve these)
**ASK-1 — Make `db-tests.yml` a REQUIRED status check on `main` (branch protection).**
* **Clauses checked:** R-AG (names **`test.yml`** as "the non-skippable backstop" for the *full* suite —
  says nothing about `db-tests.yml` being blocking); Rule 13 (wires `step:validate` into hooks, not CI);
  §4.4 (locks, not repo settings); R-Z (a programme-gate precondition is "locked both directions, never a
  printed count" — nearest in spirit, but governs descriptor gates, not GitHub settings);
  Spec 123 §7 (established the workflow's *existence*, explicitly not its enforcement); Spec 122/122a — silent.
* **Why none settles it:** every clause governs code-level locks or hook composition. **Nothing in the
  estate makes a red CI job block anything.** `db-tests.yml` has been red for 25 days across 16 pushes to
  `main` with zero consequence — the failure mode is a *social* gate, and Spec 124 has no instrument for it.
* **Recommendation: YES, after this plan lands green.** The job costs **2m10s–2m34s** (10-min timeout), so
  requiring it is cheap. Requiring it *now*, while red, would block all work — so: fix (C1–C6), confirm one
  green run on `main`, then require. This is a GitHub repo-settings change only the operator can make.

**ASK-2 — Cadence for the remaining conversion batches.** Should batch-2's remaining rows proceed while
`test:db` is red, or is green a precondition? R-AQ/R-AB govern *cloud acceptance* per batch, not the local
DB tier; no clause binds them. **Recommendation:** land C1–C4 first (that is 68 of 74 reds and ~1 day),
then continue batches with ASK-1 armed; do not block batch work on C-D/C5.

## Execution Plan
*One root cause per WF3 commit, biggest-unblock first. Tests live in the plan.*

- [ ] **C1 — HARNESS: make `npm run test:db` runnable on Windows.** *(unblocks everything else locally)*
  * Replace the POSIX prefix in `package.json` `scripts.test:db`. Preferred: add `cross-env` (ABSENT today)
    as a devDependency → `cross-env BUILDO_TEST_DB=1 vitest run …`. Alternative with no new dep: a tiny
    `node scripts/run-test-db.mjs` wrapper that sets `process.env` and spawns vitest.
  * **Constraint:** the vitest argument list and `npm run test`'s `--exclude` spellings must not change —
    `step-conformance.infra.test.ts:2439-2519` reads both and reds on drift.
  * **Tests:** `npx vitest run src/tests/step-conformance.infra.test.ts` (the lockstep battery must stay
    green) + `npx vitest run src/tests/hooks-composition.infra.test.ts` + `src/tests/db-test-harness-target.infra.test.ts`.
  * **New lock:** an infra assertion that `scripts.test:db` carries no bare `NAME=value ` prefix (RED against
    the current string, GREEN after) — proven both directions.
  * Size: S · Risk: LOW.

- [ ] **C2 — TEST: retarget the retired ENRICHER export surface (C-A, 59 tests).** *(biggest test unblock)*
  * 11 files: `enrich-parcels-{maxbuild,maxbuild-corner,clamp,accessory,optconfig,comps,existing,existing-dq,scenarios}.db.test.ts`,
    `enrich-parcels.db.test.ts`, `optconfig-staleness.db.test.ts`.
  * Repoint `require('../../../scripts/enrich-parcels')` → `require('../../../scripts/lib/compute/enrich-parcels')`
    and map call sites: `enrichParcels`→`runPass1`, `enrichMaxBuild`→`runPass2`,
    `enrichExistingStructure`→`runPass3`, `enrichComparableBuilds`→`runPass4`,
    `enrichOptimalConfig`→`runPass5`; `flushOptConfigBatch` and `buildDecisionScopeWhere` are already
    exported under their own names. `assertPreconditions` has **no successor in compute** — it moved to the
    library guards (`assertRequirements`, `index.js:473`); that one test must be re-expressed against the
    runner, **not deleted**.
  * **VERIFY FIRST, do not assume:** each `runPassN` signature against its legacy caller (arg order, whether
    it takes `client` vs `pool`, and the returned stats keys the tests assert on). A silent signature
    mismatch would turn a real assertion vacuous.
  * **Never weaken an assertion to get green** — if a pass genuinely no longer reports a field, that is a
    C-D-class finding, not a test edit.
  * **Tests:** `npx vitest run src/tests/db/enrich-parcels-maxbuild.db.test.ts` first (14 tests, the largest
    single file) as the pattern-setter, then the remaining 10; finally the full `npm run test:db`.
  * Size: L (mechanical, 59 tests) · Risk: MED (signature drift).

- [ ] **C3 — TEST: `enrich-parcels-incremental` file-target drift (C-B, 5 tests).**
  * Point `SCRIPT_SRC` (`:43`) and both `require`s (`:271`, `:419`) at `scripts/lib/compute/enrich-parcels.js`.
  * The 3 source-text regexes (`consumed_at IS NULL`, `opt_aor_without_max_gfa`, `zero_link_ghost`) and the
    2 export-absence checks then assert the truth they were written to assert. **These tests' titles still
    say "RED TODAY" / "nothing in enrich-parcels.js reads this table at all" — that prose is now false and
    must be updated in the same commit**, or the file lies about its own status.
  * Leave C-D's 2 behavioural cases failing here; they are C5.
  * **Tests:** `npx vitest run src/tests/db/enrich-parcels-incremental.db.test.ts`.
  * Size: S · Risk: LOW.

- [ ] **C4 — TEST + LOCK: `assert-data-bounds-halt` ctx drift (C-C, 4 tests).**
  * Add `descriptor,` to `buildCtx`'s ctx object (`:191`). One line — the file already `require`s the real
    descriptor at `:105`.
  * **The lock that would have caught it:** the LW-D11 harness-fidelity lock currently covers only
    `src/tests/steps/*/violations.test.ts` ctx-builders. **Extend its corpus to `src/tests/db/` ctx-builders**
    — a hand-built ctx may only set keys from `STEP_CTX_KEYS`, and must not omit one the compute reads.
    Proven both directions (RED against the pre-fix file, GREEN after).
  * **Tests:** `npx vitest run src/tests/db/assert-data-bounds-halt.db.test.ts src/tests/step-conformance.infra.test.ts`.
  * Note: Case B asserts a *specific* downstream throw (`/permit_trades[\s\S]*does not exist/`); confirm it
    reaches that throw once `descriptor` is present rather than failing for a new reason.
  * Size: S · Risk: LOW.

- [ ] **C5 — PREMISE-VERIFY, then fix: the 2 behavioural reds (C-D).** *(possible real product defect)*
  * **Lean WF3 plan roster first (§4.2 discoverer ≠ adjudicator):** Integration (does the runner's defer
    branch @ `index.js:3110-3130` actually reach `records_meta` for this descriptor?) + one DeepSeek
    idempotency/spec lens + Reality-Check if any enriched field value is implicated.
  * **Question to settle before any code:** does the test seed `enrich_parcels_defer_threshold_rows` by the
    name the descriptor's `execution.enrich_hooks.defer_scope.threshold_from_config` actually reads? The
    emitted `records_meta.config` in the failing run shows a **large** threshold, not the test's seeded low
    one — pointing at seeding drift rather than a broken mechanism, **but this is unproven.**
  * Outcome A (fixture/seeding drift) → a test fix. Outcome B (genuine wiring gap) → a product fix + a
    regression lock, and a `docs/reports/defect-ledger.md` row.
  * **Tests:** the two named cases, then full `npm run test:db`.
  * Size: M · Risk: MED (unknown until premise is verified).

- [ ] **C6 — REAL DEFECT: repair `scripts/analysis/wf3-cost-coherence-sanity.js`.**
  * Retarget its 4 retired-export calls onto the compute module (same map as C2); refresh the stale
    `localhost:5432/buildo` header comment.
  * **Sweep for siblings in the same commit** — `grep -rn "require.*enrich-parcels\.js" scripts/` to find any
    other non-test caller the conversion left behind. *(measured today: this is the only one)*
  * **Tests:** no db-test covers this script. Add a cheap import-smoke assertion that every symbol it calls
    on its required module is `typeof === 'function'` — the lock that makes the next conversion catch it.
  * Size: S · Risk: LOW.

- [ ] **C7 — GATE (operator-authorized only).** On ASK-1 = yes: confirm one green `db-tests.yml` run on
  `main`, then the operator enables it as a required status check. Record the ruling in Spec 124 §5 as a new
  register row amending R-AG (gate placement for the live-DB tier), per §4.5 — a ruling that changes what §2
  says generically is amended in the same commit as its lock.

### Verification (after every commit)
1. `npm run typecheck && npm run lint`
2. the commit's own named vitest invocation (above)
3. `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=2 npm run test:db` — full suite, one at a time (24 GB box, ~1.5 GB
   free; a 4-fork run was OS-killed, `tasks/lessons.md`)
4. `npm run test` must stay green — the live-DB files are `--exclude`d from it and must remain so
5. Target: **74 → 0**, with C-E's 4 expected to vanish once C-A lands (re-measure, never assume)

**PLAN COMPLIANCE GATE:** §11 of `docs/specs/00_engineering_standards.md` read; plan addresses each
applicable item. §11 note: no `src/` product code changes and no migration, so the API/DB/UI clauses are
N/A; the traceability clause is met by the SPEC LINK headers already present in every touched test file.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> Two Asks above (ASK-1 CI required check, ASK-2 batch cadence) need a ruling; C1–C6 need only y/n.
