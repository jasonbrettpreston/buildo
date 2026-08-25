# WF1 Cost Accuracy Investigation

**Date:** 2026-05-24
**Plan:** `.cursor/active_task.md` (WF1 v3 + IMPL folds)
**Method:** internal cross-validation — model vs declared cost (no external ground-truth data).
**Scope:** permits-side `cost_estimates` rows post WF1 §3.A re-key.

## Lens #1 — Per-combo cost distributions (p25/p50/p75/p95)

Filters: estimated_cost IS NOT NULL, permits only, n >= 20 per combo group.

| permit_type | structure_type | source | n | p25 | p50 | p75 | p95 | max |
|---|---|---|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | model | 20341 | $123.5K | $207.6K | $356.4K | $823.2K | $45.63M |
| Small Residential Projects | SFD - Detached | permit | 12939 | $55.0K | $120.0K | $250.0K | $650.0K | $5.00M |
| Small Residential Projects | SFD - Semi-Detached | model | 7254 | $181.7K | $276.3K | $417.7K | $834.8K | $8.74M |
| Building Additions/Alterations | Office | model | 4508 | $544.7K | $2.48M | $6.76M | $29.35M | $279.45M |
| Building Additions/Alterations | Apartment Building | model | 4186 | $663.2K | $2.63M | $8.16M | $16.75M | $106.56M |
| New Houses | SFD - Detached | model | 4136 | $1.34M | $2.20M | $3.66M | $7.51M | $59.83M |
| New Houses | SFD - Detached | permit | 3885 | $500.0K | $750.0K | $1.00M | $2.00M | $20.00M |
| Building Additions/Alterations | Retail Store | model | 2408 | $464.7K | $1.54M | $4.41M | $25.48M | $381.62M |
| Building Additions/Alterations | Office | permit | 2263 | $100.0K | $295.2K | $893.3K | $5.50M | $275.72M |
| Small Residential Projects | SFD - Semi-Detached | permit | 2215 | $50.0K | $100.0K | $200.0K | $500.0K | $2.50M |
| Building Additions/Alterations | Multiple Unit Building | model | 2099 | $200.7K | $504.9K | $1.50M | $8.32M | $286.21M |
| Small Residential Projects | SFD - Townhouse | model | 1855 | $307.8K | $549.6K | $967.4K | $2.36M | $19.00M |
| Building Additions/Alterations | Apartment Building | permit | 1692 | $150.0K | $372.5K | $940.5K | $4.00M | $50.00M |
| Small Residential Projects | 2 Unit - Detached | permit | 1622 | $50.0K | $84.8K | $250.0K | $700.0K | $4.25M |
| New Houses | SFD - Townhouse | model | 1483 | $1.93M | $4.97M | $9.18M | $86.89M | $86.89M |
| Residential Building Permit | SFD - Detached | model | 1375 | $738.0K | $1.31M | $2.02M | $3.99M | $28.97M |
| Small Residential Projects | 2 Unit - Detached | model | 1371 | $96.8K | $147.7K | $230.1K | $444.8K | $3.74M |
| Building Additions/Alterations | Multiple Use/Non Resident | model | 1304 | $471.6K | $1.60M | $4.50M | $26.93M | $502.55M |
| Building Additions/Alterations | Multiple Unit Building | permit | 1242 | $70.0K | $195.7K | $500.0K | $3.00M | $200.00M |
| Small Residential Projects | Unknown | model | 1099 | $165.6K | $255.1K | $423.8K | $814.1K | $7.78M |
| Small Residential Projects | Laneway / Rear Yard Suite | model | 1085 | $795.8K | $1.21M | $2.00M | $4.18M | $29.64M |
| Building Additions/Alterations | Industrial | model | 1076 | $1.10M | $2.94M | $7.31M | $26.61M | $108.23M |
| Building Additions/Alterations | Restaurant 30 Seats or Le | model | 1061 | $437.3K | $928.6K | $2.53M | $12.07M | $111.76M |
| Building Additions/Alterations | Retail Store | permit | 1022 | $80.0K | $200.0K | $500.0K | $2.98M | $110.00M |
| Building Additions/Alterations | Other | model | 993 | $287.1K | $769.0K | $2.48M | $15.93M | $592.22M |
| New Houses | SFD - Townhouse | permit | 820 | $249.5K | $310.3K | $382.3K | $2.30M | $14.00M |
| Small Residential Projects | Converted House | model | 799 | $201.7K | $325.5K | $530.0K | $1.24M | $11.66M |
| Building Additions/Alterations | Restaurant Greater Than 3 | model | 770 | $398.8K | $972.6K | $2.66M | $11.29M | $56.95M |
| Small Residential Projects | 2 Unit - Semi-detached | model | 683 | $166.5K | $237.8K | $330.3K | $582.3K | $2.41M |
| Building Additions/Alterations | Multiple Use/Non Resident | permit | 665 | $100.0K | $250.0K | $800.0K | $6.91M | $100.00M |
| Residential Building Permit | SFD - Townhouse | model | 581 | $4.21M | $6.35M | $9.49M | $27.35M | $621.40M |
| Small Residential Projects | Laneway / Rear Yard Suite | permit | 570 | $300.0K | $400.0K | $500.0K | $1.00M | $10.00M |
| Building Additions/Alterations | Medical/Dental Office | model | 530 | $566.1K | $1.67M | $3.77M | $11.51M | $44.13M |
| Building Additions/Alterations | Hospital | model | 495 | $1.36M | $15.99M | $87.10M | $151.57M | $189.90M |
| Small Residential Projects | 3+ Unit - Detached | permit | 488 | $70.0K | $150.0K | $400.0K | $900.0K | $3.00M |
| Building Additions/Alterations | Other | permit | 472 | $110.0K | $300.0K | $1.00M | $5.08M | $100.00M |
| New Houses | Stacked Townhouses | model | 458 | $551.0K | $1.10M | $2.37M | $271.96M | $271.96M |
| Building Additions/Alterations | Restaurant 30 Seats or Le | permit | 452 | $60.0K | $100.0K | $200.0K | $500.0K | $1.70M |
| Small Residential Projects | 2 Unit - Semi-detached | permit | 427 | $70.0K | $100.0K | $250.0K | $735.0K | $1.50M |
| New Building | Apartment Building | permit | 415 | $10.00M | $31.52M | $65.50M | $160.00M | $500.00M |
| Building Additions/Alterations | Place of Worship | model | 389 | $325.5K | $812.7K | $1.74M | $5.20M | $12.12M |
| Small Residential Projects | 3+ Unit - Detached | model | 381 | $102.4K | $164.0K | $270.0K | $491.8K | $974.6K |
| Building Additions/Alterations | Restaurant Greater Than 3 | permit | 374 | $150.0K | $300.0K | $500.0K | $2.54M | $27.00M |
| Building Additions/Alterations | Industrial | permit | 368 | $100.0K | $350.0K | $1.18M | $8.76M | $81.00M |
| New Building | Mixed Use/Res w Non Res | permit | 356 | $25.00M | $64.75M | $125.00M | $300.00M | $1.00B |
| Building Additions/Alterations | Hospital | permit | 350 | $252.5K | $855.0K | $3.30M | $23.65M | $480.00M |
| Building Additions/Alterations | Elementary School | model | 338 | $1.77M | $3.54M | $6.67M | $12.98M | $35.75M |
| Small Residential Projects | SFD - Townhouse | permit | 328 | $60.0K | $125.0K | $265.0K | $700.0K | $3.00M |
| New Houses | 3+ Unit - Detached | permit | 326 | $800.0K | $1.00M | $1.30M | $2.05M | $12.00M |
| Building Additions/Alterations | Medical/Dental Office | permit | 272 | $100.0K | $180.0K | $319.8K | $1.25M | $10.00M |
| Building Additions/Alterations | University | permit | 258 | $250.0K | $571.5K | $1.50M | $15.72M | $120.00M |
| New Building | Mixed Use/Res w Non Res | model | 243 | $533.0K | $2.13M | $4.98M | $84.73M | $527.43M |
| Building Additions/Alterations | University | model | 223 | $539.7K | $1.21M | $1.99M | $6.11M | $32.00M |
| New Houses | SFD - Semi-Detached | model | 220 | $1.41M | $2.25M | $4.38M | $11.66M | $38.44M |
| New Houses | Stacked Townhouses | permit | 213 | $155.2K | $189.3K | $245.0K | $3.47M | $23.00M |
| Building Additions/Alterations | Elementary School | permit | 212 | $223.8K | $1.00M | $2.08M | $10.54M | $45.00M |
| Small Residential Projects | Converted House | permit | 210 | $60.0K | $107.5K | $200.0K | $577.5K | $1.20M |
| Building Additions/Alterations | Place of Worship | permit | 201 | $150.0K | $350.0K | $900.0K | $4.72M | $30.00M |
| New Houses | 3+ Unit - Detached | model | 185 | $754.2K | $1.14M | $2.16M | $4.53M | $17.16M |
| New Building | Apartment Building | model | 184 | $1.50M | $2.54M | $5.64M | $122.08M | $299.39M |

