# Active Task: WF3 #realtor-backfill — Fix `backfill-realtor-permit-trades` (3 bundled findings)
**Status:** Done (committed 2026-05-11 — 4 findings fixed + 5 R8 review fixes applied + Spec 41/86/91/95 amendments + lessons.md)
**Workflow:** WF3 (Bug fix — bundled per user override; one root cause: "script merged but never verified end-to-end before chain orchestrator could touch it")
**Domain Mode:** Backend/Pipeline (`scripts/`, `scripts/manifest.json`, infra tests, spec amendments) — `scripts/CLAUDE.md` ✓ + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (§R1–R12, §R2 lock ID convention) ✓ + `docs/specs/03-mobile/91_mobile_lead_feed.md` §3.5 (item 4 contract) ✓ + `docs/specs/03-mobile/95_mobile_user_profiles.md` §2.5.1 (persona vs trade_slug separation) ✓
**Rollback Anchor:** `ada49fb` (current HEAD on `main` — WF1 #B lifecycle.timeline[] data layer + 84-W4 closure)
**Multi-Agent Review:** REQUIRED — Gemini + DeepSeek + worktree code-reviewer in parallel post-Implementation. *WF3 default cadence is worktree-only; opting into adversarial models because (a) the user has consistently emphasized review depth across this and the parent WF, (b) the bundle is 3 findings touching the chain orchestrator + locking subsystem + INSERT discipline, (c) the original realtor-backfill merge that introduced these findings would have been caught by WF1's standard adversarial cadence.*

---

## Context

* **Goal:** Make the realtor backfill script actually work end-to-end. The script exists (`2901fcd`) and has correct 3-axis gating (WF3 `779ec88`), but it has never produced a single `permit_trades` row in the live DB. Three independent bugs prevent it. Fix all three in one commit because they share one root cause and Findings 2+3 are inextricably coupled (manifest registration unavoidably surfaces the lock collision via Bundle G uniqueness test).

* **Why now:** WF1 #C (Cycle 7 admin Lifecycle Timeline panel UI + Maestro coverage) is parked at `.cursor/queued_task_wf1c_admin_inspector_ui.md` because its planned Maestro flow asserts a non-empty realtor feed end-to-end — currently impossible. This WF3 is the precondition.

* **Three findings (R2 will reproduce each):**
  1. **`lead_score: NULL` crashes the INSERT.** `scripts/backfill-realtor-permit-trades.js:142` writes `NULL` for `phase` and `lead_score`, but `permit_trades.lead_score` is `INTEGER NOT NULL DEFAULT 0` per `migrations/006_permit_trades.sql:14`. The explicit NULL overrides the column default and trips PG `23502` ("null value in column violates not-null constraint"). The transaction rolls back; zero rows persist; the script reports "Inserted 0 new rows" silently because the rollback aborts the loop early but PIPELINE_SUMMARY still emits success.
  2. **Script not in `scripts/manifest.json`.** Therefore not in the `permits` chain. Therefore the chain orchestrator never invokes it. Therefore even if Finding 1 were fixed, the script would only run when invoked manually. Spec 91 §3.5 item 4 mandates "recurring job or pipeline trigger; mechanical; idempotent" — manual invocation does not satisfy that.
  3. **Advisory lock 91 collision with `link-massing.js`.** Both scripts declare `ADVISORY_LOCK_ID = 91`. The Bundle G uniqueness test (`src/tests/pipeline-advisory-lock.infra.test.ts:147–164`) iterates only scripts present in `manifest.json` — so the collision is currently invisible. Fixing Finding 2 (manifest registration) would surface the collision and break the test. Per the WF1 #B precedent for `compute-phase-calibration` (owning spec 84, but lock 84 was taken by the ledger writer; registry assigned 93), the right fix is to assign the realtor backfill a free ID and document why — link-massing's 91 is part of the deliberate "Wave 2 — Link" sequential numbering (90, 91, 92, 94) and not a candidate for reassignment in this WF3.

* **Target Specs (amendments planned in R5):**
  - **Spec 91 §3.5** (item 4 status note) — flip from "pending" to "shipped (WF3 2026-05-09)"; record the free-ID assignment.
  - **Spec 95 §2.5.1** — refresh the realtor wire-up dependency note ("backend wire-up of the 'realtor' trade row + permit_trades association is pending — see Spec 91 §3.5") with a status update.
  - **Spec 41 (`docs/specs/01-pipeline/41_chain_permits.md`)** — chain table grows from 29 to 30 steps; all step numbers after the new insertion point shift by +1.
  - **Spec 86 §4** — chain table mirror; same shift.
  - **Spec 47** — no protocol change (Spec 47 already mandates the verification this script skipped). A short lessons-learned note will be added to `tasks/lessons.md` (per CLAUDE.md §8) instead — "merge-without-end-to-end-run" pattern. The lesson-routing protocol per `docs/specs/00-architecture/05_knowledge_operating_model.md` §7 calls for this kind of pattern to live in `lessons.md`, not the protocol spec itself.

* **Key Files:**
  - **MODIFY** `scripts/backfill-realtor-permit-trades.js` — Finding 1 (omit `lead_score` from the INSERT to let `DEFAULT 0` apply; same treatment for `phase` since the realtor row's phase is denormalized — neither field carries a meaningful value for realtor rows) + Finding 3 (lock ID 91 → 114).
  - **MODIFY** `scripts/manifest.json` — Finding 2: add `backfill_realtor_permit_trades` entry + insert into the `permits` chain between `classify_permits` and `compute_cost_estimates`.
  - **MODIFY** `src/tests/pipeline-advisory-lock.infra.test.ts` — Bundle G registry: add `'scripts/backfill-realtor-permit-trades.js': 114`.
  - **MODIFY** `src/tests/backfill-realtor-permit-trades.infra.test.ts` — extend with regression-locks for Finding 1 (no NULL-write to lead_score) + Finding 3 (lock id is 114).
  - **MODIFY** `src/tests/chain.logic.test.ts` — chain-step count assertion: 29 → 30; new step row at the insertion position.
  - **MODIFY** `src/tests/quality.logic.test.ts` — chain-step count assertion mirror; same shift.
  - **MODIFY** `src/tests/assert-global-coverage.infra.test.ts` — chain-step count assertions (Spec 41 / Spec 86 step count: 29 → 30).
  - **MODIFY** `src/components/FreshnessTimeline.tsx` (PIPELINE_REGISTRY) — add the new step.
  - **MODIFY** `src/lib/admin/funnel.ts` (STEP_DESCRIPTIONS + table mapping) — add the new step.
  - **AMEND** `docs/specs/01-pipeline/41_chain_permits.md`, `docs/specs/02-web-admin/86_control_panel.md` §4, `docs/specs/03-mobile/91_mobile_lead_feed.md` §3.5, `docs/specs/03-mobile/95_mobile_user_profiles.md` §2.5.1.
  - **APPEND** `tasks/lessons.md` — one short lesson on the "merged-but-never-end-to-end-verified" failure pattern.

## Technical Implementation

* **New/Modified Components:** N/A (no UI; all backend/pipeline + tests + docs).
* **Data Hooks/Libs:** `scripts/backfill-realtor-permit-trades.js` is the only logic file changed. `phase` + `lead_score` columns are dropped from the INSERT column list — DEFAULT propagation from the schema is the canonical pattern (seen across `compute-cost-estimates.js`, `compute-trade-forecasts.js`, etc.). Alternative ("write literal `0` for lead_score, literal `NULL` for phase") was considered and rejected — the omit-and-default approach is more declarative and the schema is the source of truth.
* **Database Impact:** NO migration. The fix is purely script-side; the schema's `DEFAULT 0` was correct from mig 006.
* **Operator runbook (in commit message):** After deploy, run `node scripts/backfill-realtor-permit-trades.js` manually once to backfill all currently-active permits. Subsequent runs are folded into the permits chain at the new position, so this manual step is not needed again.

## Standards Compliance

* **Try-Catch Boundary:** N/A (no API routes; pipeline script error handling already routes through `pipeline.run` per Spec 47 §R6).
* **Unhappy Path Tests:** Finding-1 regression-lock (no NULL writes to `lead_score`); Finding-3 regression-lock (lock id is 114; collision with link-massing's 91 cannot recur without breaking the Bundle G uniqueness test); Finding-2 regression-lock (manifest entry exists + chain position correct).
* **logError Mandate:** N/A (script-side; `pipeline.log.warn/error` already used per existing pattern).
* **UI Layout:** N/A.

## Execution Plan

- [ ] **R1 — Domain mode + spec reads.** Confirmed above.

- [ ] **R2 — Reproduce all 3 findings.**
  - Finding 1: Re-run `node scripts/backfill-realtor-permit-trades.js` and capture the `23502` error output (already done at audit; pin a screenshot/excerpt in the active task notes).
  - Finding 2: `Grep` `manifest.json` for `backfill_realtor` (zero matches confirmed at audit).
  - Finding 3: `Grep` for `ADVISORY_LOCK_ID = 91` across `scripts/` (two matches confirmed at audit: link-massing.js + backfill-realtor-permit-trades.js).
  - Verify the live DB has 0 realtor `permit_trades` rows. (Blocked at audit by env-loading issue; will use the script's own startup query which logs `existing realtor rows: <N>` before the backfill loop.)

- [ ] **R3 — Sibling-bug check (per WF3 cadence).** Three sibling-bug candidates to scan before fix:
  - **Sibling A:** Are there OTHER scripts that write `NULL` to a NOT-NULL column with a DEFAULT? `Grep` `migrations/` for `NOT NULL DEFAULT` columns + cross-reference against script INSERTs.
  - **Sibling B:** Are there OTHER scripts not in `manifest.json` that have `pipeline.run(...)` (= meant to be chained)? `Grep` `scripts/` for `pipeline\.run\(` and diff against manifest entries.
  - **Sibling C:** Are there OTHER lock-ID collisions hiding behind manifest-gap? Scan for `ADVISORY_LOCK_ID = N` duplicates across all `scripts/`, even those not in manifest.
  - Each finding either gets folded into this WF3 (if same root cause) OR filed as a separate WF3 in `review_followups.md`.

- [ ] **R4 — Red Light tests.** Write the failing tests FIRST per WF3 cadence:
  1. `src/tests/backfill-realtor-permit-trades.infra.test.ts` — 4 new assertions:
     - INSERT block does not write `NULL` for `lead_score` or `phase` (regex-scan SQL string for those columns)
     - `ADVISORY_LOCK_ID = 114` (post-fix value)
     - SPEC LINK header references Spec 91 §3.5 + Spec 47 §R2
     - Manifest-shape: this script's stem (`backfill-realtor-permit-trades`) is registered in `scripts/manifest.json`'s `scripts` map AND its key (`backfill_realtor_permit_trades`) appears in the `chains.permits` array between `classify_permits` and `compute_cost_estimates`
  2. `src/tests/pipeline-advisory-lock.infra.test.ts` — Bundle G registry entry assertion (added to LOCK_ID_REGISTRY map). Existing uniqueness + manifest-coverage tests will then exercise the new entry automatically.
  3. `src/tests/chain.logic.test.ts` — chain length 30 (was 29), new step position assertion.
  4. `src/tests/quality.logic.test.ts` — chain length mirror.
  5. `src/tests/assert-global-coverage.infra.test.ts` — Spec 41 / Spec 86 step count 30.
  - **Verify all tests fail before R5.**

- [ ] **R5 — Implementation + spec amendments.**
  1. **Script fix (Finding 1 + 3):** Edit `scripts/backfill-realtor-permit-trades.js`. Drop `phase` + `lead_score` from the INSERT column list; reorder the `SELECT` to match. Update the `ADVISORY_LOCK_ID` comment to record the rationale ("Spec 47 §R2 owning-spec-91 collides with link-massing.js's Wave 2 sequential lock 91; per WF1 #B compute-phase-calibration precedent, free-ID assignment").
  2. **Manifest fix (Finding 2):** Edit `scripts/manifest.json`. Add the script entry under `scripts` with `telemetry_tables: ["permit_trades"]`. Insert `"backfill_realtor_permit_trades"` into `chains.permits` between `"classify_permits"` and `"compute_cost_estimates"`.
  3. **Bundle G registry update:** Edit `src/tests/pipeline-advisory-lock.infra.test.ts`. Add `'scripts/backfill-realtor-permit-trades.js': 114` to `LOCK_ID_REGISTRY`.
  4. **PIPELINE_REGISTRY + STEP_DESCRIPTIONS:** Edit `src/components/FreshnessTimeline.tsx` and `src/lib/admin/funnel.ts` to add the new step at the correct chain position.
  5. **Chain-count cascade:** Update the count assertions in `chain.logic.test.ts`, `quality.logic.test.ts`, `assert-global-coverage.infra.test.ts` (29 → 30; new step row).
  6. **Spec amendments:** Update Spec 41 (chain table), Spec 86 §4 (chain table mirror), Spec 91 §3.5 (item 4 status note), Spec 95 §2.5.1 (realtor wire-up dependency note).
  7. **Lesson:** Append to `tasks/lessons.md` — one short lesson on "merged-but-never-end-to-end-verified" pattern. Reference Spec 47 §R as the protocol that already mandates verification (no spec change needed).

- [ ] **R6 — Green Light verification.**
  - `npm run typecheck` clean.
  - `npm run lint -- --fix` clean.
  - `npm run test` — full vitest suite passes (5184+ baseline + ~6 new assertions).
  - **Live verify:** `node scripts/backfill-realtor-permit-trades.js` runs without errors. Capture the PIPELINE_SUMMARY: `records_new` should be ~95K (the residential-non-commercial active subset per the WF3 `779ec88` 3-axis gate). Re-run; second invocation should report `records_new: 0` (idempotency).
  - **Idempotency proof:** the NOT EXISTS guard + ON CONFLICT DO NOTHING in the existing INSERT should produce 0 inserts on re-run.
  - **Chain integration smoke test:** dry-run `node scripts/run-chain.js permits` (or equivalent) to verify the orchestrator picks up the new step at the correct position. (If full chain run is too expensive, isolate to `npm run system-map` + manual diff inspection.)

- [ ] **R7 — Pre-Review Self-Checklist (3 findings + sibling-bug coverage).** Walk each item against the actual diff. Output PASS/FAIL per item BEFORE invoking R8.
  1. Finding 1 — INSERT no longer writes NULL for `lead_score` or `phase`
  2. Finding 2 — `backfill_realtor_permit_trades` is in `manifest.json` AND in `chains.permits` between the right neighbors
  3. Finding 3 — `ADVISORY_LOCK_ID` is 114 + Bundle G registry mirrors that
  4. Spec 47 §R protocol — script is fully Spec-47-compliant (skeleton, advisory lock, withTransaction, emitSummary, emitMeta) — no regressions
  5. Spec 91 §3.5 item 4 — wire-up status note now says shipped
  6. Spec 95 §2.5.1 — realtor wire-up dependency note refreshed
  7. Spec 41 / Spec 86 — chain count = 30; chain table renumbered cleanly
  8. R3 sibling-bug findings — each one folded in OR filed in `review_followups.md`
  9. WF3 cadence — single root cause documented in commit message; bundle override rationale recorded

- [ ] **R8 — Multi-Agent Review (3 reviewers in parallel).**
  1. **Gemini:** `npm run review:gemini -- review scripts/backfill-realtor-permit-trades.js --context docs/specs/01-pipeline/47_pipeline_script_protocol.md` — Spec 47 compliance + the INSERT pattern correctness.
  2. **DeepSeek:** `npm run review:deepseek -- review scripts/backfill-realtor-permit-trades.js --context docs/specs/03-mobile/91_mobile_lead_feed.md` — Spec 91 §3.5 contract + idempotency + 3-axis gate correctness.
  3. **Worktree code-reviewer (Agent + isolation:worktree):** Full diff vs Spec 91 §3.5 item 4 + Spec 47 §R2/§R6/§R9. Generates own checklist. PASS/FAIL with line numbers.
  - Triage: BUG → fix in-loop before R9; DEFER → `docs/reports/review_followups.md`.

- [ ] **R9 — Apply review fixes + re-verify.** Re-run `npm run test` + the live script run (which will be a no-op given idempotency, confirming the registry/chain integration didn't silently break anything).

- [ ] **R10 — Atomic commit + push + close active task.**
  - Commit message: `fix(91_mobile_lead_feed): WF3 — realtor backfill end-to-end (3 bundled findings)` with footer enumerating each finding.
  - Operator runbook footer: `node scripts/backfill-realtor-permit-trades.js` once after deploy to land the initial backfill; subsequent runs handled by the chain.
  - `git push origin main` after Husky pre-commit gate.
  - Resume WF1 #C: copy `.cursor/queued_task_wf1c_admin_inspector_ui.md` → `.cursor/active_task.md` and continue from R3 (live verify timeline shapes — which now has a working realtor feed to test against).

---

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
>
> §10 note: Bundle override is explicit (user authorization "C"). All 3 findings share the single root cause "script merged but never run end-to-end" and Findings 2+3 are coupled by the Bundle G uniqueness test. Spec amendments (47 N/A; 41/86/91/95 + lessons.md) are itemized in R5 step 6+7. Multi-agent review opt-in is documented in the **Multi-Agent Review** field above (overrides WF3-default-worktree-only).
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
