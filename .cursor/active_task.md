# Active Task: WF2 — 5 CRITICAL Pipeline Safety Fixes
**Status:** Implementation
**Workflow:** WF2/WF3
**Domain Mode:** Backend/Pipeline
**Rollback Anchor:** 29eec48

## Context
* **Goal:** Fix 5 CRITICAL vulnerabilities identified in the WF6 adversarial pipeline audit. All changes must strictly adhere to `47_pipeline_script_protocol.md` (transaction boundaries, lock IDs, no hardcoded business logic).
* **Target Specs:**
  - `docs/specs/pipeline/47_pipeline_script_protocol.md` (primary — §4.1, §5.2, §7.3)
  - `docs/specs/product/future/84_lifecycle_phase_engine.md` (lifecycle classifier)
* **Key Files:**
  - `scripts/compute-trade-forecasts.js` — Fix 1 (transaction) + Fix 4 (guardrail)
  - `scripts/link-coa.js` — Fix 2 (advisory lock ID)
  - `scripts/lib/lifecycle-phase.js` — Fix 3 (thresholds), Fix 5 (P18 bug)
  - `scripts/classify-lifecycle-phase.js` — Fix 3 (load new logic_variables)
  - `src/lib/classification/lifecycle-phase.ts` — Fix 3 + Fix 5 (dual-code-path)
  - `migrations/105_lifecycle_logic_vars.sql` — Fix 3 (seed threshold vars)

## Technical Implementation

### Fix 1 — Transaction Atomicity (compute-trade-forecasts.js)
**Problem:** The grace-purge + stale-purge DELETEs run in their own `withTransaction` block (Step 2, lines 226–274). Batch UPSERTs each have their own `withTransaction`. A crash between commits leaves `trade_forecasts` empty. Violates §7.3 ("DELETE + UPSERT must be in the same withTransaction").

**Fix:** Introduce `let purgeExecuted = false`. Move all purge+precount queries into `flushForecastBatch`, guarded by `!purgeExecuted`. Remove the standalone Step-2 `withTransaction` block.

```
const shouldPurge = !purgeExecuted;
const hasRows = currentBatch.length > 0;
if (!shouldPurge && !hasRows) return;
await pipeline.withTransaction(pool, async (client) => {
  if (shouldPurge) {
    purgeExecuted = true;
    // grace-purge DELETE
    // stale-purge DELETE
    // pre-count SELECT
  }
  if (!hasRows) return; // purge-only transaction (zero-row stream)
  // UPSERT batch (unchanged)
});
```

### Fix 2 — Advisory Lock ID (link-coa.js)
**Problem:** `ADVISORY_LOCK_ID = 93`; SPEC LINK points to spec 12. Per §5.2, lock ID = owning spec number. ID 12 is currently unassigned.

**Fix:** `ADVISORY_LOCK_ID = 93` → `ADVISORY_LOCK_ID = 12`.
Update `src/tests/pipeline-advisory-lock.infra.test.ts`: `'scripts/link-coa.js': 12`.

### Fix 3 — Hardcoded Stall Thresholds (lifecycle-phase.js + classify-lifecycle-phase.js + lifecycle-phase.ts)
**Problem:** `computeStalled` uses hardcoded 730/180-day thresholds; `classifyBldLed` uses hardcoded 30/90-day P7a/P7b bucket thresholds. Violates §4.1 — must load from `logic_variables`.

**Migration 105** — 4 new `logic_variables` rows (`ON CONFLICT DO NOTHING`):
- `lifecycle_issued_stall_days` = 730
- `lifecycle_inspection_stall_days` = 180
- `lifecycle_p7a_max_days` = 30
- `lifecycle_p7b_max_days` = 90

**classify-lifecycle-phase.js:** Extend `LIFECYCLE_CONFIG_SCHEMA` with `z.coerce.number().int().positive()` for all 4. Pass loaded values via the `input` object:
```js
classifyLifecyclePhase({
  ...existingFields,
  permitIssuedStallDays: logicVars.lifecycle_issued_stall_days,
  inspectionStallDays:   logicVars.lifecycle_inspection_stall_days,
  p7aMaxDays:            logicVars.lifecycle_p7a_max_days,
  p7bMaxDays:            logicVars.lifecycle_p7b_max_days,
  now: RUN_AT,
})
```

**lifecycle-phase.js:** In `computeStalled`, read `input.permitIssuedStallDays ?? 730` and `input.inspectionStallDays ?? 180`. In `classifyBldLed`, read `input.p7aMaxDays ?? 30` and `input.p7bMaxDays ?? 90`. Defaults are documented fallbacks — production always passes DB values.