## Lens #2 — Top 30 outlier permits (estimates extreme vs their combo median)

Outlier = `estimated_cost / combo_median > 10` OR `< 0.1`. Combo defined by (permit_type, structure_type). Combos with n < 10 excluded.

| permit_num | permit_type | structure_type | source | estimated | declared | combo_median | dev_ratio |
|---|---|---|---|---|---|---|---|
| 13 196560 BLD:01 | New Building | Mixed Use/Res w Non Re | model | $4.1K | $0 | $22.00M | 0.00x |
| 07 278875 BLD:00 | Building Additions/Alteratio | Industrial | model | $658 | $0 | $1.98M | 0.00x |
| 17 202273 BLD:01 | New Building | Mixed Use/Res w Non Re | model | $7.5K | $0 | $22.00M | 0.00x |
| 17 202273 BLD:03 | New Building | Mixed Use/Res w Non Re | model | $8.2K | $0 | $22.00M | 0.00x |
| 22 128037 BLD:01 | New Building | Mixed Use/Res w Non Re | model | $12.5K | $0 | $22.00M | 0.00x |
| 19 245615 BLD:01 | New Building | Mixed Use/Res w Non Re | model | $12.7K | $0 | $22.00M | 0.00x |
| 12 246001 BLD:06 | New Building | Mixed Use/Res w Non Re | model | $15.2K | $0 | $22.00M | 0.00x |
| 12 246001 BLD:04 | New Building | Mixed Use/Res w Non Re | model | $15.2K | $0 | $22.00M | 0.00x |
| 12 246001 BLD:05 | New Building | Mixed Use/Res w Non Re | model | $16.8K | $0 | $22.00M | 0.00x |
| 12 246001 BLD:07 | New Building | Mixed Use/Res w Non Re | model | $17.6K | $0 | $22.00M | 0.00x |
| 12 246001 BLD:02 | New Building | Mixed Use/Res w Non Re | model | $17.6K | $0 | $22.00M | 0.00x |
| 12 246001 BLD:03 | New Building | Mixed Use/Res w Non Re | model | $17.6K | $0 | $22.00M | 0.00x |
| 17 237216 BLD:01 | New Building | Mixed Use/Res w Non Re | model | $18.4K | $0 | $22.00M | 0.00x |
| 22 128164 BLD:01 | Building Additions/Alteratio | Office | model | $929 | $0 | $1.01M | 0.00x |
| 18 270155 BLD:02 | New Building | Mixed Use/Res w Non Re | model | $20.3K | $0 | $22.00M | 0.00x |
| 09 177085 BLD:00 | Building Additions/Alteratio | Other | model | $592.22M | $1.0K | $573.4K | 1032.89x |
| 17 277028 BLD:00 | Building Additions/Alteratio | Multiple Unit Building | model | $286.21M | $100.0K | $350.0K | 817.75x |
| 24 234090 BLD:01 | New Building | Apartment Building | model | $23.0K | $0 | $18.70M | 0.00x |
| 13 216775 BLD:00 | Building Additions/Alteratio | Industrial | permit | $2.5K | $2.5K | $1.98M | 0.00x |
| 17 190825 BLD:00 | Building Additions/Alteratio | Multiple Unit Building | model | $268.80M | $150.0K | $350.0K | 767.99x |
| 22 124445 BLD:01 | Building Additions/Alteratio | Medical/Dental Office | model | $929 | $0 | $700.3K | 0.00x |
| 13 262499 BLD:00 | Building Additions/Alteratio | Industrial | model | $2.7K | $0 | $1.98M | 0.00x |
| 24 156161 BLD:01 | Building Additions/Alteratio | Industrial | model | $2.7K | $0 | $1.98M | 0.00x |
| 23 211103 BLD:00 | Building Additions/Alteratio | Other | model | $411.66M | $277.9K | $573.4K | 717.98x |
| 24 123223 BLD:00 | Building Additions/Alteratio | Other | model | $411.66M | $2.50M | $573.4K | 717.98x |
| 23 211139 BLD:00 | Building Additions/Alteratio | Other | model | $411.66M | $417.3K | $573.4K | 717.98x |
| 11 101340 BLD:03 | New Building | Apartment Building | model | $28.5K | $0 | $18.70M | 0.00x |
| 11 101340 BLD:02 | New Building | Apartment Building | model | $28.5K | $0 | $18.70M | 0.00x |
| 11 101340 BLD:01 | New Building | Apartment Building | model | $28.5K | $0 | $18.70M | 0.00x |
| 04 162060 BLD:02 | Building Additions/Alteratio | Other | model | $372.22M | $0 | $573.4K | 649.19x |

