# Neighbourhood-Norms Layer — Data-Quality Audit

**Date:** 2026-06-29
**Trigger:** Discovery that `realized_fsi_p90` blends apartment/mixed-use new-builds into low-rise residential neighbourhoods (no `structure_type` filter in the cohort). This audit checks **every** percentile/aggregate column in `neighbourhood_build_norms` + `neighbourhood_storey_norms` for cohort contamination before any new work builds on them.
**Verdict:** **Foundation is mostly sound — ONE real shipped contamination (storey norms → `opt_coa`), plus one inert display field. Everything else is clean or protected.**

---

## Headline correction
An earlier claim in this session — that `opt_coa_gfa` is shielded from contamination by the by-law-FSI clamp — is **WRONG**. The clamp (`mainBuildGfa`: `gfa = LEAST(footprint × storeys, bylaw_max_fsi × lot)`) only protects parcels that *have* a by-law FSI. **98.5% of residential parcels (RD/RS/RT/R) have NULL `bylaw_max_fsi`** → no clamp → the contaminated `storeys_p90` flows directly into `opt_coa_gfa`.

---

## Per-column verdict

| Column | Cohort / guard | Verdict | Evidence |
|---|---|---|---|
| `neighbourhood_storey_norms.storeys_p90` | new-build permits, **no structure_type filter** | 🔴 **CONTAMINATED** | median p90 = 3.0 but **31% of pockets > 4 storeys**, 20% > 8, max **15**. Apartment new-builds in the cohort. |
| `opt_coa_storeys` / `opt_coa_gfa` (parcels) | = `storeys_p90`, unclamped when bylaw FSI NULL (98.5%) | 🔴 **CONTAMINATED (shipped)** | **92,082 residential parcels (25%) have `opt_coa_storeys > 4`; 54,841 (15%) > 8.** Example: RD parcel `5134730` → `opt_coa_storeys = 10`, `opt_coa_gfa = 2,767 m²` vs `opt_aor_gfa = 553 m²` (a 10-storey tower modeled on a detached-house lot). |
| `realized_fsi_p50/p90` | new-build, no structure_type filter | 🟠 **CORRUPT but INERT** | 23% of nbhds FSI_p90 > 3, **max 4,146**. BUT **zero computed consumers** — only the `nearby_builds_summary` display + the column itself. Not wired into any engine (confirmed by grep). Becomes load-bearing only if the proposed `opt_coa`-realized-FSI work ships → must clean first. |
| `build_ratio_p50` | new-build, **`OVER_CAPTURE_CLAMP ≤ 1.1`** | 🟢 **PROTECTED** | max = 1.10 (clamp holds), median 0.79. 41.8% of raw ratios clamped out (massing over-capture + apartments); only 1.4% of survivors are apartments. |
| `existing_build_ratio_p25/p50` | addition cohort, `[0,1]` clamp | 🟢 **CLEAN** | additions are 0.8% apartment; p50 = 0.85 with apts vs 0.85 without — identical. |
| `coa_approval_rate` | coa_applications decision text | 🟢 **CLEAN** | median 0.95, max 1.00, 0 over 1.0 (Toronto CoA approval genuinely runs high). |
| `realized_coverage_p50/p90` | on-inquiry only | ⚪ **N/A** | 0 non-null in bulk (documented). Unused. |
| `reno_kit` / `reno_bth` | renovation cohort w/ `interior_alterations_sqm` | ⚠️ **COVERAGE GAP** | kitchen cohort = **0 rows** (`interior_alterations_sqm` rarely populated / regex). Reno-fraction norms are effectively empty — flag for the (shelved) §G/§H reno cost work. Not contamination. |
| `opt_aor_storeys/gfa` (as-of-right) | = `storeys_p50` (robust to outliers) | 🟢 **LARGELY OK** | p50 = 3.0 citywide; the example parcels show `opt_aor_gfa` = 553/300/676 (sane ~2-storey) while their `opt_coa` is the casualty. p50 absorbs the apartment minority. |

---

## What's actually broken vs sound

**Broken (must fix before building on it):**
1. `compute-storey-norms.js` — new-build cohort has no `structure_type` filter → `storeys_p90` apartment-inflated in 31% of pockets → **directly corrupts shipped `opt_coa_storeys`/`opt_coa_gfa`** on ~15–25% of residential parcels (no by-law FSI to clamp).
2. `compute-build-norms.js` — same missing filter on the FSI cohort. Currently inert (no computed consumer) but blocks the planned `opt_coa`-FSI work and corrupts the `nearby_builds_summary` display.

**Sound (the foundation stands):**
- max-build envelope, footprint, suites, garage (pure geometry + by-law).
- `comparable_builds` (kNN zoning + lot/frontage ±20% filter excludes apartments).
- `build_ratio` (over-capture clamp), `existing_build_ratio`, `coa_approval_rate`.
- `opt_aor_*` (as-of-right, p50-driven).

**Not garbage:** the contamination is **one missing `structure_type` filter**, hitting **one cohort** (new-build storeys/FSI) that corrupts **one tier** (`opt_coa`) of the optimal-config engine, plus an inert display field. The geometric + by-law foundation and the as-of-right tier are intact.

---

