# Active Task: WF3 — Control Panel Pipeline Gaps
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `1204234` (feat(92_control_panel))
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Close 3 pipeline gaps found in the WF5 audit against the 86_control_panel.md spec. The control panel promises per-trade multipliers and centralized config loading, but the implementation uses global multipliers and inline per-script loading.
* **Target Spec:** `docs/specs/product/future/86_control_panel.md`

## Bugs

### Bug 1 — Missing variables + per-trade multiplier columns
**logic_variables** missing 2 keys:
- `lead_expiry_days` — TTL for tracked_projects claimed_unverified status
- `coa_stall_threshold` — CoA-specific stall detection threshold

**trade_configurations** missing 2 columns:
- `multiplier_bid` — per-trade urgency multiplier for bid window (was global 2.5)
- `multiplier_work` — per-trade urgency multiplier for work window (was global 1.5)

Per spec 86: each trade should have its own multiplier. Excavation might get 3.0x bid (heavy equipment, long lead) while painting gets 1.5x (commodity trade, short notice).

### Bug 2 — compute-opportunity-scores.js uses global multipliers, not per-trade
The script reads `los_multiplier_bid` / `los_multiplier_work` from `logic_variables` and applies the same value to all 32 trades. It should JOIN `trade_configurations` and use `tc.multiplier_bid` / `tc.multiplier_work` per row.

### Bug 3 — No centralized config loader
Each of the 4 scripts has its own inline try/catch config loading block. A shared `loadMarketplaceConfigs(pool)` in `scripts/lib/` would:
- Deduplicate the pattern
- Validate config at load time (e.g., allocation_pct sum check)
- Provide a single point of failure logging

## Execution Plan

- [ ] **Migration 093:** ALTER trade_configurations ADD COLUMN multiplier_bid + multiplier_work. INSERT missing logic_variables keys.
- [ ] **Shared loader:** Create `scripts/lib/config-loader.js` with `loadMarketplaceConfigs(pool)` returning `{ tradeConfigs, logicVars }`.
- [ ] **Refactor compute-opportunity-scores.js:** JOIN trade_configurations for per-trade multipliers.
- [ ] **Refactor all 4 scripts:** Replace inline config loading with the shared loader.
- [ ] **Tests + gauntlet + review agents + commit.**

## Standards Compliance
- ✅ **DB:** Migration 093 — 2 ADD COLUMN + 2 INSERT. All instant.
- ⬜ **API / UI:** N/A (Admin UI is a separate WF1)
- ✅ **Shared Logic:** New `scripts/lib/config-loader.js`
- ✅ **Pipeline:** All 4 scripts refactored to use shared loader.

---

**AUTHORIZED. Implementation in progress.**
