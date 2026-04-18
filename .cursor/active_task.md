# Active Task: Tier 3 CQA entity tracing + wire assert-lifecycle-phase-distribution
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `52ad6527` (52ad652712692dead5520d97866a754dae76a481)

---

## Context
* **Goal:** Two related CQA additions that close the "did new records actually make it through the pipeline?" gap:
  1. Wire the existing `scripts/quality/assert-lifecycle-phase-distribution.js` into the permits chain (step 22, after `classify_lifecycle_phase`) and the CoA chain (step 11, after `classify_lifecycle_phase`).
  2. Create a new Tier 3 CQA script `scripts/quality/assert-entity-tracing.js` that checks whether permits ingested in the last 26 hours have expected downstream rows in all 5 enrichment tables, appended as the final step of the permits chain.
* **Target Spec:**
  - `docs/specs/pipeline/41_chain_permits.md` (permits chain — primary)
  - `docs/specs/pipeline/42_chain_coa.md` (CoA chain — secondary)
  - `docs/specs/pipeline/47_pipeline_script_protocol.md` (new script skeleton requirements)
* **Key Files:**
  - `scripts/manifest.json` — step registration + chain arrays
  - `scripts/quality/assert-lifecycle-phase-distribution.js` — already written, just needs wiring
  - `scripts/quality/assert-entity-tracing.js` — NEW FILE
  - `docs/specs/pipeline/41_chain_permits.md` — update to 26-step chain
  - `docs/specs/pipeline/42_chain_coa.md` — update to 11-step chain
  - `src/tests/chain.logic.test.ts` — add guardrail tests for new wiring

---

## Technical Implementation
* **New/Modified Components:**
  - `scripts/quality/assert-entity-tracing.js` *(new)* — Tier 3 CQA. Read-only. Non-halting (observational, emits FAIL to audit_table but does not throw). Checks permits with `created_at >= NOW() - INTERVAL '26 hours'` for presence of rows in: `permit_trades`, `cost_estimates`, `trade_forecasts`, `lifecycle_phase`, `opportunity_score`. Emits one audit row per table with coverage %, overall verdict, and `records_total` = count of new permits in window.
  - `scripts/manifest.json` *(modified)* — Register `assert_lifecycle_phase_distribution` + `assert_entity_tracing` in `m.scripts`. Add `assert_lifecycle_phase_distribution` at position 22 in permits chain (after `classify_lifecycle_phase`) and at position 11 in CoA chain. Add `assert_entity_tracing` at position 26 (final) in permits chain.
* **Data Hooks/Libs:** Pipeline SDK (`scripts/lib/pipeline.js`) — `pipeline.run`, `emitSummary`, `PIPELINE_META`.
* **Database Impact:** NO — both scripts are read-only against existing tables. No migrations, no schema changes.

---

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes created/modified.
* **Unhappy Path Tests:** Tests cover: chain manifest has both new slugs in correct positions; assert-entity-tracing.js does not throw on coverage failures (non-halting contract); assert-entity-tracing.js uses `pipeline.run()` (not hand-rolled connection).
* **logError Mandate:** N/A — no API catch blocks. Pipeline script errors handled by Pipeline SDK.
* **Mobile-First:** N/A — backend-only changes.

---

## Execution Plan

- [ ] **State Verification:** Confirm `assert_lifecycle_phase_distribution` is absent from manifest.json `m.scripts` and both chain arrays. Confirm `scripts/quality/assert-lifecycle-phase-distribution.js` exists and is functional. Confirm existing permits chain is 24 steps, CoA chain is 10 steps.

- [ ] **Contract Definition:** N/A — no API routes modified. Confirm: `assert-entity-tracing.js` will emit `PIPELINE_META` + `PIPELINE_SUMMARY` per §47 protocol. `records_total` = new permit count. Each of 5 downstream tables emits one named audit row with `coverage_pct` and `PASS`/`FAIL` verdict. Non-halting: no throw on FAIL.

- [ ] **Spec Update:** Update `docs/specs/pipeline/41_chain_permits.md` to show 26-step chain with `assert_lifecycle_phase_distribution` at step 22 and `assert_entity_tracing` at step 26. Update `docs/specs/pipeline/42_chain_coa.md` to show 11-step chain with `assert_lifecycle_phase_distribution` at step 11. Run `npm run system-map`.

- [ ] **Schema Evolution:** NO database impact. No migrations. No `db:generate` required.

- [ ] **Guardrail Test:** Add to `src/tests/chain.logic.test.ts` in a new `§ Entity Tracing + Phase Distribution Wiring` describe block:
  1. `manifest: assert_lifecycle_phase_distribution is in permits chain at position after classify_lifecycle_phase`
  2. `manifest: assert_lifecycle_phase_distribution is in coa chain as final step`
  3. `manifest: assert_entity_tracing is in permits chain as final step`
  4. `assert-entity-tracing.js: uses pipeline.run() not a hand-rolled pool`
  5. `assert-entity-tracing.js: does not throw on FAIL (non-halting / observational)`

- [ ] **Red Light:** Run `npx vitest run src/tests/chain.logic.test.ts` — all 5 new tests MUST fail before implementation.

- [ ] **Implementation:**
  1. Create `scripts/quality/assert-entity-tracing.js` per §47 skeleton (SPEC LINK header, `pipeline.run()`, `emitSummary()`, `PIPELINE_META`). Query pattern: one SQL per downstream table counting `new_permit_count` vs `matched_count`. Thresholds: permit_trades ≥95%, cost_estimates ≥90%, trade_forecasts ≥90%, lifecycle_phase ≥95%, opportunity_score ≥90%. Emit verdict row per table. No `withAdvisoryLock` (read-only, no lock conflicts possible).
  2. Edit `scripts/manifest.json`: add `assert_lifecycle_phase_distribution` and `assert_entity_tracing` to `m.scripts` map; splice `assert_lifecycle_phase_distribution` into permits array at index 21 (after `classify_lifecycle_phase`); append `assert_entity_tracing` to permits array; append `assert_lifecycle_phase_distribution` to coa array.

- [ ] **UI Regression Check:** N/A — no shared UI components modified.

- [ ] **Pre-Review Self-Checklist:** Before Green Light, generate 5-10 items from §47 script protocol and §41/42 chain specs. Walk each item against the actual diff. Output PASS/FAIL per item in the response before running tests.

- [ ] **Adversarial Review — Gemini:** Spawn Gemini review agent. Provide: spec paths (`41_chain_permits.md`, `42_chain_coa.md`, `47_pipeline_script_protocol.md`), list of modified files, 1-sentence change summary. Agent generates its own evaluation checklist and returns PASS/FAIL with line numbers.

- [ ] **Adversarial Review — DeepSeek:** Same inputs as Gemini review. Independent evaluation. Compare findings with Gemini output.

- [ ] **Independent Code Review Agent:** Spawn with `isolation: "worktree"`. Provide spec paths + modified files + 1-sentence summary. Agent reads spec Behavioral Contract / Operating Boundaries, reads modified files in full, generates its own checklist (NOT the implementor's), and returns structured report with PASS/FAIL counts and specific gaps with line numbers.

- [ ] **WF3 Triage:** For any FAIL items from adversarial or independent review: if fixable in scope → fix immediately and re-run tests. If out of scope → file in `docs/reports/review_followups.md` with severity and spec reference. Re-run `npm run test` after any fixes.

- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All tests must pass. Output ✅/⬜ execution summary for every step above. → WF6.