## Fix (Phase A — clean, before any opt_coa work)
1. **`compute-storey-norms.js`** (critical — corrupts shipped data): exclude apartment / mixed-use / commercial `structure_type` from the new-build storey cohort.
2. **`compute-build-norms.js`**: same `structure_type` exclusion on the FSI / build-ratio / existing-ratio / reno cohorts (consistency + unblocks the FSI work).
3. Re-run `compute_storey_norms` + `compute_build_norms` (permits chain) → re-run `enrich-parcels --full` → re-run `enrich_permits`/`enrich_coa_zoning` (propagate corrected `opt_coa_*`).
4. **Re-validate:** `opt_coa_storeys > 4` on RD/RS/RT residential parcels drops to ~0; the 10-storey-on-a-detached-lot configs vanish; `storeys_p90` per pocket lands ≤ ~4 for low-rise neighbourhoods; `realized_fsi_p90` median ~0.98–1.27 (not 1.76+, max not 4,146).

Then Phase B (the `opt_coa` by-law-FSI-clamp lift) proceeds on clean norms.

## Post-fix results (2026-06-29 — WF3 shipped)
Allowlist (low-rise-residential `structure_type`, NULL-retained) applied in the SQL `WHERE` **before** the `DISTINCT ON`/`seen` dedup in both `compute-build-norms.js` + `compute-storey-norms.js`, with FSI ≤ 10 / storeys ≤ 8 plausibility backstops. Re-ran storey+build norms → `enrich-parcels --full` (43 min) → `enrich_permits`/`enrich_coa_zoning`.

| Metric | Before | After |
|---|---|---|
| storey-norm `storeys_p90` max | 15 | **5** |
| pockets with `storeys_p90 > 4` / `> 8` | 49 / 31 | **3 / 0** |
| `realized_fsi_p90` max | 4,146 | **3.3** |
| nbhds with `realized_fsi_p90 > 3` | 36 | **1** |
| residential parcels `opt_coa_storeys > 4` / `> 8` | 92,082 / 54,841 | **7,461 / 0** |
| residential `opt_coa_storeys` p90 | 10.0 | **3.0** |
| apartment/mixed excluded (storeys / FSI cohorts) | — | 3,052 / 2,875 |

Clean columns confirmed stable (no collateral damage): citywide `build_ratio_p50` 0.79→**0.808**, `existing_build_ratio_p50` ≈**0.807**, `opt_aor_storeys` p90 **3.0** (>4 = 0). The 10-storey-on-a-detached-lot configs are eliminated; the residual `opt_coa_storeys > 4` (7,461) are plausible RM/townhouse pockets at p90 = 5.

### A1 addendum (2026-06-29 — "2.5 storey → 5" parse fix)
A user challenge ("a storey norm can't be 5") surfaced a second bug independent of the apartment cohort: `extractStoreys`'s `\b(\d+)…storey` regex grabbed the **post-decimal digit** — "2.5 storey" → **5** (verified). It set `storeys_p90 = 5` in three tiny pockets (Junction Area n=12, L'Amoreaux West n=7, Markland Wood n=5) where one mis-parsed "2.5/3.5 storey" demolition description was the 90th percentile. **Fix:** match the integer part of a decimal (`\b(\d+)(?:\.\d+)?…storey`) in both `storey-extract.js` + its `scope.ts` twin — "2.5 storey" → 2 (captured, not dropped, **not clamped**); a genuine "5 storey" → still 5 (regression-locked). The silent `STOREYS_PLAUSIBILITY_MAX` drop is now a counted `storeys_dropped_implausible` audit row (surface, don't hide). **Post A1 (storey-norm recompute):** the three pockets → p90 3/2/2; overall max storey p90 **5→4**, pockets >3 **→1** (Malvern West stacked townhouses — the genuine A2 case); `storeys_dropped_implausible = 1`. (opt_coa propagation batched with A2's `enrich-parcels --full`.)

### Open follow-ups (noted, not this fix)
- **A2 (next WF) — structure-family segmentation:** a *detached* lot still inherits its pocket's norm even when that norm is set by *stacked townhouses* (Malvern West p50=4 = one 298-permit stacked-townhouse development). Segment storey + FSI norms by structure-family (detached/semi vs townhouse vs stacked/multi), match each parcel by zoning_class. Also lets us **remove the silent storeys cap** (a 4-storey stacked townhouse is legit *in its own family*). Prerequisite for trusting the per-pocket CoA build-form signal (East York builds OUT cov~0.5–0.7; other pockets build UP cov~0.1) → feeds Phase B opt_coa.
- **Parity-mechanism gap (LOW, deferred):** the storey-regex parity test is behavioral (JS-only), not a structural byte-equality assertion of the JS vs `scope.ts` regex; a future TS-only drift would be invisible. Moot today (`scope.ts` `storeyCount` is a dead variable), strengthen when storeyCount gets a consumer.
- `reno_kit`/`reno_bth` empty cohort (interior_alterations coverage) — feeds the shelved §G/§H reno cost work.
- The absurd raw apartment FSI (4,146) / mixed-use (112) suggests `residential_sqm ÷ lot_size` where the dominant parcel is a single small parcel of an assembled tower site — a separate data-integrity issue, sidestepped by the structure_type exclusion for the residential norms.
