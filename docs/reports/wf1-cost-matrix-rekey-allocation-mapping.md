# PI-3 Allocation Mapping — `scope_intensity_matrix` Production-Vocabulary Re-key

**Date:** 2026-05-24
**Status:** DRAFT — awaiting user review
**Parent:** `.cursor/active_task.md` (WF1 v3) + `docs/reports/wf1-cost-matrix-rekey-pis.md` (PI-1 output)
**Per G18 fold:** structured document, user-approved before migration drafting.

---

## Method

### Permit_type axis mapping (production → existing matrix semantic)

| Production permit_type | Mapped to existing | Reasoning |
|---|---|---|
| `Small Residential Projects` | `addition` (0.20–0.25 range) | **User decision** — partial scope, often majority alteration/addition not full new-build |
| `New Houses` | `new building` (1.0) | Full new SFD/townhouse build |
| `Building Additions/Alterations` | `addition` (0.20–0.25 range) | Combined scope — use higher of {addition, alteration} for conservatism |
| `Residential Building Permit` | `new building` (1.0) | Formal building permit — typically full new construction |
| `New Building` | `new building` (1.0) | Direct 1:1 case match |
| **`Plumbing(PS)`, `Mechanical(MS)`, `Drain and Site Service`, `Demolition Folder (DM)`** | **NO ROW** | **Safe-skip per §3.A(d)** — trade-specific, no valid GFA-fraction semantic |

### Structure_type axis mapping (production → existing matrix semantic)

