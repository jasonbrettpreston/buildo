# Triage — `scripts/compute-timing-calibration-v2.js` (Spec 86 / 85)

**Reviewers:** Gemini · DeepSeek R1 · Claude-adversarial · Claude-observability · Claude-spec-compliance · self
**Script:** 327 lines · **Spec ownership is unclear** — this script produces `phase_calibration` consumed by spec 85's flight tracker, but the algorithm is undocumented in any spec. Spec 86 covers the Control Panel, not the calibration algorithm.

**Rejected CLI claims:**
- **DeepSeek's "'HVAC Final' mis-order" HIGH**: `%hvac final%` (L47) fires before `%hvac%` (L54) — ordering is correct. Confirmed wrong.
- **DeepSeek's "PHASE_ORDINAL_SQL omits P1-P8/P18" CRITICAL**: the ordinal filter operates only on phases STAGE_TO_PHASE_SQL emits (P9-P17); ISSUED pairs don't use the filter. No legitimate pairs silently dropped. Confirmed wrong.
- **Gemini's "framing insulation" mis-order HIGH**: partially confirmed — *both* JS and SQL paths agree that `%framing%` matches first, so there is no dual-path drift; but if such stage names exist in the data, both paths would mis-classify as P11 rather than P13. Data-quality risk, not a code drift.

---

## List 1 — WF3 (Fix now; blocks production)

