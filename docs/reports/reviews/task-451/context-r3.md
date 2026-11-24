# Review context for task-451 (no plan id) written 2026-11-24 by backlog-brief.mjs (round 3)

## Task
task-451 SEARCHFIX.3 Lot card: "Not available" for an implausible lot size, "at the back", "or report it", screen-reader labels, plain-page header links
status: RUNNING · milestone: m-1 · assignee: @lane-BL-SFX3 · labels: SEARCHFIX-PRIORITY

## Description
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 3 (FIX.LOT-CARD) with amendment A3; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the lot card shows "Not available" when the stored lot size is outside the plausible range (RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290), reads "at the back" for a lot with no fronting street, ends the no-lot line with "or report it", and its screen-reader label says what the card shows. The plain pages (help, terms) get their header links. The several-lots map stays as built: no neighbour lots (RR-0446, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302), and objective C.3's text is corrected by a dated note through the backlog CLI.

Findings folded: ST3/2c, V1, V2, V3 (with C.9), L2, L7, R3, X1, X6 (static-page half), R5, B.7 (map links), H Q2, H Q4; the wrong doc-2 status marks for C.7 and C.12 get dated notes.

Must not: draw neighbour lots, or add a new size setting (reuse LOT_SIZE_PLAUSIBLE_M2, src/lib/report-projection/project.ts:79).

Runs after SEARCHFIX.2 (both write scripts/surfaces/_schema/static-page.json). Dated note owed: task-336.

Files: src/lib/parcels/consumer-lookup.ts, mobile/src/components/surfaces/LotMapBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json, scripts/surfaces/_schema/static-page.json, src/components/surfaces/web/StaticBinding.tsx, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/static-web-binding.ui.test.tsx, src/tests/surfaces/lot-map-help-link.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, mobile/__tests__/lotMapPage.behaviour.test.tsx, mobile/__tests__/lotMapScreens.golden.test.ts, scripts/analysis/lot-map-data-check.mjs, src/tests/fixtures/surfaces/, mobile/__tests__/fixtures/surfaces/mobile_parcel_disambiguation_map.goldens.json, mobile/__tests__/fixtures/lotMap.situations.json, scripts/surfaces/parcel_product/F06/surfaces/web_help.content.json, scripts/surfaces/parcel_product/F06/surfaces/web_terms.content.json, scripts/surfaces/parcel_product/F06/surfaces/web_privacy.content.json, scripts/surfaces/parcel_product/F06/surfaces/web_maxbld_error.content.json, scripts/surfaces/_schema/census/mobile-product.json, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, src/tests/surfaces/search-follow-ups.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, .cursor/MCFRONTEND-QUEUE.md

## Acceptance criteria
- #1 A lot size outside the plausible range reads "Not available" on the card and in its screen-reader label
- #2 A lot with no fronting street reads "at the back"
- #3 The no-lot line ends "or report it" and links to the wrong-lot help topic
- #4 The screen-reader label contains the visible card text
- #5 The lot-map smoke test renders the four error states as errors
- #6 Objective C.3 carries a dated note: no neighbour lots

## Implementation Plan
Planner: Cairn-Plan-451
Plan id: PLAN-451-v1

Read-only. I ran no tests, hooks or generators and wrote no file. The only commands I ran were `backlog ... --help` and one `node -e` read of a fixture. Cites were read at board head 0841db559. The plan grounder re-read them at ddad097a8 (the commits since are records only). MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. "450" means task-450 as it stands in the working tree: its card is modified and not yet committed.

#### 1. Rules quoted first
- RR-0444, MD:2290: "(c) Add the "Not available - good catach". Ruled at MD:2291 (2c): "The lot card shows "Not available" for an implausible area".
- RR-0446, MD:2302: "04  leave it as it is". MD:2303: "the several-lots map stays as built (no neighbour lots); objective C.3's text is corrected".
- RR-0442, MD:2276: "It should open on an exact match and we have a different process for address mistakes". RR-0443 c, MD:2284: "they need to select from the available addresses that are close".
- RR-0445, MD:2296: "we are mobie first ... look back and follow". RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this".
- C.7 "at the back": MD:776 "'at the back' when it has none". Approved mock choose-lot.html:306 "{faces {street} | at the back}". doc-2:59.
- B.6 and B.7: doc-2:48 "Try a nearby address or report it." Mock choose-lot-states.html:277 has an inline `<a href="/help?topic=wrong-lot">report it</a>`.
- V3 (GROUNDER-H D1): the mock's cards and button carry no aria-label, so "the spoken name is the visible text".
- H Q2 (GROUNDER-QUESTIONS.md:75): help.html and terms-privacy.html:262 have the header "MaxBLD home → /; Log in → /login". H Q4 (:77): "a link home, as every v8 page has" (the not-found page).
- The size window: project.ts:79 LOT_SIZE_PLAUSIBLE_M2, which is 50 to 5,000 (report-projection-settings.logic.test.ts:58). ONE-13 a: seed :8197.
- Grounder records followed: GROUNDER-SEATS F :58 (the area fix); GROUNDER-F D11 (num('')) and D7 (T5); GROUNDER-G item 2 (L7); GROUNDER-C D2 (V1), D3 (V2), D4 a (R3); GROUNDER-D D6 (chain positions); GROUNDER-F :93 and GROUNDER-G :83 (X1, copy errorOf).