## Lens #3 — Model vs declared cost divergence (MAPE-style by combo)

For each combo with BOTH `cost_source=model` AND `cost_source=permit` populations, compare their medians. Flag combos where the ratio is < 0.5 (model under-estimates) or > 2 (model over-estimates).

| permit_type | structure_type | model_n | permit_n | model_p50 | permit_p50 | ratio | verdict |
|---|---|---|---|---|---|---|---|
| Residential Building Permit | SFD - Townhouse | 581 | 45 | $6.35M | $200.0K | 31.73 | OVER (model > 2x declared) |
| New Building | Mixed Use/Res w Non Re | 243 | 356 | $2.13M | $64.75M | 0.03 | UNDER (model < 50% of declared) |
| Building Additions/Alterations | Hospital | 495 | 350 | $15.99M | $855.0K | 18.70 | OVER (model > 2x declared) |
| New Houses | SFD - Townhouse | 1483 | 820 | $4.97M | $310.3K | 16.03 | OVER (model > 2x declared) |
| New Building | Apartment Building | 184 | 415 | $2.54M | $31.52M | 0.08 | UNDER (model < 50% of declared) |
| Building Additions/Alterations | Restaurant 30 Seats or | 1061 | 452 | $928.6K | $100.0K | 9.29 | OVER (model > 2x declared) |
| Building Additions/Alterations | Medical/Dental Office | 530 | 272 | $1.67M | $180.0K | 9.26 | OVER (model > 2x declared) |
| Building Additions/Alterations | Office | 4508 | 2263 | $2.48M | $295.2K | 8.41 | OVER (model > 2x declared) |
| Building Additions/Alterations | Industrial | 1076 | 368 | $2.94M | $350.0K | 8.40 | OVER (model > 2x declared) |
| Building Additions/Alterations | Retail Store | 2408 | 1022 | $1.54M | $200.0K | 7.68 | OVER (model > 2x declared) |
| Building Additions/Alterations | Apartment Building | 4186 | 1692 | $2.63M | $372.5K | 7.05 | OVER (model > 2x declared) |
| Residential Building Permit | SFD - Detached | 1375 | 121 | $1.31M | $204.0K | 6.43 | OVER (model > 2x declared) |
| Building Additions/Alterations | Multiple Use/Non Resid | 1304 | 665 | $1.60M | $250.0K | 6.41 | OVER (model > 2x declared) |
| New Houses | Stacked Townhouses | 458 | 213 | $1.10M | $189.3K | 5.82 | OVER (model > 2x declared) |
| New Houses | SFD - Semi-Detached | 220 | 137 | $2.25M | $400.0K | 5.62 | OVER (model > 2x declared) |
| Small Residential Projects | SFD - Townhouse | 1855 | 328 | $549.6K | $125.0K | 4.40 | OVER (model > 2x declared) |
| Small Residential Projects | Unknown | 1099 | 70 | $255.1K | $70.5K | 3.62 | OVER (model > 2x declared) |
| Building Additions/Alterations | Elementary School | 338 | 212 | $3.54M | $1.00M | 3.54 | OVER (model > 2x declared) |
| Building Additions/Alterations | Restaurant Greater Tha | 770 | 374 | $972.6K | $300.0K | 3.24 | OVER (model > 2x declared) |
| Small Residential Projects | Converted House | 799 | 210 | $325.5K | $107.5K | 3.03 | OVER (model > 2x declared) |
| Small Residential Projects | Laneway / Rear Yard Su | 1085 | 570 | $1.21M | $400.0K | 3.01 | OVER (model > 2x declared) |
| New Houses | SFD - Detached | 4136 | 3885 | $2.20M | $750.0K | 2.93 | OVER (model > 2x declared) |
| Small Residential Projects | SFD - Semi-Detached | 7254 | 2215 | $276.3K | $100.0K | 2.76 | OVER (model > 2x declared) |
| Building Additions/Alterations | Multiple Unit Building | 2099 | 1242 | $504.9K | $195.7K | 2.58 | OVER (model > 2x declared) |
| Building Additions/Alterations | Other | 993 | 472 | $769.0K | $300.0K | 2.56 | OVER (model > 2x declared) |
| Small Residential Projects | 2 Unit - Semi-detached | 683 | 427 | $237.8K | $100.0K | 2.38 | OVER (model > 2x declared) |
| Building Additions/Alterations | Place of Worship | 389 | 201 | $812.7K | $350.0K | 2.32 | OVER (model > 2x declared) |
| Building Additions/Alterations | University | 223 | 258 | $1.21M | $571.5K | 2.12 | OVER (model > 2x declared) |
| Small Residential Projects | 2 Unit - Detached | 1371 | 1622 | $147.7K | $84.8K | 1.74 | mild over |
| Small Residential Projects | SFD - Detached | 20341 | 12939 | $207.6K | $120.0K | 1.73 | mild over |
| New Houses | 3+ Unit - Detached | 185 | 326 | $1.14M | $1.00M | 1.14 | aligned |
| Small Residential Projects | 3+ Unit - Detached | 381 | 488 | $164.0K | $150.0K | 1.09 | aligned |