| Production structure_type | Mapped to existing | Notes |
|---|---|---|
| `SFD - Detached` | `sfd` | Direct |
| `SFD - Semi-Detached` | `semi-detached` | Direct |
| `SFD - Townhouse`, `Stacked Townhouses` | `townhouse` | Stacked townhouse mapped to townhouse semantic |
| `Apartment Building`, `Multiple Unit Building`, `Mixed Use/Res w Non Res` | `multi-residential` | Multi-family residential |
| `2 Unit - Detached`, `2 Unit - Semi-detached`, `3+ Unit - Detached` | `multi-residential` | Small-scale multi-unit |
| `Office`, `Retail Store`, `Industrial`, `Restaurant 30 Seats or Less`, `Restaurant Greater Than 30 Seats`, `Medical/Dental Office`, `Hospital`, `Place of Worship`, `Elementary School`, `University`, `Multiple Use/Non Residential` | `commercial` | All non-residential treated as commercial |
| `Laneway / Rear Yard Suite` | `garden suite` | Direct semantic (Toronto's new ADU permit class) |
| `Unknown`, `Other`, `Converted House` | (defaults to addition+sfd ~0.25) | Insufficient info — conservative middle |

---

## Proposed seed rows (53 total)

Trade-specific permit_types (`Plumbing(PS)`, `Mechanical(MS)`, `Drain and Site Service`, `Demolition Folder (DM)`) intentionally excluded per §3.A(d).

### Tier 1 — high-confidence direct mappings

| permit_type | structure_type | n | gfa_alloc | Source |
|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | 33,356 | **0.25** | addition/sfd |
| Small Residential Projects | SFD - Semi-Detached | 9,503 | **0.25** | addition/semi-detached |
| New Houses | SFD - Detached | 8,574 | **1.00** | new building/sfd |
| Building Additions/Alterations | Office | 7,265 | **0.20** | addition/commercial |
| Building Additions/Alterations | Apartment Building | 6,175 | **0.15** | addition/multi-residential |
| Building Additions/Alterations | Retail Store | 3,820 | **0.20** | addition/commercial |
| Building Additions/Alterations | Multiple Unit Building | 3,516 | **0.15** | addition/multi-residential |
| New Houses | SFD - Townhouse | 3,247 | **1.00** | new building/townhouse |
| Small Residential Projects | 2 Unit - Detached | 3,004 | **0.15** | addition/multi-residential |
| Small Residential Projects | SFD - Townhouse | 2,223 | **0.25** | addition/townhouse |
| Building Additions/Alterations | Multiple Use/Non Residential | 2,123 | **0.20** | addition/commercial |
| Small Residential Projects | Laneway / Rear Yard Suite | 1,679 | **1.00** | new building/garden suite |
| Building Additions/Alterations | Other | 1,644 | **0.20** | addition/commercial (default) |
| Building Additions/Alterations | Restaurant 30 Seats or Less | 1,587 | **0.20** | addition/commercial |
| Building Additions/Alterations | Industrial | 1,578 | **0.20** | addition/commercial |
| New Houses | Stacked Townhouses | 1,520 | **1.00** | new building/townhouse |
| Residential Building Permit | SFD - Detached | 1,511 | **1.00** | new building/sfd |
| Building Additions/Alterations | Restaurant Greater Than 30 Seats | 1,207 | **0.20** | addition/commercial |
| Small Residential Projects | Unknown | 1,178 | **0.25** | addition/sfd (default) |
| Small Residential Projects | 2 Unit - Semi-detached | 1,118 | **0.15** | addition/multi-residential |
| Small Residential Projects | Converted House | 1,016 | **0.25** | addition/sfd (default) |
| Building Additions/Alterations | Medical/Dental Office | 891 | **0.20** | addition/commercial |
| Small Residential Projects | 3+ Unit - Detached | 877 | **0.15** | addition/multi-residential |
| Building Additions/Alterations | Hospital | 862 | **0.20** | addition/commercial |
| New Building | Apartment Building | 775 | **1.00** | new building/multi-residential |
| New Building | Mixed Use/Res w Non Res | 755 | **1.00** | new building/multi-residential |
| Residential Building Permit | SFD - Townhouse | 699 | **1.00** | new building/townhouse |
| Building Additions/Alterations | Place of Worship | 610 | **0.20** | addition/commercial |
| New Houses | SFD - Semi-Detached | 592 | **1.00** | new building/semi-detached |
| Building Additions/Alterations | Elementary School | 553 | **0.20** | addition/commercial |
| New Houses | 3+ Unit - Detached | 521 | **1.00** | new building/multi-residential |
| Building Additions/Alterations | University | 502 | **0.20** | addition/commercial |

Cumulative coverage of Tier 1 ≈ **70-75%** of all permits (after excluding trade-specific).

### Tier 2 — defensible defaults (ambiguous, surface-for-review)

These would extend the matrix further down the long tail. Recommend keeping the matrix at Tier 1 only and letting Tier 2 cases fall through to `cost_source='none'` (legitimate matrix-miss for less-common combos) — this keeps the matrix maintainable.

---

## Migration impact

- **Old rows to DELETE (exact pairs from PI-1 reference snapshot):**
  - `(addition, commercial)`, `(addition, multi-residential)`, `(addition, semi-detached)`, `(addition, sfd)`, `(addition, townhouse)`
  - `(alteration, commercial)`, `(alteration, multi-residential)`, `(alteration, semi-detached)`, `(alteration, sfd)`, `(alteration, townhouse)`
  - `(interior alteration, commercial)`, `(interior alteration, sfd)`
  - `(new building, commercial)`, `(new building, garden suite)`, `(new building, multi-residential)`, `(new building, semi-detached)`, `(new building, sfd)`, `(new building, townhouse)`
  - **18 rows total**
- **New rows to INSERT:** 32 rows (Tier 1 above)
- **Net matrix size:** 32 rows (from 18)

## Coverage estimate

After Tier 1 seeding:
- Construction permits hit by matrix: ~**45-55%** of total permits (the rest are trade-specific safe-skips per §3.A(d))
- Of construction permits NOT safe-skipped (Building Additions/Alterations, Small Residential, New Houses, Residential Building Permit, New Building): coverage ≈ **70-75%**

**D2 verification criterion:** Post-fix `cost_estimates` coverage among construction-classified permits = **PI-1 predicted ± 5pp**.

Recalibrating PI-1 predicted with safe-skip exclusion:
- Sum of `individual_pct` for the 32 Tier 1 rows above = approximately **52%** of construction permits.
- D2 acceptance band: **47–57%** coverage post-fix.

---

## OB-3b threshold derivation (per G14 lock)

Given expected post-fix `matrix_miss_pct` ≈ 48% (100% − 52%):
- **WARN threshold:** 58% (PI-1 expected + 10pp)
- **FAIL threshold:** 68% (PI-1 expected + 20pp)

These margins recognize that the long-tail safe-skip rate is structural (per §3.A(d)) and not actionable. The audit gate fires only when something materially changes — e.g., a new permit_type appears in production that the matrix doesn't cover.

---

## Awaiting user review

**Open questions:**

1. **Tier 1 allocation values** — does the addition (~0.20) / new-building (1.00) / commercial (0.20) split look right? Particularly for the `Building Additions/Alterations` rows — these combine additions AND alterations into one permit_type; using the addition values (0.15–0.20) is conservative-high. Lower (alteration: 0.10–0.15) would be the floor.
2. **`Stacked Townhouses` mapped to townhouse (0.20 / 1.00)** — could alternatively map to multi-residential (0.10 / 1.00 + 0.10). Townhouse semantic chosen because each unit has its own footprint.
3. **`Mixed Use/Res w Non Res` mapped to multi-residential (0.10 / 1.00 + 0.10)** — could alternatively split to commercial-leaning (0.15 / 1.00). Multi-residential chosen because mixed-use leans residential by row count.
4. **Tier 2 rows (long tail) — keep matrix at 32 rows, or extend?** Recommendation: stop at 32. Long-tail rows can be safe-skipped without business impact.
5. **OB-3b thresholds** (58% WARN / 68% FAIL with ~48% expected miss rate) — reasonable, or should they be tighter?