#### 2. What exists and is reused
- `LOT_SIZE_PLAUSIBLE_M2` (project.ts:79). src/lib/parcels/report-compute.ts already imports project.ts, so the parcels lib has a precedent. No import cycle: project.ts imports only JSON, format, pinned-settings and a type.
- `num` (consumer-lookup.ts:79-83) and `areaSqftM2Dot` (display-rules.ts:23).
- The card null value `lot.null` (content :9) through `fact()` (LotMapBinding.tsx:42).
- The lead keys lot.lead.* (content :5-8) and leadKey (LotMapBinding.tsx:179-181).
- resolveValue already resolves nested `{text, vars}` templates (SurfaceRenderer.tsx:89-91), so the label can embed the lead template.
- The `open_help` action (SurfaceRenderer.tsx:128-129) and helpUrl (maxbldHelp.ts:15).
- The `hero` kind's `wordmark` and `nav` roles (static-page.schema.json:381-397) and their link nodes (StaticBinding.tsx:196-197). The landing's nav.home and nav.sign_in keys are at web_landing.content.json:24 and :27.
- `errorOf` (lotMapScreens.golden.test.ts:33-36).
- Generators:
  - lotmap-golden-capture.ts --write, then emit-mobile-surfaces.mjs --write (header :9-11).
  - scripts/violations/generate-surface-registry.mjs for the census mirror and the two generated registry files (its flags are --check, --self-test and --emit-descriptors; it has no --write).
  - The web STATIC goldens: no committed writer. Use the same one-off in-memory buildGoldens call 450 uses (surface-goldens.ts:8-9). No tool is committed.

