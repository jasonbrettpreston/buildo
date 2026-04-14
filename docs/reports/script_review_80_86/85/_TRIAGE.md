# Triage — `scripts/compute-trade-forecasts.js` (Spec 85)

**Reviewers:** Gemini · DeepSeek R1 · Claude-adversarial · Claude-observability · Claude-spec-compliance · self
**Script:** 454 lines · Spec: `docs/specs/product/future/85_trade_forecast_engine.md`

**Rejected claim:** DeepSeek's "CRITICAL bimodal `<=` bug" (L221) is a false positive — the `<=` is intentional ("being AT bid_phase = window OPEN") and the `isPastTarget` guard at L237–239 correctly trips only when `targetPhase === targets.work_phase`. Walk-through: P3 permit, bid_phase=P3 → targetWindow=bid, isPastTarget=false, classifies based on daysUntil only. Correct per spec §3. Claude-adv and Claude-spec independently rejected the claim.

---

## List 1 — WF3 (Fix now; blocks production)

| # | Issue | Line(s) | Severity | Consensus | Fix |
|---|---|---|---|---|---|
| 85-W1 | **Per-trade `imminent_window_days` NOT consumed** — script hardcodes `daysUntil <= 14` at L81; downstream `update-tracked-projects.js` uses the config value only for message TEXT (confirms 82-W2); Control Panel knob is cosmetic for urgency classification | 81 | CRITICAL | Claude-spec, cross-script | Pass `tradeConfigs[trade_slug].imminent_window_days` into `classifyUrgency`; default to 14 only if missing |
| 85-W2 | **Non-atomic DELETE + UPSERT** — stale-purge DELETE (L329–344) and batch UPSERTs (L386–405) are separate `pool.query` calls; crash between = partial table state; §9.1 violation | 329–344, 386–405 | CRITICAL | Gemini, DeepSeek, Claude-adv, Claude-obs, Claude-spec | Wrap DELETE + all UPSERTs in a single `pipeline.withTransaction(pool, async (client) => {…})` |
| 85-W3 | **No advisory lock** — concurrent run (admin manual re-trigger during nightly) races on DELETE/UPSERT; sibling `classify-lifecycle-phase.js` and `compute-cost-estimates.js` both lock | (absent) | HIGH | Claude-adv, Claude-obs, Claude-spec | `pg_try_advisory_lock(85)` on a dedicated `pool.connect()` client, held for the run |
| 85-W4 | **Unbounded SELECT loads all active permit-trade pairs into heap** — potentially 700K+ rows; §3.2 violation; SDK exports `streamQuery`; sibling `compute-cost-estimates.js` uses it | 160–171 | HIGH | All reviewers | Switch to `pipeline.streamQuery(pool, sql)`; flush `forecasts` buffer incrementally in `FORECAST_BATCH_SIZE` chunks |
| 85-W5 | **`forecasts[]` in-memory array grows unbounded** — holds 700K+ objects before any write; combined with W4 = ~double-copy of dataset | 180, 295–308 | HIGH | Claude-obs | Interleave streaming with batched UPSERTs per W4 refactor |
| 85-W6 | **`records_new` wrong after purge** — `preRowCount` captured AFTER the DELETE at L329; if purge removes more than UPSERT adds, `postRowCount - preRowCount` is negative → clamped to 0 → new rows invisible | 356–359, 421, 432 | HIGH | DeepSeek, Claude-adv, Claude-obs | Capture `preRowCount` BEFORE the DELETE; `records_new = postRowCount - (preRowCountBeforeDelete - stalePurged)` |
| 85-W7 | **Invalid-date propagation** — `new Date(phase_started_at)` with malformed timestamp returns Invalid Date; `setUTCDate + NaN` produces NaN; `predictedStart.toISOString()` throws RangeError → crashes pipeline mid-run; no guard | 254–257, 299 | HIGH | DeepSeek, Claude-adv | Add `if (isNaN(anchorDate.getTime())) { warn; skipped++; continue; }` after L254 |
| 85-W8 | **`Math.abs(undefined)` → NaN when config missing** — if `logicVars.expired_threshold_days` is null, `-Math.abs(undefined)` → NaN; `daysUntil <= NaN` always false; no permit ever classifies as 'expired' | 64, 71 | HIGH | Gemini | Add fallback: `const threshold = -Math.abs(expiredThreshold ?? 90)`; or validate in config-loader |
| 85-W9 | **`PHASE_ORDINAL[unknown_phase]` silent work-window fallback** — if `lifecycle_phase` is not in PHASE_ORDINAL, `currentOrdinal=undefined`; `undefined != null` is false at L221 → else-branch → silent work_phase targeting with bad anchor; no warning | 204, 221 | HIGH | Gemini, DeepSeek, Claude-adv | Add `if (currentOrdinal == null) { warn; skipped++; continue; }` after L204 |
| 85-W10 | **`stall_penalty` negative/null not validated** — `stall_penalty_precon/active` from config passes `Number.isFinite` + non-zero guards but not sign check; a negative value pushes predicted_start INTO the past | 271–273 | HIGH | DeepSeek, Claude-adv | `Math.abs()` both reads OR add positive-only guard in `config-loader.js` for stall_penalty_* keys |
| 85-W11 | **No audit_table in PIPELINE_SUMMARY** — admin FreshnessTimeline cannot render thresholds/verdicts; sibling `compute-cost-estimates.js` provides full audit_table | 429–441 | HIGH | Claude-obs | Build audit_table with rows for forecasts_computed, stale_purged, unmapped_trades (threshold `==0`→WARN), default_calibration_pct (threshold `<5%`→WARN), stall_recalibrated_count |
| 85-W12 | **Calibration method distribution not emitted** — silent upstream calibration failure would route every permit to `method='default'` (30-day hardcoded median) with no telemetry signal | 429–441 | HIGH | Claude-obs | Aggregate `forecasts.reduce` on `calibration_method`; emit counts + percentage-default in records_meta |
| 85-W13 | **SKIP_PHASES duplicated in SQL** — L340 hardcodes `NOT IN ('P19','P20','O1','O2','O3','O4','P1','P2')`; drifts if JS Set changes | 27–31, 340 | MEDIUM | Gemini | Parameterize as `<> ALL($1::text[])` with `[...SKIP_PHASES]` |
| 85-W14 | **Wrong SPEC LINK** — points to `docs/reports/lifecycle_phase_implementation.md §Phase 4` (a report, not a spec); same issue in `compute-opportunity-scores.js` and `compute-timing-calibration-v2.js` | 10 | MEDIUM | All reviewers | Update to `docs/specs/product/future/85_trade_forecast_engine.md` |
| 85-W15 | **`classifyConfidence` thresholds hardcoded** — 0/10/30 sample-size cuts for low/medium/high; not in logic_variables; operator can't tune | 86–91 | MEDIUM | Claude-spec | Promote to `logic_variables.confidence_sample_*` keys |
| 85-W16 | **`DEFAULT_MEDIAN_DAYS = 30` hardcoded** | 46, 153 | MEDIUM | Claude-spec | Promote to `logic_variables.default_median_days` |
| 85-W17 | **`-30` overdue threshold hardcoded** — sibling `expired_threshold_days` was promoted to config in WF3 2026-04-13 but this one was missed | 79 | MEDIUM | Claude-spec | Promote to `logic_variables.overdue_threshold_days` |
| 85-W18 | **Urgency value vocabulary mismatch with consumers** — producer emits 6 values (expired/overdue/delayed/imminent/upcoming/on_time); `update-tracked-projects.js` only handles `imminent`+`expired`; `compute-opportunity-scores.js` only filters `expired`; 4 states are computational dead weight (or missing downstream behaviour) | (system) | HIGH | Claude-spec | Either narrow producer enum OR extend consumers to route overdue/delayed/upcoming/on_time. Spec 85 must declare which downstream action each value triggers |
| 85-W19 | **Urgency distribution query is full-scan** — ~700K row full SELECT after every run for telemetry; compute in-memory from `forecasts` array | 424–427 | LOW | Gemini, Claude-obs | Reduce `forecasts` array to urgency counts in JS; drop the DB query |

