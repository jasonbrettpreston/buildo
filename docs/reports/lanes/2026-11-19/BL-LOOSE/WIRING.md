# WIRING.md: BL-LOOSE, task-343, Increment 1.B wiring check (head 942f3f4dc, read-only, grep evidence)

Method: every row was read in the code of ~/Buildo-wt-loose. Lane reports were used only to learn what to look for.
Switches: MAXBLD_WEB_LIVE = false (src/lib/surfaces/maxbld-web.ts:19); customer report producer null until MB-44 (src/lib/parcels/report-page.ts:23-26).

## Common chain (mobile search flow)
index.tsx (mobile/app/(app)/parcel-tool/index.tsx:109 SurfaceRenderer, :26 useParcelSearch) -> mobile/src/hooks/useParcelLookup.ts:34 fetchWithAuth('/api/parcels/lookup') ->
src/app/api/parcels/lookup/route.ts:103 resolveAddress -> src/lib/admin/parcel-lookup.ts:246.
Lot map: disambiguate.tsx:15 (LotMapBinding import), :59 SurfaceRenderer. Semi page: semi-question.tsx:14,57. Report: [parcelId].tsx:13-36 (ReportPageHost, redirect to semi at :31).

## task-12 GAP.13 (3f0dcff10): WIRED
- content key search.tagline "Lot Intelligence": read mobile/src/components/surfaces/SearchBinding.tsx:62 and web SearchBinding.tsx:104 (index.tsx renders it).
- content key map.heading: read LotMapBinding.tsx:236 (disambiguate.tsx:59 renders it). Keys map.rail / map.badge retired, but styles S.rail/S.badge still exported: mobile/src/constants/lotMap.ts:18-19, no reader (grep) = dead style, hidden.
- scripts/surfaces/search-golden-capture.ts: no caller (grep of scripts, src, .husky, package.json finds only its own header, line 11) = manual regeneration tool, NOT called by hook/suite/station. Hidden.
- Both targets: tagline both; heading mobile only (web W5 lot map not built, doc-2 E.4, task-14 LS.11). A.11 Clear: dropped by operator RR-0281 (task-12 note), not a loose end.
- Unproven: C.6 road labels on device; mobile jest (not in hook); device.

## task-318 SRCH.ROUTE (cbf4ab954, 6b28aca47): WIRED (test only, no product code)
- src/tests/search-routing.logic.test.ts is the only change; the root test config includes src/**/*.test.ts (line 20) so the suite and the station run it.
- It proves server routing only; the client redirect to the semi page is read as text, its jest locks are not run (test header lines 9-12). Unproven: mobile jest.

