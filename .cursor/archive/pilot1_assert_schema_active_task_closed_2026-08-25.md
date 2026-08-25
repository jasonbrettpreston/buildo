# Active Task: Pilot 1 — convert `assert_schema` to the Spec 122 step standard
**Status:** Review — code complete (commits 0–9 + Fold D `f284d52b`); OUTPUT panel ×6 done, no blocking findings; awaiting operator `emits` ruling (E-class) → WF6 close → land to main

> `scripts/hooks/check-active-task.mjs` resolves `.cursor/active_task.md` only; the promoted copy carries `**Status:** Implementation`, so `src/`/`scripts/` writes are unlocked (Integration seat, verified).

## Context

* **Goal:** Convert `assert_schema` — the first of C1's eight archetype pilots (ASSERT) — from a 606-line
  `pipeline.run()` island into the Spec 122 §5.1 frozen 7-line shape: a data-only descriptor, a compute
  module, and `module.exports = pipeline.step(descriptor, compute)`. The step keeps its path, its lock ID
  (102) and its `run-chain.js` invocation. Every non-compute concern moves into `scripts/lib/step/`.
* **Target Spec:** `docs/specs/01-pipeline/122_pipeline_step_optimization.md` (§5.1 frozen shape, §5.2
  conformance, §5.3 differential, §5.4 lock-test convention) + `docs/specs/01-pipeline/123_step_opt_assessment_validation.md`
  §6 (gates), §6.1 (G4d, G-shape), §7 (the nine commits). Governing: 121 (method), 119 (verification doctrine).
* **Domain Mode:** Backend/Pipeline → `scripts/CLAUDE.md`. **Workflow:** WF2.
* **Programme position:** `.cursor/active_task.md` — C-track entry gate is `P3 green + P2 landed + S1 +
  S2-min + S3(A2) + S6a`; `Pilot ORDER within C1` puts `assert_schema` first (S5-independent).

### Key files — every path below verified to exist (`ls`/`wc -l`, planning session 2026-08-25)

| Path | Measured |
|---|---|
| `scripts/quality/assert-schema.js` | **606 lines** — the step under conversion |
| `scripts/manifest.json` | `assert_schema` at `:58`; chain members at `:78` (permits), `:94` (coa), `:100` (sources) |
| `scripts/lib/step/index.js` | 274 lines — `step`, `deriveMeta`, `deriveCounters`, `skipRecordsMeta`, `assertDatabaseTarget` |
| `scripts/lib/step/validate.js` | 113 lines — `validateDescriptor` (AJV, before compute) |
| `scripts/lib/step/verdict.js` | 189 lines — `selectChecks`, `resolvePhase`, `evaluateLimit`, `checkRow`, `deriveVerdict`, `buildAuditTable` |
| `scripts/lib/step/ledger.js` | 128 lines — `RUN_STATUS`, `ownsLedgerRow`, `openLedgerRow`, `finalizeLedgerRow` |
| `scripts/lib/pipeline.js` | `:976` exposes `pipeline.step()` via a deferred `require('./step')` |
| `scripts/steps/_schema/step.schema.json` | 1307 lines — **18 required top-level categories** |
| `scripts/steps/_schema/converted.json` | `"converted": []` — the A2 blocking scope, empty |
| `scripts/steps/_schema/fixtures/valid/assert_schema.descriptor.json` | 343 lines — the DRAFT descriptor (9 checks) |
| `scripts/hooks/check-step-shape.mjs` | the A2 driver; `npm run step-shape` |
| `scripts/ast-grep-rules/step-shape.yml` | the rule itself |
| `src/tests/step-conformance.infra.test.ts` | 17 tests, green |
| `docs/reports/2026-08-23-assess-step01-assert-schema.md` | the PH-0/PH-3/PH-5/PH-6 assessment — **stale, see G0** |
| `docs/reports/generated/123-per-step-checklist.md` | zero drift vs generator (diff empty this session) |

**Does not exist yet (measured):** `scripts/lib/compute/` · `scripts/quality/assert-schema.descriptor.json` ·
`scripts/quality/assert-schema.notes.json` · `src/tests/steps/` · `src/tests/violations/`.

## Technical Implementation

* **New files:** `scripts/quality/assert-schema.descriptor.json` (promoted from the fixture, corrected) ·
  `scripts/lib/compute/assert-schema.js` · `src/tests/steps/assert_schema/violations.test.ts` ·
  (decision-dependent) `scripts/quality/assert-schema.notes.json`.
* **Modified:** `scripts/quality/assert-schema.js` (→ 7 lines + `'use strict'`) ·
  `scripts/steps/_schema/converted.json` (append one entry, final commit) ·
  `src/tests/pipeline-advisory-lock.infra.test.ts` (one regex widening) ·
  the **6** test files carrying the 13 source-text assertion sites (Fold A: Integration + Ground-truth both measured 6, not 7). Per-site disposition at commit 7 — SURVIVE frozen shape: `quality.infra:280` (existsSync), `pipeline-advisory-lock.infra:145` (lock-ID map), `pipeline-sdk.logic:2325` (SPEC LINK in first 30 lines — the 7-line file MUST keep the SPEC LINK header). GO RED → re-home onto `scripts/lib/compute/assert-schema.js`: `chain.logic:864`, `pipeline-sdk.logic:1068`, `:1248`, `quality.infra:823`, `quality.logic:674/:711/:742/:761/:2146`; **`quality-ledger-window.logic:196` re-homes onto `scripts/lib/step/index.js` (library `finally`), NOT compute** (Fold B); plus the `:264` `toContain('withAdvisoryLock')` widening.
* **Database Impact:** **NO.** `grep -n "INSERT INTO\|UPDATE pipeline_runs\|DELETE FROM"` on the step returns
  `:277` (INSERT `pipeline_runs`) and `:560` (UPDATE `pipeline_runs`) only — bookkeeping, and only when
  `!CHAIN_ID` (`:112`). Zero domain tables, zero DB reads. No migration.

