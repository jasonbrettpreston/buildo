# Active Task: Always-Active Trade Visibility + Forecast Fallback Anchors
**Status:** Implementation
**Workflow:** WF1 — New Feature / Enhancement
**Rollback Anchor:** `c632274`

---

## Context
* **Goal:** (1) Remove phase-based time-gating from `classify-permits.js` so every classified trade is `is_active: true` regardless of which construction phase the permit is in. This unblocks early bidding — a roofer can see a P3 permit before framing starts. (2) Remove the hard `phase_started_at IS NOT NULL` filter from `compute-trade-forecasts.js` and replace it with a 3-level fallback anchor (last passed inspection → issued_date → application_date) so permits without a real phase anchor still produce forecasts with `calibration_method = 'fallback_issued'`.
* **Target Specs:**
  - `docs/specs/product/future/85_trade_forecast_engine.md`
  - `docs/specs/pipeline/47_pipeline_script_protocol.md`
  - `docs/specs/pipeline/41_chain_permits.md`
* **Key Files:**
  - `scripts/classify-permits.js` — remove `isTradeActiveInPhase` gate from `is_active` assignment
  - `src/lib/classification/classifier.ts` — dual code path mirror (§7.1)
  - `scripts/compute-trade-forecasts.js` — SOURCE_SQL + anchor fallback logic
  - `docs/specs/product/future/85_trade_forecast_engine.md` — spec update
  - `src/tests/compute-trade-forecasts.infra.test.ts` — new anchor fallback test
  - `src/tests/classify-permits.infra.test.ts` — new is_active = true always test

---

## Technical Implementation

### Part 1 — classify-permits.js (+ classifier.ts dual path)

**Current code (4 call sites — lines 410/418, 439/447, 464/472, 490/498):**
```js
const isActive = isTradeActiveInPhase(trade.slug, phase);
const tradeMatch = { ..., is_active: isActive, ... };
```

**New code (all 4 sites):**
```js
const tradeMatch = { ..., is_active: true, ... };
```

