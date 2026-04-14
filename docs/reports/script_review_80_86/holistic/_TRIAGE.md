# Holistic Triage — 80-86 Chain (7 scripts + run-chain)

**Reviewers:** Gemini · DeepSeek R1 · Claude-adversarial · Claude-observability · Claude-spec-coherence · self
**Scope:** Cross-cutting issues synthesized from 7 per-script triages + 5 holistic reviewers
**Scripts reviewed:** compute-opportunity-scores.js (81), update-tracked-projects.js (82), compute-cost-estimates.js (83), classify-lifecycle-phase.js (84), compute-trade-forecasts.js (85), compute-timing-calibration-v2.js (86), run-chain.js

Per-file triages: `docs/reports/script_review_80_86/{81,82,83,84,85,86,run-chain}/_TRIAGE.md`
Raw reviewer outputs: `docs/reports/script_review_80_86/holistic/{gemini,deepseek,claude-cross-cutting,claude-observability,claude-spec-coherence}.md`

---

## List 1 — WF3 (Fix now; blocks production)

Cross-cutting items that appear in multiple scripts. Per-file specifics live in each script's `_TRIAGE.md`.

### A. Concurrency & Atomicity (system-wide integrity)
| # | Issue | Affected scripts | Severity | Evidence |
|---|---|---|---|---|
| H-W1 | **No orchestrator-level advisory lock** — 2 simultaneous chain runs spawn 2 sets of children; 81/82/85/86 have no per-script lock either; worst case interleaves DELETE+UPSERT, corrupts `trade_forecasts`, double-fires alerts, non-deterministic scores | run-chain + 81/82/85/86 | CRITICAL | RC-W7, 81-W4, 82-W13, 85-W3, 86-W2 |
| H-W2 | **Non-atomic mutations in 5 of 7 scripts** — 81 (multi-batch UPDATE), 85 (DELETE+UPSERT), 86 (N+1 UPSERT), 83 (row-catch inside txn swallows), 84 (Phase 2c backfill) all have crash → partial-state paths; SDK `withTransaction` is used correctly only in parts of 84 | 81, 83, 84, 85, 86 | CRITICAL | 81-W1, 83-W6, 84-W3, 85-W2, 86-W1 |
| H-W3 | **83 advisory lock leaked across pool connections** — `pool.query(acquire)` and `pool.query(release)` use different pg connections; session lock only releases on `pool.end()`; unlock is a no-op | 83 | CRITICAL | 83-W5 |
| H-W4 | **83 wrong advisory lock ID (74 not 83)** — convention = lock ID matches spec number; silent collision risk with any script that legitimately uses lock 74 | 83 | HIGH | 83-W7 |
| H-W5 | **No child process timeout / SIGTERM handler** — hanging script stalls chain indefinitely; killing orchestrator orphans child processes still consuming DB connections | run-chain | HIGH | DeepSeek holistic (new) |
| H-W6 | **Step cancellation is between-step only** — running `classify-lifecycle-phase` holds advisory lock ~130s; user cancel during that window is ignored | run-chain | HIGH | RC-W10 |

### B. Data Integrity (silent corruption)
| # | Issue | Affected | Severity | Evidence |
|---|---|---|---|---|
| H-W7 | **`PERCENTILE_CONT(…)::int` truncates every calibration median** — systematic downward bias at 4 SQL sites; compounds across multi-phase paths (4 hops × 0.5d = 2 days early); every forecast biased early | 86 | CRITICAL | 86-W3, Claude-obs F23 |
| H-W8 | **Dual-path drift 83 — `sumScopeAdditions` / `computeComplexityScore` de-dup missing in JS, present in TS** — pipeline writes inflated cost ($80K for dup `pool` tags), API recomputes clean; 81 scores off the JS-inflated value; DB↔API disagree for same permit | 83 (JS + TS) | CRITICAL | 83-W2, 83-W3 |
| H-W9 | **Dual-path drift 83 — Liar's Gate exists in JS only, not in TS** — API returns raw permit cost; pipeline writes overridden model cost; `is_geometric_override` + `cost_source='model'` become untrustworthy when TS recomputes | 83 (JS + TS) | CRITICAL | 83-W4 |
| H-W10 | **Commercial Shell 0.60x multiplier MISSING in both JS + TS** — spec 83 §3 L55 requires `0.60x` on interior trade slices; zero implementation; Shell permits overstate interior trade values by ~67% feeding 81 | 83 | CRITICAL | 83-W1 |
| H-W11 | **Config-undefined → NaN propagation crashes or silently corrupts** — `expiredThreshold` undefined → `Math.abs(undefined)` → NaN → `daysUntil <= NaN` always false → no permit ever classifies expired; `stall_penalty` undefined → Invalid Date on `toISOString()`; `parseFloat('2.8x')` → NaN → batch UPDATE crashes after earlier batches committed | 85, 81 | CRITICAL | 85-W8, 81-W3, DeepSeek holistic (new) |