| # | Issue | Line(s) | Severity | Consensus | Fix |
|---|---|---|---|---|---|
| 86-W1 | **Non-atomic UPSERT loop** — N+1 `pool.query` in for-loop with no transaction; crash mid-loop leaves `phase_calibration` in mixed-vintage state; consumer (`compute-trade-forecasts.js`) then produces inconsistent predictions | 274–293 | CRITICAL | Gemini, DeepSeek, Claude-adv, Claude-obs | Wrap loop in `pipeline.withTransaction`; combine into single batched `INSERT … VALUES (…),(…) ON CONFLICT DO UPDATE` |
| 86-W2 | **No advisory lock** — concurrent runs race on UPSERT; siblings 83/84 both lock | (absent) | CRITICAL | All reviewers | Add `pg_try_advisory_lock(86)` on a dedicated `pool.connect()` client held for the run duration |
| 86-W3 | **`::int` cast on PERCENTILE_CONT truncates** — 10.9 days → 10; systematic downward bias; compounds across multi-phase paths | 125–127, 167–169, 212–214, 245–247 | CRITICAL | DeepSeek, Claude-adv | `ROUND(PERCENTILE_CONT(…))::int` at all 4 sites |
| 86-W4 | **`PHASE_ORDINAL_SQL` redefines shared `PHASE_ORDINAL` inline** — shared-lib comment in `lifecycle-phase.js:470` falsely claims this script imports the constant; two definitions drift over time | 76–89 | HIGH | Claude-spec | Import `PHASE_ORDINAL` from `scripts/lib/lifecycle-phase.js`, render to SQL once, and update the misleading lib comment |
| 86-W5 | **Wrong SPEC LINK + no authoritative spec for algorithm** — L13 points to `docs/reports/lifecycle_phase_implementation.md §Phase 3` (a report); spec 85 names the script but describes no algorithm; spec 86 doesn't mention calibration at all; the algorithm (LAG inspection-pair, ISSUED synthetic, p25/median/p75, HAVING≥5, forward-only filter) is undocumented in any spec | 13 + spec 85 + spec 86 | HIGH | All reviewers | Update SPEC LINK to spec 85; add "Algorithm" section to spec 85 covering: LAG pairs, ISSUED synthetic, percentile cuts, HAVING threshold, forward-only filter, 4-shape output contract, NULL↔__ALL__ semantics |
| 86-W6 | **`permit_phase_transitions` is a DEAD WRITE** — `classify-lifecycle-phase.js` writes this table; this script ignores it, mining `permit_inspections` instead; spec 84 (84-W4) implies calibration should use transitions (richer signal: covers non-inspection phases P3-P8, orphan transitions) | — | HIGH | Claude-obs, Claude-spec, cross-script | Decision required: (a) switch calibration input to `permit_phase_transitions` (preferred — spec 84 intent); (b) drop the transitions table writes if no consumer is planned. No spec currently owns the decision |
| 86-W7 | **No `audit_table` in PIPELINE_SUMMARY** — admin FreshnessTimeline has no threshold/verdict; `audit_table.rows` is empty stub auto-injected by SDK | 305–315 | HIGH | Claude-obs | Add full audit_table with rows: `phase_pairs_by_type`, `pairs_above_threshold`, `negative_gap_count` (WARN if >0), `min_sample_size`, `median_of_medians`, `trained_window_end` |
| 86-W8 | **All-time PERCENTILE_CONT — no recency weighting** — a 2026 calibration pulls equal weight from 2019 data; structural construction-timing shifts (labour shortages, regulatory changes) take years to show; flight tracker drifts undetectably | 103–139, 147–179, 196–221, 229–254 | HIGH | Claude-obs | Either (a) add `WHERE inspection_date >= NOW() - INTERVAL '2 years'` OR (b) compute both all-time + recency-windowed medians and tag which the calibration row used |
| 86-W9 | **No `model_version` / `training_window` on output rows** — `phase_calibration` row update silently overwrites prior; no A/B or rollback path; drift invisible | 278–291, migration 087 | HIGH | Claude-obs | Add `model_version`, `training_window_start`, `training_window_end` columns; populate per-run |
| 86-W10 | **`DISTINCT ON (i.permit_num)` non-deterministic** — `ORDER BY i.permit_num, i.inspection_date ASC` only 2 columns; same permit + same date = arbitrary stage chosen; ISSUED→first-phase calibration flip-flops across runs | 197–207, 230–240 | HIGH | DeepSeek, Claude-adv, Claude-obs | Add `i.stage_name ASC` (or `i.id ASC`) as tertiary ORDER BY |
| 86-W11 | **`HAVING COUNT(*) >= 5` hardcoded in 4 places** — spec 86 intent is `logic_variables` operator tuning; migration 087 also enforces `CHECK (sample_size >= 5)` (double-enforcement) | 138, 178, 220, 253 + migration 087 | HIGH | Gemini, DeepSeek, Claude-adv, Claude-spec | Promote to `logic_variables.calibration_min_sample_size`; update migration CHECK to reference same or soften |
| 86-W12 | **No `loadMarketplaceConfigs` call** — script has zero Control Panel integration despite 4 obvious knobs (min_sample_size, percentile cuts, gap_days_max, forward_only) | 93 | HIGH | Claude-spec | Add loader call + expose knobs via logic_variables |
| 86-W13 | **Negative / zero gap_days filtered but not counted** — `gap_days >= 0` drops corrupt rows (inspection before prior); these indicate upstream data quality issues but are invisible | 133, 175, 218 | MEDIUM | DeepSeek, Claude-adv, Claude-obs | Count `gap_days < 0` in a separate aggregate query; emit in records_meta + audit_table |
| 86-W14 | **No stale-row pruning** — if a (from, to, type) pair drops below 5 samples (permit type retired), the pre-existing calibration row lives forever; consumer uses stale calibration | 274–293 | MEDIUM | Claude-spec | Add DELETE of rows not present in current `allRows` set within the transaction (or flag as stale with `computed_at`) |
| 86-W15 | **`records_new` race-prone via COUNT delta** — preRowCount/postRowCount across unrelated writers; if any row is deleted between reads, math is wrong | 268–271, 299–303, 307–308 | MEDIUM | Gemini, DeepSeek, Claude-adv, Claude-obs | Use `RETURNING xmax=0 AS inserted` in UPSERT to count inserts vs updates precisely |
| 86-W16 | **`String.prototype.replace(/stage_name/g, …)`** at L70, 90, 91 is fragile — future comment containing "stage_name" or "phase" would break the substitution | 70, 90, 91 | MEDIUM | DeepSeek, Claude-adv | Use placeholder `__COL__` in base template; replace once |

---

## List 2 — Defer (valuable but not blocking)

