# Triage — `scripts/update-tracked-projects.js` (Spec 82)

**Reviewers:** Gemini · DeepSeek R1 · Claude-adversarial · Claude-observability · Claude-spec-compliance · self-critical list
**Script:** 346 lines · Spec: `docs/specs/product/future/82_crm_assistant_alerts.md`

---

## List 1 — WF3 (Fix now; blocks production)

| # | Issue | Line(s) | Severity | Consensus | Fix direction |
|---|---|---|---|---|---|
| 82-W1 | **Alerts are never actually delivered** — script accumulates alerts into an array emitted only in `PIPELINE_SUMMARY.records_meta.alerts`; no `INSERT INTO notifications`, no API call, no downstream consumer parses the summary. `notifications` table exists (migration 010). User stories in spec §1 ("plumber receives Back to Work alert") are unfulfilled. Infra test (L121–125) only greps for the word `alerts` in source — false confidence. | 85, 145–151, 184–190, 330 | CRITICAL | Claude-obs, Claude-spec | Add `INSERT INTO notifications SELECT … FROM alerts` inside Step 3 transaction; update infra test to assert the INSERT |
| 82-W2 | **`imminent_window_days` Control Panel knob is cosmetic** — alert trigger is hardcoded `daysUntil <= 14` in `compute-trade-forecasts.js:81`; spec §6 promises per-trade tuning via config; current code only uses the value to render the message TEXT (L189), not to gate the alert | spec §6 + forecasts L81 | CRITICAL | Claude-spec | Push per-trade `imminent_window_days` down into `compute-trade-forecasts.classifyUrgency` so the threshold actually drives urgency='imminent' |
| 82-W3 | **`last_notified_urgency` has no reset path** — once set to `'imminent'`, never cleared when urgency returns to `upcoming`/`on_time`; next imminent→shift→imminent cycle is silently suppressed forever | 179–196 | CRITICAL | Gemini, Claude-adv, Claude-spec | Reset `last_notified_urgency` to the current `row.urgency` on each run (not hardcoded `'imminent'`); OR explicitly NULL it when urgency flips away from imminent. Match the stall self-resetting pattern (L170) |
| 82-W4 | **`urgency=NULL` bypasses expired archive** — LEFT JOIN to `trade_forecasts` yields NULL urgency for permits with no forecast row; `row.urgency === 'expired'` is false for NULL; those leads accumulate indefinitely in `tracked_projects` | 108, 134 | HIGH | Claude-adv, DeepSeek | Add explicit null check: archive if urgency IS NULL AND predicted_start is missing, OR ensure upstream forecasts always produce a row (contract with spec 85) |
| 82-W5 | **`isWindowClosed` off-by-one** — `currentOrdinal >= targetOrdinal` archives the lead AT the target phase (day work begins) rather than AFTER it passes; spec says "physically passed" (→ should be `>`) | 102–104 | HIGH | Claude-adv | Change to `currentOrdinal > targetOrdinal`; add test covering the boundary (plumbing @ P12) |
| 82-W6 | **`records_updated` telemetry uses pre-merge count** — dashboard shows `updates.length` (inflated by double-updates per row) while logs show `mergedUpdates.length`; metric is wrong and misleads ops | 320 | HIGH | Gemini, DeepSeek, Claude-adv, Claude-obs | `records_updated: mergedUpdates.length` |
| 82-W7 | **Orphan/unknown phases silently stuck forever** — if `row.lifecycle_phase` is `O1/O2/O3/O4` or an unknown value (not in PHASE_ORDINAL, not in TERMINAL_PHASES), `isWindowClosed` is permanently false and the lead never auto-archives; no telemetry signals the gap | 96–104 | HIGH | DeepSeek, Claude-adv, Claude-spec | Either (a) extend PHASE_ORDINAL to cover all phase values written by `classify-lifecycle-phase.js`, or (b) explicit `else` branch with warn log + unknown_phase counter |
| 82-W8 | **Unmapped trades silently skipped** — `if (!targets) continue` drops the row with no log; spec §4 says "fallback to 14-day imminent window", but the row is skipped entirely. `TRADE_TARGET_PHASE_FALLBACK` is imported but never used | 21, 93–94 | HIGH | Gemini, DeepSeek, Claude-adv, Claude-spec | Merge `TRADE_TARGET_PHASE_FALLBACK` into the mapping when `tradeConfigs[slug]` missing; warn log + unmapped_trade counter |
| 82-W9 | **Per-row UPDATE N+1 inside transaction** — 10K state changes = 10K sequential DB round-trips serialised under one lock; serial blocking time grows linearly | 226–251 | HIGH | Gemini, DeepSeek, Claude-adv, Claude-obs | Single bulk `UPDATE tracked_projects SET … FROM (VALUES …) AS v(id, status, last_notified_stalled, last_notified_urgency) WHERE tracked_projects.id = v.id` |
| 82-W10 | **Unbounded SELECT (§3.2)** — loads all active tracked_projects into Node heap; at 10K+ OOM risk; SDK `streamQuery` not used | 51 | HIGH | Gemini, DeepSeek, Claude-adv, Claude-obs | Replace `pool.query` with `pipeline.streamQuery`; accumulate updates in bounded batches |
| 82-W11 | **`lifecycle_stalled !== true` passes for NULL** — imminent alerts fire for sites with unknown stall status, contradicting spec §4 "suppress when stalled" intent | 180 | HIGH | DeepSeek, Claude-adv | Treat NULL as "unknown → suppress": `row.lifecycle_stalled === false` (strict) |
| 82-W12 | **Alerts array embedded unbounded in JSONB** — `records_meta.alerts: alerts` with no cap; 5K imminent alerts on a big ingest night bloats `pipeline_runs.records_meta` | 330 | HIGH | Gemini, Claude-obs | `alerts: alerts.slice(0, 200)` + `alerts_truncated: alerts.length > 200` + `alerts_total: alerts.length` |
| 82-W13 | **No advisory lock** — concurrent runs (manual re-trigger during nightly) double-fire alerts and corrupt memory columns | (absent) | HIGH | Claude-obs, Claude-spec | Add `pg_try_advisory_lock(82)`; exit cleanly if held (match sibling pattern in `compute-cost-estimates.js`) |
| 82-W14 | **`revision_num > 99` breaks `LPAD(…, 2, '0')` 2-digit contract** — would produce `permit:X:100` mismatching any reader assuming 2-char suffix; schema allows VARCHAR(10) | 277, 300 | HIGH | Gemini, Claude-spec | Schema-pin revision_num at 2 chars OR change format to `permit:num:rev` unpadded (coordinated with spec 81 reader) |
| 82-W15 | **lead_key format drift between producer and consumer** — this script writes `LPAD(tp.revision_num::text, 2, '0')`; `compute-opportunity-scores.js:48` reads `LPAD(tf.revision_num, 2, '0')` (no `::text`). Works today because column is VARCHAR; invites drift | 277, 300 | MEDIUM | Gemini, Claude-spec | Standardize on `::text` form in both scripts OR extract a shared `buildLeadKey()` helper in `scripts/lib/` |
| 82-W16 | **Wrong SPEC LINK** — points to `docs/reports/lifecycle_phase_implementation.md` | 15 | MEDIUM | All reviewers | Update to `docs/specs/product/future/82_crm_assistant_alerts.md` |
| 82-W17 | **urgency values `overdue/delayed` have no alert path** — `compute-trade-forecasts.js` emits 6 urgency values; only `imminent` and `expired` are handled; `overdue` (predicted_start already passed) arguably warrants user notice | spec §4 + L108, 134, 179 | MEDIUM | Claude-spec | Add routing for `overdue`/`delayed` OR spec-declare them intentionally silent |