Mirror identical changes in `src/lib/classification/lifecycle-phase.ts`.

### Fix 4 — TRADE_TARGET_PHASE Guardrail (compute-trade-forecasts.js)
**Status: Already Implemented.** Lines 152–158 already build `TRADE_TARGET_PHASE` from `tradeConfigs.bid_phase_cutoff` / `work_phase_target` (seeded in migration 092). config-loader.js `FALLBACK_TRADE_CONFIGS` also includes these. DB loading is the primary path; lifecycle-phase.js constant is the documented fallback.

**Remaining work (guardrail only):** Add a startup warning after line 158 if any entry has `undefined` bid_phase/work_phase — signals DB schema regression without halting the script:
```js
const undefinedPhaseCount = Object.values(TRADE_TARGET_PHASE)
  .filter(v => v.bid_phase == null || v.work_phase == null).length;
if (undefinedPhaseCount > 0) {
  pipeline.log.warn('[trade-forecasts]',
    `${undefinedPhaseCount} trades have missing phase targets — fell back to lifecycle-phase.js constants`);
}
```

### Fix 5 — classifyBldLed P18 Logic Bug (lifecycle-phase.js + lifecycle-phase.ts)
**Problem:** When `status === 'Permit Issued'` and `has_passed_inspection = true`, function returns `{ phase: 'P18' }` regardless of which stage passed. A permit that passed HVAC Final (→ P15) or Framing (→ P11) is misclassified as P18 (Inspection Pipeline).

**Fix:** Consult `latest_passed_stage` first via `mapInspectionStageToPhase`, then fall back to P18 — same logic already used for `status === 'Inspection'`:
```js
if (status === 'Permit Issued') {
  if (input.has_passed_inspection) {
    if (input.latest_passed_stage != null) {
      const stageLower = String(input.latest_passed_stage).toLowerCase();
      const mapped = mapInspectionStageToPhase(stageLower);
      if (mapped) return { phase: mapped, stalled };
    }
    return { phase: 'P18', stalled }; // stage unknown → stay in inspection pipeline
  }
  // ... rest unchanged
}
```
Mirror in `lifecycle-phase.ts`.

## Database Impact
YES — migration 105 adds 4 `logic_variables` rows (key-value INSERTs only — no schema change, no column additions, no backfill needed). `db:generate` not required.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified
* **Unhappy Path Tests:** Zod throw when threshold var missing/non-numeric; purge-only path (zero-row stream); P18→stage-mapped behavior; wrong lock ID detected
* **logError Mandate:** N/A — pipeline scripts use `pipeline.log`
* **Mobile-First:** N/A — backend/pipeline only

## Execution Plan
- [ ] **State Verification:** Confirm lock ID 12 unused (it is); confirm `tradeConfigs` has bid/work phase fields (confirmed in config-loader.js lines 23–54)
- [ ] **Contract Definition:** N/A — no API routes
- [ ] **Spec Update:** Update spec 84 comment in lifecycle-phase.js/ts where thresholds are now input-driven
- [ ] **Schema Evolution:** Create `migrations/105_lifecycle_logic_vars.sql` (UP: 4 INSERT ON CONFLICT DO NOTHING; DOWN: 4 DELETE). No `npm run migrate` needed (key-value table, no type generation)
- [ ] **Guardrail Test:** Write infra/logic tests for all 5 fixes before implementation
- [ ] **Red Light:** Run tests — all new tests must fail
- [ ] **Implementation (ordered by risk — smallest first):**
  - Fix 2: link-coa.js ADVISORY_LOCK_ID 93 → 12; update pipeline-advisory-lock.infra.test.ts
  - Fix 4: compute-trade-forecasts.js undefined-phase guardrail (1 warning block)
  - Fix 5: lifecycle-phase.js classifyBldLed P18 → mapInspectionStageToPhase; mirror lifecycle-phase.ts
  - Fix 1: compute-trade-forecasts.js purge into first batch; remove Step-2 withTransaction block
  - Fix 3: migration 105; classify-lifecycle-phase.js LIFECYCLE_CONFIG_SCHEMA + pass to input; lifecycle-phase.js computeStalled+classifyBldLed read from input; mirror lifecycle-phase.ts
- [ ] **UI Regression Check:** N/A
- [ ] **Pre-Review Self-Checklist:** 5-10 spec-derived questions, PASS/FAIL per item against actual diff
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` → WF6 → Swarm Review (Gemini + DeepSeek + Independent)
