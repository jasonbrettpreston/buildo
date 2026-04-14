# Active Task: Consume per-trade `imminent_window_days` — WF3-05 (H-W13)
**Status:** Implementation — authorized via /proceed
**Workflow:** WF3 — Bug Fix
**Domain Mode:** Backend/Pipeline
**Finding:** H-W13 · 85-W1 · 82-W2 · from `docs/reports/script_review_80_86/holistic/_TRIAGE.md`
**Rollback Anchor:** `4e715e0` (fix(40_pipeline_system): chain-scope pipeline_schedules disable)

---

## Context

- **Goal:** Make the Control Panel `trade_configurations.imminent_window_days` knob actually drive the `urgency='imminent'` classification, not just the alert message text. Today the Control Panel surfaces the value and `update-tracked-projects.js` uses it ONLY to render "within ${imminent_window_days} days" in the alert body — the threshold that actually trips `urgency='imminent'` is hardcoded to 14 days in `compute-trade-forecasts.js:81`. Operators adjusting per-trade windows (fallback config surfaces 7/14/21 days by trade) see zero behavioural change.
- **Target Spec:** `docs/specs/product/future/85_trade_forecast_engine.md` — declare ownership of per-trade urgency threshold per H-S35. Spec 82 §4 is also touched (rewording to clarify the delivered alert depends on 85's classification).
- **Key Files:**
  - `scripts/compute-trade-forecasts.js` (L64 `classifyUrgency` signature, L81 hardcoded 14, L292 call site)
  - `scripts/lib/config-loader.js` (already surfaces `imminent_window_days` — verified)
  - `scripts/update-tracked-projects.js` (L65 SQL `COALESCE(tc.imminent_window_days, 14)` + L189 message text — no changes required)
  - `src/tests/compute-trade-forecasts.infra.test.ts` (add coverage for per-trade urgency classification)

## State Verification (complete)

- ✅ `classifyUrgency` signature is 3-arg (`daysUntil, isPastTarget, expiredThreshold`) at `compute-trade-forecasts.js:64`.
- ✅ Hardcoded threshold at L81: `if (daysUntil <= 14) return 'imminent';`.
- ✅ Call site at L292 passes only 3 args: `classifyUrgency(daysUntil, isPastTarget, logicVars.expired_threshold_days)`.
- ✅ `config-loader.js` surfaces `imminent_window_days` per trade (7/14/21 in fallback; DB-driven otherwise).
- ✅ `tradeConfigs[trade_slug]` is available in the scoring loop — confirmed because the trade iterator at L184 already destructures `trade_slug`.
- ✅ Downstream: `update-tracked-projects.js:65` already COALESCEs the SQL join (backup fallback of 14 if DB row missing — unchanged). L189 uses `row.imminent_window_days` for message text — unchanged.

## Technical Implementation

- **Signature change:** `classifyUrgency(daysUntil, isPastTarget, expiredThreshold, imminentWindow = 14)` — add 4th parameter with literal default 14 (safe fallback if caller omits).
- **Body change:** `if (daysUntil <= imminentWindow) return 'imminent';` at L81.
- **Call site change:** at L292, pass `tradeConfigs[trade_slug]?.imminent_window_days ?? 14` as the 4th arg. Using `?? 14` (not `|| 14`) is important — `|| 14` would treat 0 as falsy and silently re-hardcode 14 for any legitimately zero-threshold trade.
- **No migration.** DB already has the column (migration 092 / control panel).
- **No consumer changes.** `update-tracked-projects.js` already reads the same config row for message text; `compute-opportunity-scores.js` filters on `urgency != 'expired'` and is unaffected by the imminent threshold.

## Standards Compliance

- **Try-Catch Boundary:** N/A (no new API routes).
- **Unhappy Path Tests:**
  - (a) trade with `imminent_window_days=7`, `daysUntil=10` → urgency='upcoming' (not imminent).
  - (b) trade with `imminent_window_days=21`, `daysUntil=14` → urgency='imminent'.
  - (c) trade with missing `tradeConfigs` entry → fallback to 14 → urgency='imminent' at daysUntil=14.
  - (d) trade with `imminent_window_days=0` → effectively "never imminent" (0-day window) — don't let `|| 14` re-hardcode 14.
- **logError Mandate:** N/A.
- **Mobile-First:** N/A.

## Execution Plan

- [ ] **Rollback Anchor:** `4e715e0`.
- [ ] **State Verification:** complete above.
- [ ] **Spec Review:** Read spec 85 §Urgency Classification. Add a one-line declaration that `imminent_window_days` per-trade drives the threshold.
- [ ] **Reproduction:** Extend `src/tests/compute-trade-forecasts.infra.test.ts` with the 4 unhappy-path fixtures above. Per repo convention, these stay as shape tests verifying the signature + call-site wiring; behavioural verification can be added via a SQL reproducer if needed.
- [ ] **Red Light:** Run the new test — must fail because the signature is still 3-arg and the hardcoded 14 is still present.
- [ ] **Fix:**
  1. Update `classifyUrgency` signature + body.
  2. Update call site at L292.
  3. Update spec 85 §Urgency Classification with the per-trade declaration.
- [ ] **Pre-Review Self-Checklist:**
  1. Does `tradeConfigs[trade_slug]` exist for every trade reachable at L292? The code skips unmapped trades at L198–202 (`if (!targets) { unmappedTrades++; continue; }`), so all reachable rows have a valid config — good.
  2. Does `?? 14` correctly handle both `null` and `undefined`? (Yes — nullish coalescing.)
  3. Does `imminent_window_days = 0` have a legitimate meaning per spec? (Means "alert only when work has literally started" — valid edge case. `?? 14` preserves 0 correctly.)
  4. Does this change alter `compute-opportunity-scores.js` scoring? It filters `urgency NOT IN ('expired')` — other urgency values all pass through identically, so no.
  5. Does this change alter `update-tracked-projects.js` alert routing? Yes — that's the point. Per-trade windows now drive whether STALL_WARNING/IMMINENT fires. This is the intended behaviour per spec 82 §6.
  6. Any test that asserts a specific urgency value for a fixture permit-trade pair would need updating if the fixture crosses the new threshold. Grep `urgency.*imminent\|imminent.*urgency` in tests.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6 + independent review in worktree. Defer non-critical findings to `docs/reports/review_followups.md`.

---

**PLAN COMPLIANCE GATE — §10 summary:**

- ⬜ **DB:** None
- ⬜ **API:** N/A
- ⬜ **UI:** N/A (front-end out of scope)
- ✅ **Shared Logic:** One function signature change + one call site update; no dual-path (TS lib doesn't have a counterpart for this specific logic).
- ✅ **Pipeline:** §9.1/9.2/9.3 N/A — read-only parameter threading, no mutations changed.

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)** — YES (user /proceed)

---

## Execution Summary (post-WF6 + review)

- ✅ `classifyUrgency` signature: 4th param `imminentWindow = 14` (safe-net default).
- ✅ Body uses `daysUntil <= imminentWindow` (was hardcoded 14).
- ✅ Call site at L295–301 passes `tradeConfigs[trade_slug]?.imminent_window_days ?? 14` (preserves legitimate 0).
- ✅ Spec 85 §Urgency Classification declares ownership + documents 0-opt-out behaviour.
- ✅ Infra test asserts signature + call-site wiring + regression anchors against `|| 14` and bare `<= 14`.
- ✅ Full suite 3854/3854 pass; lint + typecheck clean.

## Review Triage
- **Independent (worktree):** 7 PASS / 1 WARN-medium (C8 missing behavioural fixtures — deferred per codebase convention) / 1 WARN-low (C2 spec doc — **FIXED inline**).
- **DeepSeek:** 1 CRITICAL + 2 HIGH + lower. Independent reviewer confirmed CRITICAL (default param) and one HIGH (boundary collision) are overstated — REJECTED. Generic numeric-config validation deferred to a future config-loader hardening WF.
- **Gemini:** 503 throughout window — re-run later if disagreement surfaces; DeepSeek + independent provided sufficient coverage.

All deferred + rejected logged in `docs/reports/review_followups.md`.

**Status: READY FOR COMMIT — awaiting user authorization.**