---

## List 2 — Defer (Valuable but not blocking)

| # | Issue | Line(s) | Source |
|---|---|---|---|
| 82-D1 | Analytics UPSERT forces `updated_at=NOW()` unconditionally; breaks dirty-read semantics for downstream `compute-opportunity-scores` | 284–288 | Claude-adv |
| 82-D2 | Zero-out correlated `NOT EXISTS` with LPAD expression — seq-scan on `tracked_projects` per `lead_analytics` row; add generated column or functional index on `lead_key` shape | 295–305 | DeepSeek, Claude-adv, Claude-obs |
| 82-D3 | `TERMINAL_PHASES` hardcode duplicates `TERMINAL_P20_SET`/`WINDDOWN_P19_SET` exports in `scripts/lib/lifecycle-phase.js`; drift risk | 29 | Claude-adv, Claude-spec |
| 82-D4 | Build structured `records_meta.audit_table` (rows + thresholds + PASS/WARN) like `compute-cost-estimates.js` so admin FreshnessTimeline renders verdicts | 317–331 | Claude-obs |
| 82-D5 | Add `predicted_start_null_count` metric — signals upstream forecast engine gaps | 142, 183 | Claude-obs |
| 82-D6 | Add per-trade alert breakdown (`stall_by_trade`, `imminent_by_trade`) | 317–331 | Claude-obs |
| 82-D7 | Add `users_affected` + `max_alerts_per_user` metrics — detect "one user drowning" pathology | 85, 330 | Claude-obs |
| 82-D8 | Add `suppression_rate` metric (alerts evaluated vs fired) — distinguishes "quiet night" from "memory columns stuck" | 141–196 | Claude-obs |
| 82-D9 | Message phrasing when `predicted_start` is null: "target date is now uncertain" instead of "pushed back to TBD" | 142–144 | DeepSeek |
| 82-D10 | Loose `!=` vs strict `!==` consistency (currentOrdinal vs targetOrdinal) | 103 | DeepSeek |
| 82-D11 | Redundant `CLAIMED_STATUSES` check after the `saved` branch `continue` | 117 | Gemini |
| 82-D12 | PHASE_ORDINAL drift detection — snapshot hash or unit test pinning the ordinal map | 96 | DeepSeek |
| 82-D13 | `'tracked-projects'` magic string param to `loadMarketplaceConfigs` — document or constantize | 38 | DeepSeek |
| 82-D14 | Partial-run idempotency gap — if emitSummary commits `pipeline_runs.records_meta.alerts` but the `withTransaction` rolls back, the summary shows alerts that weren't actually committed → next run re-fires them (but note: the memory columns rollback with the txn, so re-fire is expected correctness-wise; the gap is summary/DB inconsistency for observability) | 225–255 + 317–331 | Claude-obs |
| 82-D15 | Case-insensitive `row.urgency === 'expired'` — brittle if upstream producer drifts casing | 108, 134 | DeepSeek |
| 82-D16 | End-of-loop log line runs after the `for` completes; on throw mid-iteration we don't log progress | 200 | Claude-adv |

