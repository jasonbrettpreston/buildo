# Active Task: WF3 Matrix Hard-Stop Remediation (Rules 10-12 output panel)
**Status:** Implementation

## Context
* **Goal:** Operator-ruled remediation, one-finding-per-WF3, after the Rules 10-12 output panel: (1) ground link_wsib's Rule 4/G-2 ungrounded rows, (2) Rule 11 order_guarantee observability on the runtime audit row, (3) a committed lock proving `checkVerdictSingleSource`/`checkNoSecondDerivation` catch an unsanctioned verdict cascade, (4) wire an unpinned `enforced-red` policy-matrix row into `step:validate`'s `hardStop`.
* **Target Spec:** `docs/specs/01-pipeline/124_step_standard_policy.md` (Rules 4, 10, 11, 13); Spec 48 §3.6/§3.10-style key registry.
* **Key Files:** `scripts/analysis/step-validate.mjs`; `scripts/lib/step/verdict.js`; `docs/reports/2026-08-28-pilot4-link-wsib-assessment.md`; `docs/reports/defect-ledger.md`; `src/tests/step-conformance.infra.test.ts`.

## Technical Implementation
* **New/Modified Components:** `computeScorecard`/`computePolicyMatrix` (hard-stop wiring), `checkRow` (verdict.js, `order_guarantee` passthrough), a new conformance lock fixturing an unsanctioned verdict site.
* **Data Hooks/Libs:** none (tooling + docs).
* **Database Impact:** NO.

## Standards Compliance
* **Try-Catch Boundary:** N/A (tooling).
* **Unhappy Path Tests:** both-directions self-tests for the hard-stop wiring (unpinned red -> stop; pinned red -> no stop; green -> no stop) and for order_guarantee (declared -> present; undeclared -> absent).
* **logError Mandate:** N/A.
* **UI Layout:** N/A.

## Execution Plan
- [x] Commit 1 — link_wsib Rule 4 grounding: 2 of 4 ungrounded rows cited in place (`30ff8805`, `b71db6e0`); 2 rows (`a81c6a7c`, `76dcca28`) premise-refuted, reported not retired per explicit operator instruction; GAP G-2 count updated in Spec 124; `LW-D21` filed PIN; scorecard `--write`d. Landed `11691609` (pre-commit hook flaked ~7x with a Tinypool "Worker exited unexpectedly" crash reproducible even outside git via `npm run lint && npm run test` in one shell — content-independent, confirmed by 3 clean standalone `npm run test` runs; landed via a bounded retry loop).
- [x] Commit 2 — Rule 11 observability: `order_guarantee` on the runtime audit row (`verdict.js#checkRow`), Spec 48 §3.11 key registration, both-directions logic test. Landed `bef5cfc1`.
- [x] Commit 3 — Rule 10 lock: `BUILDO_VERDICT_CORPUS_EXTRA` additive test-only override + committed fixture (`scripts/steps/_schema/fixtures/verdict-corpus/unsanctioned-cascade.js:31`), both-directions conformance test asserts `unsanctioned...file:line` and the 2 sanctioned sites still pass with no override.
- [ ] Commit 4 — Hard stop: unpinned `enforced-red` matrix row -> `hardStop = true` with rule number in reason; self-test both directions; Spec 124 Rule 13 gains one sentence; regenerate all 8 scorecards `--all --write`.

## Operating Boundaries
* **Target Files:** as listed above.
* **Out-of-Scope Files:** compute files, unconverted step scripts.
* **Cross-Spec Dependencies:** Spec 123 §3.1/§4.4; Spec 48 §3.6.