---

## List 2 — Defer (valuable but not blocking)

| # | Issue | Line(s) | Source |
|---|---|---|---|
| 85-D1 | Add stall-recalibration count metric (how many permits had stall penalty applied) | 270–285 | Claude-obs |
| 85-D2 | Add bimodal routing count (`bid_routed`/`work_routed` split) | 220–227 | Claude-obs |
| 85-D3 | Add median daysUntil metric | 288–290 | self |
| 85-D4 | Add delta-vs-prior-run metric (how many predicted_start dates shifted >7 days) | telemetry | Claude-obs |
| 85-D5 | Add per-trade forecast counts (catches misconfigured bid_phase_cutoff for a trade) | 429–441 | Claude-obs |
| 85-D6 | Remove `O4` from SKIP_PHASES — dead phase across 80-86 ecosystem | 29 | DeepSeek, self |
| 85-D7 | `computed_at = NOW()` only in ON CONFLICT branch, not on INSERT — DEFAULT should fire but worth auditing | 403 | DeepSeek |
| 85-D8 | `classifyConfidence` uses strict `sampleSize === 0` — should be `?? 0` to handle NULL | 87 | DeepSeek |
| 85-D9 | Dead line: `anchorDate.setUTCHours(0,0,0,0)` is immediately cloned at L256 so the mutation doesn't persist to predictedStart (cosmetic, no bug) | 255–256 | Claude-spec |
| 85-D10 | Batch-progress logging only every 10 batches — final batches can be uncommitted in logs | 408–413 | Claude-obs |
| 85-D11 | Spec lists 4 fallback levels; code implements 5 method names — reconcile | 135–154 | Claude-spec |
| 85-D12 | `fromPhase = PRE_CONSTRUCTION_PHASES ? 'ISSUED' : lifecycle_phase` — if calibration producer drops 'ISSUED' synthetic key, all 4 fallback levels collapse silently to default; add telemetry | 242–246 | Claude-spec |
| 85-D13 | No top-level try/catch in pipeline.run callback (SDK wraps but explicit is clearer) | 93 | Gemini |
| 85-D14 | `expiredThreshold` sign normalization `-Math.abs(…)` — document expected DB sign in JSDoc | 71 | DeepSeek |

