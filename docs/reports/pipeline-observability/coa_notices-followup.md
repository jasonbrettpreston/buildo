
## coa_notices — 2026-10-10 12:57 UTC  (run_id: 2547)

**Chain status:** completed_with_warnings | **Duration:** 421.5s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| load\_coa\_notices | ⚠️ WARN | 421.2s | 0 | no baseline |

_AI analysis unavailable — API call skipped or failed._

---

## coa_notices — 2026-10-10 13:05 UTC  (run_id: 2549)

**Chain status:** completed | **Duration:** 3.3s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| load\_coa\_notices | ✅ PASS | 3.3s | 0 | -99.2% |

_AI analysis unavailable — API call skipped or failed._

---

## coa_notices — 2026-10-10 22:34 UTC  (run_id: 2561)

**Chain status:** completed_with_warnings | **Duration:** 387.5s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| load\_coa\_notices | ⚠️ WARN | 387.4s | 0 | 82.6% |

### Summary
Run completed with warnings: the `coa_notices` load wrote **0 records** while reporting three integrity WARNs, and the txn spent ~2 hours in unindexed parcel aggregation queries. Not a clean run — one integrity class (unit/target mismatch, decision disagreement) needs attention.

### Anomalies & Warnings
- **`load_coa_notices` WARN — `target_unit_mismatch_items` = 9** (threshold `== 0`, observed before_write). Items whose unit family disagrees with their mapped target must remain visible on every run; 9 violates that order guarantee.
- **`required_out_of_bounds` = 50 violations / 5136 measured** (threshold `viol <= 0`, after_write). Keys are Toronto decision PDFs (`toronto_ca_decision_pdf|A0193/17EYK|2`, etc.) — required fields landing outside valid bounds.
- **`decision_disagree` = 8** (plausibility, threshold `== 0`, after_write). Explicit decision value conflicts with derived value.
- **`records_total` = 0** with `duration_ms` = 387,413 — the step ran to completion producing no rows. Combined with an upsert-suppressing order guarantee, this is the most likely symptom of the mismatch/out-of-bounds set, not separate noise.
- **Velocity: +82.6% duration vs 2-run baseline** — a slowdown, not a drop. Root cause is visible in `slow_queries`, not pipeline velocity drift.
- **Slow queries (all >100ms mean, several by 3+ orders of magnitude):**
  - `parcel_max_build` temp table: **2,064,402 ms mean** (~34 min), 1.49M rows, stddev 387s across 3 calls.
  - `parcel_zoning_enrich`: **822,446 ms mean** (~14 min), 1.49M rows.
  - Three `UPDATE parcels ... comparable_builds` variants: **616k / 428k / 378k ms**, 349k rows each — same target rewritten repeatedly.
  - `WITH apt AS (...)`: 119,213 ms for **1 row** — CASE-mapping expression, clear plan/scaling smell.
  - `UPDATE parcels ... comparable_builds` (131k ms x3), `md5(string_agg(...))` full-table hash over `parcels` (103k ms), `parcel_existing_struct` (95k ms), `zoning_enriched_at` update (93k ms).

### Critical Issues — WF3 Prompts
> **WF3** Fix `load_coa_notices` writing 0 records while reporting 9 target-unit-mismatch and 50 required-out-of-bounds violations — bad-parse/incomplete-acquisition items must not be upserted and must stay visible.
> **WF3** Reconcile 8 `decision_disagree` plausibility failures so decision-vs-derived conflicts are zero before write.
> **WF3** Add indexes/plans for `parcel_max_build` and `parcel_zoning_enrich` temp-table passes (2.06M ms and 822k ms mean on 1.49M rows) — and dedupe the three competing `UPDATE parcels ... comparable_builds` rewrites of the same 349k rows.

---