## Lens #4 — Liar's Gate override rate by combo (model under-prediction signal)

Override rate = `is_geometric_override=true` / total. High rate means the surgical model consistently came in below 25% of the declared cost → the model is under-predicting for this combo (matrix allocation or trade rates too low).

| permit_type | structure_type | total | overrides | override% |
|---|---|---|---|---|
| Small Residential Projects | Unknown | 1169 | 994 | 85.0% |
| Residential Building Permit | SFD - Detached | 1496 | 1147 | 76.7% |
| Residential Building Permit | SFD - Townhouse | 626 | 448 | 71.6% |
| New Houses | Stacked Townhouses | 671 | 450 | 67.1% |
| Building Additions/Alterations | Restaurant 30 Seats or Le | 1513 | 883 | 58.4% |
| Small Residential Projects | Converted House | 1009 | 568 | 56.3% |
| Building Additions/Alterations | Retail Store | 3430 | 1916 | 55.9% |
| Building Additions/Alterations | Medical/Dental Office | 802 | 447 | 55.7% |
| Small Residential Projects | SFD - Townhouse | 2183 | 1183 | 54.2% |
| Building Additions/Alterations | Elementary School | 550 | 294 | 53.5% |
| Building Additions/Alterations | Apartment Building | 5878 | 3136 | 53.4% |
| Building Additions/Alterations | Office | 6771 | 3589 | 53.0% |
| Building Additions/Alterations | Industrial | 1444 | 743 | 51.5% |
| New Houses | SFD - Townhouse | 2303 | 1182 | 51.3% |
| Building Additions/Alterations | Place of Worship | 590 | 293 | 49.7% |
| Small Residential Projects | Laneway / Rear Yard Suite | 1655 | 792 | 47.9% |
| Small Residential Projects | SFD - Semi-Detached | 9469 | 4528 | 47.8% |
| Building Additions/Alterations | Restaurant Greater Than 3 | 1144 | 541 | 47.3% |
| Building Additions/Alterations | Multiple Use/Non Resident | 1969 | 929 | 47.2% |
| Building Additions/Alterations | Hospital | 845 | 374 | 44.3% |
| Small Residential Projects | SFD - Detached | 33280 | 13597 | 40.9% |
| Building Additions/Alterations | Multiple Unit Building | 3341 | 1249 | 37.4% |
| New Houses | SFD - Semi-Detached | 357 | 128 | 35.9% |
| Small Residential Projects | 2 Unit - Semi-detached | 1110 | 363 | 32.7% |
| Building Additions/Alterations | Other | 1465 | 433 | 29.6% |
| Building Additions/Alterations | University | 481 | 137 | 28.5% |
| Small Residential Projects | 2 Unit - Detached | 2993 | 720 | 24.1% |
| New Houses | SFD - Detached | 8021 | 1882 | 23.5% |
| Small Residential Projects | 3+ Unit - Detached | 869 | 172 | 19.8% |
| New Houses | 3+ Unit - Detached | 511 | 43 | 8.4% |

