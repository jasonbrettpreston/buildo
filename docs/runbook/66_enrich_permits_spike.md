# Runbook — Spec 66 `enrich-permits.js` data profiling & first-deploy spike

**SPEC LINK:** `docs/specs/01-pipeline/66_enrich_permits.md`
**Profiled:** 2026-05-31, local dev DB (read-only `scripts/one-time/spike-66-profile.js`).
**Purpose:** set honest F-H12 gate thresholds + confirm the always-full relational design (resolves DEC-3 + the round-2 incremental rethink).

## 1. Cardinality (live)

| Table | Rows |
|---|---|
| `permits` | 248,571 |
| └ construction (`permit_type_classifications.class='construction'`) | 237,510 (95.5%) |
| `coa_applications` | 33,119 |
| `permit_parcels` | 234,812 |
| `lead_parcels` (coa-prefixed) | 239,355 (28,587 coa) |
| `parcels` with `zoning_class` | 470,165 (96.6%) |

## 2. Achievable F-H12 coverage (the gate reality — DEC-3)

| Gate | Achievable (live) | §8d aspirational | Decision |
|---|---|---|---|
| **permits_zoning_class_coverage_pct** (construction) | **84.2%** | 99% | **Calibrated FAIL `< 80`** (PASS ≥83, WARN 80–83). 99% is impossible. |
| **coa_zoning_class_coverage_pct** | **84.4%** | 95% | **Calibrated FAIL `< 80`** (PASS ≥83, WARN 80–83). |

The ~84% ceiling = **5.5% of permits have no parcel link** (13,759 of 248,571) + **~10% link to a parcel that is itself a zoning gap** (parks/federal/ravine — the 3.4% unzoned parcels concentrate near some permit sites). This is the genuine end-state for Spec 58 §8e: **~84% of active construction permits get zoning, not ~99%.** The gates catch a *regression* below ~80%, not an aspirational target. → thresholds in `docs/specs/_contracts.json`.

## 3. Multi-parcel is ≈ 0 — DEC-1 is forward-looking

| Metric | permits | CoA |
|---|---|---|
| no parcel link | 13,759 (5.5%) | 4,533 (13.7%) |
| **multi-parcel** | **0** | **1** |
| heterogeneous assembly (linked parcels disagree on zone) | 0 | 0 |

`permit_parcels` is **exactly 1 parcel per permit** (234,812 links = 234,812 linked permits). `link-parcels.js` produces a single best parcel. So DEC-1's dominant-parcel ranking (`ROW_NUMBER` by `lot_size_sqm`/`confidence`) and the `applicable_bylaws`/`overlay_summary` aggregation are **defensive / forward-looking** — correct and cheap, but exercised on essentially zero current rows (`applicable_bylaws` is a single-element array today). Kept for correctness against future multi-parcel linking + the 1 live CoA case. The `*_heterogeneous_assembly_count` INFO row will read 0 today.

## 4. Always-full design viability (no incremental)

The dominant-parcel `SELECT` over all 248,571 permits ran in **4.7 s**; the FULL `enrichLeads` (temp-table build with `jsonb_agg` + the `UPDATE` of 234,812 rows incl. two jsonb columns) measured **~65 s for permits / ~4 s for CoA** without indexes, rising to **~150 s for permits once the GIN indexes on `applicable_bylaws`/`overlay_summary` exist** (each jsonb write also updates the GIN index) on the live dev DB (first-run, all rows changing; steady-state recompute is similar but writes ≈0 via `IS DISTINCT FROM`). For a **daily** chain step amid many minute-scale steps this is affordable — and strictly more correct than a timestamp incremental (auto-catches un-links/re-links). **No incremental predicate; no `--full` flag.**

## 5. DEC-4 join safety
`coa_applications.lead_id` is **100% populated** (0 NULL; all `'coa:%'`). Joining `lead_parcels lp ON lp.lead_id = c.lead_id` (the stored, trigger-synced key) is safe — no need to re-derive `'coa:'||application_number`.

## 6. Spike script (throwaway)
`scripts/one-time/spike-66-profile.js` — read-only; removed after thresholds are locked into the spec + `_contracts.json`.
