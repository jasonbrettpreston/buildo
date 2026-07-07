# 85 Trade Forecast Engine — The Flight Tracker

> **Status:** ARCHITECTURE LOCKED — Bimodal Routing & Instant Stall Recalibration (April 2026).
> **Purpose:** Predict actionable work dates for every forecastable trade by marrying current lifecycle stages with historical velocity data.

## 1. Goal & User Story

Predict actionable work dates for every forecastable trade by marrying current lifecycle stages with historical velocity data.

### Forecastability contract (WF2 Spec 80 P4, 2026-07-06)

The classifier emits **36** distinct trade slugs. Of these:
- **35 are forecastable** — each carries a `trade_configurations` row supplying `bid_phase_cutoff` + `work_phase_target` (the bimodal routing anchors). Trades absent from that table are counted by the `unmapped_trades` audit row (acceptance: `== 0`). Migration 210 closed the last two gaps: `site-preparation` (early sitework → bid P3 / work P9) and `overhead-doors` (closing/finishing → bid P11 / work P15).
- **1 is non-forecastable** — `site-maintenance` (≈108K permit_trades, 3.6%) has **no phase-anchored install window**, so no `predicted_start` can be derived. It is excluded via `logic_variables.forecast_excluded_trade_slugs` (a JSONB array, mig 210). Rows carrying an excluded slug are skipped **before** branch dispatch, so they never inflate `records_total` and never increment `unmapped_trades`. The exclusion is loud, not silent: two INFO audit rows surface it — `excluded_rows` (row count, mirroring `unmapped_trades` semantics) and `excluded_trade_slugs` (the distinct slugs withheld).

To retire or add an exclusion, edit the `forecast_excluded_trade_slugs` array (Control Panel / a migration) — no code change. The list is read via `config-loader.js` and Zod-validated (`z.array(z.string())`).

**User Story:** A landscaper looks at a project currently in the "Framing" stage and sees a predicted start date for their work in 6 months, allowing them to bid early and secure the contract.

---

## 2. Technical Architecture

### Database Schema

#### `trade_forecasts` (Primary Output)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `predicted_start` | DATE | | The core predicted date. |
| `urgency` | VARCHAR | | `expired`, `overdue`, `delayed`, `imminent`, `upcoming`, `on_time`. |
| `target_window` | VARCHAR | | `bid` (Relationship) or `work` (Operational). |
| `confidence` | VARCHAR | | `high`, `medium`, `low` based on sample size. |
| `calibration_method` | VARCHAR | | Permit-side: `exact`, `fallback_all_types`, `fallback_issued_type`, `fallback_issued_all`, `default`. CoA-side (Phase F.1+): `exact`, `fallback_all_type_classes`, `fallback_all_project_types`, `fallback_all_cohorts`, `default`. Anchor-source-specific labels for forecasts where the anchor falls back through the chain: `fallback_inspection` (last_passed_inspection_date), `fallback_application` (application_date), `fallback_decision` (decision_date), `fallback_hearing` (hearing_date), `fallback_first_seen` (first_seen_at). |

### Implementation
- **Script:** `scripts/compute-trade-forecasts.js`
- **Logic:** Combines `phase_started_at` anchors with `phase_calibration` medians and `TRADE_TARGET_PHASE` mappings.
- **Pipeline Wiring:** Permits Chain step 22 of 24. Runs after `classify_lifecycle_phase` (21) so lifecycle_phase + phase_started_at anchors are fresh. Consumes `phase_calibration` written by `compute_timing_calibration_v2` (step 15). Precedes `compute_opportunity_scores` (23) which reads the `target_window` and `urgency` stamps this script produces. `expired` urgency threshold is loaded from `logic_variables.expired_threshold_days` (WF3 2026-04-13).

---

## 3. Behavioral Contract

### Inputs
Active `lead_trades` (filtered to `is_active = true`), `permits` AND `coa_applications` with lifecycle data, and `phase_calibration` / `phase_stay_calibration` results. PK on `trade_forecasts` migrates from `(permit_num, revision_num, trade_slug)` to `(lead_id, trade_slug)` per Spec 42 §6.6.B Option C — CoA-stage rows produce forecasts end-to-end once the lifecycle classifier emits CoA P2/P3/P4 (post Phase E 84-W12 fix).