### Fold C items (operator, 2026-08-25 — OPEN, adjudication required, not decided)
* **Policy:** nothing hidden; compute = just compute; a behaviour with no box gets a NEW standardized box — **balanced against disk I/O**, which must be adjudicated with numbers.
* **C-1 `any_of` expect form** for the coordinate OR-contract (`646ea5a7`): today a named check `address_points_has_coordinate_source` with logic in compute (ruled for pilot 1). Candidate schema extension at C3 freeze so the rule becomes data. **Gate:** measure before proposing — descriptor bytes added, audit rows added per run, ×62 steps × cadence.
* **C-2 I/O baseline — MEASURED (commit 7 differential; `records_meta` B / check rows / stdout B, pre→post):** permits 669→515 / 5→3 / 1175→1255 · coa 665→425 / 5→2 / 1094→1088 · sources 418→796 / 2→6 / 2960→3572 · standalone 669→1036 / 5→9 / 3492→4093. On-disk per invocation: step 1,689 B + descriptor 18,019 B + notes 9,313 B + compute 20,842 B (vs one 606-line file before). **Awaiting operator ruling.** Original ask: `records_meta` bytes per chain run pre vs post, audit-table row count pre vs post, descriptor+notes bytes read per invocation. Numbers go in the OUTPUT-panel fold; the operator rules on the trade-off.

### Fold B (fold-validation 2026-08-25: grounder 0 mismatches; Cross-read Adversary 10 collisions folded — see Declared-diffs rows, commit 7 row, descriptor #6/#7 rulings)

### Fold A (PLAN panel 2026-08-25: Integration · Ground-truth · Descriptor-vs-schema · DB Schema-Fidelity)