### C. Producer→Consumer Contract Breaks
| # | Issue | Affected | Severity | Evidence |
|---|---|---|---|---|
| H-W12 | **Alerts never delivered** — 82 computes STALL_WARNING/STALL_CLEARED/START_IMMINENT and emits to `PIPELINE_SUMMARY.records_meta.alerts`; no INSERT into `notifications` table (migration 010); spec 82 user-stories completely unimplemented; infra test only greps for the word "alerts" | 82 | CRITICAL | 82-W1 |
| H-W13 | **`imminent_window_days` Control Panel knob is cosmetic end-to-end** — spec 82/85 promise per-trade tuning; 85 hardcodes `<= 14` for urgency classification; 82 uses config value only for message TEXT; operator-visible knob does nothing | 82 + 85 + config-loader | CRITICAL | 82-W2, 85-W1 |
| H-W14 | **Orphan phases O1/O2/O3 break 3 downstream consumers** — 84 produces them; `PHASE_ORDINAL` (shared lib) has no entries; 82 `isWindowClosed=false` forever → never archive; 85 silent work-phase fallback with bad anchor; 81 scores garbage | 84 producer → 82, 85, 81 consumers | CRITICAL | 84-W1, 82-W7, 85-W9 |
| H-W15 | **Urgency enum vocabulary mismatch** — 85 emits 6 values (expired/overdue/delayed/imminent/upcoming/on_time); 82 routes only imminent+expired; 81 filters only expired; 4 values silently ignored; `overdue` (window closing now) gets no CRM alert | 85 → 82, 81 | HIGH | 85-W18, 82-W17 |
| H-W16 | **`lead_key` format not single-sourced** — `permit:NUM:LPAD(rev,2,'0')` defined in 2 scripts with syntactic drift (`::text` cast present in writer, absent in reader); revision_num > 99 breaks the 2-digit contract | 82 (writer) + 81 (reader) | HIGH | 82-W14, 82-W15, 81-S9 |
| H-W17 | **`permit_phase_transitions` is a DEAD WRITE** — 84 writes every transition; 86 (intended consumer per spec 84) ignores it; mines `permit_inspections` instead; table absent from all manifest `telemetry_tables`; unbounded growth invisible | 84 producer → 86 consumer | CRITICAL | 84-W4, 86-W6, RC-W4 |

### D. Observability (false-green dashboard)
| # | Issue | Affected | Severity | Evidence |
|---|---|---|---|---|
| H-W18 | **Chain verdict aggregation silently ignores 4 of 6 tail steps** — run-chain reads `records_meta.audit_table.verdict`; 81/82/85/86 emit no domain audit_table; SDK auto-injects stub `{verdict:'PASS', rows:[]}`; admin UI shows green regardless of real state | 81, 82, 85, 86, run-chain | CRITICAL | RC-W3, 81-D1, 82-D4, 85-W11, 86-W7 |
| H-W19 | **`pipeline_schedules` global-disable cross-contaminates chains** — no `chain_id` filter; `classify_lifecycle_phase` is in BOTH permits (step 21) + coa (step 10); disabling for coa maintenance silently skips it in permits; no UI warning | run-chain | CRITICAL | RC-W1 |
| H-W20 | **stderr of failed child processes is LOST** — `stdio: ['inherit','pipe','inherit']`; stack traces go to parent console only; `error_message` stores only `"Command failed: node X"`; 3am postmortem impossible | run-chain | HIGH | RC-W6 |
| H-W21 | **`records_updated` wrong in 3 of 6 tail scripts** — 81 always emits batch-size not rowCount; 82 uses pre-merge inflated count; 85 computes post−pre after the DELETE → negative; orchestrator stores verbatim without validation | 81, 82, 85 | HIGH | 81-W5, 82-W6, 85-W6 |
| H-W22 | **`telemetry_null_cols` gaps in 4 critical column sets** — missing: `opportunity_score` (81, UPDATE-only means row-count delta is always 0), `trade_contract_values`/`is_geometric_override`/`modeled_gfa_sqm`/`cost_source` (83), `predicted_start`/`urgency`/`target_window` (85), memory columns (82) | manifest | HIGH | RC-W2, RC-W5 |
| H-W23 | **`pipeline_runs.records_meta` retention timebomb** — ~130MB/year JSONB growth; no DELETE/partition/archival; 82-W12 unbounded alerts array compounds; admin queries degrade over time | run-chain + migrations | HIGH | RC-W11, 82-W12 |
| H-W24 | **No `model_version` / `training_window` on outputs** — 83 hardcodes `model_version=1`; 86 `phase_calibration` has no versioning columns; retuning a coefficient produces indistinguishable rows; drift detection impossible | 83, 86 | HIGH | 83-W14, 86-W9 |

