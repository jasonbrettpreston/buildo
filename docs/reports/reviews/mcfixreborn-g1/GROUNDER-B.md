Grounder: Cairn-Ground-G1B
Ruled: out-engineering-eng-all-p1.txt sha256:5913f4cf6a81 findings:4
Ruled: out-engineering-eng-all-p2.txt sha256:84f79884b611 findings:4
Ruled: out-engineering-eng-all-p3.txt sha256:cc4372da049b findings:6
Ruled: out-engineering-eng-all-p4.txt sha256:3aea061b42a8 findings:4
Ruled: out-engineering-eng-all-p5.txt sha256:ed003974d14c findings:7
Ruled: out-engineering-eng-all-p6.txt sha256:5ba7008cf007 findings:5
Ruled: out-engineering-eng-all-p7.txt sha256:35f0d5fc0fdb findings:3
Ruled: out-engineering-eng-back.txt sha256:c28f8d218ddb findings:0
Ruled: out-engineering-eng-front.txt sha256:e73c05e57490 findings:5
Ruled: out-engineering-eng-shared.txt sha256:052c03c350f0 findings:7
Ruled: out-code-review-p1.txt sha256:b9522ce1fbd9 findings:5
Ruled: out-code-review-p2.txt sha256:9774c03f2590 findings:8
Ruled: out-code-review-p3.txt sha256:c359a7dedf96 findings:7
Ruled: out-code-review-p4.txt sha256:5d80c3cec18e findings:6
Ruled: out-code-review-p5.txt sha256:bee3bff9045d findings:8

Basis: every G1 file read at 8dba70e8e. The board HEAD is faa608ce6, and `git diff --stat` shows no change in any of the 37 G1 files between the two. Ids are `<output>#<n>` with the `out-` prefix dropped. Standard = docs/specs/00_engineering_standards.md. DUP-G2 = duplicate of the G2 grounder's D4 (typed factories) or D6 (undocumented `!`) in docs/reports/reviews/mcfixreborn-g2/GROUNDER-B.md, or of its refuted test-layer naming claim (eng-all-p1#2, "§5.5"). 36 findings are CRITICAL/HIGH/MED, and none is CRITICAL.

