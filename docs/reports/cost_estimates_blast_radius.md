# Cost Estimates — Blast Radius Review

**SPEC LINK:** docs/specs/product/future/83_lead_cost_model.md §8 Part 4
**Date:** 2026-04-15
**Script:** `scripts/compute-cost-estimates.js` (commit 90c3709)
**Reviewer:** Phase 3 ops hardening (WF2-3)

---

## Purpose

Walk every `INSERT`, `UPDATE`, and `DELETE` in `compute-cost-estimates.js` and confirm:
1. Each write is bounded — it cannot reach outside its intended key space.
2. No write can corrupt rows it did not intend to touch.
3. Re-running the script is safe (idempotent).

---

## Write Surface Inventory

The script has exactly **two write operations**:

### Write 1 — `cost_estimates` bulk UPSERT (`flushBatch`)

**SQL:**
```sql
INSERT INTO cost_estimates (
  permit_num, revision_num, estimated_cost, cost_source, cost_tier,
  cost_range_low, cost_range_high, premium_factor, complexity_score,
  model_version, is_geometric_override, modeled_gfa_sqm,
  effective_area_sqm, trade_contract_values, computed_at
) VALUES ($1, $2, ...) [× BATCH_SIZE rows]
ON CONFLICT (permit_num, revision_num) DO UPDATE SET ...
WHERE EXCLUDED.estimated_cost IS DISTINCT FROM cost_estimates.estimated_cost
   OR EXCLUDED.cost_source    IS DISTINCT FROM cost_estimates.cost_source
   OR ...
RETURNING (xmax = 0) AS inserted
```

**Blast radius analysis:**

| Property | Assessment |
|----------|------------|
| **Key space** | `(permit_num, revision_num)` — composite PK enforced by DB constraint. Impossible to write a row with an unknown key. ✅ |
| **Source of keys** | Keys come only from `SOURCE_SQL` which reads `FROM permits p`. Every written key is a known permit. ✅ |
| **Columns written** | 15 fixed columns, all in `cost_estimates`. No dynamic column names. ✅ |
| **Foreign tables affected** | None — single-table write. ✅ |
| **Idempotency** | `ON CONFLICT DO UPDATE` — re-running produces identical output; no duplicates possible. ✅ |
| **WAL guard** | `WHERE EXCLUDED.* IS DISTINCT FROM cost_estimates.*` on 5 columns — unchanged rows emit no WAL. ✅ |
| **model_version** | Hardcoded to `MODEL_VERSION = 2`. Cannot overwrite `model_version = 1` rows with a different version constant accidentally. ✅ |
| **computed_at** | Uses `RUN_AT` (captured once via `SELECT NOW()` after lock acquisition). No per-batch `NOW()` drift. ✅ |
| **Batch isolation** | Each batch is wrapped in `pipeline.withTransaction`. A failed batch rolls back cleanly — no partial writes. ✅ |
| **Maximum rows per run** | Bounded by `SELECT COUNT(*) FROM permits` = 243,454. Cannot write more rows than exist in permits. ✅ |

**Verdict: SAFE.** Write cannot escape the `(permit_num, revision_num)` key space and is fully idempotent.

---

### Write 2 — `data_quality_snapshots` best-effort UPDATE

**SQL:**
```sql
UPDATE data_quality_snapshots
   SET cost_estimates_liar_gate_overrides = $1,
       cost_estimates_zero_total_bypass   = $2
 WHERE snapshot_date = ($3::timestamptz AT TIME ZONE 'UTC')::date
```

**Blast radius analysis:**

| Property | Assessment |
|----------|------------|
| **Rows affected** | At most 1 row — the row where `snapshot_date` equals today's UTC date. ✅ |
| **Columns written** | Exactly 2 columns: `cost_estimates_liar_gate_overrides`, `cost_estimates_zero_total_bypass`. ✅ |
| **Foreign tables affected** | None. ✅ |
| **Idempotency** | Plain `UPDATE` with deterministic values — re-running overwrites with the same counters. ✅ |
| **Behaviour when row absent** | `rowCount === 0` — no-op. Logged at INFO level. Row is created later by `refresh-snapshot.js`. ✅ |
| **Error handling** | Wrapped in `try/catch` — a DB error (schema drift, column missing) is logged as WARN and does not abort the run. ✅ |
| **Dry-run guard** | Wrapped in `if (!dryRun)` — `--dry-run` flag skips this write entirely. ✅ |
| **Historical rows** | Cannot affect any past snapshot because `WHERE snapshot_date = ...today...` is pinned by `RUN_AT`. ✅ |

**Verdict: SAFE.** Best-effort, date-bounded, 2-column update on at most 1 row.

---

## Advisory Lock

The advisory lock (`pg_try_advisory_lock(83)`) is not a write operation — it is a session-level
concurrency guard. It does not write any data. It prevents concurrent runs of this script.

| Property | Assessment |
|----------|------------|
| **Lock ID** | 83 (spec number convention). Not reused by any other script. ✅ |
| **Lock scope** | Session-level on the pinned `lockClient` connection. Released in `finally` block and on SIGTERM. ✅ |
| **Double-release race** | Guarded by `lockClientReleased` flag. SIGTERM and finally both check before releasing. ✅ |

---

## Reads (no blast radius — listed for completeness)

All reads are `SELECT`-only with no side effects:
- `logic_variables` — control panel config
- `trade_sqft_rates` — rate lookup table
- `scope_intensity_matrix` — allocation lookup table
- `permits`, `permit_parcels`, `parcels`, `parcel_buildings`, `building_footprints`, `neighbourhoods`, `permit_trades`, `trades` — SOURCE_SQL stream

---

## Summary

| Write | Table | Max rows | Key bound | Idempotent | Verdict |
|-------|-------|----------|-----------|------------|---------|
| Bulk UPSERT | `cost_estimates` | 243,454 | `(permit_num, revision_num)` PK | Yes (ON CONFLICT) | ✅ SAFE |
| Counter UPDATE | `data_quality_snapshots` | 1 | `snapshot_date = today` | Yes (deterministic values) | ✅ SAFE |

**Overall blast radius: CONTAINED.** The script cannot write outside its two intended targets,
both of which are key-bounded and idempotent. A crash mid-run leaves the DB in a consistent
state — partial batches roll back via `withTransaction`, and a re-run safely resumes.