## Lens #5 — Trade-contract-value composition sanity check

For permits with `cost_source=model` (full surgical compute), look at the average percentage allocation per trade across the largest combos. Industry expectation for new residential: framing 15-20%, plumbing 5-10%, electrical 5-10%, drywall 8-12%, roofing 3-7%. Material divergence signals trade_sqft_rates miscalibration.


### Small Residential Projects / SFD - Detached (n=20341 model-source permits)
| trade | n | avg % of total | total value |
|---|---|---|---|
| framing | 18044 | 30.4% | $1.58B |
| structural-steel | 1273 | 23.2% | $94.65M |
| electrical | 17050 | 21.8% | $1.14B |
| hvac | 1530 | 20.6% | $119.53M |
| concrete | 15041 | 19.9% | $827.60M |
| plumbing | 11972 | 18.1% | $815.24M |
| masonry | 3060 | 13.0% | $99.92M |
| roofing | 12212 | 10.0% | $347.84M |
| flooring | 8456 | 8.9% | $229.99M |
| drywall | 16305 | 8.4% | $425.15M |
| excavation | 2977 | 6.4% | $52.51M |
| painting | 9955 | 5.9% | $180.32M |

### Small Residential Projects / SFD - Semi-Detached (n=7254 model-source permits)
| trade | n | avg % of total | total value |
|---|---|---|---|
| framing | 6142 | 29.9% | $655.36M |
| structural-steel | 334 | 23.0% | $29.48M |
| concrete | 4239 | 22.5% | $277.80M |
| electrical | 6026 | 22.1% | $472.03M |
| hvac | 1579 | 21.9% | $153.59M |
| plumbing | 4426 | 18.6% | $346.62M |
| masonry | 776 | 14.1% | $33.04M |
| roofing | 3016 | 10.1% | $102.18M |
| flooring | 2772 | 9.4% | $86.28M |
| drywall | 5956 | 8.6% | $184.28M |
| excavation | 1315 | 8.5% | $28.69M |
| shoring | 758 | 7.0% | $11.84M |