### E. Pagination / Scaling (§3.2 violations)
| # | Issue | Affected | Severity | Evidence |
|---|---|---|---|---|
| H-W25 | **Unbounded SELECT + unbounded in-memory buffer in 3 scripts** — 81 (~700K), 82 (~10K–100K), 85 (~700K + forecasts[] double-copy); SDK `streamQuery` exists; used in 84 + 83 but not the other 3 | 81, 82, 85 | HIGH | 81-W2, 82-W10, 85-W4/W5 |

### F. Duplicated Knowledge / Drift
| # | Issue | Affected | Severity | Evidence |
|---|---|---|---|---|
| H-W26 | **SPEC LINK rot across 6 files** — all point to `docs/reports/lifecycle_phase_implementation.md` (a report, not a spec); 81, 82, 84, shared lib, 85, 86 all broken | 81, 82, 84, 85, 86, lifecycle-phase.js | HIGH | 81-W7, 82-W16, 84-W6, 85-W14, 86-W5 |
| H-W27 | **`SKIP_PHASES` hardcoded in SQL duplicates JS constant** | 85 | MEDIUM | 85-W13 |
| H-W28 | **`PHASE_ORDINAL` duplicated in 86 SQL vs shared lib** — shared lib comment falsely claims 86 imports it | 86, shared lib | MEDIUM | 86-W4 |
| H-W29 | **`TERMINAL_PHASES` hardcoded in 82** duplicates `TERMINAL_P20_SET`/`WINDDOWN_P19_SET` exports from shared lib | 82 | MEDIUM | 82-D3 |
| H-W30 | **`O4` phantom phase dead code in 4 places** — VALID_PHASES, 85 SKIP_PHASES, 82 defensive handler; no classifier rule produces it | shared lib, 85, 82 | MEDIUM | 84-W10, 85-D6, 82-W10 |

### G. Control Panel Coverage
| # | Issue | Affected | Severity | Evidence |
|---|---|---|---|---|
| H-W31 | **Inconsistent `loadMarketplaceConfigs` adoption** — 81/82/83/85 load configs; 84/86 do NOT; knobs like `calibration_min_sample_size`, `stall_threshold_days`, `bloat_*`, `default_median_days`, `overdue_threshold_days`, `confidence_sample_*` hardcoded | 84, 86, run-chain | HIGH | 84-W5, 86-W11, 86-W12, 85-W15/W16/W17, RC-W14 |

### H. Dead Code / Dead Columns
| # | Issue | Affected | Severity | Evidence |
|---|---|---|---|---|
| H-W32 | **`data_quality_snapshots` migration 080 columns never written** — `cost_estimates_total/from_permit/from_model/null_cost` added; no writer populates them | 83 | HIGH | 83-W15 |
| H-W33 | **`compute_timing_calibration` v1 orphaned in manifest** — registered but in no chain | run-chain manifest | MEDIUM | RC-W15 |

---

## List 2 — Defer (valuable but not blocking)

