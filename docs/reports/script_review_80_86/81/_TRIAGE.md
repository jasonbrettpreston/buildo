# Triage — `scripts/compute-opportunity-scores.js` (Spec 81)

**Reviewers:** Gemini 2.5 Pro · DeepSeek R1 · Claude adversarial · Claude observability · Claude spec-compliance · Lead self-critical list (21 items)
**Script:** 178 lines · Spec: `docs/specs/product/future/81_opportunity_score_engine.md`

---

## List 1 — WF3 (Fix now; blocks production)

| # | Issue | Line(s) | Severity | Reviewer consensus | Fix direction |
|---|---|---|---|---|---|
| 81-W1 | **No transaction boundary on multi-batch UPDATE** — crash mid-loop leaves `trade_forecasts` in mixed-score state; downstream CRM alerts fire on stale+fresh mix (§9.1 violation) | 114–137 | CRITICAL | Gemini, DeepSeek, Claude-adv, Claude-obs, self | Wrap UPDATE loop in `pipeline.withTransaction(pool, async (client) => {…})`; SDK already has nested-rollback guard |
| 81-W2 | **Unbounded SELECT** loads entire `trade_forecasts` into Node heap — OOM at ~2.5M rows; SDK exports `streamQuery` but script does not use it (§3.2 violation) | 29–52 | CRITICAL | Gemini, DeepSeek, Claude-adv, Claude-obs, self | Replace `pool.query` with `pipeline.streamQuery(pool, sql)` and flush batches inside the loop |
| 81-W3 | **NaN score propagation** — `parseFloat(row.multiplier_bid)` on a typoed control-panel string (e.g., `'2.8x'`) returns NaN → `::int` cast throws → batch fails after earlier batches already committed | 73–75 | HIGH | Gemini, DeepSeek, Claude-adv, self | Use `Number.isFinite` guard; fall back to `vars.los_multiplier_*`; emit `pipeline.log.warn` on fallback so control-panel typos surface |
| 81-W4 | **No advisory lock** — two concurrent instances (e.g., admin manual re-run during nightly) race to write; final score non-deterministic; sibling `compute-cost-estimates.js` uses `pg_try_advisory_lock` — drift | (absent) | HIGH | Claude-obs, self | Add `pg_try_advisory_lock(81)`; exit cleanly if held, matching the sibling pattern |
| 81-W5 | **`records_updated` telemetry overcounts** — always equals batch size, never actual `rowCount`; masks "upstream didn't run" scenario (0 real writes) | 136 | HIGH | Claude-adv, Claude-obs, self | `updated += result.rowCount` from each UPDATE call |
| 81-W6 | **Integrity audit has no row-level persistence** — counter only; no way to see which permits flagged today vs. yesterday; spec says "flag leads" which implies surfacing | 94–106 | HIGH | DeepSeek, Claude-obs, Claude-spec, self | Option A (quick): collect flagged keys into `records_meta.integrity_flag_keys[]` (cap 500). Option B (product): new `opportunity_score_integrity_flags` table with `run_id` FK |
| 81-W7 | **Wrong SPEC LINK** — line 12 points to `docs/reports/lifecycle_phase_implementation.md` (a lifecycle report, not spec 81); same stale link appears in sibling scripts | 12 | MEDIUM | Gemini, Claude-adv, Claude-spec, self | Update to `docs/specs/product/future/81_opportunity_score_engine.md` |
| 81-W8 | **NULL urgency rows silently excluded** — `WHERE urgency NOT IN ('expired')` returns UNKNOWN for NULL; if upstream forecast step fails to set urgency, those rows are silently skipped without warning | 51 | HIGH | Claude-adv, DeepSeek, self | `WHERE (tf.urgency IS NULL OR tf.urgency <> 'expired')` OR explicit `AND urgency IS NOT NULL` with telemetry counter for `null_urgency_rows` |
| 81-W9 | **Score distribution query reads historical rows not current run** — post-UPDATE `SELECT` scans all non-expired rows; `IS DISTINCT FROM` skipped rows pollute distribution; second full-scan wastes compute | 142–154 | HIGH | Claude-adv, Gemini, Claude-obs, self | Accumulate `distBuckets` during the JS scoring loop; eliminate post-UPDATE query entirely |

---

## List 2 — Defer (Valuable but not blocking)

