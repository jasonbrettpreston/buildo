# `enrich_parcels` golden master — G2' same-day comparator report (pilot 9 commit 7e/2)

**Spec:** Spec 122 §5.3 (behaviour-preservation) · Spec 123 §3.1 (pin-then-fix).

## Why this comparator exists (the four-day-gap problem)

The original PRE golden (`pre/sources_run1.json`) was captured 2026-09-04. A PRE-vs-POST diff against
today's converted run (2026-09-08) is confounded: unlike the tightly-controlled PRE-vs-PRE comparison
(back-to-back, zero intervening chain activity), four days had passed on a live, shared dev DB — real
upstream drift (permits ingested, neighbourhood norms recomputed by any other script/session) could not
be ruled out as a contributor to any diff. To get a genuine apples-to-apples signal, the LEGACY script
(`git show 7e75c50e^:scripts/enrich-parcels.js`) was materialised untracked
(`scripts/_legacy_enrich_parcels_g2.js`) and run `--full` **today**, immediately after the converted
run, against the same DB state modulo only the converted run's own writes.

## Column-level diff (100 columns, PRE's exact projection, ordered by id)

`_g2.converted` (converted run's committed `parcels`, id + PRE's 100-column projection) vs
`_g2.legacy` (legacy run's committed `parcels`, same projection) — `LEFT JOIN ... USING (id)`,
`count(*) FILTER (WHERE c.col IS DISTINCT FROM l.col)` per column.

| Result | Value |
|---|---|
| Row count, `_g2.converted` | 486,530 |
| Row count, `_g2.legacy` | 486,530 |
| Columns checked | 100 |
| Columns with ANY diff | **1** (`comparable_builds`) |
| `comparable_builds` diff rows | 225 / 486,530 (0.046%) |
| All other 99 columns (incl. `comp_count`, `comp_dominant_build`, `comp_build_ratio_p50`, `comp_fsi_p50`) | **0 diffs — byte-identical** |

## Classification

- **`comparable_builds` (225 rows) → EP-D9.** 5 sampled ids (66450, 27684, 463335, 88205, 282017)
  inspected side-by-side: in every sample, the converted and legacy arrays contain the IDENTICAL set
  of comp objects (same addresses, same `build_ratio`/`permit_fsi`/`coa_decision` values) — only the
  ORDER differs (a kNN tie-break at `distance_m = 0` with no stable secondary sort key). Confirmed
  tie-class, not a data or logic difference.
- **`comp_count`/`comp_dominant_build`/`comp_build_ratio_p50`/`comp_fsi_p50` → 0 diffs.** Pass 4 SQL
  verbatim, confirmed — the derived scalar aggregates never depend on array order.
- **`zoning_enriched_at`/`massing_enriched_at`/`nearby_builds_summary`** are not in PRE's 100-column
  projection (excluded from PRE's own capture per inventory items (e)/(f)) and were not part of this
  comparison; not applicable here.
- **Zero unexplained columns.** G2' gate: **PASS.**

## Per-pass timing, same-day (legacy-today vs converted-today)

| Pass | Legacy (today) | Converted (today) | Ratio |
|---|---|---|---|
| 1 zoning | 512.5s | 481.4s | 0.94x |
| 2 max_build | 1505.5s | 1545.4s | 1.03x |
| 3 existing_structure | 64.6s | 60.5s | 0.94x |
| 4 comparable_builds | 336.7s | 353.9s | 1.05x |
| 5 optimal_config | 117.8s | ~102.3s (derived: total − Σpasses 1-4) | 0.87x |
| **Total** | **2548.4s** | **2543.6s** | **1.00x** |

No pass exceeds the 25% KFM-7 threshold in either direction. **No G2' performance finding.**

(Earlier attempts against a stale 1.3M-row `enrich_parcels_pass3_scope` backlog — pre-repair — showed
much larger, non-uniform ratios; those are attributed to a pre-existing `consumePendingScope` design
gap, not a code regression — see EP-D11 in the defect ledger, and the "environment repair" note below,
distinct from EP-D10.)

## Environment repair (distinct from the EP-D10 fix)

Before the second capture attempt, `enrich_parcels_pass3_scope` held 1,326,732 unconsumed
(`consumed_at IS NULL`) rows from 3 stale run_ids (`1788810724`, `1788816238`, `1788834828`),
superseding data any fresh `--full` run's own scope insert would immediately re-supersede. Removed:
`DELETE FROM enrich_parcels_pass3_scope WHERE consumed_at IS NULL` → 1,326,732 rows deleted, then
`VACUUM (ANALYZE) enrich_parcels_pass3_scope`. This is operational cleanup of accumulated churn, not a
code fix — EP-D10's actual fix (prune consumed rows at run end) remains a commit-8 peel.
`consumePendingScope` dedupes by parcel_id (`SELECT DISTINCT parcel_id ...`), so EP-D10's peel is
"prune at run end," not "prune + dedupe."

## Cleanup

`_g2` schema and `scripts/_legacy_enrich_parcels_g2.js` removed after this report was written.