**Source SQL** extended to UNION the two streams: `permits` (lead_id = `'permit:<num>:<rev>'`) ⋃ `coa_applications` (lead_id = `'coa:<application_number>'`), each contributing its own classification + anchor fields.

### Core Logic
- **Bimodal Routing:**
  - If current stage `<= bid_phase`: Target the "Shortlist" window.
  - If current stage `> bid_phase`: Target the "Work" window (Rescue Mission).
- **Anchor Selection:** Uses `phase_started_at` as the primary "T-Zero" point. When `phase_started_at` is NULL the engine applies the **Fallback Anchor Hierarchy** (see below) so no forecast is silently dropped.

#### Fallback Anchor Hierarchy
Priority order when `phase_started_at` is NULL:
1. `phase_started_at` — immutable phase-transition anchor (preferred)
2. Latest passed inspection date (`permit_inspections WHERE status='Passed'` — aggregated via CTE in SOURCE_SQL)
3. `permits.issued_date`
4. `permits.application_date`

When any fallback is used, `calibration_method` is stamped `'fallback_issued'` to signal a lower-confidence estimate. If no date is available at all the row is silently skipped and counted in `skipped_terminal_orphan`.
- **Historic Snowplow (WF3 April 2026):** Applied immediately after the initial `predictedStart = anchor + cal.median` calculation. If `anchorIsFallback` is `true` AND `predictedStart < today` (the calculated date landed in the past), snap `predictedStart` forward to `today + logic_variables.snowplow_buffer_days` (default 7, DB-driven per spec 47 §4.1). This converts rescued fallback-anchor leads from `expired` urgency to `imminent/upcoming` — treating them as Rescue Missions rather than dead leads. Only fires for fallback anchors; real `phase_started_at` anchors are never touched. Tracked via `snowplow_applied` in `records_meta`.
- ~~**Instant Stall Recalibration:**~~ *(Removed WF3 2026-04-22)* The per-row stall penalty block was deleted as dead code after the Stalled Gate was added to SOURCE_SQL. Since `AND p.lifecycle_stalled = false` is now in the WHERE clause, every row reaching the stream has `lifecycle_stalled = false`; the `if (lifecycle_stalled)` branch was permanently unreachable. **Product trade-off:** this means ALL stalled permits are excluded — including recently-stalled ones that would have produced a non-expired `predictedStart` after penalty adjustment. This is an accepted product simplification: a stalled permit's lead disappears from the feed while stalled, rather than showing a penalty-adjusted future date. `stall_penalty_precon` and `stall_penalty_active` remain in `logic_variables` and `LOGIC_VARS_SCHEMA` for potential future use.
- **Calibration Fallback:** Exact Match -> Permit Type Fallback -> Issued Date Fallback -> Default (30 days).

#### CoA-stage routing simplification (WF1 #coa-pipeline-parity-phase-a, 2026-05-13)

For CoA-stage rows (`lead_id LIKE 'coa:%'`, `lifecycle_group IN ('C1','C2','C3')`), the bimodal routing simplifies because there is no work phase pre-construction. Routing rules:

- **target_window = 'bid' ALWAYS** for CoA-stage. No work-window leads exist before construction starts.
- **Anchor priority extended** for CoA leads (DELIVERED Phase F.1 commit `4d58444`): `lifecycle_transitions.MAX(transitioned_at)` (CoA's analog of permits' `phase_started_at`, derived via LATERAL JOIN — `coa_applications` has no dedicated column) → `decision_date` → `hearing_date` → `first_seen_at` (CKAN first-surface timestamp, CoA's analog of permits' `application_date`). Snowplow freshness gate: a `lifecycle_transition` anchor older than `logic_variables.coa_lifecycle_transition_stale_days` (default 180 days = 6 months ≈ p75 of typical CoA decision cohort) becomes snowplow-eligible (treats long-stalled E.2-classified CoAs without subsequent transitions as Rescue Missions). The 30-day `inQuietPeriod` post-deploy classifies `coa_anchor_fallback_pct` and `coa_anchor_stale_lifecycle_transition_count` audit rows as INFO (operator pre-ack — see `docs/runbook/F1_baseline_quiet_period.md`); after the quiet period, threshold-based WARN/PASS classification activates.
- **Calibration cohort key** extended to `(permit_type, project_type, coa_type_class, from_seq, to_seq)` — the granular Universal Stream seq pair lets the engine learn CoA-stage cohorts separately from permit-stage cohorts (resolves Spec 84 §8.7 blind spot). CoA-stage cohort lookup reads from `phase_stay_calibration WHERE permit_type IS NULL` and keys on `from_seq` matching the lead's current `lifecycle_seq` (the cohort row's `from_seq` represents the phase being EXITED in the LAG window — measures stay duration IN that phase). 5-level fallback: exact → `(pt, __ALL__, fs)` → `(__ALL__, tc, fs)` → `(__ALL__, __ALL__, fs)` → logic_variables-driven default. Multiple `to_seq` variants for the same `from_seq` are collapsed by keeping the row with maximum `sample_size` (most reliable cohort signal).
- **Audit-verdict gate (Spec 42 §6.11 Phase F design constraint, follow-up #131):** the CoA branch is only executed if the most-recent `compute_phase_calibration` permits-chain `pipeline_runs` row (within `logic_variables.coa_gate_calibration_window_days`, default 7) has `records_meta.audit_table.verdict = 'PASS'` AND `status = 'completed'`. Fail-closed on every non-PASS state (no_prior_run, blocked_by_warn, blocked_by_fail, blocked_by_failed_run_*, blocked_by_null, query_error). Permit branch continues unaffected (degraded mode).
- **`linked_permit_num` carry-forward**: when a CoA gets linked to a permit (the C → BP handoff), the permit's forecast supersedes the CoA's. Old CoA forecasts purged via the stale-purge mechanism on next run (the CoA row's `lifecycle_phase` doesn't change but the linked permit becomes the authoritative lead). Cross-stream timeline reconstruction via `lifecycle_status_history` JOIN — see Spec 42 §6.6.B query examples.

### Inputs Filter — Stalled Gate (WF3 2026-04-22)
`SOURCE_SQL` includes `AND p.lifecycle_stalled = false` in the top-level WHERE clause (applies to both Branch A P1/P2 and Branch B active construction). Stalled permits have ancient `phase_started_at` anchors that produce `predictedStart` deep in the past → expired urgency → grace_purge deletes → stream regenerates (zombie loop). Excluding them at SQL level breaks the loop at source. `lifecycle_stalled` is `BOOLEAN NOT NULL DEFAULT false` (migration 085).

The stale-purge NOT EXISTS subquery also includes `AND p.lifecycle_stalled = false` so that forecasts for newly-stalled permits are purged on the next run (without this mirror, stalled permits still pass the NOT EXISTS subquery and their forecasts persist indefinitely).

### Outputs
Upserts rows to `trade_forecasts`. Runs two purge passes in Step 2 (atomic `withTransaction`):
- **Stale Purge:** Deletes forecasts for permits where the trade is deactivated or the permit is in `SKIP_PHASES` or is stalled. Uses `NOT EXISTS` against active `permit_trades` outside `SKIP_PHASES` with `lifecycle_stalled = false`.
- **Grace-Purge (WF2 2026-04-21):** Deletes forecasts where `urgency = 'expired' AND predicted_start < runAt - GRACE_PURGE_DAYS days` (180 days, sourced from `_contracts.json retention.grace_purge_days`). Prevents zombie accumulation of expired rows that the snowplow cannot rescue. Tracked via `grace_purged` in `records_meta`.
- **In-Memory Grace Cutoff (WF3 2026-04-22):** Before UPSERTing, each row's final `predictedStart` (after all recalibration) is compared against `graceCutoffMs = runAt - GRACE_PURGE_DAYS days`. If it falls before the cutoff, the row is silently dropped (`skippedTooOld++`) and never written to the database. This eliminates the zombie write+delete cycle where rows are UPSERTed and immediately grace_purge-deleted on the same run. `GRACE_PURGE_DAYS` is a named constant that drives both the SQL template literal and the JS cutoff math — any change propagates to both consumers automatically and is enforced by `contracts.infra.test.ts`.

### Urgency Classification
- **`expired`:** > `logic_variables.expired_threshold_days` (default 90) days in the past (dead lead).
- **`overdue`:** Physically passed the target phase OR > 30 days past predicted start.
- **`imminent`:** ≤ `trade_configurations.imminent_window_days` (per-trade; fallback 14) until predicted start. **This script is the authoritative consumer of the per-trade knob** — `update-tracked-projects.js` routes on the resulting `urgency` value and uses the same config only for alert message text (WF3-05 / H-W13). Setting `imminent_window_days = 0` disables the imminent tier for that trade — permits flow directly from `delayed` to `upcoming` because the `daysUntil <= 0` branch (delayed) fires first.
- **`upcoming`:** `imminent_window_days` < daysUntil ≤ 30 days until predicted start.

---

### 3.6 Audit-verdict thresholds & CoA gate policy (WF2 D2a/D3a, 2026-07-06)

The audit `verdict` (PASS/WARN/FAIL) is **advisory** — `run-chain.js` halts only on script crashes, never on a FAIL verdict. Forecast rows are written regardless. These gates drive the dashboard signal, not computation.

**Gate-threshold table** (all thresholds are `logic_variables`, operator-tunable via the Control Panel):

| Audit row | Source | WARN at | FAIL at | Notes |
|---|---|---|---|---|
| `default_calibration_pct` | share on `calibration_method='default'` | ≥ `forecast_default_calibration_warn_pct` (70) | ≥ `forecast_default_calibration_fail_pct` (85) | Was HARDCODED 20/50 (D2a externalized it). Relaxed while the post-rebuild calibration corpus is cold (~60% default). |
| `expired_urgency_pct` | share on `urgency='expired'` | ≥ 30% | ≥ 60% | Values HARDCODED, unchanged by D2a. |
| `unmapped_trades` | rows on a slug with no `trade_configurations` | > 0 → WARN | — | Acceptance `== 0` after Spec 80 P4 (§1). |
| `excluded_rows` / `excluded_trade_slugs` | non-forecastable rows (§1) | INFO | — | Outside `records_total`; loud, never silent. |
| `calibration_thresholds_relaxed` | active vs strict (20/50) pair | WARN whenever looser than strict | — | **GRD-F1 mechanical re-tightening guard** — emitted on EVERY run while relaxed; the loosening is permanent-by-choice-only. Value carries the active pair. |
| `calibration_cohort_fill_pct` | `100 − default_calibration_pct` | INFO | — | Recovery signal: once it passes the strict-PASS point (> 80% ⇒ default < 20%), restore strict 20/50. |

**CoA audit-verdict gate** (`compute-trade-forecasts.js` §Phase F.1) — the CoA forecast branch is gated on the most-recent permits-chain `compute_phase_calibration` `pipeline_runs` verdict within `coa_gate_calibration_window_days` (7). Policy is declarative via `logic_variables.coa_gate_policy`:

- `pass_only` — only a `PASS` verdict activates the CoA branch (strict; pre-D3a behavior).
- `pass_or_warn` (live default, D3a) — a `WARN` verdict within the window ALSO activates it. **FAIL, absent (`no_prior_run` / stale window), and non-completed runs stay BLOCKED.** The WARN here is a sample-size caveat, not a wrongness signal — strictly narrower than the already-sanctioned cold-start grace bypass.

Three bypass rows make every non-strict activation as loud as the others (override order is `verdict → grace → force-active`, force last — review-locked):

| Bypass row | Fires when | Status |
|---|---|---|
| `coa_audit_gate_warn_accepted` | a WARN verdict activated the branch under `pass_or_warn` | WARN when 1 |
| `coa_audit_gate_grace_bypass` | cold-start grace (no `pipeline_runs` ≥ 7d old) activated it | WARN when 1 |
| `coa_audit_gate_force_active` | operator set `coa_gate_force_active=1` | WARN when 1 |

## 4. Testing Mandate

- **Logic:** `trade-forecasts.logic.test.ts` — Tests the "Rolling Snowplow" math, bimodal target switching, and UTC midnight normalization.
- **Infra:** `trade-forecasts.infra.test.ts` — Verifies:
  - Ironclad Ghost Purge (deleting forecasts when trades are deactivated)
  - Grace-purge: DELETE WHERE urgency='expired' AND predicted_start older than 180 days inside `withTransaction` (not bare pool.query)
  - `grace_purged` in `records_meta`
  - `SKIP_PHASES_SQL` constant + `lifecycle_phase NOT IN` in SOURCE_SQL (SQL pushdown — not JS loop)
  - `SKIP_PHASES.size === 0` startup guard
  - `skipped_no_anchor` counter (not `skipped_terminal_orphan`)

---

## 5. Operating Boundaries & Context

### Target Files
- **`scripts/compute-trade-forecasts.js`**
- **`scripts/lib/lifecycle-phase.js`** (Shared constants)

### Out-of-Scope Files
- `scripts/classify-lifecycle-phase.js` — Timing only reads from the lifecycle; it never modifies it.

### Cross-Spec Dependencies
- **Relies on:** Lifecycle Phase Engine (for anchors), `72_lead_cost_model` (for allocation).
- **Consumed by:** `70_lead_feed` (to sort by timing) and Opportunity Score Engine (for the urgency multiplier).

### Control Panel (migrations 092 + 093)
- `trade_configurations.bid_phase_cutoff` + `work_phase_target` define the bimodal routing per trade
- `trade_configurations.imminent_window_days` defines the per-trade alert threshold for the CRM assistant
- `trade_configurations.multiplier_bid` + `multiplier_work` (migration 093) — per-trade urgency multipliers consumed by the Opportunity Score Engine
- `logic_variables.expired_threshold_days` (-90) drives the expired urgency classification
- `logic_variables.forecast_excluded_trade_slugs` (JSONB array, mig 210) — non-forecastable trade slugs (see §1 Forecastability contract). Operator-tunable; no code change to add/remove a slug.
- ~~`logic_variables.stall_penalty_precon` (45) + `stall_penalty_active` (14)~~ **RETIRED as control-panel drivers** — the per-row stall-recalibration math they fed was deleted WF3 2026-04-22 (§3, Instant Stall Recalibration removed; the Stalled Gate in SOURCE_SQL supersedes it). The two logic_variables still exist for potential future use but drive nothing in this engine today.
- `target_window` column on `trade_forecasts` stamps 'bid' or 'work' at the bimodal routing decision point

### Shared Config Loader
All config is loaded via `scripts/lib/config-loader.js` `loadMarketplaceConfigs(pool)` which returns `{ tradeConfigs, logicVars }` with hardcoded fallbacks on DB failure.

---

## 6. Engineering Requirements (Spec 47 & Bimodal Parity)

When refactoring `scripts/compute-trade-forecasts.js`, the following structural and logistical defenses must be implemented:

1. **Stream Execution (Spec 47 §6.1):** Prevent OOM errors by querying massive historical permit batches through `pipeline.streamQuery()`, processing via in-loop backpressure array limits.
2. **Graceful Locks (Spec 47 §5.5):** Acquire an advisory lock on a dedicated client and attach a `process.on('SIGTERM')` listener to ensure lock unbinding during forced shutdown.
3. **Bimodal Data Path:** The database join must retrieve `bid_phase_cutoff` and `work_phase_target` from the `trade_configurations` table, routing "Rescue Mission" states dynamically instead of hardcoding target dates.
4. **Zod Defense:** Extract the raw definitions of the consumed logic variables — `expired_threshold_days`, `urgency_overdue_days`, `urgency_upcoming_days`, `snowplow_buffer_days`, the `calibration_default_*` triple, and `forecast_excluded_trade_slugs` (JSONB array) — filtering them strictly via `Zod` (`LOGIC_VARS_SCHEMA`) prior to running math calculations so `NaN` propagation is impossible. (`stall_penalty_*` are no longer consumed — see §3, stall recalibration removed.)
5. **Atomic Commit (Spec 47 §6.3):** Ensure `ON CONFLICT DO UPDATE` upserts for forecasts occur exclusively within ephemeral `pipeline.withTransaction()` wrappers.
