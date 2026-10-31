# CARD answered 2026-10-29 (operator: "I agree. let's use it and record it.")
Evidence: ~/Buildo-scratch/p2close/front-setback-calibration.md (n = 248; raw footprint estimate short on 88 % of lots, median -0.97 m; fixed offset, not proportional; +1.0 m holds out-of-sample: MAE 1.50 -> 1.14 m, within 1 m 47 % -> 66 %; +5 % worse: 1.36 m, 55 %).

## FS-SB1 Neighbour front setback, value order (refines CHAT-198.NN-Q4)
- Current rule: M-245 fya_porch_allowance_m = 1.0, built in the scorer/analysis path only (front-averaging.mjs:107, coa-scorecard.mjs:66/396); not applied in the product evaluator path (src/ has it only in tests).
- Answer: build M-245 into the model path (fix to an existing ruling). Order: (1) user-supplied neighbour front setbacks; (2) building-footprint estimate + 1.0 m (M-245), averaging both neighbours, one side if only one is found, flagged needs survey; (3) 6.0 m, flagged needs survey (the by-law value only where 10.5.40.70(1) does not apply; otherwise a placeholder). No percentage correction (out-of-sample worse).
- Rule-text line: "The neighbours' front setbacks are the user's figures, else the building-footprint estimate plus the M-245 allowance of 1.0 m (both neighbours averaged, one side if only one is found), else 6.0 m; every estimated or default value is flagged needs survey."