Remove the `const isActive = isTradeActiveInPhase(...)` variable from `classifyPermit()` at all 4 sites (it's only used for the `is_active` field). The `isTradeActiveInPhase` function STAYS because `calculateLeadScore` (line 129) still calls it for the +15 phase-match boost. The function itself is not deleted.

**Dual code path**: Mirror identical change in `src/lib/classification/classifier.ts` at all equivalent `is_active: isActive` assignments (lines 165, 179, 217, 231, 315, 329, 388, 402).

**`--full` re-run**: Already supported via `pipeline.isFullMode()` (line 512). Post-deploy, run `node scripts/classify-permits.js --full` to backfill existing rows from `is_active: false` → `true`.

---

### Part 2 — compute-trade-forecasts.js

**SOURCE_SQL change:**
1. Remove `AND p.phase_started_at IS NOT NULL` from WHERE clause
2. Add `p.issued_date`, `p.application_date` to SELECT
3. Add a CTE (`WITH last_passed AS (...)`) for last passed inspection date — aggregated once in Postgres, not N+1

```sql
WITH last_passed AS (
  SELECT permit_num, MAX(inspection_date)::timestamptz AS last_passed_inspection_date
  FROM permit_inspections
  WHERE status = 'Passed'
  GROUP BY permit_num
)
SELECT p.permit_num, p.revision_num, t.slug AS trade_slug,
       p.lifecycle_phase, p.phase_started_at, p.permit_type,
       p.lifecycle_stalled, p.issued_date, p.application_date,
       lp.last_passed_inspection_date
  FROM permit_trades pt
  JOIN trades t ON t.id = pt.trade_id
  JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num
  LEFT JOIN last_passed lp ON lp.permit_num = p.permit_num
 WHERE pt.is_active = true
   AND p.lifecycle_phase IS NOT NULL
```

**Main loop anchor fallback (after SKIP_PHASES check):**
```js
const { phase_started_at, last_passed_inspection_date, issued_date, application_date } = row;

const effectiveAnchor = phase_started_at
  || last_passed_inspection_date
  || (issued_date ? new Date(issued_date + 'T00:00:00Z') : null)
  || (application_date ? new Date(application_date + 'T00:00:00Z') : null);

if (!effectiveAnchor) { skipped++; continue; }   // truly no anchor — rare

const anchorIsFallback = !phase_started_at;
```

Then use `effectiveAnchor` in place of `phase_started_at` in the date math (line 394). Set `calibration_method` override:
```js
const finalCalMethod = anchorIsFallback ? 'fallback_issued' : cal.method;
```

And in `batch.push(...)`:
```js
calibration_method: finalCalMethod,
```

**Telemetry update** — add to `records_meta`:
```js
anchor_fallbacks_used: anchorFallbackCount,  // count of permits that used a fallback anchor
```

**PIPELINE_META reads update**: Add `permit_inspections` to reads, add `issued_date`, `application_date` to `permits` read columns.

---

### Part 3 — Spec Update

**`docs/specs/product/future/85_trade_forecast_engine.md` §3 Behavioral Contract:**
Add under "Anchor Selection":
```
### Anchor Fallback Hierarchy
When `phase_started_at` is NULL, the engine uses the best available timestamp:
1. `phase_started_at` (true phase transition anchor — preferred)
2. Last passed inspection date (from `permit_inspections WHERE status='Passed'`)
3. `issued_date` (permit issuance)
4. `application_date` (permit application)
When any fallback is used, `calibration_method` is stamped `'fallback_issued'`
to signal a lower-confidence estimate.
```

---

## Standards Compliance
* **Try-Catch Boundary:** N/A — both scripts run inside `pipeline.run()` which wraps all errors; no new API routes.
* **Unhappy Path Tests:** (a) `is_active` always true even for terminal phases, (b) NULL phase_started_at → uses fallback, (c) no anchor at all → skipped (not crashed).
* **logError Mandate:** N/A — no new catch blocks.
* **Mobile-First:** N/A — backend only.

---

## Execution Plan
- [ ] **Contract Definition:** N/A — no API route changes. DB schema unchanged (calibration_method is VARCHAR(30), no constraint).
- [ ] **Spec & Registry Sync:** Update `85_trade_forecast_engine.md` §3 with fallback anchor hierarchy. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no migration required. `calibration_method` already VARCHAR(30) no-check. `issued_date` + `application_date` already on `permits`. `permit_inspections` already exists.
- [ ] **Test Scaffolding:** Add tests to existing infra test files:
  - `compute-trade-forecasts.infra.test.ts`: (a) SOURCE_SQL no longer contains `phase_started_at IS NOT NULL`, (b) SOURCE_SQL joins `permit_inspections` via CTE, (c) `issued_date` + `application_date` in SELECT, (d) `'fallback_issued'` is a valid calibration_method value in script.
  - `classify-permits.infra.test.ts`: `is_active: true` hardcoded — script must NOT contain `is_active: isActive` (or `is_active: isTradeActiveInPhase`).
- [ ] **Red Light:** Run `npm run test` — new tests must fail.
- [ ] **Implementation:**
  1. Edit `scripts/classify-permits.js` — remove `isActive` variable + set `is_active: true` at all 4 sites
  2. Edit `src/lib/classification/classifier.ts` — same change, all equivalent sites
  3. Edit `scripts/compute-trade-forecasts.js` — SOURCE_SQL + anchor fallback logic + telemetry
  4. Edit `docs/specs/product/future/85_trade_forecast_engine.md` — anchor fallback section
- [ ] **Auth Boundary & Secrets:** N/A.
- [ ] **Pre-Review Self-Checklist:** Before Green Light, verify:
  1. `is_active: isActive` is gone from classify-permits.js (grep check)
  2. `is_active: isActive` is gone from classifier.ts (grep check)
  3. `isTradeActiveInPhase` still exists and is still called in `calculateLeadScore` (line 129)
  4. SOURCE_SQL CTE doesn't multiply rows (LEFT JOIN on permit_num, not permit_num+revision_num — permits table uses both as PK but inspections only join on permit_num)
  5. `effectiveAnchor` null check prevents crashes on permits with no dates at all
  6. `calibration_method` override only fires when `!phase_started_at`
  7. Ghost purge NOT EXISTS query (line ~78 in infra test) still intact and not broken
  8. PIPELINE_META reads updated to include permit_inspections
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → Spawn Adversarial + Independent Review agents. → WF6.

---

## Post-Commit Re-Run Instructions
After merging, run both scripts with `--full`:
```bash
node scripts/classify-permits.js --full         # backfill is_active=false → true
node scripts/compute-trade-forecasts.js         # already processes all active permits
```
