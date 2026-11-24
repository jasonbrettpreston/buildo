Seat: Cairn-Reality-G1

1. WHAT I READ / QUERIED
Read: SEAT-BRIEF.md, G1 files.txt, context.md, GROUNDER-A/B/C.md (grep of the lead-detail items), src/lib/leads/lead-detail-query.ts (whole), mobile/app/(app)/[lead].tsx (whole), mobile/src/lib/leadDetailFormat.ts, parcelCostFormat.ts, OpportunityRing.tsx, parcels_sqm_to_sqft in scripts/seeds/logic_variables.json (10.7639, min=max pinned), Spec 91 lines 190 and 206, Spec 83 lines 27 and 125.
Queries: about 30 read-only SELECTs, each in BEGIN READ ONLY ... ROLLBACK, on 127.0.0.1:55322 only. No personal data was printed. I ran one local node line to check how a date is parsed; it touches no data. The stack's clock reads 2026-11-24.
Table sizes: cost_estimates 285,438; trade_forecasts 1,139,008 (160,214 distinct lead_id); permits 264,600; coa_applications 33,982; neighbourhoods 158; lead_views 0 rows.
Queries covered: area, cost, tier and range distributions; effective area against modeled area; score nulls, zeros and bounds; start date and p25/p75 order and age; CoA area, cost and forecast coverage; neighbourhood incomes; duplicate keys; the near-$1M rounding boundary.

2. FINDINGS (most serious first)

1. HIGH, NEW. Absurd areas are served with no cost beside them.
Code: lead-detail-query.ts:163 and :184 (permit), :355 (CoA) feed sqmToSqftOrNull at :189. Screen: [lead].tsx:81 and :89, shown at :296-306. The screen shows any finite area. There is no ceiling and no check against cost.
Data (cost_estimates.modeled_gfa_sqm): 285,438 rows, 175,363 with an area, 0 zero or negative. Percentiles: median 311 m2, p90 7,411, p99 216,717, max 1,885,729.86. 3,023 rows are above 100,000 m2, and 674 are above 541,000 m2.
All 3,023 of those have estimated_cost NULL. In fact all 5,628 rows with an area and no cost are of this kind (5,628 rows have an area but no estimated_cost).
Examples: 14 124647 BLD--00 (1,441,547 m2), 26 110986 BLD--00 (1,885,729 m2), 17 190825 BLD--00 (1,070,998 m2). The ones I joined to permits are "Building Additions/Alterations" permits with the same 1,441,547.2 value, for example 15 220030, 15 220033 and 21 153195 BLD--00.
What the person sees: "Square Footage: 20,298,000 sq ft, Modeled effective area". For 1,441,547 m2 the sqft figure is 15,517,000. There is no cost block (hasCostContent is false), so nothing contradicts it. A single Toronto building cannot be that big. It looks like a lot or parcel area, or a matrix-miss fallback. Spec 83:166 says a safe-skip should leave modeled_gfa_sqm null, but these rows carry an area.
Smallest fix: serve modeled_gfa_sqft as null when estimated_cost is null and the area is above a plausible ceiling. Alternatively, ask the pipeline owner why a no-cost row keeps an area. This may be rows the pipeline has not re-run (UNVERIFIED which). Another 380 rows are under 10 m2 (min 1 m2), which is minor.

2. MED, NEW. The label says "effective area" but the field is the whole-building area, and the two differ a lot.
Code: [lead].tsx:303 prints "Modeled effective area". The SQL reads ce.modeled_gfa_sqm (lead-detail-query.ts:86). leadDetailFormat.ts:7-9 says effective_area_sqm is "mapped to cost.modeled_gfa_sqm". That is false: effective_area_sqm is never selected. Spec 91 :190 and :206 do name modeled_gfa_sqm, so the field choice follows the spec and the label is what is wrong.
Data: 42,253 of 175,363 rows have effective_area_sqm different from modeled_gfa_sqm. For rows where is_geometric_override is true (26,778 rows), effective is about 22 percent of modeled (mean ratio 0.217). 26,065 of them are below 99 percent of modeled.
Examples: 21 192610 BLD--00 has modeled 25,032 m2 and effective 5,006 m2. 08 213784 BLD--00 has 2,163 m2 against 541 m2.
What the person sees: 25,032 m2 shows as 269,440 sq ft under "Modeled effective area", but the cost was priced on 5,006 m2, about 53,900 sq ft. Costs and area do not agree for these rows. Another 2,326 rows have modeled above 100,000 m2 while effective is not.
Smallest fix: relabel to "Modeled building area". Or serve effective_area_sqm, which needs an operator ruling (see question 1). Also correct the comment at leadDetailFormat.ts:7-9.

3. MED, NEW. Every target date is off by one day on phones in the Americas.
Code: SQL returns tf.predicted_start::text, a date such as "2026-06-12" (lead-detail-query.ts:99). [lead].tsx:36-41 does new Date(iso) and then d.getDate(), d.getMonth() and d.getFullYear() in local time. A bare date string parses as UTC midnight. With TZ=America/Toronto, node gives getDate() = 11 for 2026-06-12.
Data: all 1,139,008 forecast rows have predicted_start, so every row is affected.
What the person sees: "JUN 11, 2026" for a June 12 target. A start date is the main decision number on the page.
Smallest fix: parse the YYYY-MM-DD parts directly, or use the UTC getters.

