# WF1 GFA + Massing Accuracy Investigation

**Date:** 2026-05-24
**Parent:** `docs/reports/wf1-cost-accuracy-investigation.md` (cost over/under-prediction findings)
**Method:** read-only DB queries against modeled_gfa_sqm, building_footprints, parcels, parcel_buildings.
**Hypothesis under test:** the cost over-prediction for additions/alterations and under-prediction for megaprojects is rooted in GFA computation, not matrix allocation. Massing data quality (building outline on the lot) is the upstream driver.

## Lens A — GFA distribution by (permit_type, structure_type)

Filters: modeled_gfa_sqm IS NOT NULL, permits only, n >= 30 per combo.

**Industry expectations for sanity check:**
- SFD detached: 100-400 m² (typical ~200 m²)
- SFD townhouse: 100-250 m² (typical ~150 m²)
- Apartment Building: 2,000-50,000 m² (mid-rise 5,000-15,000; high-rise 15,000-50,000+)
- Office: 500-50,000 m² (small commercial 500-2,000; mid-rise 2,000-15,000)
- Industrial: 1,000-30,000 m²
- Retail Store: 200-5,000 m²

| permit_type | structure_type | src | n | p25 | p50 | p75 | p95 | max |
|---|---|---|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | model | 20341 | 316 m² | 474 m² | 743 m² | 1499 m² | 70.3K m² |
| Small Residential Projects | SFD - Detached | permit | 12939 | 262 m² | 362 m² | 540 m² | 1008 m² | 6493 m² |
| Small Residential Projects | SFD - Semi-Detached | model | 7254 | 475 m² | 653 m² | 903 m² | 1725 m² | 21.4K m² |
| Building Additions/Alteratio | Office | model | 4508 | 1720 m² | 8833 m² | 23.9K m² | 96.2K m² | 1071.0K m² |
| Building Additions/Alteratio | Apartment Building | model | 4186 | 1762 m² | 7048 m² | 21.5K m² | 46.6K m² | 272.9K m² |
| New Houses | SFD - Detached | model | 4136 | 393 m² | 642 m² | 966 m² | 1894 m² | 13.6K m² |
| New Houses | SFD - Detached | permit | 3885 | 235 m² | 344 m² | 525 m² | 983 m² | 9728 m² |
| Building Additions/Alteratio | Retail Store | model | 2408 | 1416 m² | 4147 m² | 11.7K m² | 68.5K m² | 1071.0K m² |
| Building Additions/Alteratio | Office | permit | 2263 | 228 m² | 693 m² | 1717 m² | 9923 m² | 213.4K m² |
| Small Residential Projects | SFD - Semi-Detached | permit | 2215 | 413 m² | 517 m² | 734 m² | 1162 m² | 3933 m² |
| Building Additions/Alteratio | Multiple Unit Building | model | 2099 | 812 m² | 2002 m² | 5763 m² | 33.4K m² | 1071.0K m² |
| Small Residential Projects | SFD - Townhouse | model | 1855 | 877 m² | 1530 m² | 2503 m² | 5738 m² | 44.1K m² |
| Building Additions/Alteratio | Apartment Building | permit | 1692 | 192 m² | 554 m² | 1556 m² | 10.3K m² | 106.1K m² |
| Small Residential Projects | 2 Unit - Detached | permit | 1622 | 252 m² | 338 m² | 481 m² | 849 m² | 3477 m² |
| New Houses | SFD - Townhouse | model | 1483 | 671 m² | 1659 m² | 2925 m² | 32.4K m² | 32.4K m² |
| Residential Building Permit | SFD - Detached | model | 1375 | 413 m² | 607 m² | 851 m² | 1661 m² | 15.0K m² |
| Small Residential Projects | 2 Unit - Detached | model | 1371 | 319 m² | 450 m² | 680 m² | 1280 m² | 6493 m² |
| Building Additions/Alteratio | Multiple Use/Non Resid | model | 1304 | 1453 m² | 4533 m² | 13.9K m² | 96.2K m² | 1071.0K m² |
| Building Additions/Alteratio | Multiple Unit Building | permit | 1242 | 206 m² | 566 m² | 1252 m² | 5382 m² | 100.0K m² |
| Small Residential Projects | Unknown | model | 1099 | 410 m² | 583 m² | 890 m² | 1735 m² | 14.0K m² |
| Small Residential Projects | Laneway / Rear Yard Su | model | 1085 | 315 m² | 476 m² | 769 m² | 1539 m² | 10.5K m² |
| Building Additions/Alteratio | Industrial | model | 1076 | 4476 m² | 11.7K m² | 28.7K m² | 95.2K m² | 315.0K m² |
| Building Additions/Alteratio | Restaurant 30 Seats or | model | 1061 | 1344 m² | 2937 m² | 7557 m² | 39.5K m² | 285.9K m² |
| Building Additions/Alteratio | Retail Store | permit | 1022 | 204 m² | 492 m² | 1190 m² | 5440 m² | 61.9K m² |
| Building Additions/Alteratio | Other | model | 993 | 1190 m² | 2747 m² | 10.1K m² | 51.1K m² | 1071.0K m² |
| New Houses | SFD - Townhouse | permit | 820 | 17 m² | 109 m² | 193 m² | 719 m² | 3369 m² |
| Small Residential Projects | Converted House | model | 799 | 479 m² | 742 m² | 1060 m² | 2354 m² | 47.5K m² |
| Building Additions/Alteratio | Restaurant Greater Tha | model | 770 | 1212 m² | 2706 m² | 8155 m² | 34.5K m² | 218.8K m² |
| Small Residential Projects | 2 Unit - Semi-detached | model | 683 | 551 m² | 728 m² | 1006 m² | 1661 m² | 5292 m² |
| Building Additions/Alteratio | Multiple Use/Non Resid | permit | 665 | 182 m² | 669 m² | 1820 m² | 9923 m² | 191.5K m² |
| Residential Building Permit | SFD - Townhouse | model | 581 | 1378 m² | 2092 m² | 2988 m² | 7183 m² | 193.4K m² |
| Small Residential Projects | Laneway / Rear Yard Su | permit | 570 | 221 m² | 293 m² | 411 m² | 683 m² | 2226 m² |
| Building Additions/Alteratio | Medical/Dental Office | model | 530 | 1712 m² | 5452 m² | 13.1K m² | 35.7K m² | 154.8K m² |
| Building Additions/Alteratio | Hospital | model | 495 | 3391 m² | 24.7K m² | 216.7K m² | 271.1K m² | 271.1K m² |
| Small Residential Projects | 3+ Unit - Detached | permit | 488 | 281 m² | 407 m² | 647 m² | 1220 m² | 3602 m² |
| Building Additions/Alteratio | Other | permit | 472 | 279 m² | 758 m² | 1875 m² | 8405 m² | 72.6K m² |
| New Houses | Stacked Townhouses | model | 458 | 206 m² | 411 m² | 792 m² | 63.1K m² | 63.1K m² |
| Building Additions/Alteratio | Restaurant 30 Seats or | permit | 452 | 191 m² | 422 m² | 899 m² | 3043 m² | 45.8K m² |
| Small Residential Projects | 2 Unit - Semi-detached | permit | 427 | 474 m² | 611 m² | 826 m² | 1230 m² | 3600 m² |
| New Building | Apartment Building | permit | 415 | 346 m² | 825 m² | 2113 m² | 19.8K m² | 86.8K m² |