### Building Additions/Alterations / Office (n=4508 model-source permits)
| trade | n | avg % of total | total value |
|---|---|---|---|
| hvac | 4497 | 28.2% | $8.76B |
| electrical | 4507 | 24.3% | $7.54B |
| framing | 904 | 20.4% | $1.78B |
| structural-steel | 60 | 18.1% | $78.08M |
| plumbing | 1625 | 18.0% | $2.34B |
| concrete | 824 | 12.6% | $1.05B |
| elevator | 125 | 11.8% | $166.22M |
| drain-plumbing | 7 | 9.6% | $719.3K |
| flooring | 4368 | 9.5% | $2.92B |
| drywall | 4379 | 9.5% | $2.92B |
| fire-protection | 4493 | 7.8% | $2.42B |
| masonry | 3 | 7.8% | $233.3K |

### Building Additions/Alterations / Apartment Building (n=4186 model-source permits)
| trade | n | avg % of total | total value |
|---|---|---|---|
| structural-steel | 14 | 23.3% | $5.37M |
| framing | 4066 | 19.9% | $4.34B |
| hvac | 3942 | 16.2% | $3.51B |
| electrical | 4143 | 14.9% | $3.17B |
| plumbing | 4013 | 14.1% | $3.07B |
| concrete | 3926 | 12.2% | $2.60B |
| elevator | 3188 | 9.2% | $1.53B |
| flooring | 579 | 7.6% | $126.90M |
| masonry | 54 | 7.2% | $7.66M |
| roofing | 1024 | 6.8% | $430.38M |
| drywall | 4136 | 5.9% | $1.25B |
| drain-plumbing | 15 | 5.8% | $5.94M |

