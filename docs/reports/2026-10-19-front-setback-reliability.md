# Front-setback reliability — neighbour estimates against CoA notices (2026-10-19)

SPEC LINK: docs/specs/01-pipeline/130_link_parcel_abutments.md Q-B1; docs/specs/01-pipeline/69a_mcbylaw_register.md M-205(1) (dated note 2026-10-19); docs/specs/01-pipeline/131_lot_configuration_policy.md LC-57

**Question (operator 2026-10-19):** the neighbour footprints have not been shown reliable. Should the averaged front setback (10.5.40.70(1)) be used, and if so where? **Ruling:** use it only where it passes a tight threshold; elsewhere use the zone default, flag "needs survey", and disclose the averaging by-law.

**Result: no estimate passes.** 26.9 % of averaged estimates are within 0.5 m of the examiner's figure (target 90 %). `fya_estimates_accepted` stays 0, so every lot where averaging would apply (about 425,000 of 440,093 residential lots) takes its zone default front setback, flagged "needs survey".

## Method

- **Oracle (independent value):** 232 CoA variances (2017 hearings) whose notice cites front-yard averaging. That is 10.5.40.70(1)[(A)|(B)] at any value, or a zone x.40.70(1) (the 2017 averaging clause) at a value that is not a flat zone default (3.0 / 4.5 / 6.0 / 7.5 / 9.0 m). The examiner's required front setback comes from a survey. All 232 come from `coa_notice_variances` (parse_status `pair`), already extracted by `load_coa_notices`, so no DeepSeek round-1 extraction was needed.
- **Ours:** the subject lot's `parcel_abutments` rows. A neighbour qualifies if it is residential, on the same frontage street, has a building, and that building is ≤ 15.0 m from the lot. One qualifying neighbour gives its `front_setback_est_m`; two give their average.
- **Second method (diagnostic):** the distance from the neighbour's footprint to its front lot line (the boundary within lot-to-street distance + 1.5 m of the street). It scored worse than the step's estimate (median 2.04 m, 4 % within 0.5 m), so it is not a usable cross-check.
- **Not available:** permit site-plan setbacks are not held in the database. The oracle is 2017; a neighbour rebuilt since then adds scatter, but the error found is mostly a systematic −1 m, which rebuilds would not produce.
- Harness: `scripts/analysis/bylaw-validation/front-setback-oracle.cjs` (read-only). Rows: `2026-10-19-front-setback-reliability.json`.

## Error (|estimate − examiner|, n = 219 with an estimate)

| Slice | n | median | P90 | ≤ 0.5 m | ≤ 1.0 m |
|---|---|---|---|---|---|
| All | 219 | 1.10 | 2.79 | 27 % | 47 % |
| One neighbour | 50 | 1.33 | 4.04 | 22 % | 48 % |
| Two neighbours | 169 | 1.10 | 2.54 | 28 % | 47 % |
| Notice's count (A/B) matches ours | 58 | 0.90 | 2.59 | 40 % | 53 % |
| RD | 133 | 0.73 | 1.98 | 35 % | 65 % |
| R | 51 | 2.08 | 4.04 | 12 % | 18 % |
| RM | 28 | 1.88 | 3.07 | 18 % | 25 % |
| Lot frontage < 7.5 m (semi / row proxy) | 44 | 2.14 | 4.92 | 9 % | 14 % |
| Lot frontage ≥ 7.5 m | 175 | 0.83 | 2.44 | 31 % | 56 % |
| Corner lot | 32 | 1.06 | 4.04 | 22 % | 50 % |

Bias: estimates are smaller than the examiner's figure (signed median −0.96 m, mean −1.10 m). That fits a footprint traced to porches and steps rather than the main front wall. Removing the bias still leaves only 34 % within 0.5 m.

## Signals tried

The best combination found was RD, frontage ≥ 12 m, two neighbours agreeing within 0.5 m: n = 26, 50 % within 0.5 m. Each other signal was also tested:
- both neighbours estimated;
- neighbour agreement at 0.5 / 1 / 1.5 / 2 / 3 m;
- building distance ≤ 5 m;
- not a corner lot;
- frontage ≥ 7.5 / 10 / 12 / 15 m;
- zone;
- the two methods agreeing.

None reaches 90 %. Following the ruling, nothing is accepted.

## What changed

- **`fya_estimates_accepted`** = 0. Set it to 1 only when this harness reports `meets_threshold: true` (n ≥ 100 and ≥ `fya_oracle_min_within_tol_pct` within `fya_oracle_tol_m`).
- **`fya_oracle_tol_m`** = 0.5.
- **`fya_oracle_min_within_tol_pct`** = 90.

All three are in admin under Source Ingestion; migration 276.

`scripts/analysis/bylaw/front-averaging.mjs` resolves the lot flags on read:
- **Averaging would apply but the estimate is not accepted:** the zone default, basis `zone_default_needs_survey`, and the P5.12 `front_yard_needs_survey` disclosure.
- **Excluded statuses:** `no_building`, `no_frontage_street`, `street_not_found`, `estimate_negative` and `estimate_out_of_bounds` never feed an average.