## Lens B — GFA computation path mix (primary massing vs fallback lot×coverage)

Primary path: `GFA = footprint_area_sqm × stories` (requires `parcel_buildings.is_primary=true` + `building_footprints`).
Fallback path: `GFA = lot_size_sqm × coverage_ratio × floors` (when massing missing — clearly wrong for additions, treats the whole lot as built).

We infer the path by joining cost_estimates → permits → permit_parcels → parcels → parcel_buildings → building_footprints. If a primary building footprint exists, the Brain used the primary path.

| permit_type | structure_type | n | primary% | primary median GFA | fallback median GFA |
|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | 33280 | 99.3% | 427 m² | 155 m² |
| Small Residential Projects | SFD - Semi-Detached | 9470 | 99.4% | 622 m² | 148 m² |
| New Houses | SFD - Detached | 8021 | 94.9% | 485 m² | 185 m² |
| Building Additions/Alteratio | Office | 6771 | 69.0% | 8335 m² | 1223 m² |
| Building Additions/Alteratio | Apartment Building | 5878 | 87.8% | 4202 m² | 955 m² |
| Building Additions/Alteratio | Retail Store | 3430 | 75.5% | 2263 m² | 1119 m² |
| Building Additions/Alteratio | Multiple Unit Building | 3345 | 82.7% | 1358 m² | 764 m² |
| Small Residential Projects | 2 Unit - Detached | 2993 | 99.1% | 387 m² | 161 m² |
| New Houses | SFD - Townhouse | 2303 | 61.6% | 1572 m² | 95 m² |
| Small Residential Projects | SFD - Townhouse | 2183 | 98.2% | 1401 m² | 428 m² |
| Building Additions/Alteratio | Multiple Use/Non Resid | 1973 | 77.7% | 3920 m² | 764 m² |
| Small Residential Projects | Laneway / Rear Yard Su | 1655 | 99.5% | 404 m² | 204 m² |
| Building Additions/Alteratio | Restaurant 30 Seats or | 1513 | 80.0% | 2139 m² | 1119 m² |
| Residential Building Permit | SFD - Detached | 1496 | 99.5% | 586 m² | 191 m² |
| Building Additions/Alteratio | Other | 1468 | 84.3% | 1957 m² | 1124 m² |
| Building Additions/Alteratio | Industrial | 1459 | 92.7% | 8351 m² | 6590 m² |
| Small Residential Projects | Unknown | 1169 | 99.9% | 574 m² | 202 m² |
| Building Additions/Alteratio | Restaurant Greater Tha | 1144 | 83.6% | 1991 m² | 845 m² |
| Small Residential Projects | 2 Unit - Semi-detached | 1110 | 99.5% | 704 m² | 160 m² |
| Small Residential Projects | Converted House | 1009 | 99.5% | 681 m² | 93 m² |
| Small Residential Projects | 3+ Unit - Detached | 869 | 99.8% | 459 m² | 356 m² |
| Building Additions/Alteratio | Hospital | 845 | 65.3% | 24.7K m² | 1189 m² |
| Building Additions/Alteratio | Medical/Dental Office | 802 | 81.0% | 3919 m² | 985 m² |
| New Houses | Stacked Townhouses | 671 | 55.9% | 411 m² | 206 m² |
| Residential Building Permit | SFD - Townhouse | 626 | 98.9% | 2017 m² | 206 m² |

**Interpretation:** if `fallback_median_gfa` is dramatically higher than `primary_median_gfa` for the same combo, the fallback is over-estimating (treating the whole lot as buildable). This is the suspected over-prediction root cause for additions/alterations.

## Lens C — GFA vs declared cost correlation

For permits with both `est_const_cost > $1K` (real applicant declaration) AND `modeled_gfa_sqm > 0`, compute implied $/m² from declared. If our trade rates (~$100-$500/m²) are right, declared $/sqm should land in that range. Wildly different ratios signal GFA error.