## task-322 SRCH.DAYLIGHT (fdb6cd266): WIRED (mobile), web page behind switch
- Styles: mobile/src/constants/lotMap.ts, parcelSearch.ts used by LotMapBinding/SearchBinding (rendered by index.tsx, disambiguate.tsx, semi-question.tsx).
- Removed A.13/B.8/C.9: no remaining element keys in mobile/src/components/surfaces/*.tsx.
- Web SearchBinding restyle: reached from src/app/(maxbld)/parcel-tool/SearchPageClient.tsx:8,13; the page renders but runtime={{disabled: !MAXBLD_WEB_LIVE}} (SearchPageClient.tsx:17) so the search does nothing. WIRED-BEHIND MAXBLD_WEB_LIVE (task-287 LS.12) for the web half.
- Unproven: browser/device render of Daylight; token gaps decided in task-335.

## task-333 SRCH.FUZZY (2d9597374): WIRED, mobile path only
- parcel-lookup.ts:246 resolveAddress(opts.matchMistyped); caller src/app/api/parcels/lookup/route.ts:103 (consumer). Admin caller src/app/api/admin/parcels/lookup/route.ts:59 does NOT pass it (intended, test 09c0349ea).
- Matcher reads logic_variables key enrich_heritage_address_levenshtein_threshold: seed scripts/seeds/logic_variables.json:6656; normalize_address migrations/170_create_heritage_tables.sql:21. The result is resolution text_candidates, rendered by the existing candidate list B.1 (index.tsx).
- UNVERIFIED: SQL never run on a database (task-343 line 3).
- Web: consumer web search behind MAXBLD_WEB_LIVE.

## task-334 SRCH.METER (2557b83e7): WIRED-BEHIND MB-44, plus two NOT WIRED parts
- route.ts:152-170 meter branches; openReport called only at route.ts:167 (single production caller). It runs only when body.page !== null.
- page is null for every lot: report-page.ts:23-26 readCustomerPageResponse returns null (MB-44 tasks: task-285 L.7, task-123 1.3 W). Today openReport is never reached: the meter is built but counts nothing = WIRED-BEHIND the MB-44 producer.
- NOT WIRED: an unsure lot is metered 'semi_pending' (route.ts:162) and no caller counts it after the semi answer: the lookup hook sends only parcelId (mobile/src/hooks/useParcelLookup.ts:75-80; the semi answer travels as a route param, lotForm.ts:20), so the answered lot is still unsure on every later call. The route comment says "UNVERIFIED who counts the lot after it" (route.ts:156). Owner: task-319 stage 2 (WAITS).
- NOT WIRED: GET /api/parcels/entitlement (src/app/api/parcels/entitlement/route.ts; host-policy.ts:58): grep of src, mobile/src, mobile/app finds no reader. Owner: task-320 (LATER), task-340 (OPERATOR).

## task-336 + task-338 SRCH.LOTCARD (2b01c2237, 56e96eed5, faa6515fb, 270c35f00): WIRED (mobile)
- Reads: src/lib/parcels/lot-map.ts:26 CONSUMER_MAP_COLS (+primary_frontage_street_name, has_footprint) -> consumer-lookup.ts:232-234 -> contract types.ts:111-112 (frontageStreet, hasFootprint; declared) -> mobile schema schemas.ts:383-385 -> LotMapBinding.tsx:131 (fill), :170-181 (card lead line keys lot.lead.*). Rendered by disambiguate.tsx:59.
- Repair 338: contract fields declared; S-sbind pins 414->418.
- Draws a fill colour only (LotMapBinding.tsx:131); no footprint outline is drawn (task-343 line 5 "draft-37").
- scripts/analysis/lot-map-data-check.mjs: referenced only by src/tests/surfaces/search-follow-ups.logic.test.ts (dry-run SQL check); the live run is operator/rehearsal-stack only.
- Web: none (W5 not built, E.4).
- UNVERIFIED: data check covered one address; no device.

## task-69 1.4 PARSER (87ecc6e97, 29bac2f69): WIRED
- stripTrailingUnit, typedDirection, guardByDirection, conflictList in src/lib/admin/parcel-lookup.ts, all inside resolveAddress (parcel-lookup.ts:246), called by consumer route.ts:103 and admin route.ts:59. Join keys untouched.
- UNVERIFIED: live-DB direction tokens for Queen St E/W; unit forms Unit No., PH, Bsmt, Rear not stripped (UNIT_TAIL lists UNIT, APT, APARTMENT, SUITE, STE, #); mobile screen for the one-lot address list.

## task-332 SRCH.FOOTER (d2cd0d5a2, c168b4ef4): WIRED, report footer behind switch
- footerNode.ts exports used by StaticBinding.tsx:38,178 (static pages src/app/(maxbld)/parcel-tool/(static)/home|terms|privacy|help/page.tsx import StaticBinding), SearchBinding.tsx:25,138 (web search page, rendered but disabled), ReportPage.tsx:14,267, admin report preview src/app/admin/report-preview/page.tsx:12-13,50, maxbld-landing.ts:38 (sample report on landing).
- Live customer report page: src/app/(maxbld)/parcel-tool/[parcelId]/page.tsx:18 notFound() while MAXBLD_WEB_LIVE false; :21 throws if flipped. The report footer reaches users only through the landing sample and the admin preview: WIRED-BEHIND MAXBLD_WEB_LIVE (task-287) and MB-44 (task-123).
- G2 sources line pending (task-127 LATER).
- UNVERIFIED: browser render of any footer.

## task-321 SRCH.C12 (d20ddec5e, edc19e928): WIRED-BEHIND the support inbox setting
- LotMapBinding.tsx:96-111,229,231 helpLink(topic) -> action open_help -> SurfaceRenderer.tsx:128 -> disambiguate.tsx:51 / index.tsx:103 openHelp -> mobile/src/lib/maxbldHelp.ts:16 (opens /help#topic=..). Search page notice link SearchBinding.tsx:191. Topics lot_match/address_match exist: scripts/surfaces/_schema/static-page.json:33-34, web_help.content.json.
- The Help page mailto parts need logic_variables maxbld_support_inbox (src/lib/surfaces/maxbld-support.ts:13); empty until the RR-0299 database job (operator GO). WIRED-BEHIND that setting.
- Web twin link: web SearchBinding.tsx:222 exists, page disabled by MAXBLD_WEB_LIVE.
- UNVERIFIED: device; v8 names topic wrong-lot (Help page has the two built topics).

## task-319 SRCH.SEMI stage 1: records only (105d5c5cf); stage 2 WAITS. Not counted.

## Checks 1.B relies on
- scripts/hooks/check-task-files.mjs: wired .husky/commit-msg:6.
- lane-claims.mjs and backlog-status-check.mjs: no caller found in .husky, scripts, package.json (grep); no 1.B loose end depends on them.
