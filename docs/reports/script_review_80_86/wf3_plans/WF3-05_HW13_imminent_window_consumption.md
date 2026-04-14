# Active Task: Consume per-trade imminent_window_days in urgency classification
**Status:** Planning
**Domain Mode:** Backend/Pipeline
**Finding:** H-W13 · 85-W1, 82-W2

## Context
* **Goal:** Make the Control Panel `trade_configurations.imminent_window_days` per-trade knob actually drive the `urgency='imminent'` classification. Today the value is loaded and passed through `update-tracked-projects.js` but only used in the alert MESSAGE TEXT; the actual threshold that classifies a permit as `imminent` is hardcoded `daysUntil <= 14` in `compute-trade-forecasts.js:81`. Operators adjusting the knob see no behavioural change.
* **Target Spec:** `docs/specs/product/future/85_trade_forecast_engine.md` (declare spec 85 owns consuming `imminent_window_days` per H-S35) + `docs/specs/product/future/82_crm_assistant_alerts.md` (clarify 82 uses the value only for display)
* **Key Files:**
  - `scripts/compute-trade-forecasts.js` (L64 classifyUrgency signature, L81 hardcoded 14, L292 call site)
  - `scripts/lib/config-loader.js` (confirm `tradeConfigs[slug].imminent_window_days` is loaded; it IS, from `trade_configurations`)

## Technical Implementation
* **New/Modified Components:**
  - `classifyUrgency(daysUntil, isPastTarget, expiredThreshold, imminentWindow)` — gains a 4th parameter.
  - Caller at L292 passes `tradeConfigs[trade_slug]?.imminent_window_days ?? 14`.
* **Data Hooks/Libs:** None new; `loadMarketplaceConfigs` already surfaces the value.
* **Database Impact:** NO — value is already in DB via `trade_configurations.imminent_window_days`.

## Standards Compliance
* **Try-Catch Boundary:** N/A.
* **Unhappy Path Tests:** (a) trade with `imminent_window_days=7` and `daysUntil=10` → urgency='upcoming' (not imminent); (b) trade with `imminent_window_days=21` and `daysUntil=14` → urgency='imminent'; (c) trade missing config → fallback 14 → urgency='imminent' at daysUntil=14.
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan
- [ ] **Rollback Anchor:** Record Git SHA.
- [ ] **State Verification:** Query `SELECT trade_slug, imminent_window_days FROM trade_configurations;` — confirm all 32 trades have a non-null value and values span a range (7, 14, 21 per fallback config).
- [ ] **Spec Review:** Spec 85 currently hardcodes 14 in algorithm description. Add explicit "per-trade configurable" line citing `imminent_window_days`.
- [ ] **Reproduction:** Extend `src/tests/compute-trade-forecasts.logic.test.ts`. Three fixtures per above. Assert classifyUrgency output per-trade.
- [ ] **Red Light:** Tests fail because the function signature doesn't accept the 4th arg and the call site doesn't pass it.
- [ ] **Fix:**
  1. Update `classifyUrgency` signature to accept `imminentWindow` parameter with default 14.
  2. Replace L81 `daysUntil <= 14` with `daysUntil <= imminentWindow`.
  3. At call site L292, pass `tradeConfigs[trade_slug]?.imminent_window_days ?? 14`.
  4. No change needed in `update-tracked-projects.js`; it already reads `row.imminent_window_days` via the SQL JOIN at L65 for message rendering, and routes alerts via `urgency` which is now correct.
- [ ] **Pre-Review Self-Checklist:**
  1. Does `tradeConfigs` fallback (loaded by `config-loader.js` when DB query fails) include `imminent_window_days` for every slug? Verify FALLBACK_TRADE_CONFIGS in config-loader has the field.
  2. Is there a trade that appears in `permit_trades` but NOT in `tradeConfigs`? Code path L198–202: `if (!targets) { unmappedTrades++; continue; }` — unmapped trades are skipped before urgency classification, safe.
  3. Does the fixture test cover the `imminent_window_days = null` case? Add explicit null-fallback test.
  4. Does `compute-opportunity-scores.js` read `target_window` (bid vs work) which depends on `bid_phase_cutoff` / `work_phase_target` — still separate knobs not affected by this change?
  5. Does the alert-message text in `update-tracked-projects.js:189` still correctly interpolate the per-trade window ("within ${imminent_window_days} days")? (Yes — reads same config.)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: None
- ⬜ API: N/A
- ⬜ UI: N/A
- ✅ Shared Logic: Single function signature change; callers updated
- ✅ Pipeline: §9 N/A

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)**