| permit_type | structure_type | n | median GFA | median declared | implied $/m² |
|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | 26536 | 417 m² | $41.3K | $93/m² |
| Small Residential Projects | SFD - Semi-Detached | 6743 | 609 m² | $30.0K | $47/m² ← suspiciously low |
| Building Additions/Alteratio | Office | 5852 | 2939 m² | $100.0K | $33/m² ← suspiciously low |
| New Houses | SFD - Detached | 5767 | 446 m² | $600.0K | $1334/m² |
| Building Additions/Alteratio | Apartment Building | 4828 | 2965 m² | $125.0K | $33/m² ← suspiciously low |
| Building Additions/Alteratio | Retail Store | 2938 | 1954 m² | $75.0K | $30/m² ← suspiciously low |
| Building Additions/Alteratio | Multiple Unit Building | 2492 | 1232 m² | $75.0K | $56/m² |
| Small Residential Projects | 2 Unit - Detached | 2342 | 382 m² | $50.0K | $139/m² |
| New Houses | SFD - Townhouse | 2002 | 668 m² | $274.0K | $442/m² |
| Building Additions/Alteratio | Multiple Use/Non Resid | 1597 | 2346 m² | $100.0K | $41/m² ← suspiciously low |
| Small Residential Projects | SFD - Townhouse | 1511 | 1420 m² | $26.0K | $21/m² ← suspiciously low |
| Small Residential Projects | Laneway / Rear Yard Su | 1362 | 405 m² | $200.0K | $500/m² |
| Building Additions/Alteratio | Restaurant 30 Seats or | 1335 | 1737 m² | $60.0K | $29/m² ← suspiciously low |
| Residential Building Permit | SFD - Detached | 1268 | 584 m² | $120.0K | $198/m² |
| Building Additions/Alteratio | Industrial | 1122 | 7884 m² | $100.0K | $16/m² ← suspiciously low |
| Small Residential Projects | Unknown | 1064 | 574 m² | $10.0K | $16/m² ← suspiciously low |
| Building Additions/Alteratio | Restaurant Greater Tha | 915 | 1811 m² | $100.0K | $48/m² ← suspiciously low |
| Building Additions/Alteratio | Other | 907 | 1634 m² | $122.5K | $69/m² |
| Small Residential Projects | 2 Unit - Semi-detached | 790 | 702 m² | $50.0K | $84/m² |
| Small Residential Projects | Converted House | 778 | 680 m² | $30.0K | $38/m² ← suspiciously low |
| Building Additions/Alteratio | Hospital | 724 | 3676 m² | $350.0K | $72/m² |
| Building Additions/Alteratio | Medical/Dental Office | 719 | 2088 m² | $100.0K | $39/m² ← suspiciously low |
| New Houses | Stacked Townhouses | 663 | 206 m² | $150.5K | $515/m² |
| Small Residential Projects | 3+ Unit - Detached | 660 | 455 m² | $87.5K | $182/m² |
| Building Additions/Alteratio | Elementary School | 506 | 5391 m² | $200.0K | $68/m² |

## Lens D — Megaproject GFA diagnosis (the under-prediction class)

From the cost-accuracy report: `New Building / Apartment Building` and `New Building / Mixed Use/Res w Non Res` were model-under-predicted (model $2-3M vs declared $30-65M). Hypothesis: their `modeled_gfa_sqm` is much smaller than the true building envelope.

| permit_type | structure_type | n | GFA p25 | GFA p50 | GFA p75 | GFA p95 | GFA max | declared storeys p50 / max |
|---|---|---|---|---|---|---|---|---|
| New Houses | SFD - Detached | 8021 | 287 m² | 467 m² | 755 m² | 1539 m² | 13.6K m² | 0 / 0 |
| New Houses | SFD - Townhouse | 2303 | 193 m² | 671 m² | 2259 m² | 32.4K m² | 32.4K m² | 0 / 0 |
| Residential Building Permit | SFD - Detached | 1496 | 397 m² | 585 m² | 824 m² | 1616 m² | 15.0K m² | 0 / 0 |
| New Houses | Stacked Townhouses | 671 | 183 m² | 206 m² | 781 m² | 63.1K m² | 63.1K m² | 0 / 0 |
| Residential Building Permit | SFD - Townhouse | 626 | 1267 m² | 2017 m² | 2919 m² | 7183 m² | 193.4K m² | 0 / 0 |
| New Building | Apartment Building | 599 | 381 m² | 848 m² | 2124 m² | 25.3K m² | 115.0K m² | 0 / 0 |
| New Building | Mixed Use/Res w Non Re | 599 | 256 m² | 919 m² | 3415 m² | 28.8K m² | 191.3K m² | 0 / 0 |
| New Houses | 3+ Unit - Detached | 511 | 232 m² | 323 m² | 520 m² | 1057 m² | 4601 m² | 0 / 0 |
| New Houses | SFD - Semi-Detached | 357 | 272 m² | 506 m² | 904 m² | 2357 m² | 17.1K m² | 0 / 0 |

**Specific high-cost permits — what GFA did they get?**
| permit | type/struct | declared storeys | dwelling units | modeled_gfa | declared cost | model cost | footprint_sqm | massing_stories | lot_size_sqm |
|---|---|---|---|---|---|---|---|---|---|
| 23 120705 BLD:00 | New Building/Mixed Use/Res w No | 0 | 405 | 443 m² | $1.00B | $1.00B | 111 m² | 4 | 287 m² |
| 25 111279 BLD:00 | New Building/Mixed Use/Res w No | 0 | 498 | 469 m² | $1.00B | $1.00B | 156 m² | 3 | 261 m² |
| 18 192535 BLD:00 | New Building/Mixed Use/Res w No | 0 | 867 | 67 m² | $938.34M | $938.34M | 67 m² | N/A | 5786 m² |
| 24 114597 BLD:00 | New Building/Apartment Building | 0 | 194 | N/A | $700.00M | N/A | 759 m² | 21 | 3735 m² |
| 25 257691 BLD:00 | New Building/Mixed Use/Res w No | 0 | 357 | 244 m² | $601.00M | $601.00M | 61 m² | 4 | 747 m² |
| 25 259382 BLD:00 | New Building/Mixed Use/Res w No | 0 | 461 | 244 m² | $601.00M | $601.00M | 61 m² | 4 | 747 m² |
| 26 143188 BLD:00 | New Building/Apartment Building | 0 | 508 | 1119 m² | $500.00M | $500.00M | 70 m² | 16 | 2067 m² |
| 19 106142 BLD:00 | New Building/Mixed Use/Res w No | 0 | 416 | 4323 m² | $485.00M | $485.00M | 4323 m² | N/A | N/A |
| 21 248833 BLD:00 | New Building/Apartment Building | 0 | 100 | 627 m² | $463.00M | $463.00M | 125 m² | 5 | 502 m² |
| 23 177833 BLD:00 | New Building/Mixed Use/Res w No | 0 | 509 | N/A | $450.00M | N/A | N/A | N/A | N/A |