#### 3. The change, file by file, in build order
1. src/lib/parcels/consumer-lookup.ts:
   - :80 (L2, ruled at FOLD-PLAN.md:56). `if (v == null) return null;` becomes `if (v == null || v === '') return null;`. It is a defensive guard with no data case: lot_size_sqm is numeric and comp_count is integer, so no stored row holds '' (rc#3). The helper is shared, so a '' also reads null, not 0, at :110 (the headline `areas`), :146 (the comparable-build fields) and :166-170 (compCount, compBuildRatioP50, compFsiP50, neighbourhoodId); compCount is z.number().nullable() on the phone (mobile/src/lib/schemas.ts:336). Every reader of the shared num edit is pinned by the L2 test in section 4.
   - :227 (ST3). Old: `area: areaSqftM2Dot(l.lot_size_sqm)`. New: the same call only when `num(l.lot_size_sqm)` lies within LOT_SIZE_PLAUSIBLE_M2.min..max (inclusive, the same test as project.ts:267); otherwise null.
   - One import line and one comment citing RR-0444 2c. The comment must not hold the word select: consumer-parcel-lookup.infra.test.ts:145 refuses it, in any case, anywhere in this file. The headline `areas` code (:104-111) is not edited: no phone renderer reads it (GROUNDER-SEATS F); a '' value there now reads null through the shared num.
2. scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json:
   - :9 lot.null: "—" becomes "Not available". After step 3 it is the area's null value only.
   - :5-6 (V1): lot.lead.house becomes "Lot {letter} · has the house · at the back"; lot.lead.no_building becomes "Lot {letter} · no building · at the back".
   - :10 lot.label becomes "{lead}, {area}".
   - :13 select.label is deleted. After step 3 no state uses it, and the golden test at :102-104 fails on an unused key.
   - :17 unlinked.body ends "Try a nearby address or " (a trailing space is allowed: scripts/surfaces/parcel_product/F06/surfaces/web_landing.content.json:16, hero.title, ends with one and passes surface-validate). Two keys are added, ruled 8.1 b: "unlinked.report": "report it" and "unlinked.stop": ".", so the line ends with a full stop as doc-2 B.6 (:48) does. Net string count for this file: +1 (select.label goes, two keys come).
3. mobile/src/components/surfaces/LotMapBinding.tsx:
   - :97 helpLink takes the topic 'wrong-lot' (the type; the function is defined at :97). Its five calls change: :115 (lot_match), :234 (intersection), :236 (too many), :238 and :240 (address_match); all five go to wrong-lot, as doc-2 B.7 (:49) says under every notice.
   - :88-94 unlinkedNotice gains, after the body template, two nested `Text` nodes. The first has key 'unlinked-report' (lotMapProblems, lotMapScreens.golden.test.ts:60-67, refuses a child node without a key), testID parcel-lotmap-report, accessibilityRole 'link', onPress `{action:'open_help', topic:'wrong-lot', q: derived('query')}` and the child content('unlinked.report'); the second has key 'unlinked-stop' and the child content('unlinked.stop'). AlertDescription is the vendored RN Text (mobile/src/vendor/rnr/components/ui/alert.tsx:58-73), so a nested Text press is the native one.
   - :171-172: the frontage and zoning refs go.
   - :189 accessibilityLabel becomes `{text: content('lot.label'), vars: {lead: <the same title template as :193>, area}}`.
   - :204-208: the unreachable middle branch is deleted. Route non-null means selectedLetter is non-null (lotMap.ts:112-114; GROUNDER-E p1#2).
   - :217 accessibilityLabel becomes `label`.
   - Comments :173-175 and :96 are reworded. The `!` at :168 is untouched, so the pin of 2 holds.
4. scripts/surfaces/_schema/static-page.json (shared with 450; see section 6):
   - :2: the stale "has no mail link yet ... does not exist on the tip" sentence gets a dated prior-text-kept sentence (R5).
   - A first section `{kind:'hero', id:'top', parts:[{role:'wordmark', content:'nav.home', href:'/'}, {role:'nav', content:'nav.sign_in', href:'/login'}]}` is added to web_help.static (before :7), web_terms.static, web_privacy.static and both states of web_maxbld_error, error (before :536) and miss (before :583). Ruled 8.5: H Q4 (GROUNDER-QUESTIONS.md:77) asks for a link home as every v8 page has, and the error state is the same page's other state: it costs no string and gives the person a way out.
5. src/components/surfaces/web/StaticBinding.tsx:
   - heroNode (:184-226): a hero whose parts are only wordmark and nav returns the nav Group alone as `component:'header'`. Every other title-less hero still throws "a hero has a title".
   - :328: `landing` becomes "a hero with a title part", so the plain pages keep L.column.
   - No schema change, and no new kind or role.
6. ON THE FILES LINE (added by the plan grounder, round 1), needed for step 4 (the page throws on a missing key, StaticBinding.tsx:355). web_help, web_terms, web_privacy and web_maxbld_error .content.json each gain "nav.home": "MaxBLD" and "nav.sign_in": "Log in" (wording ruled in 8.3). That is +8 strings: the four files hold no nav. key today.
7. mobile_parcel_disambiguation_map.descriptor.json (R3), as dated prior-text-kept text. The descriptor file is byte-equal to its entry in scripts/surfaces/_schema/census/mobile-product.json (mobile_parcel_disambiguation_map, the source of record; surface-registry --check refuses a drift), so each edit below is made in the census entry and the descriptor is then rewritten from it by `node scripts/violations/generate-surface-registry.mjs --emit-descriptors`:
   - :5 and :239: the card is the lead line and the area; there is no frontage, zoning or faint neighbours.
   - :413: light map.
   - :447: no neighbours are drawn, per RR-0446; its quoted line "Try a nearby address." becomes "Try a nearby address or report it.".
   - Chain positions: :112 sources[1] becomes [4] (parcels), :151 [3] becomes [8] (link_parcel_addresses), :165 [4] becomes [15] (link_massing). :135 [2] (address_points) is already right (manifest.json:104-110).
   - :57 (the "older server ... falls back to the client derivation" sentence) is this card's, unconditionally (section 6): an absent resolution reads as no_match, as 450's Q19 deletes the client derivation.
   - Frontage and zoning stay in field_whitelist (:86-87). They are still sent; removing them is a contract change nobody named.
8. scripts/analysis/lot-map-data-check.mjs:28-36 (L7; the --parcels line is :33): parseArgs sets `o.error` when the value after --url or --parcels is missing or starts with "--". main() prints the usage and sets exitCode 2.
9. Regenerate in this order (the census-to-descriptor rewrite of step 7 comes first, since emit-mobile-surfaces reads the descriptor):
   - emit-mobile-surfaces --write;
   - lotmap-golden-capture --write;
   - emit --write again (this also writes mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json and mobile/__tests__/fixtures/surfaces/mobile_parcel_disambiguation_map.goldens.json, both on the Files line);
   - the one-off web golden call (web_help, web_terms, web_privacy static and web_maxbld_error error and miss);
   - node scripts/violations/generate-surface-registry.mjs with no flag (it rewrites docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md from the census), then with --check; the census, both generated files and the map's census text are on the Files line;
   - surface-validate --check before and after.
10. Test-side edits, on the Files line since the plan grounder's round 1, each needed because it pins the old behaviour:
   - src/tests/surfaces/search-follow-ups.logic.test.ts (task-456's file; edit by test title): LEADS :142-148 take the new tails; the test at :149-151 whose title says "at the back is not used" (RR-0289) is retitled, dropping the RR-0289 claim, and its assertion is replaced by the new lock of section 4 (AC2); :163 (Lot B key unchanged, text changed), plus the L7 red case beside :190.
   - surface-validate.logic.test.ts:91 and surface-conformance.logic.test.ts:261: 427 becomes 436 strings (after 450's 426 to 427; +8 nav strings and +1 on the map file), with a dated comment, measured before and after.
   - The web_maxbld_error error and miss goldens (src/tests/fixtures/surfaces/web_maxbld_error/, on the Files line).

#### 4. Tests first (red, then green)
AC1 / fold "ST3" and "L2":
- consumer-parcel-lookup.infra.test.ts, new "ST3: the map area is null outside LOT_SIZE_PLAUSIBLE_M2":
  - assembleLotMap with lot_size_sqm '123456789', 49 and 5001 gives area null. Red today.
  - 50 and 5000 are non-null. '283.5' still gives '3,052 sq ft · 284 m²' (the fixture is at :279, the assertion at :286).
  - A source check: consumer-lookup.ts imports LOT_SIZE_PLAUSIBLE_M2 and types no 50 or 5000.
- consumer-parcel-lookup.infra.test.ts, "L2" (a defensive guard with no data case, rc#3): assembleConsumerPayload of a row with lot_size_sqm '', comp_count '' and neighbourhood_id '' gives areas.lot_size_sqm null, compCount null and neighbourhoodId null (0 today); a '' headline column (:110) and a '' comparable-build field (:146) give null too. No existing test builds a '' row, so these are new red cases.
- lotMapScreens.golden.test.ts: LOT_MAP_SLICE.content['lot.null'] is 'Not available'. The lot_facts_null card's area child and its label's area var are {content:'lot.null'}. Red today ('—').
AC2 / fold "V1":
- lotMapPage.behaviour.test.tsx :90: getByText 'Lot B · no building · at the back' (multi_parcel_2). New: 'Lot A · has the house · at the back' on multi_parcel_3plus. Red today.
- Lot B of multi_parcel_2 has neither a street nor a footprint, so it reads 'no building · at the back' (risk 4).
- search-follow-ups.logic.test.ts: the old lock (no content value holds "at the back") is replaced by: lot.lead.house and lot.lead.no_building end ' · at the back'; lot.lead.house_faces, lot.lead.no_building_faces and lot.letter never contain it. Red today.
AC3 / fold "V2":
- lotMapScreens: the unlinked golden's AlertDescription holds the two nested Texts: parcel-lotmap-report with onPress open_help wrong-lot, and the stop. The pin at :204 (the group "the ruled message texts are verbatim", :201-205) becomes the new body 'We found {address}, but the City's data doesn't link it to a lot yet. Try a nearby address or ', with a second pin of unlinked.report ('report it') and unlinked.stop ('.') and a comment citing doc-2 B.6 (:48) as the ruling source.
- lotMapPage.behaviour: the unlinked text reads "...Try a nearby address or report it." (body, link, stop). Pressing parcel-lotmap-report opens `https://maxbld.ca/help#topic=wrong-lot&q=12%20Laneway%20Rear`. :189 becomes topic=wrong-lot.
- lot-map-help-link.logic.test.ts: openHelp('wrong-lot') at :85 and :100. New: the map's topic is a web_help mailto topic in static-page.json (needs 450's part). Header comments :9 and :40-41 are dated.
AC4 / fold "V3, C.9":
- lotMapPage.behaviour :92-93 (:93 is Lot B's label, now 'Lot B · no building · at the back, 2,153 sq ft · 200 m²'): Lot A's label is 'Lot A · has the house · faces Dunmore Lane, 3,052 sq ft · 284 m²', and each label contains no "frontage" or "zoning".
- Continue's accessibilityLabel resolves to its visible text: 'Choose a lot', then 'Continue with Lot B' after a tap (:118).
AC5 / fold "X1":
- lotMapPage.behaviour :68-74: the four error inputs pass errorOf(i.error, k) and schemaDrift. Expected testIDs: error gives parcel-lotmap-error plus retry; rate_limited gives parcel-lotmap-ratelimit; unauthorized gives parcel-lotmap-entitlement; schema_drift gives parcel-lotmap-error with no retry. Red today: each renders the redirect tree.
Fold "H Q2, H Q4":
- static-web-binding.ui.test.tsx, new (e): web_help, web_terms, web_privacy and web_maxbld_error (both states, error and miss) SSR a `<header>` with links / "MaxBLD" and /login "Log in", and keep the narrow column. Red today.
- RED plant: a title-less hero with a tagline still throws.
- static-page.logic.test.ts T4 (:143-155): the per-href block (:149-153) asserts internal equals /parcel-tool plus the href and a page under the (static) mount, which fails for '/' (internal /parcel-tool/home) and '/login' (internal /parcel-tool/login, a page outside (static)). It is rewritten: the footer set ['/help', '/privacy', '/terms'] keeps the strict check; the header set ['/', '/login'] is checked as public host rows whose internal page exists (the pageExists of web-landing.logic.test.ts:267-270 and :278); both lists are pinned exactly so a stray link still fails.
Fold "X6 static half": T5 (:158) matches `require-parcel-tool-page|requireParcelToolPage\s*\(` over the comment-stripped whole text. RED: a wrapped three-line import and a bare call are caught; a comment-only mention is not.
Fold "L7": parseArgs(['--parcels','--url','x']).error and parseArgs(['--url']).error are set; parseArgs(['--parcels','1,2']).error is undefined.
Index shifts, not new tests: every `web_help.static.sections[0]`/`[1]` becomes [1]/[2] in static-page.logic.test.ts:55-68 and static-web-binding.ui.test.tsx (c) and (d).
Fold "R3": surface-validate --check and the generator --check modes.

#### 5. Limits, and what could fail or surprise
Limits:
- No neighbour lots (RR-0446). No new setting. lotMap.ts is not touched (its :103 isFetching gate is outside the card).
- The headline `areas`, the contract's frontage and zoning, the old help topics address_match and lot_match (choice 8.4), and the search links (450) are all unchanged.
- Nothing is planned on the lead-detail page or the old permit route.
Risks:
1. consumer-lookup now loads project.ts, which reads report-page.json, the decl, presentation and the seed at import. The lookup route already loads it (route.ts:52 imports lookup-flow.ts, :16 imports report-compute.ts, :20 imports project.ts), so a fault there already breaks the route and this import adds no new failure. consumer-parcel-lookup.infra.test.ts imports the module and detects it.
2. The inline link is a nested Text under AlertDescription. It is not a C-9m touch target, so it is under 44 px; WCAG 2.5.8 exempts inline links. AlertDescription is the vendored RN Text (mobile/src/vendor/rnr/components/ui/alert.tsx:58-73) and the renderer passes onPress to any component (SurfaceRenderer.tsx:148-160), so the press is the native nested-Text press; the behaviour press test checks the node and a device tap is checked once before close. If it did not fire, the person still has the button under the notice (Get help with an address, the same wrong-lot topic, doc-2 B.7), so the no-lot state is never a dead end.
3. The trailing space in "or " is allowed: web_landing.content.json:16 (hero.title) ends with one and passes surface-validate today, and a one-character value exists (lot.null is a dash today), so unlinked.stop "." is allowed too. No fallback is owed.
4. The lead keys keep their names but now say "at the back". The server always sends hasFootprint as a boolean (consumer-lookup.ts:234), so every current lot takes a lead key and only an older cached payload without the field reads lot.letter. A lot with neither a street nor a footprint therefore reads "no building · at the back": on the local test stack 56 lots on 29 multi-lot addresses are such (of 2,347 lots on 1,166 addresses; 444 lots in all have no street). Ruled, not asked: MD:776 says "at the back" when the lot has no street.
5. Every map golden fingerprint moves, as do the four STATIC web goldens. The S-screen golden count is unchanged.
6. A 429 shows no Retry on the map today, whatever the wait: the Retry button is built only inside the unexpected block (LotMapBinding.tsx:74-83), and the page keeps its Back to search button (:55) in every state. After 450's L3 change a 429 of 0 is one rate_limited message, as FOLD-PLAN.md:44 orders. X1 asserts the notice only.
7. The size window blanks real lots as well as placeholders. On the local test stack 19,439 of 496,536 lots (3.9%) have no size or one outside 50 to 5,000 m² (8,137 under 50, 11,295 over 5,000, 7 none); the 19,432 and the window were put to the operator (GROUNDER-SEATS.md:122) and he answered "Not available" (MD:2290-2291), so the rate is settled by his words. On the 1,166 multi-lot addresses 659 of 2,347 lots (28%) are outside the window or have no size (642 over 5,000 m², 13 under 50, 4 none), so about one card in four on a several-lots map reads "Not available". The figures in the comment above project.ts:79 (4,297 and 1,923) are older than the stack's. Not re-asked; no new setting (Must not).

#### 6. Who owns which hunk (450 runs first; re-read at the merge, edit by anchor text, not line)
- static-page.json:
  - 450 owns the "wrong-lot" mailto part after :30, the schema enum and help.mailto.wrong_lot.
  - 451 owns $comment :2, the four header sections and the nav.* keys.
  - Both touch web_help.content.json, on different lines.
- Descriptor :57 (the "older server ... falls back to the client derivation" line) is this card's, unconditionally: 450's final plan edits no line of the map descriptor (its steps 10 and 11 are the search and semi descriptors), and 450's grounder ruled it task-451's file (docs/reports/reviews/task-450/GROUNDER-PLAN.md, rg#2). Step 7 rewords it: an absent resolution reads as no_match. Re-read 450's diff at the merge.
- classifyParcelSearchError and deriveMatchType (used by lotMap.ts:87-88) belong to 450 (L3, Q19). 451 edits neither.
- The string count pins: 450 moves 426 to 427, and 451 moves 427 to 436 (+8 nav strings, +1 on the map file: ruled 8.1 b); measure with surface-validate --check before and after. 450's search descriptor needs the same census route (the census, not the descriptor, is the source: step 7), so both cards edit different entries of scripts/surfaces/_schema/census/mobile-product.json and regenerate the same two registry files: whoever lands second re-runs the generator.
- static-page.logic.test.ts: 450 owns T8 (:229-236); 451 owns T1, T4, T5. static-web-binding.ui.test.tsx: 451 owns it, apart from 450's optional TOPICS line.
- search-follow-ups.logic.test.ts belongs to task-456, which runs later, so 451 edits by test title.

#### 7. Dated notes and card notes owed (backlog CLI at node_modules/.bin/backlog, never a hand edit)
- doc-2, through `backlog doc update doc-2 --content` (it replaces the whole body; prior text kept):
  - C.3 (:55): no neighbour lots, RR-0446 MD:2303.
  - C.7 (:59): built, with "at the back" by this card.
  - C.12 (:64): built (LotMapBinding.tsx:115).
  - B.6 and B.7 (:48-49): "report it" and wrong-lot.
  - C.9 (:61): the label no longer reads the facts; frontage and zoning are still sent (field_whitelist) but no longer shown or spoken.
- task-336: `backlog task edit 336 --append-notes` with ST3, V1, V3 and L7 closed. Read the task's notes first and append only if no note with that title is there (append-notes has no dedup key, so a second run would add the note twice); build the doc-2 body from a fresh read at write time, not from a copy taken earlier.
- .cursor/MCFRONTEND-QUEUE.md (a repo file, committed with the work as the SRCH.LOTCARD note was in 2b01c2237): one appended dated note on the MF-53 row, prior text kept, after :417: the lane note at :415 ("at the back" is not data and is not used) is superseded by FOLD-PLAN.md:57 and doc-2 C.7, and the :417 reason for the address_match topic ends because wrong-lot exists after 450. The superseding note task-450 left to this card.
- task-451: --plan, the acceptance checks, and --append-notes with the evidence and any 8.x answers as verbatim dated rows.

#### 8. Open choices (ruled by the plan grounder, round 1; the rulings are in docs/reports/reviews/task-451/QUESTIONS-RULED.md)
8.1 V2 link shape:
- (a) An inline link with the body ending "or" and no full stop. This matches AC3's literal "ends "or report it"". +1 key.
- (b) The same with a "." key. Matches doc-2:48 and the mock exactly. +2 keys.
- (c) A text-only line, with the existing link below. GROUNDER-C D3 asked for "one-line operator confirmation of the link shape".
- Recommend (a).
Ruled (b) for 8.1, by the plan grounder: doc-2 B.6 (:48) is "Try a nearby address or report it." with a full stop and B.7 (:49) puts "report it" inside the no-lot message, so the link shape is the operator's own approved text and needs no question; a body ending "or" with no stop is a surprise. Keys: unlinked.report and unlinked.stop.
8.2 V1 keys:
- (a) Reword the two existing lead keys. No new key; the count holds.
- (b) Two new *_back keys. The old keys would then be unused and the golden test at :102 fails, so they would have to be deleted.
- Recommend (a).
Ruled (a) for 8.2: FOLD-PLAN.md:57 says a lot with no fronting street reads "at the back"; the faces keys (content :7-8, chosen at LotMapBinding.tsx:179-181) are untouched, so a lot that fronts a street keeps "faces {street}".
8.3 Header sign-in word: "Log in" (help.html:319, terms-privacy.html:262) or "Sign in" (the landing's nav.sign_in). Recommend "Log in", the approved mocks' word. Ruled: "Log in" (H Q2 was answered from the approved mocks, GROUNDER-QUESTIONS.md:75; the landing keeps its own approved word).
8.4 Old Help topics address_match and lot_match:
- Keep them: minimal, but the help page then lists three overlapping topics.
- Or remove them: FOLD-PLAN.md:48 says "stay until 3 moves the map links", but no line orders removal, and the mock lists "General · Wrong address or lot · Billing".
- Ruled keep: FOLD-PLAN.md:48 says the old topics stay until this card moves the map links and orders no removal; removing two Help topics is a change no card or ruling names (RR-0392). Piled for a later card.
8.5 Header on the error state of web_maxbld_error too, not only on the not-found (miss) state. H Q4 names not-found only. Ruled: both states (plan-ux#3). H Q4 (GROUNDER-QUESTIONS.md:77) says a link home as every v8 page has; the error state is the same page's other state and costs no string.
8.6 A Spec 100 §3.2 dated note saying that map.lots[].area is null outside the window. Not named on the card. Recommend the descriptor text only (RR-0392). Ruled: the descriptor text only.

#### 9. UNVERIFIED
- Nothing was run: no tests, no generators, no device, no Next build.
- Settled by reading in round 1: the trailing space (web_landing.content.json:16), the --write flag (none; the flags are --check, --self-test and --emit-descriptors) and descriptor :57 (this card's, section 6). Still UNVERIFIED: that a nested Text onPress fires on a device (read as native; the jest press test and the button under the notice cover it).
- Settled by reading in round 1: the host table maps /login (host-policy.ts:43) and / (:50) to public rows, and the pages exist (src/app/(maxbld)/parcel-tool/login/page.tsx and the (static) home page).
- Descriptor :57 is this card's whatever 450 does (section 6); re-read 450's diff at the merge.
- The 5000 m² boundary output text depends on floating rounding, so the test asserts non-null only.

#### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/parcels/consumer-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/LotMapBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/_schema/static-page.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/components/surfaces/web/StaticBinding.tsx

Plan review round 1: 23 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder docs/reports/reviews/task-451/GROUNDER-PLAN.md; triage docs/reports/reviews/task-451/TRIAGE-PLAN.md
plan-error-paths#2 MED folded Every reader of the 
plan-error-paths#5 MED folded append-notes has no 
plan-plan-review-deepseek#9 MED folded emit-descriptors; it
plan-ux#2 MED folded Two keys are added, 
plan-ux#3 MED folded both states of web_m
in#1 MED folded the descriptor is th
rc#1 MED folded 56 lots on 29 multi-
rc#2 MED folded about one card in fo
rg#1 MED folded retitled, dropping t
rg#2 MED folded No existing test bui
rg#3 MED folded both lists are pinne
rg#6 MED folded this card's, uncondi

## Implementation Notes
2026-11-24 taken on the board at lane launch (lane BL-SFX3, worktree /Users/brettpreston_macmini/Buildo-wt-sfx3, branch wf2/inc1b-sfx3), RR-0240

2026-11-24 build started (lane BL-SFX3): tests first per plan section 4; red is the refused commit attempt with only the test and task files staged (RR-0225). Mobile jest tests (lotMapPage.behaviour, lotMapScreens.golden) are not reached by the pre-commit related run (src/ and scripts/ only): their red and green are UNVERIFIED until the push station, as for task-450.

2026-11-24 deviation (lane BL-SFX3): mobile/__tests__/fixtures/lotMap.situations.json is added to the Files line (precedent task-450, which added the paths its generators needed). Reason: once the card label and the zoning line no longer read lot.null, no committed golden used the key, and surface-validate refused "SV-SBIND mobile_parcel_disambiguation_map: orphan content key lot.null" (the golden test lotMapScreens "every content key is used by a committed golden" holds the same rule). The fixture lot C of multi_parcel_3plus and multi_parcel_3plus_none (the lot whose response lacks the footprint and street fields) now has area null, so the multi_parcel_3plus golden shows the area null value "Not available" (AC1). No other fixture value changed.

2026-11-24 build (lane BL-SFX3), plan PLAN-451-v1 sections 3 and 4 followed. Red: the commit attempt with only the test and task files staged was refused, Test Files 7 failed, Tests 22 failed | 199 passed (lane red.out). Changes: consumer-lookup.ts num('') null (L2) and the map area null outside LOT_SIZE_PLAUSIBLE_M2 (ST3); map content lot.null Not available, the two no-street leads end at the back (V1, ruling 8.2 a), lot.label {lead}, {area}, select.label retired, unlinked.body ends 'or ' with unlinked.report and unlinked.stop (V2, ruling 8.1 b); LotMapBinding: inline report-it link (it reuses the existing link text class L.helpLinkText so it reads as a link), every help link topic wrong-lot (B.7), card label = lead + area, Continue label = its visible text, unreachable select.label branch deleted (V3); static-page.json header hero on web_help, web_terms, web_privacy and both web_maxbld_error states (H Q2, H Q4, ruling 8.5) and the R5 dated sentence; StaticBinding draws a wordmark-and-nav-only hero as the header and keeps the narrow column; nav.home MaxBLD and nav.sign_in Log in in the four content files (ruling 8.3); lot-map-data-check parseArgs error (L7); census entry and descriptor dated text and chain positions sources[4], [8], [15] (R3); doc-2 dated notes C.3 (AC6), C.7, C.12, B.6/B.7, C.9; MF-53 queue dated note. surface-validate --check 427 strings before, 436 after. Generators: emit-mobile-surfaces --write, lotmap-golden-capture --write (11), emit again, buildGoldens one-off (70 goldens, 5 rewritten), generate-surface-registry then --check clean. Mobile jest (lotMapPage.behaviour, lotMapScreens.golden): red and green UNVERIFIED until the push station; an in-memory tsx probe of the binding gave the expected card text, labels, the unlinked line, the four error notices and the single help topic wrong-lot (lane probe.out).

2026-11-24 deviation (lane BL-SFX3): static-web-binding.ui.test.tsx (c) also indexes the web_maxbld_error error page's prose (children[0] -> [1]); the plan's index-shift list named web_help only. Found by the green commit's related run (1 failed), fixed in the same work commit.

2026-11-24 work commit 04c181564 (hooks: GATE OK, POLICY CHECKS OK; pre-commit related run Test Files 17 passed | 1 skipped (18), Tests 419 passed | 7 skipped (426); lane green.out). The doc-2 dated notes (AC6 C.3, C.7, C.12, B.6/B.7, C.9) and the regenerated docs/reports/generated/rule-lists-by-kind.md (doc-2 grew) land in their own commit: check-task-files refuses a path outside the Files line beside code, and neither path is code.

## References
- docs/reports/reviews/task-451/GROUNDER-PLAN.md
- docs/reports/reviews/task-451/TRIAGE-PLAN.md
- docs/reports/reviews/task-451/seat-integration-1.md
- docs/reports/reviews/task-451/seat-reality-check-1.md
- docs/reports/reviews/task-451/seat-regression-1.md
- compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
- compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
- compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
- compliance:step-132 docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:orchestrator-doc17 backlog/docs/doc-17 - Orchestrator-readings-not-rulings.md
- compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
- RR-0406 McFixReborn label on the tasks that process covers
- RR-0407 next push as soon as possible; does not wait for task-442
- RR-0408 McFixReborn in merged groups by shared files; map validated before anything proceeds
- RR-0409 McFixReborn map: the three hand-written schema files are reviewed; a plan is needed for the oversized files
- RR-0410 McFixReborn map: the script with no rule-list row is not reviewed
- RR-0411 McFixReborn label stays on task 349; merged groups move forward
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows
- RR-0414 task 442 re-makes only its three changed lists; five McFixReborn map decisions
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0415 McFixReborn group reviews outside a lane: liked, to be grounded; tasks 442 and 367 to be running
- RR-0416 Operator pre-approves removing lane work folders to free disk space
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions
- RR-0418 Rule lists per task are cut down by turning lists off in the table
- RR-0419 The rule-list table edit is approved as one task
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward
- RR-0424 Task 448 also corrects the close check's refusal-message sentence
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0425 Push order: 442 and 367 first, task 448 later
- RR-0426 Task 448: stale launch-script comment fixed; by-law pre-registrations unchanged
- RR-0427 DONE record moves for the pushed tasks, as one batch
- RR-0428 The seven pushed tasks stay BUILT; no review for the DONE word
- RR-0429 Dated notes are kept short
- RR-0430 The six unlabelled running tasks join McFixReborn
- RR-0431 McFixReborn: each set of files reviewed once, output only
- RR-0432 McFixReborn: fold the six first; progress in the orchestrator's table
- RR-0433 The six fold as they are; the group review is their one output review
- RR-0434 McFixReborn proceeds as per the status table
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0435 The orchestrator may do the merge edits and the test fix for the six
- RR-0436 Option 1 confirmed for the remaining folds
- RR-0437 Task 388 left out of the folds; nine paperwork notes approved
- RR-0438 Task 349 D3: the public web report page is wired at launch
- RR-0439 McFixReborn review calls: 120,000 characters; each list reads only its own files
- RR-0440 plan to drop the planning and process lists from reviews
- RR-0441 McFixReborn reading seats: reality check and integration run, code review dropped
- RR-0442 the search opens a lot on an exact match — "It should open on an exact match and we have a different process for address mistakes, if the lot is shared by two parcels - you need to pick one - if its a semi potentially - you need to state that?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276)
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0444 fold the McFixReborn findings — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task — "04  leave it as it is 02 Agrred add to the plan." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles
- RR-0452 tooling plan approved; the three questions are not added
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work
- RR-0149 Increment 1·A tooling location
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped (names RR-0387) — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0442 the search opens a lot on an exact match (names RR-0442) — "It should open on an exact match and we have a different process for address mistakes, if the lot is shared by two parcels - you need to pick one - if its a semi potentially - you need to state that?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276)
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses (names RR-0443) — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0444 fold the McFixReborn findings (names RR-0444) — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process (names RR-0445) — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task (names RR-0446) — "04  leave it as it is 02 Agrred add to the plan." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks (names RR-0447) — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks (names RR-0448) — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)

## Prior reviews and lane reports
### task-451 (this task)
- docs/reports/reviews/task-451/FINDINGS-PLAN.md
- docs/reports/reviews/task-451/FOLD-CHECK.md
- docs/reports/reviews/task-451/GROUNDER-PLAN.md
- docs/reports/reviews/task-451/QUESTIONS-RULED.md
- docs/reports/reviews/task-451/TRIAGE-PLAN.md
- docs/reports/reviews/task-451/seat-integration-1.md
- docs/reports/reviews/task-451/seat-reality-check-1.md
- docs/reports/reviews/task-451/seat-regression-1.md
### task-450 (dependency)
- docs/reports/reviews/task-450/FINDINGS-PLAN.md
- docs/reports/reviews/task-450/FOLD-CHECK.md
- docs/reports/reviews/task-450/GROUNDER-PLAN.md
- docs/reports/reviews/task-450/QUESTIONS-RULED.md
- docs/reports/reviews/task-450/TRIAGE-PLAN.md
- docs/reports/reviews/task-450/seat-integration-1.md
- docs/reports/reviews/task-450/seat-reality-check-1.md
- docs/reports/reviews/task-450/seat-regression-1.md
- docs/reports/lanes/2026-11-24/BL-SFX2/REPORT.md (lane report naming task-450)

## Dependencies
- task-450 SEARCHFIX.2 Search page: a street with no number asks for a house number; no-match flicker, strict lot-form check, typed "3", double retry message and the wrong-lot help topic corrected · status: BUILT
  final summary: Landed in ee3634771 (work, through the real hooks): the six search page fixes of task-450: (1) a street typed with no house number shows the refine line 'Add a house number to narrow it down.' and keeps the candidate list (ruled B); (2) a settled miss fetched again keeps the no-match line; (3) the lot form parses one extra field, the closed enums stay; (4) the minimum-length copy is filled from config.min_query_len on phone and web, not a typed 3; (5) the semi page opened cold and offline shows loading and does not redirect before the lookup settles; (6) the help page has the topic wrong-lot ('Wrong address or lot') and both search links point at it. Also L3 (a retry-after of 0 shows one message, MF35-DF1 closed), Q19 (client shim deleted), Q8, R2, R4, R5. The Spec 99 section 6.5 dated note is in ee3634771 and the task-319 dated note in 3f4f616fe. The census scripts/surfaces/_schema/census/mobile-product.json and three generated pages (127-surface-registry.md, 127-surface-review-queue.md, rule-lists-by-kind.md) were added to the Files line because the hooks regenerate them from this change. NOT PROVEN BY THE COMMIT HOOK: the mobile jest tests (red and green for AC1, AC2, AC3, AC4, AC5) are not reached by the pre-commit related run; they are owed at the push station, and the task is not complete until they pass there (operator rule: a task is not complete until it actually works). The push station also owes the full suite and the fold with sfx1 and sfx5 (regenerate the three generated pages, re-run surface-validate --check, re-check the 426 to 427 count locks). One later sweep for the 14 piled LOW ids: out-code-review-p1#1, out-code-review-p1#2, out-code-review-p2#3, out-compliance-inc-S-p1#2, out-compliance-mobile-90-p1#4, out-compliance-mobile-98-p1#3, out-compliance-mobile-99-p3#3, out-compliance-plan-protocol-p1#3, out-compliance-plan-protocol-p1#5, out-compliance-step-132-p2#4, out-compliance-surface-136-p1#1, out-compliance-surface-136-p3#3, out-error-paths-p1#1, out-ux-p1#7 (TRIAGE.md).

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 14 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX2/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX2/TRIAGE.md
