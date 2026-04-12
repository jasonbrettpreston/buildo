# Active Task: Phase 4 — Flight Tracker (compute-trade-forecasts.js)
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Generate per-permit, per-trade predicted start dates and urgency statuses that the lead feed will surface. This script replaces the cosmetic "Active build phase" placeholder with actionable countdown data: "Plumbing rough-in expected in 47 days — On Time" or "HVAC delayed by 12 days."
* **Why now:** Phases 1-3 are shipped. `phase_started_at` is populated on 242K permits. `phase_calibration` has 131 rows of historical medians. `TRADE_TARGET_PHASE` maps 32 trades to their lifecycle phase. `trade_forecasts` table exists but is empty. This script is the consumer that turns all three inputs into user-facing predictions.
* **Target Spec:** `docs/reports/lifecycle_phase_implementation.md`
* **Key Files:** `scripts/compute-trade-forecasts.js` (new), `src/tests/compute-trade-forecasts.infra.test.ts` (new)

## Technical Implementation

### Algorithm

For each permit with an active trade assignment:

```
1. Look up trade's target phase:  TRADE_TARGET_PHASE[trade_slug] → target_phase
2. Compare current phase to target phase:
   a. If current_phase ordinal >= target_phase ordinal → overdue (window closed)
   b. If current_phase is pre-construction (P3-P8, P7*) → use ISSUED calibration
   c. If current_phase is construction (P9-P17) → use phase-to-phase calibration
   d. If current_phase is terminal/orphan/dead → skip

3. Calibration lookup (fallback hierarchy):
   (current_phase, target_phase, permit_type) → exact match
   (current_phase, target_phase, NULL)        → all-types aggregate
   (ISSUED, target_phase, permit_type)        → issued-based fallback
   (ISSUED, target_phase, NULL)               → issued-based all-types
   30 days                                    → hardcoded floor

4. Compute prediction:
   predicted_start = phase_started_at + median_days
   days_until = predicted_start - today

5. Classify urgency:
   overdue:   current phase past target   OR  days_until <= -30
   delayed:   -30 < days_until <= 0
   imminent:  0 < days_until <= 14
   upcoming:  14 < days_until <= 30
   on_time:   days_until > 30

6. Classify confidence:
   high:    sample_size >= 30
   medium:  sample_size >= 10
   low:     sample_size < 10 or fallback used
```

### Data flow

```
[permit_trades × trades × permits]  →  93K active permit-trade pairs
[phase_calibration]                  →  131 calibration rows (loaded to JS Map)
[TRADE_TARGET_PHASE]                 →  32 trade → target_phase mappings

         ↓ compute in JS ↓

[trade_forecasts]  ←  UPSERT per-permit, per-trade predictions
```

### Script structure

1. **Load calibration** into a nested Map: `Map<from_phase, Map<to_phase, Map<permit_type|'__ALL__', {median, p25, p75, sample}>>>`
2. **Query active permit-trades**: single JOIN across `permit_trades × trades × permits` — returns ~93K rows with `(permit_num, revision_num, trade_slug, lifecycle_phase, phase_started_at, permit_type)`
3. **Compute forecasts in JS**: O(1) Map lookup per permit-trade pair. Phase ordinal comparison for overdue detection.
4. **Batch UPSERT** into `trade_forecasts`: VALUES + ON CONFLICT DO UPDATE, batched at 1000 rows × 11 params = 11,000 params per batch (under 65535 limit)

### Urgency value semantics (for the feed)

| Value | Meaning | Feed behavior |
|-------|---------|---------------|
| `overdue` | Permit has passed the target phase or predicted_start is >30 days ago | Deprioritize or hide |
| `delayed` | Predicted date passed but within 30 days | HIGH urgency — builder is behind schedule |
| `imminent` | Due within 14 days | HIGHEST urgency — trade needed NOW |
| `upcoming` | Due within 30 days | Moderate urgency — trade needed soon |
| `on_time` | Due in 30+ days | Standard urgency — track but not urgent |
| `unknown` | No calibration data or missing inputs | Neutral — show but don't rank on urgency |

### Permits to skip

- `lifecycle_phase IS NULL` (dead/unclassified)
- `lifecycle_phase IN ('P19', 'P20')` (terminal — no active construction)
- `lifecycle_phase IN ('O1', 'O2', 'O3')` (orphan trade permits — separate from BLD-led)
- `phase_started_at IS NULL` (pre-backfill edge case)
- No active trade assignment

* **Database Impact:** YES — writes to existing `trade_forecasts` table (Phase 1 created it). Potentially 93K rows on first run.

## Standards Compliance
* **Try-Catch Boundary:** Pipeline SDK `pipeline.run` wrapper.
* **Unhappy Path Tests:** Infra shape tests for batch structure, fallback hierarchy, urgency classification.
* **logError Mandate:** Uses `pipeline.log`.
* **Mobile-First:** N/A — backend-only.

## Execution Plan

- [ ] **Contract Definition:** The `trade_forecasts` table shape (Phase 1 migration 086) IS the contract. The feed will JOIN on `(permit_num, revision_num, trade_slug)`.

- [ ] **Spec & Registry Sync:** Wire into manifest + FreshnessTimeline + funnel. Add to permits chain after `compute_timing_calibration_v2`.

- [ ] **Test Scaffolding:** `src/tests/compute-trade-forecasts.infra.test.ts` — script shape, batch structure, urgency classification logic, fallback hierarchy.

- [ ] **Red Light:** Tests must FAIL before implementation.

- [ ] **Implementation:**
  1. Write `scripts/compute-trade-forecasts.js`
  2. Wire into manifest + FreshnessTimeline + funnel
  3. Run against live DB, verify forecasts
  4. Verify urgency distribution (sanity check)

- [ ] **Pre-Review Self-Checklist:**
  1. Does the phase ordinal comparison correctly detect "permit already past target"?
  2. Does the fallback hierarchy exhaust all 4 levels before using the 30-day default?
  3. Are the batch UPSERT params correctly aligned (no j*7 repeat)?
  4. Is the script idempotent? (ON CONFLICT DO UPDATE)
  5. Does the urgency classification handle negative days_until correctly?
  6. Are orphan/terminal/dead permits excluded from forecasting?
  7. Does the script handle trades not in TRADE_TARGET_PHASE? (skip with warning)

- [ ] **Green Light:** Full test suite + live DB verification.

- [ ] **Independent + adversarial review agents.** Triage, WF3, defer.

- [ ] → WF6 + commit.

---

## §10 Compliance

- ✅ **DB:** Writes to existing `trade_forecasts` table. CHECK constraints (Phase 1) enforce urgency/confidence values. FK cascade handles permit deletion. Batch UPSERT idempotent.
- ⬜ **API:** N/A
- ⬜ **UI:** N/A
- ✅ **Shared Logic:** Uses `TRADE_TARGET_PHASE` from shared lib (dual code path).
- ✅ **Pipeline:** Pipeline SDK · PIPELINE_SUMMARY + PIPELINE_META · batch UPSERT · wired into manifest + chain