### New Houses / SFD - Detached (n=4136 model-source permits)
| trade | n | avg % of total | total value |
|---|---|---|---|
| framing | 4136 | 16.0% | $1.98B |
| hvac | 4136 | 13.4% | $1.65B |
| plumbing | 4136 | 11.5% | $1.42B |
| electrical | 4136 | 11.5% | $1.42B |
| concrete | 4136 | 9.9% | $1.22B |
| masonry | 4136 | 6.8% | $835.81M |
| roofing | 4136 | 5.1% | $634.92M |
| flooring | 4136 | 4.5% | $561.02M |
| drywall | 4136 | 4.5% | $561.02M |
| glazing | 4136 | 3.4% | $417.90M |
| excavation | 4136 | 3.1% | $379.91M |
| painting | 4136 | 3.1% | $379.91M |

### Building Additions/Alterations / Retail Store (n=2408 model-source permits)
| trade | n | avg % of total | total value |
|---|---|---|---|
| hvac | 2394 | 22.7% | $3.12B |
| framing | 422 | 20.2% | $431.69M |
| electrical | 2404 | 19.5% | $2.68B |
| plumbing | 2402 | 19.5% | $2.68B |
| structural-steel | 45 | 17.4% | $76.50M |
| concrete | 306 | 11.9% | $248.91M |
| elevator | 35 | 10.4% | $28.16M |
| drywall | 2366 | 7.7% | $1.05B |
| flooring | 2353 | 7.7% | $1.05B |
| roofing | 149 | 7.5% | $53.57M |
| drain-plumbing | 4 | 7.4% | $10.14M |
| masonry | 1 | 7.2% | $131.6K |

### Building Additions/Alterations / Multiple Unit Building (n=2099 model-source permits)
| trade | n | avg % of total | total value |
|---|---|---|---|
| drain-plumbing | 5 | 27.0% | $5.39M |
| framing | 1344 | 25.9% | $602.62M |
| hvac | 1201 | 21.5% | $707.46M |
| electrical | 1952 | 21.1% | $918.63M |
| plumbing | 1752 | 20.0% | $765.46M |
| structural-steel | 25 | 19.5% | $19.08M |
| concrete | 862 | 17.2% | $284.38M |
| excavation | 182 | 13.9% | $9.53M |
| roofing | 448 | 11.0% | $68.70M |
| demolition | 135 | 10.4% | $4.46M |
| elevator | 109 | 9.5% | $34.15M |
| masonry | 14 | 9.3% | $1.33M |