---

## List 3 — Spec 82 Updates Needed

| # | Spec change | Why |
|---|---|---|
| 82-S1 | Define alert DELIVERY MECHANISM explicitly — must the script INSERT into `notifications` table? Emit to a queue? Call an API? | Spec §4 Outputs only mentions mutating tracked_projects + lead_analytics. User-story promises delivery. Gap is fundamental — 82-W1 can't be resolved without spec direction |
| 82-S2 | Specify that `imminent_window_days` per-trade config MUST drive the urgency classification threshold in `compute-trade-forecasts.js`, not only message copy | Ties to 82-W2; currently the Control Panel knob is advertised but inert |
| 82-S3 | Document `TERMINAL_PHASES` (P19/P20) auto-archive behaviour and source it from `scripts/lib/lifecycle-phase.js` rather than a local hardcode | Behaviour is in code but absent from spec; leads drift between script and shared lib |
| 82-S4 | Define behaviour for orphan / unknown `lifecycle_phase` values (O1–O4 written by `classify-lifecycle-phase.js`) — archive? skip? warn? | 82-W7 has no spec anchor; reviewers disagreed on intent |
| 82-S5 | Define behaviour for ALL urgency values — not just `imminent`/`expired`. How should `overdue`, `delayed`, `upcoming`, `on_time` route? (silent? alert? archive?) | Producer (`compute-trade-forecasts.js`) emits 6 values; spec 82 describes only 2. Reviewers flagged as silent gap |
| 82-S6 | Define NULL semantics for `lifecycle_stalled` (treat as stalled / treat as not-stalled / warn) and `urgency` (block alert / block archive) | Code currently has inconsistent NULL treatment (L134 misses expired archive; L180 lets imminent alerts fire) |
| 82-S7 | Define `isWindowClosed` boundary — does "window closed" mean `currentOrdinal > targetOrdinal` or `>=`? Concrete numeric example per trade | 82-W5 off-by-one has no spec anchor |
| 82-S8 | Define concurrent-run policy (mutex via advisory lock / serialized / re-entrant safe) | 82-W13; sibling scripts lock but spec is silent |
| 82-S9 | Define canonical `lead_key` format (producer ↔ consumer contract) and move to shared spec section referenced by 80/81/82 | 82-W14, 82-W15 — revision_num width, casting convention |
| 82-S10 | Enumerate alert type codes (`STALL_WARNING`/`STALL_CLEARED`/`START_IMMINENT`) as a spec enum referenced by downstream delivery code | 82-W1 delivery path needs a stable enum |
| 82-S11 | Require an `audit_table` telemetry structure (rows + thresholds + PASS/WARN) matching sibling spec 83 pattern | Admin FreshnessTimeline UI contract; 82-D4 |
| 82-S12 | Add spec §4 rule: INNER JOIN to `permits` silently drops tracked rows whose permit row is missing — intended? Add dropped_permit_rows metric requirement | Claude-spec found unspec'd edge case |
| 82-S13 | Define `'expired'` status in `tracked_projects` state machine — code anticipates it (line 282 excludes from analytics), but no code path writes it | State machine needs closure |
| 82-S14 | Document `'tracked-projects'` step name param to `loadMarketplaceConfigs` and its effect on which configs/fallbacks are loaded | 82-D13; avoids magic strings |

---

## Verdict

**NOT safe to run in production** — two CRITICALs (alerts never delivered; Control Panel knob cosmetic) break the spec's user-facing promise. Five HIGHs around memory-column reset, NULL handling, off-by-one archive boundary, orphan phase handling, and fan-out scaling block ship. 17 WF3 items, 16 defer items, 14 spec updates. The single most urgent fix is wiring the `notifications` table INSERT (82-W1).
