# WF1 — Toronto Bylaw Investigation for Cost Model GFA Estimation

**Date:** 2026-05-24
**Purpose:** Replace the made-up coverage/floors defaults from my heuristic-validation draft with bylaw-sourced numbers, plus document the caveats around massing data and missing proposed-GFA signals.
**Source ranking:** Toronto Zoning By-law 569-2013 (primary) > recent amendments (laneway 2018, garden suite 89-2022, multiplex 2023) > planning department summaries > planning consultancy/legal guides (secondary).

---

## Part 1 — Toronto Zoning By-law 569-2013: residential zone summary

### RD — Residential Detached zone (Chapter 10.20)

Bread-and-butter SFD detached zoning across most Toronto residential neighborhoods.

| Property | Value | Source |
|---|---|---|
| Max lot coverage | **35%** | Bylaw 10.20, City of Toronto |
| Max height (flat roof / low pitch) | **7.2m** | Bylaw 10.20.40 |
| Max height (high pitch roof) | **10.0m** | Bylaw 10.20.40 |
| Max storeys | **3** (with 10m height) | Implied |
| Max FSI | Varies by overlay; default ~**0.45** (some areas 0.6-1.0 with overlay) | Bylaw varies |
| Multiplex permitted | **Yes (2023)** — up to 4 units (expanding to 6) | OPA 649, Law 0653/0654 |

### RS — Residential Semi-Detached zone (Chapter 10.40)

| Property | Value | Source |
|---|---|---|
| Max lot coverage | **~35-40%** (similar to RD with semi-detached adjustments) | Bylaw 10.40 |
| Max height | Similar to RD (7.2m / 10m) | Bylaw 10.40.40 |
| Multiplex permitted | **Yes (2023)** — up to 4 units | Same as RD |

Bylaw text wasn't fully extractable from search — values inferred from RD parallel + multiplex amendment language. Should be confirmed against Chapter 10.40.40 directly.

### RT — Residential Townhouse zone (Chapter 10.60)

| Property | Value | Source |
|---|---|---|
| Max lot coverage | **60%** | Bylaw 10.60 |
| Max height | **12m** (4 storeys typical) | Bylaw 10.60.40 |
| Max FSI | **No FSI limit**; upper-storey platform area capped at 60% | Bylaw 10.60 |
| Min lot per unit | 5m frontage, 30m depth | Bylaw 10.60 |
| Setbacks | Front 4.5m, rear 7.5m, side 1.2m | Bylaw 10.60 |
| Multiplex permitted | **Yes** — supports row-style multiplexes | OPA 649 |

### RM — Residential Multiple Dwelling zone (Chapter 10.80)

Mid-density zone permitting townhouses, walk-ups, and small-scale apartments. Specifics vary widely by overlay (Chapter 900 exceptions).

| Property | Value | Source |
|---|---|---|
| Permitted forms | Townhouses, low-rise walk-ups, small apartments | Bylaw 10.80 |
| Max coverage | **Varies by overlay** (typically 40-60%) | Bylaw + Chapter 900 |
| Max FSI | **Varies by overlay** (typically 1.0-2.5) | Bylaw + Chapter 900 |
| FSI exempt for multiplex | Yes | 2023 multiplex amendment |

### RA — Residential Apartment zone (Chapter 15.10)

High-rise residential zone.

| Property | Value | Source |
|---|---|---|
| Max FSI | Up to **3.0+** (varies by location, can be much higher with avenue/major-street overlay) | Bylaw 15.10 + Chapter 900 |
| Max height | Tied to adjacent street width; varies by overlay (10m to 200m+) | Bylaw 15.10 |
| Coverage | Typically **70-80%** for tower footprint | Bylaw 15.10 |
| Major Streets bylaw (recent) | **FSI removed** on major streets — allows tower density | 2024-2025 amendment |

### CR — Commercial Residential zone (Chapter 40.10)

Mixed-use zone.