2. TABLE (CRITICAL/HIGH/MED)
code-review-p1#1 | MED | REFUTED | all four callers push `/(app)/[lead]?id=...` (mobile/app/_layout.tsx:413,:472; (app)/index.tsx:133; map.tsx:72), and Spec 91 §4.3 names `[lead]?id=X`, so `id` is the real query param.
code-review-p2#1 | MED | REFUTED | TARGETS (report-layout.json targets) is mobile,web,admin,pdf and PAGE_GOLDENS keys (goldens.ts) are the same four, so the lookup never misses (page.tsx:37,:41).
code-review-p2#2 | MED | REFUTED | core.ts:331 rejects a tree with more than one image node; viewOf also reads the first image node (core.ts:391). The fixtures hold 0 or 1 image node each (printed).
code-review-p3#1 | MED | REFUTED | citywideLines returns all five lines or none (what-we-checked.ts:109), and the template keys equal CITYWIDE_KEYS (lots, regulations, buildings, builds, map_areas), so a partial row cannot be produced.
code-review-p3#2 | MED | REFUTED | trade_forecasts.opportunity_score is INTEGER (migrations/091:50, made nullable in 104), so pg returns a number; the cast is not needed.
code-review-p4#1 | MED | REFUTED | all 488 ref objects in the mobile_parcel_search goldens are single-key and 0 are multi-key (printed). Template refs nest single-key refs, which refsOf (search-parity.golden.test.ts:26) recurses into.
code-review-p5#1 | MED | REFUTED | `search.legal` has no apostrophe, ampersand or quote, so the innerHTML regex (site-footer.ui.test.tsx:53) matches today. The risk is hypothetical, and the test would fail loudly, not pass.
code-review-p5#2 | MED | REFUTED | 21 of the 22 situations have `recent`, so the loop runs 21 times (printed). A zero-iteration guard is a hardening wish, not a current defect.
code-review-p5#3 | MED | REFUTED | a null `querySelector` still fails the test, with a worse message (:67,:78,:97-101). No false pass.
eng-all-p1#1 | MED | REFUTED | the RS-4 parity both ways is a vitest test: src/tests/report-schema.logic.test.ts:78-89. The hook also runs `report-schema.mjs --check` (hooks-composition.infra.test.ts:340).
eng-all-p1#2 | MED | REFUTED | admin-placements-seed.logic.test.ts:8-9 and :28 assert that the placement rows set-equal report-presentation.json `ad_placements` keys, and that max_slots match.
eng-all-p2#1 | MED | UNDETERMINED | the descriptor :345 truthfully records "none"; the route has no withRateLimit (only 6 route files use it; leads/feed and leads/view do). Standard §4.4 (line 92) says "Public-facing API routes must include rate limiting before a second app is connected ... middleware-level". Settled by an operator word on whether a session-guarded route is "public-facing". The route is outside G1.
eng-all-p3#1 | HIGH | CONFIRMED | see D2. Admin-only preview, so mis-rated: real impact is LOW.
eng-all-p3#2 | HIGH | NOT-APPLICABLE | §10.2 (lines 223-226) bars a frontend WF from changing how data enters the DB (pipeline scripts, migrations). scripts/surfaces/** are surface-registry descriptors under Specs 126/127, not that pipeline.
eng-all-p3#3 | MED | REFUTED | TARGETS and the PAGE_GOLDENS keys are identical (checked); `state` is picked from STATES = Object.keys(GOLDENS), so the lookups at page.tsx:41 and :54 cannot miss.
eng-all-p3#4 | MED | CONFIRMED (known) | see D1. This is a named residual: task-384 card :81 "C-9 reach (needs a rule on what to judge in a hand-built renderer)", REPORT.md:37, descriptor :203.
eng-all-p3#5 | MED | NOT-APPLICABLE | `"dark_mode": "hardcoded"` is a value of the surface schema's closed vocabulary (surface.schema.json:3020). It records the measured state; it is not UI code.
eng-all-p4#1 | HIGH | DUP-G2 D6 (defect refuted) | ReportPage.tsx:155 has 4 `!`, not 5. A malformed edge cannot reach render: validDrawing (core.ts:435) checks line length 2 (report-page.json edge_ends 2) and each point, and drops an invalid drawing whole (core.ts:488). Only the missing why-comment is real, and it is pinned at ceiling 4 (non-null-assertion-comment.logic.test.ts:64).
eng-all-p4#2 | MED | REFUTED | the rows (ReportPage.tsx:40,:346,:368) are two-cell dt/dd pairs. Flex items shrink and wrap their own text, so nothing collides. Whether §1.1 "dense metadata rows" reaches a two-cell pair is a reading question, not a defect.
eng-all-p5#1 | HIGH | DUP-G2 D4 | lead-detail-query.coa.infra.test.ts imports no factory (verified). It is a conformity gap needing a decision, not a defect. Mis-rated HIGH.
eng-all-p5#2 | HIGH | REFUTED | the whole handler is one try/catch (route.ts:51-94), shared by the permit and CoA branches. The sanitized-500 case (leads-detail.infra.test.ts:345-355) pins it. Only the fixture uses a permit id.
eng-all-p5#3 | MED | REFUTED | tpl keys equal the line keys (same five keys, see code-review-p3#1), so `String(tpl[l.key])` cannot yield "undefined".
eng-all-p5#4 | MED | NOT-APPLICABLE | §1.3 governs the Expo/NativeWind app. StaticBinding.tsx:78 is the web landing, a fixed dark page, with no NativeWind.
eng-all-p5#5 | MED | REFUTED | `ast-grep scan --rule silent-catch-fallback.yml` on maxbld-landing.ts printed no hit. The rule's pattern is `catch { return []; }` alone, and these catches call logError first (:80,:91,:115).
eng-all-p6#1 | HIGH | DUP-G2 D4 | leads-detail.infra.test.ts imports no factory (verified). Mis-rated HIGH.
eng-all-p6#2 | MED | CONFIRMED | see D3.
eng-all-p7#1 | MED | DUP-G2 §5.5 | vitest's include is `src/**/*.test.ts` (checked), so `.golden.test.ts` runs in the default run. The claim is a file-name question, which G2 refuted in eng-all-p1#2.
eng-all-p7#2 | MED | DUP-G2 D4 | the footer tests build inline literals with `as never` and import no factory (verified).
eng-front#1 | HIGH | CONFIRMED (part) | see D4. Mis-rated HIGH: cosmetic.
eng-front#2 | HIGH | UNDETERMINED | `bg-zinc-950` at [lead].tsx:107,:373 is real. But Spec 91 §6.1 (:262-275) locks `bg-zinc-950` as "Screen base" ("Deviating requires a spec update"), `dark:` appears 0 times in the file, and the descriptor records "hardcoded". Standard §1.3 and Spec 91 conflict app-wide. Settled by a decision on which governs (the 2026-04 file predates G1).
eng-front#3 | MED | REFUTED | the Neighbourhood rows ([lead].tsx:309,:319,:329) are two-cell label/value rows. RN flex items shrink; no overflow. Same reading question as eng-all-p4#2.
eng-shared#1 | HIGH | REFUTED | tests exist: leads-detail.infra.test.ts 400 (:232), 404 (:278), 500 (:345), non-uuid to NULL (:217). The coa test has 404 (:121), the uuid case (:135) and the witness catalog of columns (:259-300), which is the 42883 class.
eng-shared#2 | MED | CONFIRMED | see D5. Pre-existing.
eng-shared#3 | MED | UNDETERMINED | `avg_household_income`, `median_household_income`, `period_of_construction` and others are column names verbatim (types.ts:20+). But Spec 91 §4.3.1 (:206) lists exactly these names as the published contract the Expo app consumes. Settled by a decision on a contract rename (breaking the phone); pre-G1 (4ad00c44a).
eng-shared#4 | MED | DUP-G2 §5.5 | mobile tests run under jest. 57 of 58 files in mobile/__tests__ use plain `.test.ts` as the mobile convention. The proofs run; it is a name question.
eng-shared#5 | MED | DUPLICATE of eng-all-p6#2 | see D3.