| # | Issue | Source |
|---|---|---|
| H-D1 | Extract shared `buildLeadKey(permitNum, revisionNum)` helper; add stability test | Claude-spec, 82-W15 |
| H-D2 | Consolidate PIPELINE_SUMMARY parsing code between run-chain success/failure paths | Gemini |
| H-D3 | Pre-flight bloat pct stored as formatted string `'30.0%'` — consumers must re-parse | Gemini holistic |
| H-D4 | Sanitize metric key names (`sys_db_bloat_${table}` with special chars could break dashboard parsing) | DeepSeek holistic |
| H-D5 | Admin UI audit ledger for `permit_phase_transitions` — currently write-only | 84-D1 |
| H-D6 | Per-trade forecast breakdown in 85 telemetry | 85-D5 |
| H-D7 | `classify_lifecycle_phase` runs on no-ingest days (~237K full scan) with no incremental watermark | 84-D10, RC-D11 |
| H-D8 | End-to-end permit audit trail across 80-86 chain — no single link key connects lifecycle → calibration → forecast → score → alert | Claude-obs F8 |
| H-D9 | `DISTINCT ON (permit_num)` in 86 non-deterministic without tie-breaker | 86-W10 |
| H-D10 | Stale `phase_calibration` rows never pruned when sample drops below threshold | 86-W14 |
| H-D11 | Skip-status ambiguity: `disabled` vs `gate_skipped` both set status='skipped' | RC-W12 |
| H-D12 | Gate-skip message pollutes `error_message` column | RC-W13 |
| H-D13 | `--force` not propagated to child scripts; semantics undocumented | RC-W20 |
| H-D14 | Duplicate all-time vs recency PERCENTILE_CONT — no recency weighting | 86-W8 |
| H-D15 | Per-row UPDATE N+1 pattern in 82 inside transaction — 10K state changes = 10K DB round-trips | 82-W9 |
| H-D16 | `COA_STALL_THRESHOLD_DAYS` undefined → falsy handling could mark stalled CoAs as active | DeepSeek holistic |
| H-D17 | `score_delta_vs_prior`, `liar_gate_override_count`, `stall_recalibrated_count`, `bimodal_routing_split`, `integrity_flag_keys` — missing audit metrics across scripts | Claude-obs F3, 81-D2, 85-D1/D2, 83-W19, 81-W6 |
| H-D18 | Correlated NOT EXISTS in 82 zero-out query — perf cliff at scale | 82-D2, 82-W9 |

---

## List 3 — Spec Updates Needed (cross-cutting + per-spec)

### Cross-spec structural updates
| # | Spec change | Why |
|---|---|---|
| H-S1 | **Publish `docs/specs/product/future/80_data_contracts.md`** as canonical single-source-of-truth for: `lead_key` format, urgency enum (6 values + required downstream action per value), `target_window` enum (currently spec 80 says `early_bid/rescue_mission`, DB/code says `bid/work` — drift), `cost_source` enum (add `'none'` for Path 3), `calibration_method` enum (spec 85 has 4 levels; code emits 5), `lifecycle_phase` enum, alert-type codes (STALL_WARNING/CLEARED/START_IMMINENT), `trade_contract_values` JSONB shape | H-W14, H-W15, H-W16, Claude-spec 25 findings |
| H-S2 | **Reconcile spec 72 vs spec 83** — both titled "Lead Cost Model"; script 83 SPEC LINK points to 72 but 83 is the active implementation; mark one SUPERSEDED, cross-reference the other | Claude-spec H-2 |
| H-S3 | **Declare `logic_variables` canonical key set** in spec 86; resolve drift (`los_base_unit` vs `los_base_divisor`, `imminent_window` vs `imminent_window_days`, etc.); each spec 81-85 references spec 86 for key ownership | H-W31, Claude-spec H-12, H-13 |
| H-S4 | **Document canonical chain-ordering DAG** across specs 41/81-86 — producer→consumer dependencies | Claude-spec |
| H-S5 | **Fix all SPEC LINK headers** (6 files) — definitive map: 81→81 spec, 82→82 spec, 84+lib→84 spec, 85+86→85 spec | H-W26 |

### Spec 40 (Pipeline System) updates
| # | Spec change | Why |
|---|---|---|
| H-S6 | Declare `pipeline_runs.status` enum (7 values incl. `completed_with_errors`, `completed_with_warnings`) | RC-W19 |
| H-S7 | Declare `pipeline_schedules` chain scope: global vs per-chain; require `chain_id` column | H-W19 |
| H-S8 | Define retry/resume policy (restart from step 1 vs resume from failed step) | RC-D12 |
| H-S9 | Require `audit_table` emission for all chain scripts (not only quality scripts) with minimum row set | H-W18 |
| H-S10 | Require orchestrator-level advisory lock for concurrent chain runs | H-W1 |
| H-S11 | Define `pipeline_runs` retention policy (90-day age-out or partitioning) | H-W23 |
| H-S12 | Define stderr capture contract (child failures must save stack trace in `error_message`) | H-W20 |
| H-S13 | Define SIGTERM propagation contract (orchestrator → children on cancel) | H-W5 |
| H-S14 | Define child process timeout contract | H-W5 |
| H-S15 | Define `telemetry_null_cols` contract: require for every downstream-consumed output column | H-W22 |
| H-S16 | Separate skip-status: `disabled` vs `gate_skipped` as distinct values | RC-W12 |