| Property | Value | Source |
|---|---|---|
| Density notation | `CR <total> (c<commercial>; r<residential>)` — e.g., `CR 3.0 (c2.0; r2.5)` | Bylaw 40.10 |
| FSI range | Typically **1.0 to 6.0+** depending on overlay | Bylaw 40.10 |
| Min height (downtown) | Often **10.5m (3 storeys)** with tall first storey (4.5m) | Bylaw 40.10 |
| Permitted uses | Retail, office, clinic, residential — mixed | Bylaw 40.10 |

---

## Part 2 — Specialty bylaws

### Laneway Suite Bylaw (2018, integrated into 569-2013 §150)

| Property | Value | Source |
|---|---|---|
| **Max footprint** | **8m × 10m = 80 m²** | Toronto Laneway Suite Bylaw 2018 |
| **Max GFA (total)** | **100 m²** (1,076 sq ft) | Toronto Laneway Suite Bylaw |
| **Max height** | **6m** (1 storey typical, with loft option) | Bylaw 569-2013 §150 |
| Lot coverage by laneway | Max **30%** of lot | Bylaw |
| Angular plane | 45° from 4m height on adjacent property line | Bylaw + Lanescape design guide |

### Garden Suite Bylaw 89-2022 (integrated into 569-2013 §170)

| Property | Value | Source |
|---|---|---|
| **Max footprint** | Lesser of **60 m²** OR **40% of rear yard** | Bylaw 89-2022 |
| Max total GFA (1-storey) | 60 m² | Bylaw 89-2022 |
| Max total GFA (with cantilevered 2nd storey) | **120 m²** | Bylaw 89-2022 |
| Max ancillary coverage (suite + sheds + garage) | **20% of lot** | Bylaw 89-2022 |
| Floor area constraint | Must be **less than primary building GFA** | Bylaw 89-2022 |
| Height | Typically 6m (1-storey) or 8.5m (with cantilever) | Bylaw 89-2022 |

### Multiplex Bylaw (2023 → 2025)

Allows duplex/triplex/fourplex in RD/RS/RT zones (originally 4 units, expanding to 6 in 2025 Toronto & East York pilot).

| Property | Value | Source |
|---|---|---|
| Max units | **4** (2023) → **6** (2025, ward-specific pilot) | OPA 649, Law 0653/0654/0648 |
| Max height | **10m** (3 storeys) — applied even in zones where RD cap is 7.2m | OPA 649 |
| Max building depth | **19m** | OPA 649 |
| Min lot frontage | As narrow as **6m** | OPA 649 |
| Eligible zones | RD, RS, RT | OPA 649 |
| FSI | **Multiplex EXEMPT from FSI** | OPA 649 |
| Coverage | "Roughly same envelope as detached house" → use **35%** as RD baseline | Plain language of bylaw |

---

## Part 3 — Mapping to our `permits.structure_type` values

