---
write_scope:
- scripts/seeds/logic_variables.json
- scripts/generate-logic-variable-groups.mjs
- src/tests/control-panel.logic.test.ts
---
# MF-83 group 3 — seven lot-view settings: seed entries and the three key lists — LEAVE UNCOMMITTED

**Provider:** deepseek. Tools: `read_file`, `edit_file` only. Make exactly these three anchored edits, stop. Never `git add`/`commit`. LF endings, keep the file's indentation.

## Edit 1 — `scripts/seeds/logic_variables.json`
Insert seven entries immediately AFTER the closing `},` of the `"semi_doubt_min_shared_len_m"` entry and BEFORE `"user_lot_size_entry_enabled"`, in this order, each in the exact shape of `semi_doubt_min_shared_len_m` (`default`, `type: "number"`, `min`, `max`, `description`, `admin: { group: "Parcel Lookup" }`):

| key | default | min | max |
|---|---|---|---|
| lotview_require_convex | 1 | 0 | 1 |
| lotview_convex_tol | 0.995 | 0.5 | 1 |
| lotview_min_rectangularity | 0.8 | 0.5 | 1 |
| lotview_front_max_angle_deg | 30 | 0 | 90 |
| lotview_front_dist_tol_m | 2 | 0 | 10 |
| lotview_rear_max_angle_deg | 45 | 0 | 90 |
| lotview_run_max_turn_deg | 10 | 0 | 90 |

Descriptions (use these sentences, in one JSON string each, no double quotes inside):
- lotview_require_convex: `MF-83 group 3 (plan-group3.md D-G3-3, operator "Accepted" 2026-11-15; LOT-VIEWS-RULE.md eligibility): 1 = a lot must be convex (convexity at or above lotview_convex_tol) to be drawn with its edges, 0 = convexity is not tested. Whole number 0 or 1. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts), read through readLotViewSettings (src/lib/parcels/lot-view.ts); a missing or out-of-bounds value leaves the lot view out.`
- lotview_convex_tol: `MF-83 group 3 (D-G3-3; D-7 provisional, locked only after data-check items 3 to 5 and the RA look): the least convexity (lot area divided by convex hull area, stored in parcel_lot_view) for a lot to count as convex. Starting value 0.995. Bounds 0.5 to 1. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts) when lotview_require_convex is 1.`
- lotview_min_rectangularity: `MF-83 group 3 (D-G3-3; D-7 provisional, locked only after data-check items 3 to 5 and the RA look): the least rectangularity (lot area divided by the oriented envelope area, stored in parcel_lot_view) for a lot to be drawn with its edges. Starting value 0.80. is_irregular for images keeps its own 0.95. Bounds 0.5 to 1. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts).`
- lotview_front_max_angle_deg: `MF-83 group 3 (D-G3-3; LOT-VIEWS-RULE.md edge classes): the widest angle, in degrees, between an edge and the street for the edge to be the front. Starting value 30. Bounds 0 to 90. CONSUMED by the parcel_lot_view job (the pipeline task MB-109), which classifies the edges and stores them; changing it needs a re-run of that job.`
- lotview_front_dist_tol_m: `MF-83 group 3 (D-G3-3; LOT-VIEWS-RULE.md edge classes): the furthest distance, in metres, from the street centreline for an edge to be the front. Starting value 2. Bounds 0 to 10. CONSUMED by the parcel_lot_view job (the pipeline task MB-109); changing it needs a re-run of that job.`
- lotview_rear_max_angle_deg: `MF-83 group 3 (D-G3-3; LOT-VIEWS-RULE.md edge classes): the widest angle, in degrees, between an edge and the line opposite the front for the edge to be the rear. Starting value 45. Bounds 0 to 90. CONSUMED by the parcel_lot_view job (the pipeline task MB-109); changing it needs a re-run of that job.`
- lotview_run_max_turn_deg: `MF-83 group 3 (D-G3-3; LOT-VIEWS-RULE.md edge classes): the largest turn, in degrees, between two neighbouring edges for them to join one run. Starting value 10. Bounds 0 to 90. CONSUMED by the parcel_lot_view job (the pipeline task MB-109); changing it needs a re-run of that job.`

## Edit 2 — `scripts/generate-logic-variable-groups.mjs`
In `GROUP_ORDER`, find the `Parcel Lookup` group's `keys` array; after `'semi_doubt_min_shared_len_m'` append the seven keys above, in the table order, same quote style.

## Edit 3 — `src/tests/control-panel.logic.test.ts`
After the line `  'semi_doubt_min_shared_len_m',` (in the expected-keys list, near line 241) insert a comment line `  // MF-83 group 3 lot view eligibility and edge classes (plan-group3.md D-G3-3, operator "Accepted" 2026-11-15): admin group "Parcel Lookup", migration 325` then the seven keys, each on its own line as `  'key',`.

## Verify (run, report output)
- `node -e "const s=require('./scripts/seeds/logic_variables.json');console.log(Object.keys(s).filter(k=>k.startsWith('lotview_')).join())"` — prints the seven keys in table order.
- `npx eslint scripts/generate-logic-variable-groups.mjs src/tests/control-panel.logic.test.ts` — clean.