## Lens E — GFA outliers

Permits with modeled_gfa_sqm > 10× combo median (likely over-estimate) or < 0.1× combo median (under-estimate). Combos with n < 30 excluded.

| permit | type/struct | modeled_gfa | declared cost | est cost | combo median GFA | deviation |
|---|---|---|---|---|---|---|
| 23 116141 BLD:00 | Building Addit/Multiple Use/N | 1 m² | $65.0K | $65.0K | 2241 m² | 0.00x |
| 21 114456 BLD:00 | Building Addit/Apartment Buil | 1 m² | $9.3K | $9.3K | 2862 m² | 0.00x |
| 21 203912 BLD:00 | Building Addit/Apartment Buil | 1 m² | $14.8K | $14.8K | 2862 m² | 0.00x |
| 14 255551 B04:00 | New Houses/SFD - Townhous | 0 m² | $375.0K | $375.0K | 671 m² | 0.00x |
| 17 218469 BLD:00 | Building Addit/Restaurant 30  | 1 m² | $70.0K | $70.0K | 1730 m² | 0.00x |
| 18 105099 BLD:00 | Building Addit/Restaurant 30  | 1 m² | $5.0K | $5.0K | 1730 m² | 0.00x |
| 25 246346 BLD:00 | Small Resident/SFD - Townhous | 1 m² | $10.0K | $10.0K | 1375 m² | 0.00x |
| 26 141465 BLD:00 | Building Addit/Multiple Unit  | 1 m² | $5.00M | $5.00M | 1201 m² | 0.00x |
| 02 178907 BLD:00 | Building Addit/Place of Worsh | 1 m² | $600.0K | $600.0K | 2269 m² | 0.00x |
| 21 206147 BLD:00 | Building Addit/Apartment Buil | 2 m² | $18.0K | $18.0K | 2862 m² | 0.00x |
| 15 129482 BLD:00 | Building Addit/Apartment Buil | 2 m² | $250.0K | $250.0K | 2862 m² | 0.00x |
| 25 109938 BLD:00 | Building Addit/Multiple Unit  | 1 m² | $16.9K | $16.9K | 1201 m² | 0.00x |
| 10 261320 BLD:00 | New Building/Apartment Buil | 1 m² | $48.50M | $48.50M | 848 m² | 0.00x |
| 15 218147 B03:00 | New Houses/SFD - Townhous | 1 m² | $325.0K | $325.0K | 671 m² | 0.00x |
| 15 219785 B05:00 | New Houses/SFD - Townhous | 1 m² | $325.0K | $325.0K | 671 m² | 0.00x |
| 15 219785 B02:00 | New Houses/SFD - Townhous | 1 m² | $325.0K | $325.0K | 671 m² | 0.00x |
| 15 218147 B06:00 | New Houses/SFD - Townhous | 1 m² | $325.0K | $325.0K | 671 m² | 0.00x |
| 15 218147 B05:00 | New Houses/SFD - Townhous | 1 m² | $325.0K | $325.0K | 671 m² | 0.00x |
| 15 218147 B04:00 | New Houses/SFD - Townhous | 1 m² | $325.0K | $325.0K | 671 m² | 0.00x |
| 18 232913 B09:00 | New Houses/SFD - Townhous | 1 m² | $550.0K | $550.0K | 671 m² | 0.00x |
| 15 218147 B07:00 | New Houses/SFD - Townhous | 1 m² | $350.0K | $350.0K | 671 m² | 0.00x |
| 15 219785 B01:00 | New Houses/SFD - Townhous | 1 m² | $325.0K | $325.0K | 671 m² | 0.00x |
| 25 269847 BLD:00 | Building Addit/Industrial | 8 m² | $100.0K | $100.0K | 8034 m² | 0.00x |
| 17 265385 BLD:00 | Building Addit/Industrial | 8 m² | $430.0K | $430.0K | 8034 m² | 0.00x |
| 23 192669 BLD:00 | Building Addit/Industrial | 8 m² | $1.82M | $1.82M | 8034 m² | 0.00x |

## Lens F — Massing data presence and completeness

Massing data comes from `link-massing.js` (spatial join: permit → parcel → primary building → footprint). For each link to feed the primary GFA path, we need: a permit→parcel link, a parcel→building link (with `is_primary=true`), a footprint_area_sqm value, AND an estimated_stories value.