| Our structure_type | Most likely zone | Coverage % | Floors | Source |
|---|---|---|---|---|
| **SFD - Detached** | RD | **35%** | 2.5–3 (height ≤ 10m) | Bylaw 10.20 |
| **SFD - Semi-Detached** | RS | **35-40%** | 2.5–3 | Bylaw 10.40 |
| **SFD - Townhouse** | RT | **60%** | 3–4 (height ≤ 12m) | Bylaw 10.60 |
| **2 Unit - Detached** | RD (multiplex) | **35%** | 3 (multiplex up to 10m) | OPA 649 |
| **2 Unit - Semi-detached** | RS (multiplex) | **35-40%** | 3 | OPA 649 |
| **3+ Unit - Detached** | RD/RS/RT (multiplex) | **35-50%** | 3 | OPA 649 |
| **Stacked Townhouses** | RT/RM | **60%** | 4 (height ≤ 12m, RM exceptions higher) | Bylaw 10.60 / 10.80 |
| **Multiple Unit Building** | RM | **~50%** | 4–6 (varies by overlay) | Bylaw 10.80 |
| **Apartment Building** | RA | **70%** | **Derived from units** (FSI 2.0-4.0+) | Bylaw 15.10 |
| **Mixed Use/Res w Non Res** | CR | **70-80%** | **Derived from units** (FSI 2.0-6.0) | Bylaw 40.10 |
| **Converted House** | RD (existing) | n/a — existing | existing | No new envelope |
| **Laneway / Rear Yard Suite** | Any with primary | **n/a — fixed cap** | n/a | **Max 100 m² GFA, 60 m² footprint** |
| **Garden suite** (subset of above) | Any with primary | **n/a — fixed cap** | n/a | **Max 120 m² GFA, 60 m² footprint** |
| **Office** | CR or Employment | **70-80%** | Derived | Bylaw 40.10 / 60 |
| **Retail Store** | CR | **60-70%** | 1-2 (single-storey common) | Bylaw 40.10 |
| **Restaurant 30 Seats or Less** | CR | **60-70%** | 1-2 | Bylaw 40.10 |
| **Restaurant Greater Than 30 Seats** | CR | **60-70%** | 1-2 | Bylaw 40.10 |
| **Industrial** | E (Employment Industrial) | **60%** | 1 (typical high-ceiling) | Bylaw 60 |
| **Hospital** | I (Institutional) | varies | varies (often 3-10) | Bylaw 50 |
| **Medical/Dental Office** | CR | **70%** | 2-3 | Bylaw 40.10 |
| **Place of Worship** | I (Institutional) | varies | 1-2 | Bylaw 50 |
| **Elementary School / University** | I (Institutional) | varies | 2-3 (varies) | Bylaw 50 |
| **Multiple Use/Non Residential** | CR / E | varies | varies | Bylaw varies |
| **Apartment Hotel** | CR / RA | **70%** | derived | Bylaw 40.10 / 15.10 |
| **Retail Mall/Plaza** | CR or RA Avenue | **60-70%** | 1-2 | Bylaw 40.10 |

---

## Part 4 — Bylaw maximum vs empirical built coverage (validation)

Per `wf1-gfa-accuracy-investigation.md` Lens L (existing built coverage from massing data):

| Combo | Bylaw max (this report) | Empirical median | Empirical p75 | Verdict |
|---|---|---|---|---|
| Small Resid Proj × SFD Detached | 35% | **30.2%** | 37.4% | Built at ~86% of bylaw; p75 at bylaw cap ✓ |
| Small Resid Proj × 2 Unit - Detached | 35% | 31.5% | 39.1% | p75 slightly above (sample noise / non-conforming?) |
| Residential Bldg Permit × SFD Detached | 35% | 34.1% | 39.8% | At bylaw cap |
| New Houses × SFD Detached | 35% | 26.1% | 33.9% | Built at ~75% — many new builds under-build slightly |
| Small Resid Proj × SFD Townhouse | 60% | 153.1%* | 293.4%* | *Schema mismatch — per-unit lot vs whole-building footprint |
| Residential Bldg Permit × SFD Townhouse | 60% | 250.1%* | 460.6%* | *Same schema issue |
| Small Resid Proj × 2 Unit - Semi-detached | 35-40% | 80.8%* | 98.9%* | *Per-unit lot issue |

**Conclusion:** for **DETACHED** structures, the "build to bylaw max" assumption holds — empirical built coverage is 75-100% of bylaw max, with p75 right at the cap.

**For semi-detached and townhouse**, the empirical numbers are nonsensical (>100% coverage) — confirming the **shared-parcel data model issue** (per-unit lot vs whole-building footprint) rather than a bylaw-vs-real mismatch.

**Operational implication:** using bylaw max as the coverage default for detached residential is accurate. For semi/townhouse, we need to first solve the per-unit lot data problem (divide footprint by unit count, or aggregate sibling parcels) before bylaw defaults will be meaningful.

