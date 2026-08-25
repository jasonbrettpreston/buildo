# WF3 — compute-cost-estimates cost_source='none' for 100% permits — Phase A Findings

**Date:** 2026-05-23
**Phase A status:** COMPLETE (read-only)
**Plan version:** v3 (2 rounds of adversarial PLAN review)
**HALT GATE:** awaiting user authorization on the proposed Phase B fix.

---

## Executive Summary

The `scope_intensity_matrix` lookup table contains 18 rows keyed on a **completely different vocabulary** than the production `permits` table data. Every permit's `(permit_type, structure_type)` pair misses the matrix → `computeEffectiveArea()` returns `areaEff=null` → Brain short-circuits to `cost_source='none'` for 100% of permits (~248K).

This is the **B-hypothesis** branch (matrix miss) of the 4 short-circuit paths in `cost-model-shared.js` — confirmed by elimination of the other 3.

---

## Phase A evidence

### A.0 Wipe-origin forensics

**A.0a — pipeline_runs in widened 30-min window (01:30-02:00 UTC):**
- **ZERO pipeline_runs in window.** The wipe was NOT done by any pipeline-instrumented script.

**A.0b — out-of-band DML check (pg_stat_statements):**
- Extension installed but NOT loaded via `shared_preload_libraries`. **Cannot trace recent DML.** Out-of-band vector remains an open hypothesis.