* **Compute contract (Integration, `scripts/lib/step/index.js` `computeResult = await runnable.compute(stepCtx)`):** `compute(stepCtx)` → `{observations?, records_meta?}`; `stepCtx.report(checkId, obs)` **throws on any checkId not declared in `checks[]`**. Commit 7's "verbatim" extraction must map the 9 check outcomes onto the declared IDs or the library throws at runtime. Status is row-derived from `audit_table.verdict` (`index.js` `built.audit_table.verdict === 'FAIL' ? RUN_STATUS.FAILED …`) — no parallel boolean.
* **Strand-window fence (Integration + Ground-truth, `quality-ledger-window.logic.test.ts:196`):** that lock requires `require(...ledger-window)` + `finalizeStrandedRun` in a `finally` **inside the step file** — unsatisfiable by the frozen 7-line shape. **Decision: the library gains the window** (`scripts/lib/step/` calls `finalizeStrandedRun` in its `finally`, lock re-homed onto the library) — retiring the fence is not on the table (P3 fence `f32b1485`, 1 day old). This is a library-growth item of commit 7 (R4: the library grows per pilot).
* **Descriptor corrections before promotion (Descriptor-vs-schema seat; `validateDescriptor` passes as-is, but):**
  1. `permit_cost_type_sample`: `blocking:true` **and `when:"pre"`** — schema `allOf` enforces `blocking:true ⇒ when:"pre"`; flipping `blocking` alone THROWS (verified).
  2. `zoning_resource_columns.expect`: per-resource map — height `["_id","geometry","HT_LABEL"]`, lot_coverage `["_id","geometry","PRCNT_CVER"]`, 7 others `["_id","geometry"]` (code `:432-441` has 3 distinct required sets; draft has 2).
  3. `execution.network.timeout`: draft says 30s; code has **no** fetch timeout (5 bare `fetch(`). PIN not FIX → `"none"` at commit 7; adding `AbortSignal.timeout` is a peel candidate (8c) with its own lock.
  4. `execution.on_check_error`: `"fail_step"` (8 of 9 checks fail the step on error); the `:163` omit is a per-check limitation, not the policy.
  5. `database.min_migration`: 241 has no basis (it is `fix_lead_id_trigger_column_scope`; the only table touched is `pipeline_runs`, mig 033). Set to `33` with a `why`. (Dissolves the DB seat's cloud advisory; that seat's "cloud = 237" came from a stale `resolve-db.js` header — P2's record verified 245 applied on cloud. Fix the header text in passing.)
  6. `parcel_columns.chains`: `["sources"]` contradicts its own `why` ("emitted into every chain") and the code (`:487-488`, `:510-511` emit `parcels_schema_mismatch_count` rows into permits AND coa audit tables). **Fold B ruling: widen to `["permits","coa","sources"]`** — the `sharing` option is unexpressible: `verdict.js` `buildAuditTable` builds rows only `for (const check of selected)` and `index.js` passes no `extraRows`; a `report()` for an unselected check is accepted but silently dropped. In permits/coa the parcels check does not execute (`runSourceChecks` gate `:328`) — compute reports a constant `violations: 0`, declared as a diff (constant row, not a check execution). Partition becomes **permits:3 / coa:2 / sources:6** (11 selections of 9 checks); standalone still runs all 9.
  7. `terminals`: `fail_check` and `fail_error` are indistinguishable in code (one throw at `:585` serves both). **Fold B ruling: merge at commit 7** (drop `fetch_error`, carry its `why.liveness external` onto the survivor and record the loss); separating them is peel 8b. No 55-A claim demands distinct terminals (generator: only #179, k=FLEET, 55-C). Stale cites: `:1073→:1092`, `:351-397→:365-404`.
* **DB Schema-Fidelity (live `127.0.0.1:54322/postgres`, 242 migrations): 0 FAIL.** All columns/types/nullability/defaults used by the old step, `ledger.js`, `index.js`, `run-chain.js` exist; `pipeline_runs.status` has **no CHECK/enum** — vocabulary is enforced only by `step.schema.json` + `RUN_STATUS`. `self_skipped`/`crashed` have never been written (live distinct: completed 1416, skipped 103, failed 101, completed_with_errors 15, completed_with_warnings 6, cancelled 2).

## Gate ledger — G0–G8 + G4d + G-shape

Requirement text is quoted from Spec 123 §6 / §6.1 (grep anchors given, not line numbers). "Measured" = run in the planning session.

| Gate | Spec 123 requirement (anchor) | Command that proves it | CURRENT measured state |
|---|---|---|---|
| **G0** | §6 `Boundary freeze` — *"every table/column written, every audit row, exit codes, stdout — enumerated"* | `grep -n "INSERT INTO\|UPDATE pipeline_runs\|DELETE FROM\|emitSummary\|emitMeta\|throw new Error" scripts/quality/assert-schema.js` | ⚠️ **STALE — re-derive.** A boundary freeze exists (`docs/reports/2026-08-23-assess-step01-assert-schema.md` §`## P0 — Boundary freeze`) but was written against **571 lines**; `wc -l` now returns **606**. `git log --oneline -- scripts/quality/assert-schema.js` shows `f32b1485` (P3 strand-window) landed after it. Measured surface today: 8 `throw new Error`, 1 INSERT `:277`, 1 UPDATE `:560`, `emitSummary :571`, `emitMeta :572`, circuit-breaker throw `:585`. **Do not inherit the report's line numbers.** |
| **G1** | §6 `Archaeology` — *"churn + fix density + fence density + 20% coupling computed (batch)"* | `git log --oneline -- scripts/quality/assert-schema.js \| wc -l` · `git log --pretty=%s -- scripts/quality/assert-schema.js \| grep -c "^fix("` · `git log --pretty=%B -- scripts/quality/assert-schema.js \| grep -ci "^Severity:"` | ✅ **GREEN (recomputed now): 37 commits · 25 `fix(` · fix density 67.6% · fence density 4.** (The assessment's `24/36 = 66.7%` is superseded by one commit.) 20% change-coupling: **NOT computed** — no batch artifact and no generator exists. |
| **G2** | §6 `Structure` — *"churn×complexity plot; top-right quadrant named"* | *(no command exists)* | ⛔ **ABSENT.** `ls scripts/analysis \| grep -i "churn\|archae\|risk\|complex"` returns nothing. No plot, no quadrant naming, no generator. **Blocking work item** — either build the batch instrument or record `ASSESSMENT-INCOMPLETE` per §6.2 clause 3. |
| **G3** | §6 `Intent Ledger` — *"100% of top-right + fence>0 constructs have a recovered why or an explicit INTENT-UNKNOWN"* | `git log -S'<constant>' -- scripts/quality/assert-schema.js` per constant; adjudication per §7.1 | ⚠️ **PARTIAL + STALE.** The assessment carries a P3 pass that refuted D2, narrowed D1, downgraded D5 and found D9/D10 — but predates `f32b1485`. **Fence density is 4 > 0, so G3 is mandatory** (§7 row 2: *"skip unless top-right or fence>0"* — it is not skippable here). The 4 fences: `646ea5a7` (HIGH, chain-blocking, coordinate-source OR-contract), `58914fa8` (CRITICAL+HIGH, zoning DataStore), `1ceebd17` (HIGH, ravines), `f6047e89` (HIGH, centreline). §7.1: **a human adjudicates** — the agent that discovers may not retire. |
| **G4** | §6 `Risk class` — *"A/B/C with chance and impact factors shown, not just the total"* | derived from G1 + the blast radius (3 chains, halt-on-drift) | ✅ **CLASS A.** Chance: fix density 67.6%, 4 HIGH/CRITICAL fences, 21 network calls to one host with no timeout/retry. Impact: halting step 1 of 3 chains; `assert-schema.js:583-584` — *"allowing downstream scripts to run with malformed data would silently corrupt 240K+ permit records."* Class A ⇒ §6 G7's mutation clause applies (see G7). |
| **G5** | §6 `Seam map` — *"DB, clock, network, argv/env each have a named seam"* | `grep -c 'fetch(' …` · `grep -c 'Date.now()' …` · `grep -n 'process.env' …` · `grep -c 'process.argv' …` | ✅ **GREEN (recomputed): DB** = the `pool` from `pipeline.run` (2 bookkeeping statements). **Clock** = `Date.now()` ×3, elapsed-only (no `new Date()` written to DB — Spec 47 §R3.5 clean). **Network** = 5 `fetch(` call sites fanning out to 21 requests, one host. **argv/env** = `process.env.PIPELINE_CHAIN` at `:112` only; `process.argv` count **0** (manifest declares `supports_full:false, supports_dry_run:false` — consistent). |
| **G6** | §6 `Classification` — *"every behaviour CONTRACT / INCIDENTAL / DEFECT; **every DEFECT has a ledger ID**"* | `grep -rn "AS-D1\|AS-D9\|Defect Ledger" docs/ src/ scripts/` | ⚠️ **PARTIAL — the ledger IDs have no register.** The assessment classifies 6 CONTRACT (C1–C6), 4 INCIDENTAL, and 10 DEFECTs `AS-D1, AS-D1b, AS-D2, AS-D3, AS-D4, AS-D5, AS-D6, AS-D7, AS-D8, AS-D9, AS-D10` — but there is **no Defect Ledger file** anywhere in the repo. G6 cannot be "full" until one exists, and §6 says *"Any zero in G6–G8 is a hard stop."* Re-verified live: D1 (`:546` `sourceErrors.length > 0 ? 'FAIL' : 'PASS'` — raw array, not `sourceAuditRows`), D7 (`:527` `checks_passed: … ? 'all' : undefined`), D9 (`:605` `if (!lockResult.acquired) return;` — no emit) **all still present.** |
| **G7** | §6 `Test adequacy` — *"class-A: **mutation ≥80% on covered code**; every class-A behaviour **proven red**"* | `npx vitest run src/tests/steps/assert_schema/violations.test.ts` · `grep -n "mutate\|break" stryker.config.mjs` | ⛔ **RED, and the mutation clause is unsatisfiable as written.** Measured: `stryker.config.mjs` `mutate:` lists **3 files, all `src/features/leads/lib/*.ts`**, `break: 75`. `scripts/*.js` is outside `src/` and unreachable; there is no line/branch coverage tooling. Spec 123 §4.8 already says this (*"a NEW dependency, not existing capability"*). **Prove-red half:** `src/tests/steps/` does not exist — 0 of the 44 55-A claims are red or green today. |
| **G8** | §6 `Differential` — *"zero unexplained diffs; every explained diff points at a Defect Ledger ID"* | per chain: `PIPELINE_CHAIN=<c> node scripts/quality/assert-schema.js` before/after, 4-tuple diff | ⛔ **NOT MEASURABLE IN THE PLANNING SESSION.** DB probe was permission-denied, so no capture was taken. Also **no golden-master harness exists**: `grep -rln "golden.master\|golden-master\|goldenMaster" scripts src/tests` returns only prose mentions in `scripts/violations/extract-claims.mjs` and `src/tests/step-library.logic.test.ts`. Commit 5 must build it. |
| **G4d** | §6.1 — *"every fence found in P3 has a **both-directions** lock test. A both-directions lock test IS a violation test with its reversion patch"* | `git log --format=%B -- scripts/quality/assert-schema.js \| grep -ci "^Severity:"` then one lock test per fence | ⛔ **RED: 4 fences, 0 both-directions locks.** No `*.regression.test.ts` covers this file. The nearest existing locks are 13 **source-text** read sites across **6** test files (`grep -rn "quality/assert-schema.js" src/tests/*.ts` → 13; Fold A corrected 7→6) — all of which go red at commit 7 and must be re-homed, not deleted. |
| **G-shape** | §6.1 — *"the converted file passes the ast-grep shape rule (Spec 122 §4.1) and `pipeline.run(` no longer appears in it"* | `node scripts/hooks/check-step-shape.mjs` (or `npm run step-shape`); `node scripts/hooks/check-step-shape.mjs --json` | ⛔ **RED by design, and correctly armed.** Measured output: `footgun[step-shape] (info): 62/62 unconverted manifest step files violate the frozen shape … ✅ Step-shape gate clean (0 converted step file(s) enforced).` `--json` confirms `converted: []`, `report_only` length **62**, and `scripts/quality/assert-schema.js` is in the report-only violating set. Live today: `assert-schema.js:259` `pipeline.run('assert-schema', …)`. Gate arms when the path is appended to `converted.json`. |

**Score today:** G1 ✅(1) + G4 ✅(2) + G5 ✅(1) = **4/17**, with G6/G7/G8 at zero. §6 threshold: *"Ship at ≥14/17 with G6, G7 and G8 full."*

## The 55-A "proven red" step

**Measured, not transcribed** — `node scripts/violations/plan-claims.mjs --self-test` prints
`SELF-TEST PASSED — 17 totality assertions incl. 4 negative controls (6 original + 11 K-axis)`, so the
generator's output is admissible per Spec 121 §12b.6's tooling gate.

* **Count:** `node scripts/violations/plan-claims.mjs --checklist` → headings `## 55-A — the hard
  per-conversion gate (44)` / `## 55-B — … (5)` / `## 55-C — DEFERRED, arming k named (6)`.
  Cross-checked structurally: `--json` filtered to `scope === 'PER_STEP'` gives **55**, splitting
  **k=PER_STEP 44 / k=MIXED 5 / k=FLEET 6**. **55-A = 44.**
* **K-axis (whole register):** `PER_STEP 229 · MIXED 48 · FLEET 13` (matches the S6a `[x]` item in the
  programme record).
* **Drift:** `diff <(node scripts/violations/plan-claims.mjs) docs/reports/generated/123-claim-plan.md`
  and the `--checklist` equivalent are empty **after dropping the generator's leading `SELF-TEST PASSED` stdout line** (Fold A caveat: the literal diff shows that 1 extra line) — committed artifacts are current.
* **⚠️ There is no `assert_schema` row.** The generator is claim-scoped, not step-scoped. Searching the
  generated artifacts (`grep -rn "assert_schema" docs/reports/generated/*.md`) returns exactly **one**
  hit — `123-claim-plan.md:89`, the C1 stage-table row. The "per-step checklist" is a **template** copied
  per conversion, which is what §5.2 says (*"Copy it into each conversion task"*). Any plan claiming a
  measured per-step claim row for `assert_schema` is claiming something the generator does not emit.

**The mechanism that turns them green — measured, single-valued.** All 55 PER_STEP claims name the same
test artifact: `src/tests/steps/<slug>/violations.test.ts`. For this pilot that is
**`src/tests/steps/assert_schema/violations.test.ts`**, which **does not exist** (`ls src/tests/steps` →
`No such file or directory`). `vitest.config.ts:20` includes `src/**/*.test.ts`, so the file is picked up
the moment it lands. Three mechanisms in total:

1. `src/tests/steps/assert_schema/violations.test.ts` — the 44 A items + the 5 B monotone partials.
2. `src/tests/step-conformance.infra.test.ts` — sibling-descriptor uniqueness (`:149` derives
   `<file>.slice(0,-3) + '.descriptor.json'`), AJV validation, `pg.Pool` require-probe, named exports,
   lock↔registry agreement, `checks.length > 0`, `loaded.length === converted.length`.
3. `scripts/hooks/check-step-shape.mjs` + `scripts/steps/_schema/converted.json` — the A2 shape gate,
   armed by appending `scripts/quality/assert-schema.js` in the final commit.

**⚠️ Vacuity risk on 7 of the 44.** Claims #30/#31/#33/#34/#35/#37/#38 are about `notes.json` (prose cap
12, "no overflow file", `blind_spots[].detected_by`, `measured{value,date,query}`). The draft descriptor
sets `"interpretation": "none"` and `scripts/quality/*.notes.json` does not exist, so those 7 are
**vacuously green**. Either author a real `assert-schema.notes.json` (the schema's `interpretation`
object requires `{file, entries}` with `entries ≤ 12`) or prove each red against a known-bad fixture.
Decide at commit 6, record the choice.

**The 6 55-C items are NOT gated here** — `#160 k=2 (C1)`, `#161 k=20 (C5)`, `#168 k=27 (C6)`,
`#177/#178/#179 k=27 (C5) and blocked on nock`. Verified live: **`nock` is not in `package.json` and not
in `node_modules`** — S6b must resolve it; no pilot-1 checkbox may claim them.

## The nine commits (Spec 123 §7)

Commit-message format enforced by `scripts/hooks/validate-commit-msg.sh`: `type(NN_spec): description`.

| # | Phase / Gate | Files touched | Test(s) | Commit message |
|---|---|---|---|---|
| **1** | PH-0 boundary freeze → **G0** | `docs/reports/2026-08-25-pilot1-assert-schema-boundary.md` | none (doc) — evidence is the grep transcript at 606 lines | `docs(122_step_optimization): C1 pilot 1 PH-0 - assert_schema boundary freeze re-derived at 606 lines` |
| **2** | PH-3 intent ledger → **G3** (mandatory: fence density 4 > 0) | same report + a Defect Ledger register file (G6 needs it) | none (doc); **a human adjudicates** per §7.1 | `docs(122_step_optimization): C1 pilot 1 PH-3 - intent ledger for 4 fences; AS-D1..D10 registered` |
| **3** | PH-5 seam map → **G5** | same report | none (doc) | `docs(122_step_optimization): C1 pilot 1 PH-5 - seam map (DB/clock/5 fetch sites/PIPELINE_CHAIN)` |
| **4** | PH-6 classification → **G6** | same report | none (doc) | `docs(122_step_optimization): C1 pilot 1 PH-6 - CONTRACT/INCIDENTAL/DEFECT, every defect ledger-IDed` |
| **5** | Golden master (4-tuple) → **G1′** | `scripts/analysis/capture-step-golden.js` (new) + `docs/reports/.../golden/{permits,coa,sources}.json` | the harness's own self-test | `feat(122_step_optimization): C1 pilot 1 - golden-master capture x3 chains + non-determinism inventory` |
| **6** | PH-7 test design + **prove red** → **G7** | `src/tests/steps/assert_schema/violations.test.ts`; 4 both-directions fence locks | `npx vitest run src/tests/steps/assert_schema/` — **must be RED** | `test(122_step_optimization): C1 pilot 1 PH-7 - 44 55-A violations + 5 partials + 4 fence locks (red)` |
| **7** | Descriptor (Fold A corrections 1–7) + compute extracted + **library growth** → **G2′** | `scripts/quality/assert-schema.descriptor.json` (new) · `scripts/lib/compute/assert-schema.js` (new) · `scripts/quality/assert-schema.js` (→ frozen shape, SPEC LINK kept) · **`scripts/lib/step/index.js`** (strand window: `require('../ledger-window')` + `finalizeStrandedRun` in `finally`) · **`scripts/lib/resolve-db.js`** (header cloud 237→ measured) · `src/tests/pipeline-advisory-lock.infra.test.ts` (regex widening) · `src/tests/quality-ledger-window.logic.test.ts` (re-home onto library) · the other 9 GO-RED sites across 5 files re-homed onto compute | `npx vitest run src/tests/step-conformance.infra.test.ts src/tests/pipeline-advisory-lock.infra.test.ts src/tests/quality.logic.test.ts` | `refactor(122_step_optimization): C1 pilot 1 - assert_schema to frozen shape; compute extracted verbatim` |
| **8** | Peel — one policy concern per commit, green diff after **every** peel | 8a gating · 8b verdict/audit (**closes AS-D1**) · 8c thresholds/checks | full differential re-run after each peel | `refactor(122_step_optimization): C1 pilot 1 peel a/b/c - <concern>` (three commits) |
| **9** | Differential + cutover → **G8, G4d, G-shape** | `scripts/steps/_schema/converted.json` (+1 entry) | `node scripts/hooks/check-step-shape.mjs` (must exit 0 with 1 enforced file) + differential green in all 3 chains | `feat(122_step_optimization): C1 pilot 1 cutover - assert_schema converted; shape gate armed (1/27)` |

> §7's note is load-bearing here: *"old and new are **the same file at two commits**, invoked identically
> by the same `spawnStepChild`."* Confirmed live — `run-chain.js:646` calls
> `spawnStepChild({ runtime, scriptPath, args: extraArgs, env: stepEnv, … })` with
> `stepEnv = { ...process.env, PIPELINE_CHAIN: chainId, ... }` (`:638`) and `extraArgs` empty for this
> step (manifest has no `chain_args`). Zero invocation divergence to normalise.

### Declared diffs the differential WILL show (state before capture, per §5.3)

| Diff | Old | New | Disposition |
|---|---|---|---|
| `PIPELINE_META.reads` | `{"CKAN API":["metadata"]}` (`:572-575`) | `{}` + `external: [ckan_datastore_api, …]` | **CONTRACT change** — `deriveMeta` reads `inputs.reads.externals` |
| `PIPELINE_META.writes` | `{"pipeline_runs":["checks_passed","checks_failed"]}` | `{}` | forced by `outputs: "none"` (normative for ASSERT) |
| `records_total` | `0` (`:571`) | `null` | forced by `counters: "none"`; in-chain the ledger is unchanged (run-chain COALESCEs) |
| log tag / banner | `pipeline.run('assert-schema', …)` (`:259`) | `pipeline.run('assert_schema', …)` — library passes `descriptor.identity.name` | INCIDENTAL; declare as a normalisation |
| DB target refusal | none (no `assertDbTarget` in the step — grep returns 0) | refuses below migration **33** / non-`postgres` | **NEW behaviour** from `database: {min_migration: 33, assert_current_database: "postgres"}` (Fold B: 241→33) |
| `on_check_error` | `:163` returns `true` silently on non-OK (omit) | descriptor `fail_step`; library `checkRow` returns a severity-status row on `{error}` | **inert at commit 7 iff compute never reports `{error}` for `permit_cost_type_sample`**; otherwise declare. Rewrite the fixture's `on_check_error_why` (describes omit_row) |
| `parcel_columns` in permits/coa | constant `0/PASS` rows (`:487-488`, `:510-511`; check gated at `:328`) | check selected in all 3 chains, compute reports constant `violations: 0` | **declared normalisation** — constant row, not a check execution (Fold B) |
| `permit_cost_type_sample` | blocking (`:308-311` → `:585`) | `blocking:true, when:"pre"` | **no diff — corrected descriptor** (`when` has no runtime consumer: `grep "\.when" scripts/lib/step/` → 0) |
| `network.timeout` | none (5 bare `fetch(`) | `"none"` | **no diff — declared, inert** (not read by `index.js`/`verdict.js`) |
| audit_table rows (all chains) | hand-written metric rows: `permit_columns_checked` INFO, `schema_mismatch_count`, `api_errors`, `parcels_other_errors`; threshold `== 0`; counts permits 5 / coa 5 / sources 2 / standalone 5 | rows keyed by `check.id` with `check.limit` (`viol == 0`); one PASS/FAIL row per selected check; counts permits 3 / coa 2 / sources 6 / standalone 9 | **STRUCTURAL to §5.1** (`verdict.js` keys every row by check id) — the observable half of AS-D6/AS-D7. Declared post-hoc from the commit-7 differential (Fold C). `sys_*` rows excluded. |
| lock-contention path | `:605` `return;` — **no emit at all** (AS-D9) | library emits a SKIP summary with a row-derived `audit_table` (`skipEmit: false`) **and writes `status = 'self_skipped'` — the first-ever writer of that value** (live DB: 0 rows) | **FIX** — points at `AS-D9`. Fold B ruling: keep `self_skipped` (ratified `RUN_STATUS` vocabulary; no DB CHECK). Consumers to enumerate + verify at commit 7: `/api/quality/route.ts` (`WHERE status = 'failed'` — unaffected), admin stats reaper (`stats/route.ts` stranded-`running` logic — must not treat `self_skipped` as stranded), `run-chain.js` COALESCE path, `FreshnessTimeline.tsx`. Per `tasks/lessons.md` this IS an API change to every status reader — listed, not hidden. |
| **PEEL 8a** — `parcel_columns` in permits/coa | compute reported a constant `{violations: 0}` WITHOUT fetching (the chain-gated source block never ran there) | the check is executed wherever the library SELECTS it; compute reads `stepCtx.checks`, never `chainId` | **FIX / declared (added at peel 8a)** — differential: **+2 stdout lines per ingest chain** (`  Fetching CSV headers for Parcels...` / `  OK: Parcels - all 4 expected columns present (6 total)`), permits 19->21 and coa 17->19 diffs; `sources`/`standalone` unchanged at 52/82. The audit row value is unchanged (`parcel_columns` 0/PASS) so `records_meta` does not move. Cost: one extra ranged GET (`bytes=0-2048`) per ingest chain. Gain: a parcels drift is no longer invisible on permits/coa, where the row previously said `0` without looking. Closes the Fold B constant-row fiction; no AS-D id (the fiction was created by Fold B, not by the pre-conversion step). |
| **PEEL 8c** — compute narration | `console.log` / `console.error` / `console.warn` straight to the process stdout, as plain text (`  OK: Building Permits - ...`) | the same messages through the injected `ctx.log` seam, so they land as the pipeline's structured lines (`{"level":"INFO","msg":"OK: Building Permits - ...","tag":"[assert_schema]"}`) | **INCIDENTAL / declared (added at peel 8c)** - required by Spec 122 §5.5 (2)(3): a compute with a bare `console.*` cannot be silenced or captured by its caller, which is why the step test had to monkey-patch the global. Message TEXT is preserved verbatim (the two leading spaces are dropped); the banner's blank padding lines go. Differential: **no new diff keys** - permits 21 / coa 19 / sources 52 / standalone 82, identical counts to peel a/b; what changed is the VALUE of the already-declared `stdout_lines[*]` rows. `records_meta`, `audit_table` rows, exit codes and verdicts are untouched. `sys_*` and marker lines (`PIPELINE_SUMMARY`/`PIPELINE_META`) are library-emitted and unaffected. |

## Shared-step rule

`assert_schema` appears in **3 chains** (measured from `scripts/manifest.json`):
`permits` (33 steps, index 0), `coa` (16 steps, index 0), `sources` (28 steps, index 1 — behind the new
`reconcile` head step from S3-A3). It appears in **zero** of `entities`, `wsib`, `deep_scrapes`.

Per the S2-min item in the programme record, *"a shared pilot's differential must be green in **every
chain it appears in** even at C1."* Mechanism, all three verified in code:

* Selection: `scripts/lib/step/verdict.js` → `selectChecks(descriptor, chainId)` filters on
  `check.chains` **only when** `sharing.varies_by_chain.checks === 'per_chain'`. The draft descriptor sets
  exactly that; after Fold B's `parcel_columns` widening the 9 checks select as `permits:3 / coa:2 / sources:6` (overlapping). A standalone run (no chain)
  runs **all 9** — deliberate, per the function's own doc comment.
* Phase: `resolvePhase()` reads the explicit map `{"permits":1,"coa":1,"sources":1}` — never a ternary.
* **The differential command, per chain** (there is no `--only` flag in `run-chain.js`; `--manifest=` is
  documented at `:233-236` as TEST-ONLY):
  ```
  PIPELINE_CHAIN=permits node scripts/quality/assert-schema.js
  PIPELINE_CHAIN=coa     node scripts/quality/assert-schema.js
  PIPELINE_CHAIN=sources node scripts/quality/assert-schema.js
  ```
  This reproduces `spawnStepChild` exactly. Capture the 4-tuple at each, before and after.
* Plus one standalone run (`PIPELINE_CHAIN` unset) — it takes a different ledger path
  (`ownsLedgerRow(null) === true`), so it is a fourth capture, not a fourth chain.

## ⚠️ Decision item for the operator — `permit_cost_type_sample`

`docs/reports/review_followups.md` (§`Spec 122 §S2-min`) defers a MED: a **non-blocking FAIL** is invisible
to `/api/quality`, because `run-chain.js:732` (Fold A: was cited `:731`) writes the literal `status = 'completed'` and
`src/app/api/quality/route.ts:98` selects `WHERE status = 'failed'`. Both anchors verified live. The
followup says it *"must be resolved BEFORE any pilot declares a non-blocking FAIL check."*

**⚠️ The premise is refuted by the code, and this changes the decision.** The draft descriptor declares
`permit_cost_type_sample` with `"severity": "FAIL", "blocking": false` — but **today the check is
blocking**: `assert-schema.js:308-311` sets `allPassed = false` on failure, which reaches the circuit
breaker at `:585` (`if (!allPassed) throw`) and halts the chain. Shipping `blocking: false` would be a
**silent behaviour change smuggled inside a "genuine no-op diff"** (§7 commit 7).

| Option | What it means | Consequence |
|---|---|---|
| **(a) Defer + file followup** — *and correct the descriptor to `blocking: true`* | PIN, don't FIX (Spec 123 §3.1). The descriptor states what the code does. | The `/api/quality` blocker **never arises at pilot 1**, because no non-blocking FAIL is declared. Commit 7 stays a true no-op. The followup stays open for the first step that genuinely wants one. |
| **(b) Resolve `/api/quality` now** | Either `/api/quality` also reads `records_meta.audit_table.verdict` (mirroring `FreshnessTimeline.tsx:329-336`), or run-chain derives its status literal from the verdict — the latter **is** claim #39's ledger consolidation | Drags a Cross-Domain admin change and an S2 growth-wave item into pilot 1, breaking the WF2 single-domain boundary and inflating the diff the panel must review. |

> **Recommendation: (a).** The descriptor must match the code before it may deviate from it — declaring
> `blocking: false` on a check that halts today is exactly the §1 failure shape Spec 122 exists to end
> (*"the descriptor would say one thing and the code would do another"*).

## Standards Compliance

* **Try-Catch Boundary:** No API route touched — N/A for §11's route block. The step's boundary is
  `scripts/lib/step/index.js`'s `try/catch/finally` in `runWithPool`; the ledger row is finalized in the
  `finally`. ⚠️ **`scripts/lib/step/` does not reference `finalizeStrandedRun` or `ledger-window`
  (grep: 0 hits)** — the P3 strand window that `f32b1485` added to this very file (`:594-601`) has **no
  home in the library**. Fold A decision: the library gains it at commit 7; the lock re-homes onto `index.js`. Regression Guardian verifies the `finally` semantics match `:594-601`.
* **Unhappy Path Tests:** every declared check ships a must-fail fixture (55-A #165); the 4 fence locks are
  proven in **both** directions (G4d); the known-bad shape fixtures under
  `scripts/steps/_schema/fixtures/shape/` are already asserted to FIRE by `step-conformance.infra.test.ts`
  (measured: `RED — a spread descriptor is caught by the shape rule and by NOTHING ELSE` passes today).
  Unhappy paths in scope: CKAN non-OK response · empty CSV header · unreachable ZIP · lock contention ·
  ledger INSERT failure · below-floor database.
* **logError Mandate:** **N/A for `scripts/`** — the corpus uses `pipeline.log.*` and `logError` is 0/27
  (the programme record's Standards block says the same). The library uses `pipeline.log.error/warn`.
* **UI Layout:** **N/A** — no `src/` component or route is modified. (If option (b) were chosen, this
  would flip to Cross-Domain and stop being N/A — a further argument for (a).)
* **Database Impact:** **NO** — no migration. `pipeline_runs` writes are pre-existing bookkeeping.
* **Cross-Layer Contracts (§11, always applies):** the step introduces no new numeric threshold crossing
  spec↔SQL↔Zod↔migration. The status vocabulary **is** a cross-layer contract — `RUN_STATUS` in
  `scripts/lib/step/ledger.js` vs `/api/quality/route.ts:98`'s `WHERE status = 'failed'`; per
  `tasks/lessons.md` (*"A new terminal status is an API change to every consumer that reads status"*), no
  new status value may be introduced by this pilot. It does not: `completed_with_warnings` and
  `self_skipped` already exist in the enum.

## Panel plan (CLAUDE.md → "Panel sizing")

**PLAN altitude (run BEFORE code, per `scripts/CLAUDE.md` "Two altitudes", Spec 08 §6.4):**
1. **Integration** (`general-purpose`, main tree, NO worktree) — manifest/chain wiring, `spawnStepChild`
   argv/env, `pipeline.step` export surface, the 13 source-text test sites.
2. **Ground-truth** (grounder) — re-executes every executable claim in this plan.
3. **Descriptor-vs-schema** (NOT the Spec 08 seat) — the draft descriptor vs `step.schema.json` + live code.
3b. **Schema-Fidelity (Spec 08 §5.4, live DB)** — every `pipeline_runs`/`schema_migrations` column the old step, `ledger.js`, `index.js`, `run-chain.js` read/write.
4. **Reality-Check** — **NOT RUN.** Trigger is *"the diff adds/changes an enriched parcel field."* Measured:
   this step writes **zero domain tables** (`grep` for INSERT/UPDATE returns only `pipeline_runs`) and
   `outputs: "none"`. **No enriched field changes.**

**OUTPUT altitude (on the diff + re-run values) — pipeline WF2 = 5-reviewer + Regression Guardian:**
1. Bash: `npm run review:gemini -- review scripts/quality/assert-schema.js --context docs/specs/01-pipeline/122_pipeline_step_optimization.md`
2. Bash: `npm run review:deepseek -- review scripts/lib/compute/assert-schema.js --context docs/specs/01-pipeline/123_step_opt_assessment_validation.md`
3. Agent `code-reviewer-grounded`, worktree — spec conformance / code quality.
4. Agent `observability-reviewer`, worktree — audit-row completeness, verdict cascade
   row-derived (AS-D1), §11 counter scoping, `records_meta` producer/consumer contracts.
5. Agent `general-purpose`, NO worktree — **Integration** vs the real codebase.
6. Agent `regression-guardian`, **main tree** (fires: WF2 alters existing
   code by definition). Anchored on the 4 `Severity:`-footer fences, `finalizeStrandedRun` in `index.js` `finally` matching `:594-601` semantics, the
   13 source-text assertion sites, and `tasks/lessons.md` (script-must-be-run-live; status-vocabulary).
7. **Reality-Check: N/A** — no enriched field changes (justified above).

Then **Fold Validation** (Spec 08 §11.2): Backend/Pipeline ⇒ **mandatory** — one grounder re-executes every
claim in the fold, plus one Cross-read Adversary checking folded decisions pairwise.

## Contradictions / unverifiable

| # | Item | Evidence | Status |
|---|---|---|---|
| 1 | Spec 122 §4.1 says the descriptor is **13 categories**; §1.2/§1.3 say **17, "set in stone"**; `step.schema.json` has **18 required** top-level keys | `node -e` dump of `schema.required` → 18 (`…, config, sharing, terminals`) | **CONFLICT.** R2 makes the schema canonical — the spec prose is stale. Do not author against §4.1. |
| 2 | §4.1 gives the path as `scripts/<slug>.descriptor.json` | real file is `scripts/quality/assert-schema.js`; `step-conformance.infra.test.ts:149` derives `<file>.slice(0,-3)+'.descriptor.json'` | **CONFLICT.** Correct target is `scripts/quality/assert-schema.descriptor.json` (nested dir; **hyphen** basename, not the underscore slug). The fixture is named `assert_schema.descriptor.json` — do not copy the name. |
| 3 | Spec 123 §6.1 G-shape cites the shape rule as *"Spec 122 §4.1"* | the rule is in §5.1; §4.1 is "Three files, one slug" | **Doc error.** Harmless but must not be followed literally. |
| 4 | Spec 122 §5.4 says the widening is *"one-line … at `pipeline-advisory-lock.infra.test.ts:259-260`"* | measured: `describe` at `:258`, assertion `toContain('withAdvisoryLock')` at `:264-265`; the `:246-253` and `:289-296` loops stay green | **Line drift.** The instruction is right, the coordinates are not. |
| 5 | Draft descriptor: `permit_cost_type_sample` `blocking: false` | code: `:308-311` sets `allPassed = false` → `:585` throws | **CONFLICT — the operator decision item.** Descriptor contradicts the code it describes. |
| 6 | Descriptor `outputs: "none"` / `counters: "none"` | code emits `emitMeta(..., {"pipeline_runs":[…]})` at `:572-575` and `records_total: 0` at `:571` | **CONFLICT resolved by the contract** (ASSERT must declare `outputs:"none"`), but it makes commit 7 **not** a byte-identical no-op. Must be a declared normalisation before capture. |
| 7 | `finalizeStrandedRun` / `ledger-window` (P3, `f32b1485`) | `grep -rn "finalizeStrandedRun\|ledger-window" scripts/lib/step/` → **0 hits** | **RESOLVED by Fold A** — library gains the window at commit 7; lock re-homed. |
| 8 | `identity.gate_exempt` is "an explicit schema field" replacing `run-chain.js` name-prefix dispatch | `grep -rn "gate_exempt" scripts/ src/` → only schema + fixtures, **no runtime consumer**; `run-chain.js:547` still `slug.startsWith('assert_')` | **DECLARED BUT INERT** at pilot 1. Not a pilot-1 blocker; must not be claimed as closed. |
| 9 | S4 migration numbers | generator prints `S4 | State tables (migrations **245-248**)`; `.cursor/active_task.md` S4 says **246–249**, *"245 consumed by P1's centroid invalidator"* | **CONFLICT between the generator and the programme record.** Out of pilot-1 scope but it will re-emit on every regeneration. |
| 10 | Stryker surface | `00_engineering_standards.md:381` — *"The 4 high-stakes pure modules (… `builder-query.ts`) … ≥ 50%"*; `stryker.config.mjs` `mutate:` = **3 files**, `break: 75`, with a comment saying `builder-query.ts` was deleted | **CONFIRMED doc drift** (Spec 123 §4.8 already flags it). G7's mutation clause is unsatisfiable for `scripts/` either way. |
| 11 | The 2026-08-23 assessment as an inheritable G0/G3/G6 | report says **571 lines / 10 `try` blocks**; measured **606 lines / 13 `try` blocks**; `f32b1485` landed after | **STALE.** Its *classifications* (D1/D7/D9 re-verified live at `:546`, `:527`, `:605`) hold; its *line numbers and counts* do not. |
| **U1** | **UNVERIFIABLE:** G8 differential, live migration count, and any `/api/quality` runtime behaviour | DB probe permission-denied in the planning session | **NOT MEASURED.** No number about the live DB appears anywhere in this plan. |
| **U2** | **UNVERIFIABLE:** G1's *"20% change coupling"* and G2's churn×complexity quadrant | no generator or artifact exists (`ls scripts/analysis` has no churn/complexity tool) | **NOT MEASURED — a real work item, not a formality.** |
| **U3** | 55-A per-step rows for `assert_schema` | the generator emits a claim-scoped register and a step-agnostic template; `grep -rn "assert_schema" docs/reports/generated/*.md` → 1 hit (a stage-table row) | **NOT PRODUCIBLE.** "The assert_schema rows" do not exist as generator output; 44 is the template's A-block size. |

## Execution Plan
- [ ] **State Verification:** DB unreachable in the planning session — re-run the three per-chain captures against the authoritative DB (print host + database first, per `tasks/lessons.md`) before commit 5.
- [ ] **Contract Definition:** N/A — no API route altered. Descriptor↔schema contract validated by `validateDescriptor` before compute; `npm run typecheck` after the test re-homing in commit 7.
- [ ] **Spec Update:** amend Spec 122 §4.1 (13→18 categories; nested/hyphenated descriptor path) and §5.4 (line coordinates), and Spec 123 §6.1 (§4.1→§5.1). Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — Database Impact NO, no migration.
- [ ] **Guardrail Test:** `src/tests/steps/assert_schema/violations.test.ts` — 44 A items + 5 B partials + 4 both-directions fence locks.
- [ ] **Red Light:** `npx vitest run src/tests/steps/assert_schema/` must FAIL before commit 7. Record the red set.
- [ ] **Implementation:** commit 7 = frozen-shape wrap + library strand window + declared descriptor corrections (every non-identical output is a row in the Declared-diffs table — nothing undeclared); commit 8 = three peels; green differential after each.
- [ ] **UI Regression Check:** N/A — no shared component modified; no `src/` component in the diff.
- [ ] **Pre-Review Self-Checklist:** 5–10 items from Spec 122 §5.1/§5.2 walked against the ACTUAL diff, PASS/FAIL each, BEFORE running tests.
- [ ] **Multi-Agent Review:** the 5-reviewer panel + Regression Guardian in ONE message (roster above). Reality-Check explicitly N/A — no enriched field changes.
- [ ] **Fold Validation:** mandatory (Backend/Pipeline) — grounder re-executes every claim in the fold + Cross-read Adversary pairwise.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` + `node scripts/hooks/check-step-shape.mjs` (must report **1** enforced file, exit 0) + the three per-chain differentials green. Baseline to beat, measured in the planning session: `npx vitest run src/tests/quality.logic.test.ts src/tests/quality-ledger-window.logic.test.ts src/tests/pipeline-advisory-lock.infra.test.ts src/tests/chain.logic.test.ts src/tests/pipeline-sdk.logic.test.ts` → **928 passed / 5 files**; and the four step files → **111 passed / 4 files**. → WF6.

**PLAN COMPLIANCE GATE (§11):** Database Impact **NO** (no migration) · Pipeline Script Modified **YES** — uses the SDK via `pipeline.step()`, streaming N/A (zero DB reads) · Shared Logic Touched **YES** (`scripts/lib/step/`, 3 chains) — dual-path consumers identified, `npx vitest related` planned · Cross-Layer Contracts: no new threshold; status vocabulary unchanged · UI/Frontend blocks N/A · Pre-Review Self-Checklist scheduled.