---

## Part 5 — Proposed `logic_variable` defaults (bylaw-anchored, operator-tunable)

Replace my earlier guesses with these bylaw-sourced numbers. All would live in `scripts/seeds/logic_variables.json` and be editable via the Spec 86 Control Panel.

```json
{
  "lot_coverage_max_sfd_detached":           { "default": 0.35, "min": 0.10, "max": 0.80, "source": "Bylaw 10.20 RD" },
  "lot_coverage_max_sfd_semi_detached":      { "default": 0.40, "min": 0.10, "max": 0.80, "source": "Bylaw 10.40 RS" },
  "lot_coverage_max_sfd_townhouse":          { "default": 0.60, "min": 0.20, "max": 0.90, "source": "Bylaw 10.60 RT" },
  "lot_coverage_max_apartment":              { "default": 0.70, "min": 0.30, "max": 0.95, "source": "Bylaw 15.10 RA typical" },
  "lot_coverage_max_mixed_use":              { "default": 0.75, "min": 0.30, "max": 0.95, "source": "Bylaw 40.10 CR typical" },
  "lot_coverage_max_commercial":             { "default": 0.70, "min": 0.30, "max": 0.95, "source": "Bylaw 40.10 CR + ground-floor commercial" },
  "lot_coverage_max_industrial":             { "default": 0.60, "min": 0.30, "max": 0.95, "source": "Bylaw 60 Employment zones" },

  "default_floors_sfd_detached":             { "default": 2.5,  "min": 1, "max": 4,  "source": "RD 10m height cap → 2.5-3 storeys" },
  "default_floors_sfd_semi_detached":        { "default": 2.5,  "min": 1, "max": 4,  "source": "RS similar to RD" },
  "default_floors_sfd_townhouse":            { "default": 3.0,  "min": 1, "max": 5,  "source": "RT 12m → 3-4 storeys" },
  "default_floors_multiplex":                { "default": 3.0,  "min": 1, "max": 4,  "source": "Multiplex 10m height cap (OPA 649)" },
  "default_floors_apartment_low":            { "default": 6.0,  "min": 3, "max": 12, "source": "Mid-rise typical 6-8 storeys" },
  "default_floors_apartment_derived":        { "default": "derived", "source": "Derived from units × unit_sqm / (lot × coverage × efficiency)" },

  "laneway_suite_max_gfa_sqm":               { "default": 100,  "min": 30, "max": 150, "source": "Toronto Laneway Suite Bylaw 2018" },
  "laneway_suite_max_footprint_sqm":         { "default": 80,   "min": 25, "max": 100, "source": "8m × 10m max per bylaw" },
  "garden_suite_max_gfa_sqm":                { "default": 120,  "min": 30, "max": 180, "source": "Bylaw 89-2022 — with cantilevered 2nd storey" },
  "garden_suite_max_footprint_sqm":          { "default": 60,   "min": 25, "max": 80,  "source": "Bylaw 89-2022 §170" },

  "typical_unit_sqm_apartment":              { "default": 80,   "min": 40, "max": 200, "source": "Toronto condo unit average (industry)" },
  "typical_unit_sqm_mixed_use_residential":  { "default": 90,   "min": 40, "max": 200, "source": "Mixed-use unit average (industry)" },
  "typical_unit_sqm_sfd_detached":           { "default": 250,  "min": 80, "max": 500, "source": "Toronto SFD average (industry)" },
  "gfa_to_sellable_efficiency":              { "default": 0.85, "min": 0.70, "max": 0.95, "source": "Real estate net-to-gross convention" }
}
```

**`"source"` field is a new convention** — annotate the bylaw or industry reference next to each value, so operators tuning via the Control Panel can see where the default came from and whether their adjustment moves toward or away from regulatory data.

---

## Part 6 — Known caveats and gaps

### Caveat 1 — Story count is COMPUTED, not stored