| permit_type | structure_type | n | parcel% | any-building% | primary-building% | full-path% |
|---|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | 33356 | 99.8% | 99.8% | 99.8% | 99.0% |
| Plumbing(PS) | SFD - Detached | 18406 | 98.8% | 98.7% | 98.7% | 97.3% |
| Mechanical(MS) | SFD - Detached | 13473 | 98.4% | 98.3% | 98.3% | 96.6% |
| Small Residential Projects | SFD - Semi-Detached | 9503 | 99.7% | 99.6% | 99.6% | 99.0% |
| New Houses | SFD - Detached | 8574 | 93.8% | 93.4% | 93.4% | 88.8% |
| Drain and Site Service | SFD - Detached | 8411 | 98.4% | 98.3% | 98.3% | 96.7% |
| Building Additions/Alteratio | Office | 7265 | 93.7% | 91.9% | 91.9% | 64.3% |
| Building Additions/Alteratio | Apartment Building | 6175 | 95.5% | 95.2% | 95.2% | 83.9% |
| Mechanical(MS) | Office | 4972 | 95.2% | 93.2% | 93.2% | 63.7% |
| Plumbing(PS) | Apartment Building | 4222 | 92.9% | 92.3% | 92.3% | 67.1% |
| Plumbing(PS) | SFD - Semi-Detached | 3902 | 97.1% | 96.8% | 96.8% | 95.6% |
| Building Additions/Alteratio | Retail Store | 3820 | 90.0% | 89.3% | 89.3% | 67.8% |
| Building Additions/Alteratio | Multiple Unit Building | 3516 | 95.4% | 94.9% | 94.9% | 78.7% |
| New Houses | SFD - Townhouse | 3247 | 74.6% | 70.8% | 70.8% | 43.7% |
| Plumbing(PS) | Office | 3227 | 94.5% | 92.2% | 92.2% | 65.9% |
| Small Residential Projects | 2 Unit - Detached | 3004 | 99.6% | 99.6% | 99.6% | 98.7% |
| Plumbing(PS) | SFD - Townhouse | 2905 | 87.8% | 84.8% | 84.8% | 70.8% |
| Mechanical(MS) | SFD - Townhouse | 2573 | 81.4% | 78.1% | 78.1% | 60.4% |
| Plumbing(PS) | Retail Store | 2259 | 91.6% | 90.7% | 90.7% | 69.9% |
| Small Residential Projects | SFD - Townhouse | 2223 | 98.3% | 98.2% | 98.2% | 96.4% |
| Building Additions/Alteratio | Multiple Use/Non Resid | 2123 | 93.5% | 92.1% | 92.1% | 72.3% |
| Mechanical(MS) | Retail Store | 2117 | 92.1% | 91.3% | 91.3% | 63.6% |
| Mechanical(MS) | Apartment Building | 2108 | 93.0% | 91.9% | 91.9% | 75.7% |
| Plumbing(PS) | 2 Unit - Detached | 2093 | 99.6% | 99.6% | 99.6% | 98.7% |
| Demolition Folder (DM) | SFD - Detached | 1962 | 98.9% | 98.9% | 98.9% | 98.0% |

**Interpretation:** the gap between `primary-building%` and `full-path%` shows how often a primary building exists but lacks footprint OR stories. The gap between `parcel%` and `primary-building%` shows the link-massing spatial-join failure rate.

## Lens G — Massing sanity check vs declared dwelling units (residential only)

For residential permits with `dwelling_units_created > 0`: a typical residential unit is 50-150 m². So **expected GFA ≈ dwelling_units × 90 m² midpoint**. We flag cases where modeled GFA differs from this expectation by > 5x in either direction.

| permit_type | structure_type | n | median units | median GFA | median m²/unit | < 18 m²/unit | > 450 m²/unit |
|---|---|---|---|---|---|---|---|
| New Houses | SFD - Detached | 5667 | 1 | 439 m² | 438 m²/unit | 8 (0%) | 2763 (49%) |
| New Houses | SFD - Townhouse | 1999 | 1 | 664 m² | 542 m²/unit | 297 (15%) | 1110 (56%) |
| Small Residential Projects | 2 Unit - Detached | 1951 | 1 | 373 m² | 366 m²/unit | 0 (0%) | 701 (36%) |
| Small Residential Projects | Laneway / Rear Yard Su | 1468 | 1 | 406 m² | 402 m²/unit | 2 (0%) | 607 (41%) |
| New Houses | Stacked Townhouses | 568 | 1 | 206 m² | 206 m²/unit | 49 (9%) | 116 (20%) |
| Small Residential Projects | 2 Unit - Semi-detached | 557 | 1 | 674 m² | 664 m²/unit | 2 (0%) | 461 (83%) |
| Small Residential Projects | 3+ Unit - Detached | 521 | 2 | 409 m² | 197 m²/unit | 3 (1%) | 78 (15%) |
| Residential Building Permit | SFD - Townhouse | 458 | 1 | 2078 m² | 2017 m²/unit | 12 (3%) | 402 (88%) |
| New Building | Apartment Building | 441 | 143 | 837 m² | 10 m²/unit | 264 (60%) | 10 (2%) |
| New Houses | 3+ Unit - Detached | 403 | 4 | 319 m² | 92 m²/unit | 1 (0%) | 13 (3%) |
| New Building | Mixed Use/Res w Non Re | 391 | 210 | 936 m² | 7 m²/unit | 259 (66%) | 16 (4%) |
| Small Residential Projects | SFD - Detached | 324 | 1 | 368 m² | 363 m²/unit | 0 (0%) | 111 (34%) |
| Residential Building Permit | SFD - Detached | 297 | 1 | 567 m² | 566 m²/unit | 0 (0%) | 197 (66%) |
| New Houses | SFD - Semi-Detached | 257 | 1 | 492 m² | 492 m²/unit | 18 (7%) | 137 (53%) |
| Building Additions/Alteratio | Multiple Unit Building | 255 | 2 | 1005 m² | 465 m²/unit | 11 (4%) | 132 (52%) |
| Building Additions/Alteratio | Apartment Building | 154 | 2 | 1470 m² | 586 m²/unit | 12 (8%) | 89 (58%) |
| Small Residential Projects | SFD - Semi-Detached | 95 | 1 | 695 m² | 666 m²/unit | 0 (0%) | 80 (84%) |