| # | Issue | Line(s) | Source |
|---|---|---|---|
| 86-D1 | Four nearly-identical queries — collapse via `GROUPING SETS((from,to,permit_type), (from,to))` | 103–258 | Gemini |
| 86-D2 | Full-table scan on permit_inspections — no incremental watermark (`WHERE inspection_date > last_run`) | 103–258 | Gemini |
| 86-D3 | `allTypesResult` omits the `permits` JOIN — intentional but undocumented | 147–179 | Claude-obs |
| 86-D4 | `records_total: allRows.length` reports intent, not actual upserts (mismatches on mid-loop crash) | 306 | Claude-obs |
| 86-D5 | Missing sample-size histogram in telemetry (how many pairs at threshold boundary) | records_meta | Claude-obs |
| 86-D6 | Add `gap_days_max` cap (e.g., 730 days) to exclude outlier inspection pairs from p75 | 133, 175, 218 | Claude-spec |
| 86-D7 | `level-2 all-types specific` beats `level-3 ISSUED per-type` in consumer fallback — undocumented policy choice; debatable | consumer L135–154 | Claude-spec |
| 86-D8 | `gap_days` column typing — confirm `inspection_date` is `date` not `timestamptz` to keep `- prev_date` returning integer days (not interval that can't cast to int) | 119, 161, 212, 245 | Claude-adv |
| 86-D9 | `computed_at` on phase_calibration updated unconditionally via NOW() on every UPSERT — no IS DISTINCT FROM guard; every run bumps updated_at even when medians unchanged | 287 | self |
| 86-D10 | The word "v2" in script name — was there a v1, and does any code still reference it? Cleanup opportunity | filename | self |

---

## List 3 — Spec Updates Needed (85 primary, 86 secondary)

| # | Spec change | Why |
|---|---|---|
| 86-S1 | **Create a dedicated "Phase Calibration Algorithm" section in spec 85** (or a new spec) covering: LAG inspection-pair algorithm, ISSUED synthetic from_phase, percentile cuts (p25/median/p75), HAVING≥5 threshold, forward-only transition filter, 4-shape output contract, NULL↔'__ALL__' semantics | No spec currently owns the algorithm — 86-W5 |
| 86-S2 | Document `permit_type=NULL` ↔ consumer key `'__ALL__'` contract; producer writes NULL, consumer maps `permit_type \|\| '__ALL__'` | 86 implicit contract, explicit failure path on empty-string drift |
| 86-S3 | Specify which script owns reading `permit_phase_transitions` (consumer TBD), OR declare that calibration should SWITCH from inspection-mining to transitions-mining | 86-W6 dead write |
| 86-S4 | Specify `model_version` / `training_window` requirement on `phase_calibration` rows | 86-W9 |
| 86-S5 | Specify recency policy (all-time vs rolling window) and document the tradeoff | 86-W8 |
| 86-S6 | Promote `min_sample_size`, `percentile_low`, `percentile_high`, `gap_days_max`, `forward_transitions_only` to `logic_variables` per spec 86 Control Panel pattern | 86-W11, 86-W12 |
| 86-S7 | Fix migration 087 CHECK to reference logic_variables OR decouple from 86-S6 promotion | Double-enforcement issue |
| 86-S8 | Specify stale-row policy — is a (from,to,type) calibration row ever removed, or does it live forever? | 86-W14 |
| 86-S9 | Fix SPEC LINK (L13) to point to spec 85 (primary algorithm owner) | 86-W5 |
| 86-S10 | Declare consumer fallback policy explicitly: level-2 "all-types specific transition" vs level-3 "ISSUED per-type" — which is preferred and why | 86-D7 |
| 86-S11 | Declare producer-consumer contract: producer must write all 4 shapes for fallback to be complete | Claude-spec §D |
| 86-S12 | Specify data quality gates: `gap_days < 0` threshold, p25 ≤ median ≤ p75 sanity, forward-ordering sanity (median P11→P15 > median P11→P13) | 86-W13 + Claude-obs |

---

## Verdict

**NOT safe to run in production.** 3 CRITICAL + 9 HIGH findings. Top blockers: non-atomic N+1 UPSERT (86-W1), no advisory lock (86-W2), `::int` percentile truncation biasing all medians downward (86-W3). Architectural concerns: `permit_phase_transitions` is a dead write that the spec 84 intent says should feed calibration (86-W6); calibration algorithm is undocumented in any spec (86-W5); all-time PERCENTILE_CONT makes structural drift invisible (86-W8). 16 WF3, 10 defer, 12 spec updates. DeepSeek's "PHASE_ORDINAL omits P1-P8" CRITICAL and "HVAC Final mis-order" HIGH rejected as false positives (independently verified twice).