---

## List 3 — Spec 85 Updates Needed

| # | Spec change | Why |
|---|---|---|
| 85-S1 | Declare ownership: this script MUST consume `tradeConfigs[trade].imminent_window_days` for urgency classification (not just message rendering in 82) | Resolves 85-W1 / 82-W2 jointly |
| 85-S2 | Specify producer→consumer urgency enum contract — define required downstream behaviour for all 6 urgency values or narrow the producer enum | 85-W18 |
| 85-S3 | Add §3 contract line: "UTC midnight normalization is required for all date arithmetic" | Currently implementation-only |
| 85-S4 | Document `PRE_CONSTRUCTION_PHASES` set (P3-P8) → forces `'ISSUED'` calibration anchor; include P18 exclusion rationale (Probe 2) | 85-W / Claude-spec |
| 85-S5 | Document "Ironclad Ghost Purge" dual condition: delete if EITHER phase died OR trade deactivated | 85-W / Claude-spec |
| 85-S6 | Lock expired-vs-isPastTarget precedence ordering (graveyard first) as a contract, with example | Implementation-only today |
| 85-S7 | Lock bimodal `<=` semantic as a contract — "currentOrdinal AT bid_phase → bid_window OPEN" | Subtle; `isPastTarget` guard at L237 depends on it |
| 85-S8 | Promote 4 hardcoded thresholds to `logic_variables`: default_median_days, confidence_sample_low/medium/high, imminent_window_days (already per-trade), overdue_threshold_days | 85-W15, 85-W16, 85-W17 |
| 85-S9 | Declare calibration method enum with EXACT set of 5 values (exact, fallback_all_types, fallback_issued_type, fallback_issued_all, default) OR reduce to spec's 4 | 85-D11 — drift |
| 85-S10 | Define advisory-lock requirement and lock ID convention (85) | 85-W3 |
| 85-S11 | Require audit_table structure in PIPELINE_SUMMARY with minimum rows: forecasts_computed, unmapped_trades, default_calibration_pct, stall_recalibrated_count | 85-W11, 85-W12 |
| 85-S12 | Fix SPEC LINK across 3 dependent files (85, 81, 86) — canonical path for 85 is `docs/specs/product/future/85_trade_forecast_engine.md` | 85-W14 |
| 85-S13 | Specify "invalid / malformed phase_started_at" handling: skip with warn vs crash | 85-W7 |
| 85-S14 | Specify `stall_penalty_*` sign rules (positive integer only) — validate in config-loader | 85-W10 |

---

## Verdict

**NOT safe to run in production.** 2 CRITICAL + 10 HIGH findings. Top ship-blockers: (1) `imminent_window_days` knob is cosmetic — this script must consume it to make the spec 82 Control Panel promise real (85-W1), (2) non-atomic DELETE+UPSERT creates a data-gap window on crash (85-W2), (3) no advisory lock permits concurrent-run corruption (85-W3), (4) unbounded SELECT + unbounded `forecasts[]` OOM risk at 700K+ rows (85-W4/W5), (5) invalid-date and NaN-config paths that crash the pipeline (85-W7/W8). 19 WF3 items, 14 defer items, 14 spec updates. DeepSeek's "bimodal `<=`" claim rejected as false positive.