### Spec 81 (Opportunity Score) updates
| # | Spec change | Why |
|---|---|---|
| H-S17 | Rename `los_base_unit` → `los_base_divisor` (align spec with DB); document tier thresholds 80/50/20 | 81-S1, 81-S2 |
| H-S18 | Declare `IS DISTINCT FROM` idempotency contract; per-trade multiplier fallback semantics | 81-S5, 81-S6 |
| H-S19 | Integrity audit persistence requirement (flagged permits must be queryable) | 81-S4, H-D17 |

### Spec 82 (CRM Alerts) updates
| # | Spec change | Why |
|---|---|---|
| H-S20 | **Define alert delivery mechanism** — MUST INSERT into `notifications` table | H-W12 |
| H-S21 | Document TERMINAL_PHASES auto-archive; isWindowClosed boundary (> vs >=); NULL handling for lifecycle_stalled/urgency | 82-S3, 82-S6, 82-S7 |
| H-S22 | Require all 6 urgency values have defined downstream routing | H-W15 |
| H-S23 | Specify behaviour for orphan phases O1-O4 + unknown phase values in tracked_projects | 82-S4, 84-S12 |

### Spec 83 (Cost Model) updates
| # | Spec change | Why |
|---|---|---|
| H-S24 | **Expand Commercial Shell §3**: enumerate interior-trade subset, Shell detection heuristic | H-W10 |
| H-S25 | Document `renter_pct > 50` urban/suburban heuristic; floor defaults 2/1; primary parcel disambiguation | 83-S2, S3, S4 |
| H-S26 | Define `model_version` semantics (when to bump, shadow-mode for v2) | 83-S5 |
| H-S27 | Reconcile spec §6 trade slugs + percentages vs migration 092 seed (foundation/glazing/pool-installation naming; raw vs normalized) | 83-S12 |
| H-S28 | Specify producer must populate `data_quality_snapshots` columns (migration 080) | 83-S13 |
| H-S29 | Lock dual-path policy (byte-for-byte sync via CI OR extract shared JSON) | 83-S16 |

