# WF1 Bylaw-Heuristic Validation Report

**Date:** 2026-05-24
**Hypothesis:** developers/owners maximize the bylaw envelope. For new builds:
  `new_build_GFA = lot_size × coverage × floors` (with floors derived from units for high-density)
  For laneway: `MIN(60 m², lot × 0.20)`
**Defaults assumed** (per `STRUCTURE_DEFAULTS` in this script): see source.

## Validation A — New-build heuristic vs declared cost

For each `New Building` / `New Houses` / `Residential Building Permit` permit with declared cost > $100K, compute:
- `heuristic_gfa = lot_size × coverage × floors` (per structure_type defaults)
- `implied_$/m² = declared_cost ÷ heuristic_gfa`

**Industry expectation** for Toronto residential hard cost (2024-2026):
- SFD/Semi/Townhouse new build: $2,500-$4,000/m²
- Apartment Building new construction: $3,000-$5,000/m²
- If implied $/m² lands in this range, heuristic GFA is right-sized.
- If implied $/m² is suspiciously LOW (<$1,000/m²), heuristic GFA is too LARGE.
- If implied $/m² is suspiciously HIGH (>$8,000/m²), heuristic GFA is too SMALL.

### Per-combo distribution of implied $/m² (from declared cost ÷ heuristic GFA)

| permit_type | structure_type | n | median heuristic GFA | median declared | median implied $/m² | in-band % ($1K-$8K) |
|---|---|---|---|---|---|---|
| New Houses | SFD - Detached | 5280 | 563 m² | $600.0K | $1093/m² | 56% |
| New Houses | SFD - Townhouse | 996 | 820 m² | $220.0K | $532/m² | 33% |
| Residential Building Permit | SFD - Detached | 664 | 524 m² | $250.0K | $482/m² | 4% |
| Residential Building Permit | SFD - Townhouse | 381 | 264 m² | $177.5K | $606/m² | 24% |
| New Houses | 3+ Unit - Detached | 350 | 558 m² | $1.00M | $1708/m² | 77% |
| New Building | Apartment Building | 345 | 14.6K m² | $29.00M | $1366/m² | 37% |
| New Building | Mixed Use/Res w Non Re | 282 | 6745 m² | $64.50M | $6062/m² | 38% |
| New Houses | 2 Unit - Detached | 276 | 588 m² | $800.0K | $1365/m² | 72% |
| Residential Building Permit | SFD - Semi-Detached | 172 | 209 m² | $135.0K | $717/m² | 3% |
| New Houses | SFD - Semi-Detached | 155 | 347 m² | $400.0K | $797/m² | 42% |
| New Houses | Stacked Townhouses | 124 | 23.7K m² | $180.7K | $8/m² | 6% |
| New Building | Industrial | 92 | 8125 m² | $2.00M | $366/m² | 18% |
| Residential Building Permit | Apartment Building | 63 | 38.4K m² | $10.00M | $205/m² | 16% |
| New Building | Retail Store | 40 | 11.8K m² | $1.03M | $134/m² | 10% |
| New Building | Office | 22 | 40.1K m² | $2.00M | $127/m² | 9% |

### Comparison: heuristic GFA vs current modeled GFA (same permits)
| combo | n | heuristic median | current modeled median | ratio |
|---|---|---|---|---|
| New Houses/SFD - Detached | 5277 | 563 m² | 450 m² | 1.25x |
| New Houses/SFD - Townhouse | 996 | 820 m² | 1614 m² | 0.51x |
| Residential /SFD - Detached | 664 | 524 m² | 623 m² | 0.84x |
| Residential /SFD - Townhouse | 381 | 264 m² | 2530 m² | 0.10x |
| New Houses/3+ Unit - Detached | 344 | 558 m² | 311 m² | 1.79x |
| New Building/Apartment Building | 332 | 14.6K m² | 965 m² | 15.14x |
| New Building/Mixed Use/Res w No | 274 | 6916 m² | 1145 m² | 6.04x |
| New Houses/SFD - Semi-Detache | 154 | 347 m² | 568 m² | 0.61x |
| New Houses/Stacked Townhouses | 124 | 23.7K m² | 63.1K m² | 0.38x |

### Sample: high-cost megaproject permits with heuristic GFA
Previously these had model_GFA of 100-500 m². Heuristic should produce 10K-50K m².

| permit | combo | units | lot | current GFA | heuristic GFA | declared $ | implied $/m² |
|---|---|---|---|---|---|---|---|
| 23 120705 BLD:00 | Mixed Use/Res w Non Re | 405 | 287 m² | 443 m² | 2153 m² | $1.00B | $464447 |
| 25 111279 BLD:00 | Mixed Use/Res w Non Re | 498 | 261 m² | 469 m² | 1961 m² | $1.00B | $509976 |
| 18 192535 BLD:00 | Mixed Use/Res w Non Re | 867 | 5786 m² | 67 m² | 43.4K m² | $938.34M | $21622 |
| 24 114597 BLD:00 | Apartment Building | 194 | 3735 m² | N/A | 31.4K m² | $700.00M | $22309 |
| 25 257691 BLD:00 | Mixed Use/Res w Non Re | 357 | 747 m² | 244 m² | 5602 m² | $601.00M | $107276 |
| 25 259382 BLD:00 | Mixed Use/Res w Non Re | 461 | 747 m² | 244 m² | 5602 m² | $601.00M | $107276 |
| 26 143188 BLD:00 | Apartment Building | 508 | 2067 m² | 1119 m² | 17.4K m² | $500.00M | $28803 |
| 21 248833 BLD:00 | Apartment Building | 100 | 502 m² | 627 m² | 4221 m² | $463.00M | $109696 |
| 07 232946 BLD:00 | Mixed Use/Res w Non Re | 360 | 307 m² | 45 m² | 2306 m² | $450.00M | $195128 |
| 24 230010 BLD:00 | Apartment Building | 599 | 2606 m² | 984 m² | 21.9K m² | $415.00M | $18959 |
| 18 163654 BLD:00 | Mixed Use/Res w Non Re | 1670 | 258 m² | 422 m² | 1933 m² | $380.00M | $196542 |
| 23 186274 BLD:00 | Mixed Use/Res w Non Re | 542 | 726 m² | 5762 m² | 5444 m² | $375.00M | $68888 |

## Validation B — Laneway / garden suite heuristic

Heuristic: `laneway_GFA = MIN(60 m² bylaw max, lot × 0.20 physical cap)`.
Industry expectation: laneway suites are typically $200K-$500K total cost = $3,000-$8,000/m² for ~60 m² (a small premium for separate utility hookups vs main-house addition).

**n permits analyzed:** 1172

| stat | value |
|---|---|
| heuristic GFA p25 | 53 m² |
| heuristic GFA p50 | 60 m² |
| heuristic GFA p75 | 60 m² |
| declared cost p50 | $250.0K |
| implied $/m² p25  | $2760 |
| implied $/m² p50  | $5000 |
| implied $/m² p75  | $7831 |
| in-band $2K-$10K/m² | 847 of 1172 (72%) |

### Comparison: current vs heuristic for laneways
Current cost model multiplies the PRIMARY HOUSE GFA by 1.00 allocation → estimates the WHOLE primary house cost as the laneway cost.

| stat | current model | heuristic |
|---|---|---|
| median GFA used | 397 m² | 60 m² |
| median est cost | $721.7K | (would be heuristic_gfa × rate) |