4. MED, NEW. Most target dates are already in the past, with no cue on the page.
Data: 1,072,693 of 1,139,008 forecasts (94 percent) have predicted_start before today. 1,021,491 are more than 90 days old and 102,016 are "bid" ("Early Bid") rows. Earliest is 2026-06-12, latest 2027-01-03. computed_at runs 2026-06-12 to 2026-10-25, and 37,327 rows are over 30 days old. 9,143 rows show "+0 to +0 days".
The page prints "Target Start Date: JUN 12, 2026" in amber with "Early Bid" beside it, even for a date months gone. Part of this is stale data, since the forecaster last ran 2026-10-25. But 94 percent past is more than lag, because most permits have already started (P18 and similar phases). Whether the date should be hidden or marked once it is past is a product call (question 2).
The range line also reads "+0 to +0 days" in 9,143 rows (p25 = p75 = 0).
No impossible combinations: 0 rows with p25 above p75, 0 negatives, max p75 268.

5. MED, ALREADY-KNOWN as D3 (GROUNDER-C EP1#3), extent NEW. The ring reads 0 where the score is absent.
Code: [lead].tsx:167, `opportunity_score ?? 0`.
Data, permits: 206,188 of 1,139,008 forecast rows have a null score (18 percent). Real zeros are 25,425, and max is 90, so a real 0 cannot be told from "no score".
Data, CoA: only 1,725 of 33,982 CoA applications have any trade_forecasts row, so 32,257 (95 percent) have none. A further 7,547 of the 28,806 CoA forecast rows have a null score.
So for CoA leads the ring reads 0 for about 95 percent of rows. D3 was ruled as "appears only via..." (a rare path), but for CoA it is the normal case. CoA also loses the target date, range and window pills for the same rows.

6. LOW, NEW. Rounding at the $1M boundary.
Code: leadDetailFormat.ts:59-60, `$${Math.round(v/1000)}K` for v from 999,500 to 999,999.
Data: 31 estimated_cost rows, 31 range_low rows and 26 range_high rows fall in 999,500-999,999. Example 03 202875 BLD--00.
The page shows "$1000K" instead of "$1.0M". (parcelCostFormat.formatCurrency has the same shape, :64-66.)
Fix: test the rounded value against 1,000,000 before choosing the K or M branch.

7. LOW, NEW. A zero-width range, and an estimate outside its own range.
Data: 6,998 rows have cost_range_low = cost_range_high, so the page shows "Range $450K - $450K". 48 rows have the estimate outside its range (31 above the high end, 17 below the low end). The gap is under a dollar for the rows I looked at: 26 177997 BLD--00 has estimated 101,999.25 against a range of 101,999.00 to 101,999.00. At the page's K rounding it looks identical, so the harm is cosmetic.
The "Cost not disclosed" over-a-printed-range case (U2, GROUNDER-C) cannot be reached on this data: 0 rows have a null estimate with a range set.

3b. Related to the date fix: the stack has zero lead_views rows, so competition_count and is_saved only return 0 and false here (UNVERIFIED for real values).

3. FOUND SOUND
- The sqm to sqft arithmetic: the factor is a pinned 10.7639 (min = max), null in gives null out (lead-detail-query.ts:189), and it is reached from both the permit and CoA branches (:163, :184, :355). Rounding happens once, on the phone.
- Areas: 0 zero or negative values in either permit or CoA data.
- CoA area: max 1,895.64 m2, none above 100,000, and area and cost are always present or absent together (0 mismatches in 33,982 rows). CoA cost minimum is $37,338, so none is zero or negative.
- Permit cost: 0 zero or negative estimates; min 2,000, max 104,393,044. Every tier fits its own band (small 2K to 100K up through mega 10M+). A tier-null row always has a null estimate. Range low is never above range high, and no range is negative.
- Forecast order and bounds: p25 never above p75, no negatives, opportunity_score between 0 and 90, no score above 100, so the ring's clamp is never needed.
- Target window: 'bid' and 'work' only, no other values.
- Keys: 0 duplicate permit keys and 0 duplicate application numbers. The only repeated forecast keys are the 25 CoA groups with a null permit_num, and the CoA join (lead_id plus trade_slug) has 0 duplicates, so the LIMIT 1 hides nothing.
- Permit address: 37 of 264,600 permits have neither street number nor street name, and the code falls back to the id. 3 CoA rows are the same. No row has a future updated_at. lifecycle_stalled is never null (23,003 true).
- Neighbourhoods: 158 rows, all incomes positive (avg 72,200 to 519,500, median 57,200 to 222,000), none with median above 3 times avg. period_of_construction is never blank. A CoA with no neighbourhood (2,132 rows) hits the null-block path correctly.
- The cost block collapses to null only when every field is null; a row with an area and no estimate still shows the area section (5,628 rows).
- Description: max length 3,873 characters in 6 rows above 2,000; the screen does not truncate it, so it scrolls.

4. QUESTIONS FOR THE OPERATOR
1. Should the Square Footage section show effective_area_sqm (the work area the cost was priced on) or the whole-building modeled_gfa_sqm, and what should the label say?
2. For a target start date already in the past, should the page hide it, mark it, or keep showing it?
3. Should a lead whose area is huge but has no cost estimate show an area at all, and what is the sane ceiling?

5. UNVERIFIED
- Whether the 5,628 no-cost rows with an area, including the 3,023 above 100,000 m2, are rows the pipeline has not re-run or a live fault. The stack lags the branch, and I did not read the cost script.
- competition_count and is_saved: lead_views is empty on the stack, so no real values were checked.
- Distances: the lead detail page shows no distance. Latitude and longitude only build `location`, which the screen never reads. 22,746 permits and 1,382 CoA rows have a null latitude, which matters for nothing on this page.
- The pipeline's own assumptions (why geometric-override rows carry 22 percent effective area) were not checked.
- I did not examine the on-device rendering; the date finding is from the code plus a local node timezone check.