**Interpretation:** typical residential is **50-150 m²/unit**. A "suspicious_low" rate of >20% means the massing footprint is much too small for the declared unit count — likely the linked building is a different (smaller) one on the lot. A "suspicious_high" rate >20% means modeled_gfa is too large for the unit count — likely fallback path treating the whole lot as buildable, or the primary building is much bigger than the new work.

## Lens H — Building-link confidence (link-massing quality)

`parcel_buildings.confidence` is set by link-massing.js based on spatial-match quality. Low confidence = weak spatial evidence that the building belongs to the parcel. We look at confidence distribution for the primary-flagged building on each permit's parcel.

| confidence | n primary links | median footprint |
|---|---|---|
| 0.60-0.79_low | 99589 | 202 m² |
| 0.95+_high | 381605 | 148 m² |

**Cost impact: how is modeled_gfa distributed by confidence?**
| confidence | n permits | median GFA | median estimated_cost |
|---|---|---|---|
| 0.60-0.79_low | 16363 | 810 m² | $400.0K |
| 0.95+_high | 82480 | 562 m² | $326.2K |
| null_confidence | 338 | 4332 m² | $150.0K |

## Lens I — Multi-building parcel handling

When a parcel has > 1 building, link-massing.js picks one as `is_primary=true`. For permits on multi-building parcels (apartment complexes, mixed-use sites, etc.), the picked "primary" may not match the building under construction. Quantify how often this happens and whether it impacts modeled GFA.

| parcel building count | n permits | median modeled GFA |
|---|---|---|
| 1_building | 80447 | 551 m² |
| 2-3_buildings | 8455 | 2474 m² |
| 4-10_buildings | 6727 | 1510 m² |
| >10_buildings | 3214 | 634 m² |
| no_buildings | 338 | 4332 m² |

**Interpretation:** if median GFA is similar across multi-building buckets, link-massing is consistently picking a reasonable representative building. If multi-building parcels show systematically smaller or larger GFA, the spatial-join may be picking the wrong building (e.g., a tower vs an adjacent townhouse row).

## Lens J — Why New Building permits get tiny GFAs (the smoking gun)