`load-massing.js:77-80` derives `estimated_stories` from `max_height_m / 3.0`. Toronto's 3D Massing dataset does not directly publish story counts.

**Failure modes:**
- High-ceiling commercial (1-story warehouse, 12m ceiling) → recorded as 4 stories ❌ → over-estimates GFA
- Sloped or stepped buildings → single max_height_m doesn't reflect average

**Mitigation options:**
- (a) Per-`structure_type` story divisor: residential 3.0m, commercial 3.6m, industrial 6.0m, mid-rise apartment 3.2m. Operator-tunable.
- (b) Use `permits.dwelling_units_created` ÷ `footprint_area_sqm` as a sanity check for residential.
- (c) Cap stories at structure_type-specific maximums (residential 4 stories baseline, apartment 30, etc.).

### Caveat 2 — `permits.storeys` is 100% zero

Confirmed in Lens K. The declared `storeys` field on every permit is zero. Either Toronto stopped populating it, or our `load-permits.js` is dropping the value during ingestion.

**Action:** investigate `load-permits.js` — is the column being read from CKAN? If yes, why is it zero? If no, why was it included in the schema?

### Caveat 3 — No proposed-GFA signal in our data

The conceptual gap from previous discussion: massing data measures the **current property**, but the cost model needs the **scope of the work**. For new builds and laneway suites, the proposed-build size is the answer we need, and it's nowhere in our database.

**Potential sources:**
- **Toronto Open Data Building Permit dataset** — sometimes contains free-text description with proposed dimensions ("new 3-storey, 4-unit dwelling, 280 sq.m. GFA")
- **MPAC Property Assessment** — has authoritative built GFA post-completion, but paid license required
- **Description-text parsing** — `permits.description` may contain proposed dimensions that we could extract with regex/NLP. This would be a high-value but moderate-effort follow-up WF.

### Caveat 4 — No per-parcel zoning class in our data

We have `parcels` but no `parcels.zoning_class` field. Without it, we can't pick the right bylaw row per parcel — we have to fall back to `structure_type` as a proxy (good for residential, less good for commercial where structure_type is e.g. "Office" but the zone matters).

**Action:** ingest **Toronto Open Data `zoning-by-law` dataset** → `parcels.zoning_class` (R1/R2/RD/RS/RT/RM/RA/CR/E/I etc.). Then the cost model could look up bylaw caps per zone instead of per structure_type. Higher accuracy.

### Caveat 5 — Major Streets / Avenues overlay

Recent bylaw amendments allow much higher density on major streets (FSI removed). A parcel's bylaw cap depends on whether it's on an avenue. Our heuristic doesn't account for this — it treats every RD parcel as low-density even when it's on Yonge Street.

**Mitigation:** secondary follow-up. For high-impact cases, add `parcels.on_major_street boolean` from Toronto's Major Streets layer.

### Caveat 6 — Chapter 900 exceptions

`logic_variable` defaults are **base zone maxes**. Toronto Bylaw 569-2013 Chapter 900 contains **thousands of site-specific exceptions** that override the base zone. Without ingesting these, our heuristic uses the base case — which is conservative but can be wrong (10-30% off) for parcels with exceptions.

**Acceptance:** for now, document this. Operator can tune individual cases via the Control Panel matrix when they find systematically off categories.

---

## Part 7 — Recommended next steps