### Spec 84 (Lifecycle Phase Engine) updates
| # | Spec change | Why |
|---|---|---|
| H-S30 | Document `TIME_BUCKET_GROUPS` suppression policy (P7a/b/c yes; O2/O3 needs decision) | 84-S2, S3 |
| H-S31 | Define orphan phase archive policy (O1/O2/O3 behaviour in tracked_projects) | H-W14 |
| H-S32 | Promote `stall_threshold_days` (730 vs 180) to `logic_variables` | 84-S10 |
| H-S33 | Specify `unclassified_threshold` — absolute vs percentage | 84-S11 |
| H-S34 | Declare consumer of `permit_phase_transitions.neighbourhood_id` (calibration v2 doesn't read) OR drop column | H-W17 |

### Spec 85 (Trade Forecast Engine) updates
| # | Spec change | Why |
|---|---|---|
| H-S35 | **Declare spec 85 owns consuming per-trade `imminent_window_days`** for urgency classification, not only message text | H-W13 |
| H-S36 | Document PRE_CONSTRUCTION_PHASES set → ISSUED calibration anchor (P18 exclusion rationale) | 85-S4 |
| H-S37 | Lock UTC midnight normalization contract; bimodal `<=` semantics; expired-vs-isPastTarget precedence | 85-S3, S6, S7 |
| H-S38 | Ironclad Ghost Purge dual-condition documented (phase-died OR trade-deactivated) | 85-S5 |
| H-S39 | Promote remaining hardcoded thresholds (default_median_days, confidence_sample_*, overdue_threshold_days) to logic_variables | 85-S8 |
| H-S40 | Add dedicated "Phase Calibration Algorithm" section (currently undocumented in any spec) — LAG pairs, ISSUED synthetic, percentile cuts, HAVING threshold, forward-only filter, 4-shape output contract | H-S / 86-W5 |
| H-S41 | Spec invalid `phase_started_at` handling (skip+warn vs crash) | 85-S13 |
| H-S42 | Spec `stall_penalty_*` sign rules (positive-only; validate in config-loader) | 85-S14 |

### Spec 86 (Control Panel) updates
| # | Spec change | Why |
|---|---|---|
| H-S43 | Define `model_version` + `training_window_start/end` requirement on `phase_calibration` | H-W24 |
| H-S44 | Define recency policy (all-time vs rolling window) for calibration | 86-S5 |
| H-S45 | Promote `min_sample_size`, `percentile_low/high`, `gap_days_max`, `forward_transitions_only`, `bloat_warn_threshold`, `bloat_abort_threshold` to `logic_variables` | 86-S6, RC-S11 |
| H-S46 | Specify stale-row policy — when `phase_calibration` row no longer meets threshold, delete? | 86-S8 |
| H-S47 | Resolve bloat threshold conflict (pre-flight 30%/50% warn-only vs assert-engine-health 10% FAIL) | RC-S12 |

---

## System-Level Verdict

**NOT safe to run in production** without a focused Phase-1 fix pass. The 80-86 chain has three systemic classes of risk:

**Class 1 — Silent data corruption.** The chain runs without crashing most nights but quietly writes wrong data. PERCENTILE_CONT `::int` truncation biases every calibration median (H-W7). Dual-path JS/TS drift in 83 has pipeline writes disagreeing with API reads for every cost estimate (H-W8/W9). Commercial Shell overstates interior trades by 67% (H-W10). Non-atomic mutations in 5 scripts leave partial-commit state after any crash (H-W2). No advisory lock means concurrent runs produce compound corruption (H-W1).

**Class 2 — Observability collapse.** The admin dashboard fabricates green status for 4 of 6 tail steps because their `audit_table` is missing (H-W18); `pipeline_schedules` global-disable silently breaks the wrong chain (H-W19); failed child `stderr` is lost so 3am postmortems are impossible (H-W20); `records_updated` is wrong in 3 scripts (H-W21); `permit_phase_transitions` grows unbounded with no admin UI and no consumer (H-W17).

**Class 3 — Product contract failures.** CRM alerts are computed but never delivered to the notifications table (H-W12) — spec 82 user stories are 100% unimplemented. The `imminent_window_days` Control Panel knob is cosmetic (H-W13). Orphan phases O1/O2/O3 produce tracked leads that never archive (H-W14). Four of six urgency values have no downstream routing (H-W15).

**Recommended fix sequence:**
- **Phase 1 (ship-blocker):** H-W1 (orchestrator lock), H-W7 (::int truncation), H-W12 (alert delivery), H-W13 (imminent_window), H-W18 (audit_table across 4 scripts), H-W19 (chain_id filter), H-W2 transaction boundaries in 81/85/86, H-W8/W9/W10 (cost model dual-path + Shell).
- **Phase 2 (observability):** H-W20 (stderr), H-W21 (records_updated), H-W22 (telemetry_null_cols manifest additions), H-W24 (model_version columns), H-W17 (decide permit_phase_transitions fate).
- **Phase 3 (scaling):** H-W25 (streamQuery adoption), H-W23 (retention policy), H-W14 (PHASE_ORDINAL orphan entries), H-W15 (urgency routing).
- **Phase 4 (hygiene):** H-W26 (SPEC LINK fixes), H-W27-H-W30 (drift removal), H-W31 (config-loader uniformity), H-W32-H-W33 (dead-code removal).

**Tallies:** 33 WF3 items · 18 defer items · 47 spec updates.

**Rejected CLI claims (false positives):**
- DeepSeek's "CRITICAL lock leak" on 84 — verified correct code flow (confirmed by Claude-adv + Claude-spec).
- DeepSeek's "CRITICAL PHASE_ORDINAL omits P1-P8" on 86 — ordinal filter only applies to phases STAGE_TO_PHASE_SQL emits (P9-P17); ISSUED pairs don't use the filter.
- DeepSeek's "HVAC Final mis-order" on 86 — `%hvac final%` (L47) correctly fires before `%hvac%` (L54).
- DeepSeek's "bimodal `<=` bug" on 85 — `<=` is intentional; `isPastTarget` guard at L237 prevents false-positive overdue.
- DeepSeek's "UTF-8 split mid-char" on run-chain — `StringDecoder.write()` normalizes boundaries before return.
- DeepSeek's "type coercion `0 === 0`" on run-chain — all 80-86 scripts emit numeric types that survive JSON round-trip.