3. CONFIRMED DEFECTS
D1. 44 px is not enforced on the three report renderers (eng-all-p3#4 known), and one real miss follows from it.
- src/components/report/ReportView.tsx:126 `<summary className="cursor-pointer text-sm text-gray-600">` has no min-h. It is a disclosure toggle, shown for the mobile and web targets (report-layout.json `details: collapsed`). The other controls in the three files carry min-h-11 or min-h-12.
- Standard §1.1 (line 15): "All interactive elements ... MUST have a minimum tappable area of 44px x 44px."
- The gap in the checks is known: descriptor binding_web_report :203 "No 44 px measure exists", task-384 card :81, REPORT.md:37. No new task is needed for the check itself.
- Smallest fix: ReportView.tsx:126 class `cursor-pointer text-sm text-gray-600` becomes `cursor-pointer py-3 text-sm text-gray-600`. That is one line.
- Owner: task-384 (it listed this file; ab40b8ecb). Size: line-size.
- Impact: small touch target on the "Details" toggle of the older renderer. The public web page is not live in 1·B (RR-0438), so it is seen in the admin preview and by any other ReportView user.
D2. Admin preview links have no 44 px target (eng-all-p3#1).
- src/app/admin/report-preview/page.tsx:48 (target nav links), :68 (state, target and scenario links), :70 (the "none" link). All are bare `<a>` at text-sm.
- Same §1.1 line 15. The standard has no admin exemption.
- Smallest fix: add `inline-flex min-h-11 min-w-11 items-center justify-center` to the three class lists (:48, :68, :70). The `states` link at :48 needs the same.
- Owner: task-332 touched the file last (d2cd0d5a2); the page came from MF-14. Size: line-size (3 lines).
- Impact: low. Admin-only synthetic preview behind requireAdminPage; HIGH is over-rated.
D3. No fast-check property test for the lead-detail unit conversion (eng-all-p6#2 and eng-shared#5).
- src/lib/leads/lead-detail-query.ts:189 `sqm * SQM_TO_SQFT` has only example tests (leads-detail.infra.test.ts:124-137, coa.infra :163). The only property file near it is report-sqft-rounding.property.test.ts, which covers the report projection, not this route.
- Standard §12.12 (line ~340): "distance/unit conversions ... MUST have at least one fast-check property test".
- Smallest fix: add src/tests/property/lead-detail-sqft.property.test.ts. For all non-negative finite sqm, the served sqft is within rounding of sqm x the pinned factor, never falls as sqm grows, and is null when sqm is null.
- Owner: task-411 (FIX.AREA-FACTOR). Size: line-size for the server. The mobile formatters (formatSqft, formatCurrencyAbbrev, formatServedSqft) have no property test either; mobile has no fast-check dependency. That half needs a decision.
- Impact: low. The factor is a pinned setting read in one place, and the example tests pin the product.
D4. `font-mono` on button text in the lead detail screen (eng-front#1, part).
- mobile/app/(app)/[lead].tsx:118 (`Feed` back button) and :145 (`← Back to Feed`).
- Standard §1.3: "`font-mono` ... must never be applied to ... button text." Spec 91 §6.2 (:282-284) licenses mono only for numbers, badge labels and "Section labels in sheets". It does not cover button text.
- Smallest fix: delete `font-mono` from the className at :118 and :145.
- Owner: none of the G1 tasks; the lines date from 2026-04 (blame 0a50f9d44). Size: line-size.
- The other 22 font-mono uses (:120, :227-:354 headings and labels) follow Spec 91 §6.2. That is the same §1.3 versus Spec 91 conflict as eng-front#2, and it needs a decision.
- Impact: cosmetic.
D5. The published lead-detail types live under the route directory, not src/lib (eng-shared#2).
- src/lib/leads/lead-detail-query.ts:14 imports from '@/app/api/leads/detail/[id]/types'. The file src/app/api/leads/detail/[id]/types.ts was created at 4ad00c44a.
- Standard §10.3 (line 230): "New API routes must define Request/Response TypeScript interfaces in a shared types file (`src/lib/[feature]/types.ts`), not inline in the route."
- The types are in a separate file, not inline. 11 src/lib files import from '@/app/api/' in total.
- Smallest fix: move the file to src/lib/leads/types.ts and repoint the route, the query and the mobile schema comment. Needs a decision, since the pattern is repo-wide and the move is bigger than one line. Owner: none of the G1 tasks; pre-existing.
- Impact: layering only. No behaviour.

Known and pinned, not new: the undocumented `!` at ReportPage.tsx:155 (see eng-all-p4#1).
Typed factories: DUP-G2 D4 in eng-all-p5#1, eng-all-p6#1 and eng-all-p7#2. The standard's own words are unmet in these files (§5.1 line 103). It is a conformity gap needing a decision, not a defect; see G2 D4.

4. LOW/NIT (recorded)
code-review: p1#2,#3,#4,#5; p2#3,#4,#5,#6,#7,#8; p3#3,#4,#5,#6,#7; p4#2,#3,#4,#5,#6; p5#4,#5,#6,#7,#8.
eng-all: p1#3,#4; p2#2,#3,#4; p3#6; p4#3,#4; p5#6,#7; p6#3,#4,#5; p7#3.
eng-front: #4,#5. eng-shared: #6,#7.
Total 45 recorded. I checked the ones that touch behaviour:
- code-review-p2#6: the CoA SQL selects `ca.last_seen_at::text AS updated_at` (query :301), so the field is not null.
- code-review-p3#3 and #7: the keys match, so no "undefined" text.
- eng-all-p6#5: 401 cases exist (leads-detail.infra.test.ts:264).
- eng-all-p6#4 is an undocumented `!` in a test file, outside the pin test's scope (G2 D6 class).
None is a mis-rated HIGH-class defect.

5. TOTALS (36 CRITICAL/HIGH/MED)
Confirmed 5 (D1 to D5; D1 is a known named residual plus one concrete miss, D4 is part of eng-front#1). Refuted 18. Refuted-by-ruling 0. Not-applicable 3. Duplicate 7 (five DUP-G2: eng-all-p4#1, p5#1, p6#1, p7#1, p7#2; plus eng-shared#4 DUP-G2 §5.5; plus eng-shared#5 of eng-all-p6#2). Undetermined 3 (eng-all-p2#1, eng-front#2, eng-shared#3).
Sum: 5 + 18 + 0 + 3 + 7 + 3 = 36.
Needs a decision: D5, the §1.3 versus Spec 91 conflict (eng-front#2 and the font-mono labels), eng-shared#3, eng-all-p2#1, and the mobile half of D3. Line-size: D1, D2, D3 (server half), D4.

6. UNVERIFIED
- I did not run the test suite, so I did not confirm which of the cited tests are green. Where a finding said a test would fail, I read the code and the committed data.
- How many callers of ReportView outside the admin preview and the web landing show the collapsed `<summary>` (D1) was not traced.
- Whether the committed mobile fixtures (parcelSearch.situations.json) are the exact ones the web test loads was assumed from the path in site-footer.ui.test.tsx:29.
- The `ast-grep` result covers only the silent-catch rule. I did not run the other rules or the commit hook.
- eng-all-p1#2: I read the test's header comment (admin-placements-seed.logic.test.ts:8-9) and its two JSON constants. I did not check that it also asserts the disclosure label.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/components/report/ReportView.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/src/app/admin/report-preview/page.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/leads/lead-detail-query.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/app/(app)/[lead].tsx
- /Users/brettpreston_macmini/Buildo-wt-board/src/app/api/leads/detail/[id]/types.ts