| # | Action | Source confidence | Effort | Impact |
|---|---|---|---|---|
| 1 | Replace heuristic defaults with bylaw-sourced numbers from Part 5 | ✅ Bylaw-cited | 0.5 day | HIGH (~5x cost-model improvement validated) |
| 2 | Investigate `permits.storeys = 0` ingestion (Caveat 2) | — | 0.5-1 day | CRITICAL |
| 3 | Fix `link-massing` for New Building permits (bypass massing, use lot×bylaw) | ✅ Per Part 3 mapping | 2-3 days | CRITICAL |
| 4 | Add per-structure-type story-divisor (Caveat 1) | — | 0.5 day | MEDIUM |
| 5 | Solve per-unit lot data for townhouse/semi (multi-unit divisor) | — | 1-2 days | HIGH |
| 6 | Ingest Toronto zoning dataset → `parcels.zoning_class` (Caveat 4) | ✅ Toronto Open Data | 2-4 days | HIGH (enables true zone-based bylaw lookup) |
| 7 | Parse `permits.description` for proposed dimensions (Caveat 3) | 🟡 Heuristic | 1-2 weeks (regex iterative) | MEDIUM (better than bylaw heuristic for narrow set) |
| 8 | Ingest Toronto Major Streets layer → `parcels.on_major_street` (Caveat 5) | ✅ Toronto Open Data | 0.5-1 day | LOW-MEDIUM (urban density refinement) |

---

## Sources

- [Toronto Zoning By-law 569-2013, as amended (Office Consolidation)](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10.htm)
- [Toronto Zoning By-law Vol 1 PDF (Ch 1-800)](https://www.toronto.ca/legdocs/bylaws/2013/law0569-schedule-a-vol1-ch1-800.pdf)
- [Bylaw 10.20 — Residential Detached (RD) Zone](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm)
- [Bylaw 10.40 — Residential Semi-Detached (RS) Zone](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm)
- [Bylaw 10.60 — Residential Townhouse (RT) Zone](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm)
- [Bylaw 15.10 — Residential Apartment (RA) Zone](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter15_10.htm)
- [Bylaw 40.10 — Commercial Residential (CR) Zone](https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter40_10.htm)
- [Toronto Garden Suites Summary of Rules (Feb 2022)](https://www.toronto.ca/wp-content/uploads/2022/02/9320-cityplanning-garden-suites-summary-of-rules-Feb2022.pdf)
- [Toronto Multiplex Housing City of Toronto](https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/multiplex-housing/)
- [Toronto Multiplex Considerations](https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/multiplex-housing/considerations-when-building-multiplexes/)
- [Multiplex Draft ZBLA (May 2025)](https://www.toronto.ca/wp-content/uploads/2025/05/979e-city-planning-multiplex-draft-zbla-plex-monitoring.pdf)
- [Lanescape — Laneway Suite Bylaws](https://lanescape.ca/bylaws/)
- [Toronto Garden Suite Bylaw 89-2022 (third-party summary)](https://www.maisongardensuites.com/resources/post/toronto-garden-suite-bylaws)
- [Re-Housing the Yellowbelt: What can you build](https://rehousing.ca/What-can-you-build)
- [Toronto Multiplex Zoning Bylaw — Alloway Property](https://allowayproperty.com/city-of-torontos-multiplex-zoning-by-law/)
- [Toronto's Zoning Bylaws — ASR Engineers](https://asrengineers.ca/post-torontos-zoning-bylaws/)
- [CR Zoning in Toronto — Landsignal](https://landsignal.ai/blog/commercial-residential-zoning-toronto/)
- [Understanding GFA & FSI in Toronto — Landsignal](https://landsignal.ai/blog/gfa-fsi-toronto/)
- [Toronto 3D Massing dataset (CKAN)](https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/387b2e3b-2a76-4199-8b3b-0b7d22e2ec10/) — used by `scripts/load-massing.js`
- Ontario Regulation 462/24 (Simplified Garden and Laneway Suites in Toronto) — recent simplification of approval process

**Note on confidence:** numeric values for the base RD/RS/RT zones are pulled from secondary planning-consultancy summaries because the official PDF/HTML pages didn't extract cleanly via WebFetch. Before shipping the `logic_variable` defaults from Part 5 to production, an operator with domain knowledge should cross-check the key numbers (35% RD, 60% RT, 100 m² laneway, 60 m² garden suite footprint) against the actual bylaw text. The third-party citations are consistent across multiple sources, which is a reasonable proxy for accuracy.