**A.0c — git log over 2026-05-09 → 2026-05-24:**
- 2 commits touched relevant code: `3c8824b` (WF3 #5 Finding D matrix-miss safe-skip — older) + `56ebce1` (WF3 #16 Findings M+N — ON CONFLICT repair).
- 0 commits to seed JSON files (`scope_intensity_matrix.json`, `trade_sqft_rates.json`).

**A.0d — diff of WF3 #16 commit `56ebce1`:**
- Changed BULK_COLUMN_COUNT 15→16, added `lead_id` to INSERT column list + ON CONFLICT target.
- Did NOT touch Brain logic or SOURCE_SQL. **WF3 #16 is NOT the cause** — write-target repair only.

### A.1 Seed/lookup table state

**A.1a permit_type_classifications class distribution:**
| class | rows |
|---|---|
| construction | 12 |
| administrative | 8 |
| unclassified | 4 |
| safety_upgrade | 1 |

Healthy.

**A.1b permits JOIN-yield distribution (with COALESCE → 'unclassified'):**
| resolved_class | permits |
|---|---|
| **construction** | **237,510 (95.5%)** |
| safety_upgrade | 6,883 |
| unclassified | 3,061 |
| administrative | 1,117 |

→ **Hypothesis (a) FALSIFIED.** The `permit_type_class` gate is NOT firing for 100% of permits.

**A.1c scope_intensity_matrix:** 18 rows total.

**A.1d whitespace contamination:** 0 rows.
→ **Hypothesis (b.1) FALSIFIED.** No whitespace mismatch between Brain's `.trim()` and Muscle's `.toLowerCase()`-only keys.

**A.1e trade_sqft_rates:** 32 rows. Healthy.

**A.1f scope_intensity_matrix entries (all 18):**
```
permit_type            | structure_type
-----------------------+----------------------
alteration             | semi-detached
alteration             | sfd
alteration             | townhouse
interior alteration    | commercial
interior alteration    | sfd
new building           | commercial
new building           | garden suite
new building           | multi-residential
new building           | semi-detached
new building           | sfd
new building           | townhouse
(... 7 more similar shape)
```

**A.1g production vocabulary:**
- 248,571 total permits across **967 distinct `(permit_type, structure_type)` combinations**
- Top permit_types: `'Building Additions/Alterations'`, `'Building New'`, etc.
- Top structure_types: `'SFD - Detached'` (85,815) / `'SFD - Semi-Detached'` (18,148) / `'Office'` (17,317) / `'Apartment Building'` (16,003) / `'SFD - Townhouse'` (13,195) / `'Retail Store'` (9,070) / `'2 Unit - Detached'` (7,610) / `'Multiple Unit Building'` (7,389) / `'Multiple Use/Non Residential'` (5,346) / `'Other'` (4,748)

**A.1h JOIN yield (matrix vs permits, normalized):**
```sql
SELECT COUNT(*) FROM permits p
JOIN scope_intensity_matrix sim
  ON LOWER(TRIM(sim.permit_type)) = LOWER(TRIM(p.permit_type))
 AND LOWER(TRIM(sim.structure_type)) = LOWER(TRIM(p.structure_type))
```
→ **`matched_permits: 0`** (out of 248,571).

**→ ROOT CAUSE CONFIRMED:** the matrix vocabulary is **incompatible** with production vocabulary. Not a case-mismatch, not a whitespace issue — completely different value sets. `'sfd'` vs `'SFD - Detached'`, `'townhouse'` vs `'SFD - Townhouse'`, `'commercial'` vs `'Office'`/`'Retail Store'`/etc., `'multi-residential'` vs `'Apartment Building'`/`'Multiple Unit Building'`.

---

## Hypothesis elimination

| Hypothesis | Status | Evidence |
|---|---|---|
| (a) `permit_type_class != 'construction'` gate firing for all | **FALSIFIED** | A.1b: 95.5% resolve to 'construction' |
| (b.1) scopeMatrix `.trim()` whitespace bug | **FALSIFIED** | A.1d: 0 whitespace rows |
| **(b) matrix-miss for all permits** | **CONFIRMED** | A.1h: 0 of 248K permits match the 18-row matrix even with normalized JOIN |
| (c) `surgicalTotal === 0` Zero-Total Bypass | **CASCADE** | Same root: matrix miss → areaEff=null → bypasses surgical compute → trivially zero |
| (d) other | N/A | (b) explains 100% |

---

## Proposed Phase B fix (per scope-boundary rule)

### Root cause classification

This falls under scope-rule (ii) **"Re-seed of scope_intensity_matrix from existing JSON seed file"** OR (iii) **"DML backfill"** — depending on whether the JSON seed file contains the production-vocabulary entries or not.

**Sub-question for Phase B planning:** does `scripts/seeds/scope_intensity_matrix.json` contain the correct production-vocabulary entries, or does it also have the current 18-row normalized-vocabulary set?

- If the seed JSON has production vocabulary → re-seed (run the seed script) is the fix.
- If the seed JSON also has the wrong vocabulary → DML population of new rows (or a new seed file) is the fix.

### Proposed Phase B steps

**B.1 (root-cause fix):**
- Read `scripts/seeds/scope_intensity_matrix.json` (Phase B Step 1)
- If seed JSON has production vocabulary entries: re-run the seed script to refresh the table
- If seed JSON has the same wrong vocabulary: **escape hatch fires — this becomes scope-rule (iii) DML backfill of `scope_intensity_matrix` from canonical source** (the Spec 83 §3 reference matrix definition, or Toronto's permit_type / structure_type taxonomy mapped to one of {sfd, townhouse, semi-detached, multi-residential, commercial, garden suite}).
- Either way: ≤5 LOC code change (might be zero — could be 100% DB operation).

**B.2 (observability hardening per plan):**
- OB-1: row-derived verdict cascade (replaces parallel-boolean at line 495)
- OB-2: `model_coverage_pct === 0 → FAIL` with `Number.isFinite()` guard
- OB-3a: `permit_type_class_skipped_pct` audit row with threshold anchored to A.1b actuals (steady-state ~4.5% non-construction → threshold = 14.5% = 4.5% + 10pp margin, well above 90% floor)
- **OB-3b: `matrix_miss_pct` audit row — THIS is the gate that would have caught the current regression. Threshold = ≤5% (current steady state should be near zero after the fix; matrix is supposed to cover the long tail).**
- OB-3c: `zero_total_bypass_pct` audit row — threshold = ≤5% (cascades from matrix miss; should be ~0% post-fix).
- OB-5: `table_with_value_count` + `table_with_value_pct` INFO rows, post-stream, try/catch wrapped.

**B.3:** NULL-to-NULL trap verification post-fix (expected to be a no-op since the fix produces non-null values, which trip IS DISTINCT FROM).

### Production-data verification criterion

Per plan: `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL) / COUNT(*), 1) FROM cost_estimates WHERE lead_id LIKE 'permit:%'` MUST be ≥ 83% post-fix.

**Adjustability clause invocation:** A.1g shows 967 distinct (permit_type, structure_type) combinations in production. A matrix that covers the top N most common combinations may legitimately only achieve 60-80% coverage (covering common cases but not the long-tail Office/Retail/Industrial/etc. variants). If the seed-JSON-derived matrix only covers SFD/townhouse/semi-detached/commercial → ~60% coverage. The 83% floor needs to be re-evaluated post-fix:

- If post-fix coverage is ≥83%: PASS.
- If post-fix coverage is 60-83%: investigate — likely matrix needs additional rows for long-tail structure_types (Office, Retail Store, Apartment Building, 2 Unit - Detached, etc.). Decide: in-scope DML extension OR separate WF3 for matrix expansion.
- If post-fix coverage is <60%: fix did not address the root cause — escalate.

---

## HALT GATE

**Phase A is read-only and complete.** No code or DB changes made.

**User decision required before Phase B:**

1. **Proceed with Phase B as planned** (re-seed OR DML backfill of `scope_intensity_matrix` to production vocabulary + same-commit observability hardening) — Y
2. **Spec 83 §3.A matrix-design discussion first** — the 18-row matrix vs 967-combo production reality suggests the matrix as designed is structurally undersized; this may need an upstream design conversation before any code/data fix.
3. **Other direction** — operator override.

Pending authorization.
