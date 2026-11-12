---
write_scope:
- scripts/steps/_schema/programme-items.json
- src/tests/step-validate-net-new.logic.test.ts
- src/tests/src-sql-ledger.logic.test.ts
---
# Brief: three registration pins the full suite found after the MB-35 capture commit (data and test-expectation moves only)

Make exactly the edits below. Change no other byte. Do not reformat. Do not commit.

## Edit 1 — scripts/steps/_schema/programme-items.json
In the item whose "id" is "EP-PIN-D17", its "gate" -> "blocks" list contains the line
          "compute_maxbld_scenarios",
(between "compute_cost_estimates", and "compute_opportunity_scores",). Delete that ONE line. Nothing else.
(Why: the census now declares compute_maxbld_scenarios legacy "none"; EP-PIN-D17 blocks only census slugs whose legacy is not "none".)

## Edit 2 — src/tests/step-validate-net-new.logic.test.ts
Line 113: replace the words `exactly the four net-new pending steps` with `exactly the five net-new pending steps`.
Line 115: replace
['link_parcel_abutments', 'load_bylaw_map_areas', 'load_coa_notices', 'resolve_bylaws']
with
['compute_maxbld_scenarios', 'link_parcel_abutments', 'load_bylaw_map_areas', 'load_coa_notices', 'resolve_bylaws']

## Edit 3 — src/tests/src-sql-ledger.logic.test.ts
1. In the `it(` title on line 325, replace `only the matview and the unapplied migration-305 table are skipped` with `only the matview is skipped`.
2. Directly ABOVE the line
    expect(r.membership.uncatalogued).toEqual(['mv_monthly_permit_stats', 'parcel_maxbld_scenarios', 'parcel_user_inputs']);
   insert these two comment lines (4-space indent, like the comment lines above them):
    // MB-35 (2026-11-12): the capture commit lands the witness catalog recaptured on the dev DB (MB35-RECAP, migrations 305 and 309 applied), so
    // parcel_user_inputs and parcel_maxbld_scenarios are catalogued and the matview is again the only uncatalogued name (the precedent above).
3. Replace that expect line with
    expect(r.membership.uncatalogued).toEqual(['mv_monthly_permit_stats']);

## Check before you stop
- `git diff --stat` lists exactly these 3 files; programme-items.json has 1 deletion only.
- `node -e 'JSON.parse(require("fs").readFileSync("scripts/steps/_schema/programme-items.json","utf8"))'` exits 0.