### Small Residential Projects / SFD - Townhouse (n=1855 model-source permits)
| trade | n | avg % of total | total value |
|---|---|---|---|
| framing | 1496 | 30.7% | $389.64M |
| concrete | 900 | 23.9% | $146.99M |
| electrical | 1520 | 23.4% | $294.10M |
| structural-steel | 71 | 22.8% | $24.19M |
| hvac | 473 | 21.9% | $94.18M |
| plumbing | 1128 | 19.2% | $207.06M |
| masonry | 177 | 15.0% | $19.63M |
| roofing | 601 | 11.0% | $53.19M |
| flooring | 734 | 10.5% | $62.43M |
| drywall | 1508 | 9.1% | $115.17M |
| excavation | 266 | 8.8% | $12.85M |
| shoring | 147 | 7.7% | $4.92M |

## Calibration backlog (data-driven, ranked)

Based on Lens #2 (outliers) + Lens #3 (model-vs-declared divergence) + Lens #4 (override rate), the top calibration candidates for Control Panel tuning are:

| permit_type | structure_type | n | model_p50 | permit_p50 | ratio | override% | suggested action |
|---|---|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | 33280 | $207.6K | $120.0K | 1.73 | 40.9% | minor recalibration |
| Small Residential Projects | SFD - Semi-Detached | 9469 | $276.3K | $100.0K | 2.76 | 47.8% | BUMP DOWN matrix allocation |
| New Houses | SFD - Detached | 8021 | $2.20M | $750.0K | 2.93 | 23.5% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Office | 6771 | $2.48M | $295.2K | 8.41 | 53.0% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Apartment Building | 5878 | $2.63M | $372.5K | 7.05 | 53.4% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Retail Store | 3430 | $1.54M | $200.0K | 7.68 | 55.9% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Multiple Unit Building | 3341 | $504.9K | $195.7K | 2.58 | 37.4% | BUMP DOWN matrix allocation |
| Small Residential Projects | 2 Unit - Detached | 2993 | $147.7K | $84.8K | 1.74 | 24.1% | minor recalibration |
| New Houses | SFD - Townhouse | 2303 | $4.97M | $310.3K | 16.03 | 51.3% | BUMP DOWN matrix allocation |
| Small Residential Projects | SFD - Townhouse | 2183 | $549.6K | $125.0K | 4.40 | 54.2% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Multiple Use/Non Resid | 1969 | $1.60M | $250.0K | 6.41 | 47.2% | BUMP DOWN matrix allocation |
| Small Residential Projects | Laneway / Rear Yard Su | 1655 | $1.21M | $400.0K | 3.01 | 47.9% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Restaurant 30 Seats or | 1513 | $928.6K | $100.0K | 9.29 | 58.4% | BUMP DOWN matrix allocation |
| Residential Building Permit | SFD - Detached | 1496 | $1.31M | $204.0K | 6.43 | 76.7% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Other | 1465 | $769.0K | $300.0K | 2.56 | 29.6% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Industrial | 1444 | $2.94M | $350.0K | 8.40 | 51.5% | BUMP DOWN matrix allocation |
| Small Residential Projects | Unknown | 1169 | $255.1K | $70.5K | 3.62 | 85.0% | BUMP DOWN matrix allocation |
| Building Additions/Alteratio | Restaurant Greater Tha | 1144 | $972.6K | $300.0K | 3.24 | 47.3% | BUMP DOWN matrix allocation |
| Small Residential Projects | 2 Unit - Semi-detached | 1110 | $237.8K | $100.0K | 2.38 | 32.7% | BUMP DOWN matrix allocation |
| Small Residential Projects | Converted House | 1009 | $325.5K | $107.5K | 3.03 | 56.3% | BUMP DOWN matrix allocation |
