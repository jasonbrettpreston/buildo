# Seat: reality-check: task-451 plan (PLAN-451-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board, branch wf2/board, head b1e4012f5. The plan says it read cites at 0841db559, and the cites I checked still match at this head. Files read: backlog/tasks/task-451 and task-450, docs/reports/reviews/task-451/FINDINGS-PLAN.md, consumer-lookup.ts, lot-map.ts, project.ts:79 and :267, display-rules.ts, LotMapBinding.tsx, the map content and descriptor JSON, static-page.json, StaticBinding.tsx:184-226 and :322-358, scripts/manifest.json, the test pins at the cited lines, and MD:776, 1117, 2290 and 2303. Local test stack: read-only aggregates, counts only.

## Checked and clean
- project.ts:79 is LOT_SIZE_PLAUSIBLE_M2 and project.ts:267 is the inclusive test `lotSize < min || lotSize > max`. The window of 50 to 5000 is pinned at report-projection-settings.logic.test.ts:58.
- consumer-lookup.ts:81 and :227 are as quoted: `if (v == null) return null;` and `area: areaSqftM2Dot(l.lot_size_sqm)`. The headline `areas` is at :104-111 and is not touched.
- areaSqftM2Dot already returns null for '' (display-rules.ts:23). The ST3 gate sits before it, so 50 and 5000 stay non-null and 49 and 5001 go null.
- consumer-parcel-lookup.infra.test.ts:286 pins '3,052 sq ft · 284 m²'.
- Map content file count: removing select.label and adding unlinked.report nets 0.
- The four static content files (web_help, web_terms, web_privacy, web_maxbld_error) have zero "nav." keys today, so +8 is exact. The pin is 426 at surface-validate.logic.test.ts:91 and surface-conformance.logic.test.ts:261, and 450's card (line 148) moves it to 427. So 435 holds only if 450 lands first with +1.
- Descriptor chain positions match scripts/manifest.json chains.sources: address_points is 2, parcels is 4, link_parcel_addresses is 8, link_massing is 15. The current descriptor says 1, 2, 3, 4 at :112, :135, :151 and :165. Plan step 7 is right.
- The plan's line cites for the static pages are right: the `landing` test is at StaticBinding.tsx:328 and the "a hero has a title" throw is in heroNode. static-page.json has "miss" at about :581 and web_help.static starts at :5. $comment is at :2.
- All three of the map's error testIDs exist, built as `parcel-lotmap-${key}`: ratelimit, entitlement and error. The retry testID exists and is skipped on schema_drift (LotMapBinding.tsx:74-83). The AC5 expected results are real.
- The no-hunk-clash claim between 450 and 451 holds from 450's card: 450 owns the wrong-lot mailto part and help.mailto.wrong_lot, and 451 owns :2 and the header sections.
- '/login' is in the landing hrefs list (web-landing.logic.test.ts:290), which resolves most of the plan's UNVERIFIED on the host row. I did not check that the row has a page.
- MD:776 says the street is "non-null on 480,489 lots". The stack agrees: 480,489 of 496,536 parcels have a non-blank frontage street.

## rc#1 MED: Risk 4 is false, so lots with neither street nor footprint will read "at the back"
Plan: section 5 risk 4, "a payload with neither still reads lot.letter", with V1 rewording the two lead keys.
Evidence: consumer-lookup.ts:234 reads `hasFootprint: l.has_footprint === true`, so the server always sends a boolean and never undefined. LotMapBinding.tsx:164 sets `known = lot.hasFootprint !== undefined`, so it is true for every current-server lot. A lot with no street and no footprint therefore takes `lot.lead.no_building` and reads "Lot A · no building · at the back". Stack data: 1,166 addresses link to more than one lot (2,347 lots). 56 of those lots, on 29 addresses, have neither a frontage street nor a parcel_buildings row.
Fix: Correct risk 4 to say that 56 lots on 29 multi-lot addresses (stack) have neither a street nor a footprint, and that the card says "no building · at the back" for them. MD:776 rules "at the back" when there is no street, so this may be intended. Put it to the operator as a one-line confirmation, or record it as ruled.

## rc#2 MED: ST3 will blank a large share of cards, and the stack counts differ from the figures the plan inherits
Plan: section 3 step 1 and AC1 ("Not available" outside LOT_SIZE_PLAUSIBLE_M2). The window is quoted from project.ts, whose comment cites reality F-3: "4,297 lots under 50 m², 1,923 over 5,000 m²".
Evidence, stack parcels table: 496,536 rows; 7 null lot size; 1 equal to 0; 8,137 under 50; 11,295 over 5,000. Of the 2,347 lots on multi-lot addresses, 659 (28%) are outside the window or null. The stack's 8,137 and 11,295 do not match F-3's 4,297 and 1,923. I could not tell which source is current, so that is UNVERIFIED. The stack may lag the data F-3 measured.
Fix: Add one sentence to section 5: "about 28% of multi-lot cards on the stack would show Not available". The plan never states how often the new text appears, and the operator ruling (RR-0444 2c) is on the text, not the rate. Also mark the F-3 comparison UNVERIFIED.

## rc#3 LOW: The L2 empty-string case cannot come from the database
Plan: section 4 L2 ("a row with lot_size_sqm '' and comp_count '' gives null (0 today)").
Evidence: on the stack, parcels.lot_size_sqm is numeric and parcels.comp_count is integer, so pg never returns ''. The code claim is true: `Number('')` is 0 at consumer-lookup.ts:79-83. The test is synthetic only. lot-map.ts:93 already has its own num that rejects ''.
Fix: Label L2 a defensive guard with no data case, so nobody expects a count of rows it fixes.

## rc#4 LOW: "The six calls change" lists five
Plan: section 3 step 3, "helpLink takes the topic 'wrong-lot'. The six calls change: :115, :234, :236, :238, :240."
Evidence: grep finds the definition at LotMapBinding.tsx:97 and five calls: `helpLink('lot_match')` at :115 and `helpLink('address_match')` at :234, :236, :238 and :240. The intersection and too-many states at :234 and :236 also move to wrong-lot, which the plan does not say.
Fix: Say "five calls plus the type at :97", and name that intersection and too_many also move to wrong-lot.

## rc#5 LOW: Risk 6 misdates the missing Retry on a 429
Plan: section 5 risk 6, "After 450's L3 change, a 429 of 0 shows no Retry on the map."
Evidence: the Retry button is built only inside the `s.errors.unexpected` block (LotMapBinding.tsx:74-83). The rate-limit notice (:63-67) has no Retry today whatever the wait is.
Fix: Reword to "a 429 shows no Retry today". The X1 assertion of the notice only is then a true lock of existing behaviour.

## rc#6 NIT: Stale head in the plan
Plan: the preamble, "board head 0841db559".
Evidence: the head is b1e4012f5. The plan-review records commit changes only under docs/reports, so the code cites were not affected.
Fix: None required; re-read by anchor text at the merge, as section 6 already says.

UNVERIFIED: whether 450's final plan takes descriptor :57 (I did not grep 450's plan for it). Everything the plan marks UNVERIFIED stays unverified: nothing was run and there was no device check. The stack counts above may lag the branch.

STATUS: 6 findings (0 CRITICAL, 0 HIGH, 2 MED, 3 LOW, 1 NIT); the plan's numbers and expected results hold, and the real gaps are the "neither street nor footprint" case (rc#1) and the unstated 28% blank rate (rc#2).
