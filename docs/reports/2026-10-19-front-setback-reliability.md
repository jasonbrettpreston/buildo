# Front-setback reliability — neighbour estimates against CoA notices (2026-10-19)

SPEC LINK: docs/specs/01-pipeline/130_link_parcel_abutments.md Q-B1; docs/specs/01-pipeline/69a_mcbylaw_register.md M-205(1) (dated note 2026-10-19); docs/specs/01-pipeline/131_lot_configuration_policy.md LC-58 (drafted as LC-57; renumbered because the validation-fixes lane holds LC-57)

**Question (operator 2026-10-19):** the neighbour footprints have not been shown reliable. How should the averaged front setback (10.5.40.70(1)) be used?

**Ruling (operator, "looks great!"; it revises the same-day tight-threshold ruling):** where averaging applies, the front setback is max(averaged neighbour estimate + porch allowance, the zone's standard front setback). The porch allowance is an admin setting, `fya_porch_allowance_m`, default 1.0 m. The lot is always flagged "needs survey" and the disclosure is mandatory and high importance. Where an estimate is excluded, the lot takes the zone default, still flagged "needs survey".

## What the comparison shows

| Measure (n = 219 with an estimate) | Value |
|---|---|
| Estimate at or below the examiner's figure | 89.0 % |
| Estimate: median error / P90 | 1.10 m / 2.79 m |
| Estimate within 0.5 m / 1 m | 26.9 % / 47.5 % |
| **Ruled value max(estimate + 1.0, 6.0): mean error** | **1.39 m** |
| Ruled value within 1 m | 54.8 % |
| Ruled value below the examiner (too generous) | 22.4 % (20.5 % by more than 0.05 m) |
| Zone default 6.0 m alone: mean error | 2.53 m |
| Zone default alone within 1 m | 19.2 % |
| Zone default alone too generous | 63.9 % |

**Why the estimates fall short:** they run short of the examiner's figure, by a signed median of −0.96 m. That fits building outlines that take in porches and steps.

**Choosing the allowance:**

| Allowance | Mean error | Too generous |
|---|---|---|
| 0 m | 1.42 m | 55 % |
| 0.5 m | 1.32 m | 36 % |
| 1.0 m (default) | 1.39 m | 22 % |
| 1.5 m | 1.56 m | 16 % |
| 2.0 m | 1.80 m | 11 % |

1.0 m keeps the error near its lowest while cutting "too generous" to about a fifth.

**No subset of lots met the earlier tight test** (90 % within 0.5 m). The best slice was RD lots with frontage ≥ 12 m and two neighbours agreeing within 0.5 m: 50 %, n = 26.

### Error by slice (estimate alone)

| Slice | n | median | P90 | ≤ 0.5 m | ≤ 1.0 m |
|---|---|---|---|---|---|
| All | 219 | 1.10 | 2.79 | 27 % | 47 % |
| One neighbour | 50 | 1.33 | 4.04 | 22 % | 48 % |
| Two neighbours | 169 | 1.10 | 2.54 | 28 % | 47 % |
| RD | 133 | 0.73 | 1.98 | 35 % | 65 % |
| R | 51 | 2.08 | 4.04 | 12 % | 18 % |
| RM | 28 | 1.88 | 3.07 | 18 % | 25 % |
| Lot frontage < 7.5 m (semi / row proxy) | 44 | 2.14 | 4.92 | 9 % | 14 % |
| Lot frontage ≥ 7.5 m | 175 | 0.83 | 2.44 | 31 % | 56 % |
| Corner lot | 32 | 1.06 | 4.04 | 22 % | 50 % |

## Coverage (440,093 residential lots, R / RD / RS / RT / RM)

| Outcome | Lots |
|---|---|
| Ruled value from estimate + 1.0 m (above 6.0 m) | 251,897 |
| Ruled value at the 6.0 m floor | 143,203 |
| Zone default, "needs survey": an estimate excluded | 13,166 |
| Zone default, "needs survey": three or more neighbours (Q-B2) | 16,759 |
| Zone default, averaging does not apply | 15,068 |

In all, 395,100 lots get the ruled value and 45,000 get the zone default.

## Method

- **Oracle (independent value):** 232 CoA variances from 2017 hearings whose notice cites front-yard averaging. That is 10.5.40.70(1)[(A)|(B)] at any value, or a zone x.40.70(1) (the 2017 averaging clause) at a value that is not a flat zone default of 3.0 / 4.5 / 6.0 / 7.5 / 9.0 m. The examiner's figure comes from a survey.
- **Source data:** `coa_notice_variances` (parse_status `pair`), already extracted, so DeepSeek was not needed.
- **Not available:** permit site plans are not held.
- **Ours:** the subject lot's `parcel_abutments` rows. A neighbour qualifies when it is residential, on the same frontage street, has a building, and that building is ≤ 15.0 m from the lot.
- **Second measurement (diagnostic):** footprint to the neighbour's front lot line. It scored worse: median 2.04 m, 4 % within 0.5 m.
- **Harness:** `scripts/analysis/bylaw-validation/front-setback-oracle.cjs` (read-only). It reports these figures at the current allowance. Rows are in `2026-10-19-front-setback-reliability.json`.

## What changed

- **Logic variable `fya_porch_allowance_m`:** 1.0 m, admin group Source Ingestion, migration 276. The earlier draft's `fya_estimates_accepted`, `fya_oracle_tol_m` and `fya_oracle_min_within_tol_pct` were never landed and are removed, so no dial is left unread.
- **`scripts/analysis/bylaw/front-averaging.mjs`:** resolves the lot on read (flags, vars, front setback, P5.10 basis, P5.12 codes). Both new codes are mandatory and high importance:
  - `front_yard_needs_survey`: averaging applies.
  - `front_yard_not_measured`: an estimate is excluded.