Lens D showed the under-prediction class: New Building permits with 100s of dwelling units modeled at <500 m² GFA. The hypothesis: the linked "primary" building on the parcel is a small existing structure (shed/garage/teardown), NOT the new megaproject (which by definition doesn't exist yet in the city massing data).

| linked footprint bucket | n permits | median declared units | median declared cost | median modeled cost |
|---|---|---|---|---|
| 0_no_footprint | 331 | 49 | $16.00M | $68.08M |
| 1_<100sqm_tiny | 258 | 37 | $14.45M | $14.00M |
| 2_100-500sqm_small | 410 | 28 | $8.03M | $7.87M |
| 3_500-2000sqm_mid | 431 | 87 | $18.00M | $25.00M |
| 4_2K-10K_large | 99 | 128 | $20.00M | $60.00M |
| 5_>10K_megaproject | 1 | 341 | $195.00M | $195.00M |

**Interpretation:** for New Building megaprojects, if a high percentage of links land in the `<100sqm_tiny` or `100-500sqm_small` buckets, it confirms link-massing is matching wrong/old buildings. The correct massing should be `>10K_megaproject` for an apartment building with 200+ units. **Specifically:** apartment buildings declared > $30M almost always need GFA > 5,000 m² to be plausible; if they're getting < 500 m², the link is wrong.

## Lens K — Stories data quality (declared vs modeled)

GFA formula in primary path: `footprint_area_sqm × estimated_stories`. A wrong story count multiplicatively breaks GFA. We have TWO story sources: `permits.storeys` (declared at permit application) and `building_footprints.estimated_stories` (from city massing). Previously `permits.storeys` was reported as returning zero everywhere — check whether that's still the case and how it affects GFA.

### permits.storeys distribution (declared)
| bucket | n |
|---|---|
| 1_zero | 248571 |

### building_footprints.estimated_stories distribution (city massing)
| bucket | n | avg footprint |
|---|---|---|
| 0_null | 17797 | 437 m² |
| 2_low_rise | 255084 | 193 m² |
| 3_mid_rise | 149812 | 362 m² |
| 4_high_rise | 4384 | 1077 m² |

### Permits with non-zero declared storeys (verify "previously zero" status)
| total | NULL | zero | > 0 | positive% |
|---|---|---|---|---|
| 248571 | 0 | 248571 | 0 | 0.0% |

### Story disagreement (declared vs massing) for permits with BOTH populated
| permit_type | structure_type | n | avg declared | avg massing | n with |Δ|>3 |
|---|---|---|---|---|---|

**Interpretation:** if `permits.storeys` is mostly zero or null, the Brain falls back to massing-side `estimated_stories`, which (per the Brain code at cost-model-shared.js:193) defaults to 1 when both are missing. For megaprojects this means **GFA = footprint × 1**, drastically under-estimating multi-story buildings. This is the load-bearing question: is `permits.storeys` reliable enough to be the source of truth, or do we need to derive stories from `dwelling_units_created` / `footprint_area_sqm` as a fallback?

## Lens L — Residential building-to-lot coverage (NON-commercial focus)

**Operator question:** for our highest-volume residential combos (SFD/semi-detached/townhouse additions, new builds, and laneway/garden suites), how accurate is the massing data — specifically `footprint_area_sqm / lot_size_sqm` (lot coverage ratio)?

**Toronto residential zoning baseline:** typical built coverage is **30-50%** of lot size for SFD/semi-detached/townhouse. Garden suites + laneway suites push toward 35-45% when added to existing primary structures.

**Interpretation rules:**
- `coverage < 10%`: building is suspiciously small for the lot → likely wrong building linked (shed/garage) or lot data is wrong (large vacant parcel
- `coverage 10-25%`: under-built lot (small house on big lot — possible but rare for additions/new builds)
- `coverage 25-55%`: **EXPECTED RANGE** — accurate Toronto residential coverage
- `coverage 55-75%`: dense lot (could be townhouse or laneway suite included)
- `coverage > 75%`: implausible — either lot_size_sqm is wrong (under-counted) OR building includes adjacent parcel

### Coverage distribution by combo
| permit_type | structure_type | n | p25 | p50 | p75 | p95 | median footprint | median lot | <10% | in 25-55% band | >75% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | 33147 | 23.9% | 30.2% | 37.4% | 68.5% | 126 m² | 446 m² | 509 (2%) | 21094 (64%) | 1379 (4%) |
| Small Residential Projects | SFD - Semi-Detached | 9441 | 62.9% | 78.6% | 95.2% | 159.5% | 159 m² | 203 m² | 48 (1%) | 1399 (15%) | 5335 (57%) |
| New Houses | SFD - Detached | 7451 | 19.4% | 26.1% | 33.9% | 46.8% | 144 m² | 575 m² | 290 (4%) | 3868 (52%) | 105 (1%) |
| Small Residential Projects | 2 Unit - Detached | 2975 | 25.1% | 31.5% | 39.1% | 72.8% | 129 m² | 460 m² | 28 (1%) | 2004 (67%) | 143 (5%) |
| Small Residential Projects | SFD - Townhouse | 2151 | 74.3% | 153.1% | 293.4% | 650.9% | 315 m² | 169 m² | 259 (12%) | 116 (5%) | 1607 (75%) |
| Small Residential Projects | Laneway / Rear Yard Su | 1643 | 22.3% | 30.7% | 45.6% | 98.6% | 123 m² | 355 m² | 27 (2%) | 768 (47%) | 201 (12%) |
| Residential Building Permit | SFD - Detached | 1495 | 27.0% | 34.1% | 39.8% | 63.8% | 166 m² | 499 m² | 24 (2%) | 1102 (74%) | 59 (4%) |
| New Houses | SFD - Townhouse | 1217 | 28.5% | 86.9% | 303.5% | 2608.3% | 584 m² | 497 m² | 94 (8%) | 278 (23%) | 639 (53%) |
| Small Residential Projects | 2 Unit - Semi-detached | 1104 | 66.6% | 80.8% | 98.9% | 147.8% | 175 m² | 213 m² | 3 (0%) | 148 (13%) | 679 (62%) |
| Small Residential Projects | Converted House | 1004 | 36.1% | 61.1% | 91.0% | 214.0% | 164 m² | 256 m² | 10 (1%) | 396 (39%) | 407 (41%) |
| Small Residential Projects | 3+ Unit - Detached | 857 | 26.3% | 33.7% | 42.8% | 87.7% | 140 m² | 405 m² | 14 (2%) | 573 (67%) | 57 (7%) |
| Residential Building Permit | SFD - Townhouse | 625 | 22.3% | 250.1% | 460.6% | 867.5% | 447 m² | 163 m² | 91 (15%) | 56 (9%) | 399 (64%) |
| New Houses | 3+ Unit - Detached | 492 | 18.8% | 25.2% | 34.2% | 60.0% | 108 m² | 465 m² | 7 (1%) | 218 (44%) | 15 (3%) |
| New Houses | 2 Unit - Detached | 425 | 20.3% | 25.6% | 32.1% | 48.9% | 107 m² | 490 m² | 14 (3%) | 213 (50%) | 11 (3%) |
| Residential Building Permit | SFD - Semi-Detached | 393 | 68.2% | 84.4% | 100.7% | 214.8% | 157 m² | 190 m² | 9 (2%) | 43 (11%) | 263 (67%) |
| New Houses | SFD - Semi-Detached | 228 | 29.1% | 64.6% | 88.8% | 249.9% | 167 m² | 299 m² | 11 (5%) | 76 (33%) | 88 (39%) |
| New Houses | Stacked Townhouses | 128 | 31.9% | 31.9% | 31.9% | 99.3% | 3154 m² | 9881 m² | 11 (9%) | 99 (77%) | 13 (10%) |
| Small Residential Projects | Stacked Townhouses | 30 | 6.7% | 15.5% | 64.5% | 841.1% | 724 m² | 4962 m² | 9 (30%) | 3 (10%) | 7 (23%) |

### Verdict per combo
- **Small Residential Projects / SFD - Detached** (n=33147): ✅ **ACCURATE** — median in 25-55% band, ≥60% of permits in band
- **Small Residential Projects / SFD - Semi-Detached** (n=9441): ⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for 57% of permits
- **New Houses / SFD - Detached** (n=7451): 🟡 **MEDIAN OK, TAIL NOISY** — median in band but only 52% of permits land in band
- **Small Residential Projects / 2 Unit - Detached** (n=2975): ✅ **ACCURATE** — median in 25-55% band, ≥60% of permits in band
- **Small Residential Projects / SFD - Townhouse** (n=2151): ⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for 75% of permits
- **Small Residential Projects / Laneway / Rear Yard Suite** (n=1643): 🟡 **MEDIAN OK, TAIL NOISY** — median in band but only 47% of permits land in band
- **Residential Building Permit / SFD - Detached** (n=1495): ✅ **ACCURATE** — median in 25-55% band, ≥60% of permits in band
- **New Houses / SFD - Townhouse** (n=1217): ⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for 53% of permits
- **Small Residential Projects / 2 Unit - Semi-detached** (n=1104): ⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for 62% of permits
- **Small Residential Projects / Converted House** (n=1004): ⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for 41% of permits
- **Small Residential Projects / 3+ Unit - Detached** (n=857): ✅ **ACCURATE** — median in 25-55% band, ≥60% of permits in band
- **Residential Building Permit / SFD - Townhouse** (n=625): ⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for 64% of permits
- **New Houses / 3+ Unit - Detached** (n=492): 🟡 **MEDIAN OK, TAIL NOISY** — median in band but only 44% of permits land in band
- **New Houses / 2 Unit - Detached** (n=425): 🟡 **MEDIAN OK, TAIL NOISY** — median in band but only 50% of permits land in band
- **Residential Building Permit / SFD - Semi-Detached** (n=393): ⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for 67% of permits
- **New Houses / SFD - Semi-Detached** (n=228): ⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for 39% of permits
- **New Houses / Stacked Townhouses** (n=128): ✅ **ACCURATE** — median in 25-55% band, ≥60% of permits in band
- **Small Residential Projects / Stacked Townhouses** (n=30): 🟡 **MIXED** — median 15.5%, in-band rate 10%

### Sample of suspiciously low-coverage permits (likely wrong building linked)
| permit | combo | units | footprint | lot | coverage% | est cost | declared cost |
|---|---|---|---|---|---|---|---|
| 07 129713 BLD:00 | New Houses/Stacked Townhouses | 187 | 333 m² | 7567 m² | 4.4% | $23.00M | $23.00M |
| 17 257788 BLD:00 | New Houses/SFD - Detached | 1 | 33 m² | 3522 m² | 0.9% | $9.00M | $9.00M |
| 06 196930 BLD:00 | New Houses/Stacked Townhouses | 72 | 333 m² | 7567 m² | 4.4% | $7.00M | $7.00M |
| 06 196946 BLD:00 | New Houses/Stacked Townhouses | 60 | 333 m² | 7567 m² | 4.4% | $6.00M | $6.00M |
| 16 237673 BLD:00 | New Houses/SFD - Detached | 1 | 393 m² | 24.3K m² | 1.6% | $5.35M | $5.35M |
| 00 352810 CMB:00 | Residential /SFD - Townhouse | 77 | 14 m² | 15.4K m² | 0.1% | $3.32M | $3.32M |
| 09 179029 BLD:00 | New Houses/SFD - Detached | 0 | 422 m² | 8463 m² | 5.0% | $11.11M | $2.68M |
| 25 141394 BLD:00 | Small Reside/SFD - Detached | 1 | 330 m² | 7253 m² | 4.5% | $2.46M | $2.46M |
| 19 189219 BLD:00 | New Houses/SFD - Detached | 1 | 118 m² | 3297 m² | 3.6% | $2.00M | $2.00M |
| 14 236884 BLD:00 | New Houses/SFD - Detached | 1 | 327 m² | 10.4K m² | 3.1% | $2.00M | $2.00M |
| 03 179657 BLD:00 | Residential /SFD - Townhouse | 10 | 57 m² | 6977 m² | 0.8% | $1.80M | $1.80M |
| 03 179616 BLD:00 | Residential /SFD - Townhouse | 10 | 57 m² | 6977 m² | 0.8% | $1.80M | $1.80M |
| 03 179504 BLD:00 | Residential /SFD - Townhouse | 10 | 57 m² | 6977 m² | 0.8% | $1.80M | $1.80M |
| 03 179640 BLD:00 | Residential /SFD - Townhouse | 9 | 57 m² | 6977 m² | 0.8% | $1.62M | $1.62M |
| 19 148726 BLD:00 | New Houses/SFD - Detached | 1 | 34 m² | 2996 m² | 1.1% | $1.55M | $1.55M |

### Sample of suspiciously high-coverage permits (likely lot data under-counted)
| permit | combo | units | footprint | lot | coverage% | est cost | declared cost |
|---|---|---|---|---|---|---|---|
| 24 235081 BLD:00 | New Houses/3+ Unit - Detached | 3 | 557 m² | 201 m² | 276.8% | $8.00M | $8.00M |
| 24 235164 BLD:00 | Small Reside/Laneway / Rear Yar | 1 | 557 m² | 201 m² | 276.8% | $8.00M | $8.00M |
| 08 149862 BLD:00 | New Houses/SFD - Townhouse | 10 | 580 m² | 325 m² | 178.4% | $3.70M | $3.70M |
| 09 140169 BLD:00 | New Houses/Stacked Townhouses | 17 | 261 m² | 246 m² | 106.0% | $3.50M | $3.50M |
| 09 142179 BLD:00 | New Houses/Stacked Townhouses | 17 | 261 m² | 246 m² | 106.0% | $3.40M | $3.40M |
| 09 142189 BLD:00 | New Houses/Stacked Townhouses | 17 | 261 m² | 246 m² | 106.0% | $3.40M | $3.40M |
| 09 142197 BLD:00 | New Houses/Stacked Townhouses | 17 | 261 m² | 246 m² | 106.0% | $3.40M | $3.40M |
| 19 175222 BLD:00 | Small Reside/SFD - Townhouse | 0 | 250 m² | 213 m² | 117.5% | $3.00M | $3.00M |
| 08 150176 BLD:00 | New Houses/SFD - Townhouse | 17 | 580 m² | 325 m² | 178.4% | $2.80M | $2.80M |
| 09 140165 BLD:00 | New Houses/Stacked Townhouses | 12 | 261 m² | 246 m² | 106.0% | $2.80M | $2.80M |
| 13 224241 B01:01 | New Houses/SFD - Townhouse | 0 | 1123 m² | 517 m² | 217.1% | $2.50M | $2.50M |
| 04 201239 BLD:00 | New Houses/SFD - Townhouse | 11 | 667 m² | 35 m² | 1910.7% | $2.50M | $2.50M |
| 08 150186 BLD:00 | New Houses/SFD - Townhouse | 12 | 580 m² | 325 m² | 178.4% | $2.40M | $2.40M |
| 08 150184 BLD:00 | New Houses/SFD - Townhouse | 12 | 580 m² | 325 m² | 178.4% | $2.30M | $2.30M |
| 25 149206 BLD:00 | New Houses/SFD - Detached | 1 | 5639 m² | 229 m² | 2463.4% | $24.75M | $2.00M |