| # | Issue | Line(s) | Why defer | Source |
|---|---|---|---|---|
| 81-D1 | Build structured `records_meta.audit_table` (rows with thresholds + PASS/WARN verdicts) so admin FreshnessTimeline renders this script like `compute-cost-estimates.js` does | 157–165 | Observability upgrade; admin UI will render flat dict until then | Claude-obs |
| 81-D2 | Add median score, score delta vs. prior run, per-urgency bucket counts, per-trade extremes to PIPELINE_SUMMARY — supports "scores dropped 30%" 3am debugging | 157–165 | Nice to have; current telemetry tolerable | Claude-obs |
| 81-D3 | Validate JSONB `trade_contract_values[trade_slug]` type; warn if non-number (string/null) — defensive for cost-estimates writer drift | 64–65 | Defensive; current producer contract is clean | Claude-adv, DeepSeek |
| 81-D4 | Early exit when `competitionPenalty >= base × multiplier` — micro-optimisation avoiding useless math | 78–85 | Perf-only; score lands at 0 either way | DeepSeek |
| 81-D5 | Use positive list `IN ('bid', 'work')` instead of `NOT IN ('expired')` — future-proofs against new urgency values | 51 | Blocked only if new urgency values land; cover with 81-W8 | DeepSeek |
| 81-D6 | Add covering index `(opportunity_score, urgency) WHERE urgency != 'expired'` if post-UPDATE distribution query is retained (but 81-W9 eliminates it) | 142–154 | Superseded if 81-W9 ships | Claude-obs |
| 81-D7 | Remove unused `tradeConfigs` destructure — minor clarity | 21 | Cosmetic | Claude-adv |
| 81-D8 | Add `NULL opportunity_score` guard to distribution `CASE` (currently falls into 'low' tier) — superseded if 81-W9 ships | 144–148 | Covered by in-memory accumulation | Claude-adv |
| 81-D9 | `records_total` vs distribution denominator mismatch — clarity for ops | 158, 142 | Covered if 81-W9 ships | Claude-adv |
| 81-D10 | Add `scoring_run_id` timestamp column to `trade_forecasts` for partial-run detection if 81-W1 cannot wrap the whole loop in one transaction | — | Alternative strategy if per-batch transactions chosen | Claude-obs |

---

## List 3 — Spec 81 Updates Needed

| # | Spec change | Why |
|---|---|---|
| 81-S1 | Rename `los_base_unit` → `los_base_divisor` throughout spec 81 §2 (logic_variables table, example math) — OR rename DB key to match spec (engineering debt either way) | Code + migration 092 + config-loader all use `los_base_divisor`; spec still says `los_base_unit`. Anyone tuning the control panel via the spec will look for the wrong DB key. |
| 81-S2 | Document tier thresholds (`elite >= 80`, `strong >= 50`, `moderate >= 20`, `low < 20`) explicitly in spec | Currently hardcoded at lines 144–148 with no spec anchor; tuning these via control panel would silently diverge from telemetry |
| 81-S3 | Specify handling of NULL `urgency` rows (exclude / process / error) | Code currently silently excludes via 3-valued logic; no spec rule — behaviour is an accident not a decision |
| 81-S4 | Add an "Integrity Audit" section covering: which fields to flag, persistence requirement (row-level or counter-only), retention period, admin UI surfacing | Spec says "flag leads" — ambiguous; implementation picked counter-only; product intent unclear |
| 81-S5 | Document `IS DISTINCT FROM` idempotency behaviour and its interaction with `records_updated` telemetry | Reviewers repeatedly confused "records updated" (logical) vs "rows physically written" (DB) — spec should state which number is the contract |
| 81-S6 | Document per-trade vs global multiplier fallback (what happens if a trade lacks a `trade_configurations` row — fallback to logic_variables? or error?) | Code has a defensive fallback; spec silent — future dev may remove fallback as "dead code" |
| 81-S7 | Declare concurrent-run policy (not permitted / serialized via advisory lock / idempotent re-entrant) | Relates to 81-W4; no spec rule means reviewers disagreed on "is concurrency a bug or a feature" |
| 81-S8 | Specify expected behaviour when a `trade_forecast` row has no matching `cost_estimates` row (LEFT JOIN → tradeValue = 0 → score ≈ 0 with negative penalty). Is this intentional (score expired leads at 0) or a bug (skip them)? | Spec does not anchor the LEFT JOIN semantics; reviewers disagreed |
| 81-S9 | Fix the `lead_key` format contract: document the canonical format `permit:<num>:<LPAD(rev,2,'0')>` in a single "Data Contracts" section shared between spec 80/81/82 so reader/writer cannot drift | Gemini and DeepSeek both flagged the join as brittle; root cause is no single-source-of-truth definition of `lead_key` |

---

## Verdict

Script is **not safe to run in production** as-is. Two CRITICAL (no transaction; unbounded SELECT) and five HIGH findings block ship; nine WF3 items, ten defer items, nine spec updates total.
