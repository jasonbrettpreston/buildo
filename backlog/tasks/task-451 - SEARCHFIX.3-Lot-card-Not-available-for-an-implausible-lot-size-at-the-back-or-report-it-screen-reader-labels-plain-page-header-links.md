---
id: TASK-451
title: >-
  SEARCHFIX.3 Lot card: "Not available" for an implausible lot size, "at the
  back", "or report it", screen-reader labels, plain-page header links
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-24T15:36:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies:
  - TASK-450
type: fix
ordinal: 150040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 3 (FIX.LOT-CARD) with amendment A3; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the lot card shows "Not available" when the stored lot size is outside the plausible range (RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290), reads "at the back" for a lot with no fronting street, ends the no-lot line with "or report it", and its screen-reader label says what the card shows. The plain pages (help, terms) get their header links. The several-lots map stays as built: no neighbour lots (RR-0446, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302), and objective C.3's text is corrected by a dated note through the backlog CLI.

Findings folded: ST3/2c, V1, V2, V3 (with C.9), L2, L7, R3, X1, X6 (static-page half), R5, B.7 (map links), H Q2, H Q4; the wrong doc-2 status marks for C.7 and C.12 get dated notes.

Must not: draw neighbour lots, or add a new size setting (reuse LOT_SIZE_PLAUSIBLE_M2, src/lib/report-projection/project.ts:79).

Runs after SEARCHFIX.2 (both write scripts/surfaces/_schema/static-page.json). Dated note owed: task-336.

Files: src/lib/parcels/consumer-lookup.ts, mobile/src/components/surfaces/LotMapBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json, scripts/surfaces/_schema/static-page.json, src/components/surfaces/web/StaticBinding.tsx, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/static-web-binding.ui.test.tsx, src/tests/surfaces/lot-map-help-link.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, mobile/__tests__/lotMapPage.behaviour.test.tsx, mobile/__tests__/lotMapScreens.golden.test.ts, scripts/analysis/lot-map-data-check.mjs, src/tests/fixtures/surfaces/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A lot size outside the plausible range reads "Not available" on the card and in its screen-reader label
- [ ] #2 A lot with no fronting street reads "at the back"
- [ ] #3 The no-lot line ends "or report it" and links to the wrong-lot help topic
- [ ] #4 The screen-reader label contains the visible card text
- [ ] #5 The lot-map smoke test renders the four error states as errors
- [ ] #6 Objective C.3 carries a dated note: no neighbour lots
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Planner: Cairn-Plan-451
Plan id: PLAN-451-v1

Read-only. I ran no tests, hooks or generators and wrote no file. The only commands I ran were `backlog ... --help` and one `node -e` read of a fixture. Cites were read at board head 0841db559. MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. "450" means task-450 as it stands in the working tree: its card is modified and not yet committed.

## 1. Rules quoted first
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

## 2. What exists and is reused
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
  - generate-surface-registry.mjs for the census.
  - The web STATIC goldens: no committed writer. Use the same one-off in-memory buildGoldens call 450 uses (surface-goldens.ts:8-9). No tool is committed.

## 3. The change, file by file, in build order
1. src/lib/parcels/consumer-lookup.ts:
   - :81 (L2). `if (v == null) return null;` becomes `if (v == null || v === '') return null;`.
   - :227 (ST3). Old: `area: areaSqftM2Dot(l.lot_size_sqm)`. New: the same call only when `num(l.lot_size_sqm)` lies within LOT_SIZE_PLAUSIBLE_M2.min..max (inclusive, the same test as project.ts:267); otherwise null.
   - One import line and one comment citing RR-0444 2c. The headline `areas` (:104-111) is not touched: no phone renderer reads it (GROUNDER-SEATS F).
2. scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json:
   - :9 lot.null: "—" becomes "Not available". After step 3 it is the area's null value only.
   - :5-6 (V1): lot.lead.house becomes "Lot {letter} · has the house · at the back"; lot.lead.no_building becomes "Lot {letter} · no building · at the back".
   - :10 lot.label becomes "{lead}, {area}".
   - :13 select.label is deleted. After step 3 no state uses it, and the golden test at :102-104 fails on an unused key.
   - :17 unlinked.body ends "Try a nearby address or ". One key is added: "unlinked.report": "report it". Net string count for this file: 0.
3. mobile/src/components/surfaces/LotMapBinding.tsx:
   - :97 helpLink takes the topic 'wrong-lot'. The six calls change: :115, :234, :236, :238, :240.
   - :88-94 unlinkedNotice gains a nested `Text` (testID parcel-lotmap-report, accessibilityRole 'link', onPress `{action:'open_help', topic:'wrong-lot', q: derived('query')}`, child content('unlinked.report')) after the body template.
   - :171-172: the frontage and zoning refs go.
   - :189 accessibilityLabel becomes `{text: content('lot.label'), vars: {lead: <the same title template as :193>, area}}`.
   - :204-208: the unreachable middle branch is deleted. Route non-null means selectedLetter is non-null (lotMap.ts:112-114; GROUNDER-E p1#2).
   - :217 accessibilityLabel becomes `label`.
   - Comments :173-175 and :96 are reworded. The `!` at :168 is untouched, so the pin of 2 holds.
4. scripts/surfaces/_schema/static-page.json (shared with 450; see section 6):
   - :2: the stale "has no mail link yet ... does not exist on the tip" sentence gets a dated prior-text-kept sentence (R5).
   - A first section `{kind:'hero', id:'top', parts:[{role:'wordmark', content:'nav.home', href:'/'}, {role:'nav', content:'nav.sign_in', href:'/login'}]}` is added to web_help.static (before :7), web_terms.static, web_privacy.static and web_maxbld_error.miss (before :583).
5. src/components/surfaces/web/StaticBinding.tsx:
   - heroNode (:184-226): a hero whose parts are only wordmark and nav returns the nav Group alone as `component:'header'`. Every other title-less hero still throws "a hero has a title".
   - :328: `landing` becomes "a hero with a title part", so the plain pages keep L.column.
   - No schema change, and no new kind or role.
6. OUTSIDE FILES LINE, needed for step 4 (the page throws on a missing key, StaticBinding.tsx:355). web_help, web_terms, web_privacy and web_maxbld_error .content.json each gain "nav.home": "MaxBLD" and "nav.sign_in": "Log in" (wording: choice 8.3). That is +8 strings.
7. mobile_parcel_disambiguation_map.descriptor.json (R3), as dated prior-text-kept text:
   - :5 and :239: the card is the lead line and the area; there is no frontage, zoning or faint neighbours.
   - :413: light map.
   - :447: no neighbours are drawn, per RR-0446.
   - Chain positions: :112 sources[1] becomes [4] (parcels), :151 [3] becomes [8] (link_parcel_addresses), :165 [4] becomes [15] (link_massing). :135 [2] (address_points) is already right (manifest.json:104-110).
   - :57 only if 450's final plan does not take it (see section 6).
   - Frontage and zoning stay in field_whitelist (:86-87). They are still sent; removing them is a contract change nobody named.
8. scripts/analysis/lot-map-data-check.mjs:33 (L7): parseArgs sets `o.error` when the value after --url or --parcels is missing or starts with "--". main() prints the usage and sets exitCode 2.
9. Regenerate in this order:
   - emit-mobile-surfaces --write;
   - lotmap-golden-capture --write;
   - emit --write again (this also writes mobile/generated/...map.json and mobile/__tests__/fixtures/surfaces/...goldens.json, OUTSIDE FILES LINE);
   - the one-off web golden call (web_help, web_terms, web_privacy static and web_maxbld_error miss);
   - the census (scripts/surfaces/_schema/census/mobile-product.json, OUTSIDE FILES LINE) with generate-surface-registry.mjs;
   - surface-validate --check before and after.
10. Test-side edits OUTSIDE FILES LINE, each needed because it pins the old behaviour:
   - src/tests/surfaces/search-follow-ups.logic.test.ts (task-456's file): LEADS :141-147, the "at the back is not used" assertion :148-150 and :163 (Lot B key unchanged, text changed), plus the L7 red case beside :190.
   - surface-validate.logic.test.ts:91 and surface-conformance.logic.test.ts:261: 427 becomes 435 strings (after 450's 426 to 427), with a dated comment, measured before and after.
   - The web_maxbld_error miss golden.

## 4. Tests first (red, then green)
AC1 / fold "ST3" and "L2":
- consumer-parcel-lookup.infra.test.ts, new "ST3: the map area is null outside LOT_SIZE_PLAUSIBLE_M2":
  - assembleLotMap with lot_size_sqm '123456789', 49 and 5001 gives area null. Red today.
  - 50 and 5000 are non-null. '284' still gives '3,052 sq ft · 284 m²' (:286).
  - A source check: consumer-lookup.ts imports LOT_SIZE_PLAUSIBLE_M2 and types no 50 or 5000.
- consumer-parcel-lookup.infra.test.ts, "L2": assembleConsumerPayload of a row with lot_size_sqm '' and comp_count '' gives areas.lot_size_sqm null and compCount null (0 today).
- lotMapScreens.golden.test.ts: LOT_MAP_SLICE.content['lot.null'] is 'Not available'. The lot_facts_null card's area child and its label's area var are {content:'lot.null'}. Red today ('—').
AC2 / fold "V1":
- lotMapPage.behaviour.test.tsx :90: getByText 'Lot B · no building · at the back' (multi_parcel_2). New: 'Lot A · has the house · at the back' on multi_parcel_3plus. Red today.
AC3 / fold "V2":
- lotMapScreens: the unlinked golden's AlertDescription holds Text parcel-lotmap-report with onPress open_help wrong-lot. The :207 pin becomes the new body.
- lotMapPage.behaviour: the unlinked text reads "...Try a nearby address or report it". Pressing parcel-lotmap-report opens `https://maxbld.ca/help#topic=wrong-lot&q=12%20Laneway%20Rear`. :189 becomes topic=wrong-lot.
- lot-map-help-link.logic.test.ts: openHelp('wrong-lot') at :85 and :100. New: the map's topic is a web_help mailto topic in static-page.json (needs 450's part). Header comments :9 and :40-41 are dated.
AC4 / fold "V3, C.9":
- lotMapPage.behaviour :92-93: Lot A's label is 'Lot A · has the house · faces Dunmore Lane, 3,052 sq ft · 284 m²', and each label contains no "frontage" or "zoning".
- Continue's accessibilityLabel resolves to its visible text: 'Choose a lot', then 'Continue with Lot B' after a tap (:118).
AC5 / fold "X1":
- lotMapPage.behaviour :68-74: the four error inputs pass errorOf(i.error, k) and schemaDrift. Expected testIDs: error gives parcel-lotmap-error plus retry; rate_limited gives parcel-lotmap-ratelimit; unauthorized gives parcel-lotmap-entitlement; schema_drift gives parcel-lotmap-error with no retry. Red today: each renders the redirect tree.
Fold "H Q2, H Q4":
- static-web-binding.ui.test.tsx, new (e): web_help, web_terms, web_privacy and web_maxbld_error/miss SSR a `<header>` with links / "MaxBLD" and /login "Log in", and keep the narrow column. Red today.
- RED plant: a title-less hero with a tagline still throws.
- static-page.logic.test.ts T4 (:146): the header hrefs ['/', '/login'] are public host rows with a page (same check as web-landing.logic.test.ts:277). The footer list stays ['/help', '/privacy', '/terms'].
Fold "X6 static half": T5 (:158) matches `require-parcel-tool-page|requireParcelToolPage\s*\(` over the comment-stripped whole text. RED: a wrapped three-line import and a bare call are caught; a comment-only mention is not.
Fold "L7": parseArgs(['--parcels','--url','x']).error and parseArgs(['--url']).error are set; parseArgs(['--parcels','1,2']).error is undefined.
Index shifts, not new tests: every `web_help.static.sections[0]`/`[1]` becomes [1]/[2] in static-page.logic.test.ts:55-67 and static-web-binding.ui.test.tsx (c) and (d).
Fold "R3": surface-validate --check and the generator --check modes.

## 5. Limits, and what could fail or surprise
Limits:
- No neighbour lots (RR-0446). No new setting. lotMap.ts is not touched (its :103 isFetching gate is outside the card).
- The headline `areas`, the contract's frontage and zoning, the old help topics address_match and lot_match (choice 8.4), and the search links (450) are all unchanged.
- Nothing is planned on the lead-detail page or the old permit route.
Risks:
1. consumer-lookup now loads project.ts, which reads report-page.json, the decl, presentation and the seed at import. A fault there now also breaks the lookup route. Detected because consumer-parcel-lookup.infra.test.ts imports the module.
2. The inline link is a nested Text under AlertDescription. It is not a C-9m touch target, so it is under 44 px; WCAG 2.5.8 exempts inline links. Whether RN fires a nested-Text onPress inside the vendored AlertDescription is UNVERIFIED; the behaviour press test detects it.
3. The trailing space in "or " may fail a content lint (UNVERIFIED). Fallback: the space goes at the start of the link text.
4. The lead keys keep their names but now say "at the back". This holds because the server sends frontageStreet and hasFootprint together (types.ts:116-117); a payload with neither still reads lot.letter.
5. Every map golden fingerprint moves, as do the four STATIC web goldens. The S-screen golden count is unchanged.
6. After 450's L3 change, a 429 of 0 shows no Retry on the map. X1 asserts the notice only.

## 6. Who owns which hunk (450 runs first; re-read at the merge, edit by anchor text, not line)
- static-page.json:
  - 450 owns the "wrong-lot" mailto part after :30, the schema enum and help.mailto.wrong_lot.
  - 451 owns $comment :2, the four header sections and the nav.* keys.
  - Both touch web_help.content.json, on different lines.
- Descriptor :57 (the "older server ... falls back to the client derivation" line). 450's seat-regression rg#2 asked 450 to reword it, but 450's plan does not take it yet. If 450's final plan takes it, 451 skips it. Otherwise 451 rewords it in step 7: an absent resolution reads as no_match.
- classifyParcelSearchError and deriveMatchType (used by lotMap.ts:87-88) belong to 450 (L3, Q19). 451 edits neither.
- The string count pins: 450 moves 426 to 427, and 451 moves 427 to 435.
- static-page.logic.test.ts: 450 owns T8 (:229-236); 451 owns T1, T4, T5. static-web-binding.ui.test.tsx: 451 owns it, apart from 450's optional TOPICS line.
- search-follow-ups.logic.test.ts belongs to task-456, which runs later, so 451 edits by test title.

## 7. Dated notes and card notes owed (backlog CLI at node_modules/.bin/backlog, never a hand edit)
- doc-2, through `backlog doc update doc-2 --content` (it replaces the whole body; prior text kept):
  - C.3 (:55): no neighbour lots, RR-0446 MD:2303.
  - C.7 (:59): built, with "at the back" by this card.
  - C.12 (:64): built (LotMapBinding.tsx:115).
  - B.6 and B.7 (:48-49): "report it" and wrong-lot.
  - C.9 (:61): the label no longer reads the facts.
- task-336: `backlog task edit 336 --append-notes` with ST3, V1, V3 and L7 closed.
- task-451: --plan, the acceptance checks, and --append-notes with the evidence and any 8.x answers as verbatim dated rows.

## 8. Open choices (not decided here)
8.1 V2 link shape:
- (a) An inline link with the body ending "or" and no full stop. This matches AC3's literal "ends "or report it"". +1 key.
- (b) The same with a "." key. Matches doc-2:48 and the mock exactly. +2 keys.
- (c) A text-only line, with the existing link below. GROUNDER-C D3 asked for "one-line operator confirmation of the link shape".
- Recommend (a).
8.2 V1 keys:
- (a) Reword the two existing lead keys. No new key; the count holds.
- (b) Two new *_back keys. The old keys would then be unused and the golden test at :102 fails, so they would have to be deleted.
- Recommend (a).
8.3 Header sign-in word: "Log in" (help.html:319, terms-privacy.html:262) or "Sign in" (the landing's nav.sign_in). Recommend "Log in", the approved mocks' word.
8.4 Old Help topics address_match and lot_match:
- Keep them: minimal, but the help page then lists three overlapping topics.
- Or remove them: FOLD-PLAN.md:48 says "stay until 3 moves the map links", but no line orders removal, and the mock lists "General · Wrong address or lot · Billing".
- Recommend keep, and ask the grounder.
8.5 Header on the error state of web_maxbld_error too, not only on the not-found (miss) state. H Q4 names not-found only. Recommend miss only.
8.6 A Spec 100 §3.2 dated note saying that map.lots[].area is null outside the window. Not named on the card. Recommend the descriptor text only (RR-0392).

## 9. UNVERIFIED
- Nothing was run: no tests, no generators, no device, no Next build.
- That a nested Text onPress fires inside AlertDescription on device; that content lint accepts a trailing space; that generate-surface-registry.mjs has a --write flag.
- That the host table maps /login to a public row with a page (only '/' was read, at web-landing.logic.test.ts:369).
- Whether 450's final plan takes descriptor :57. Its seat reports are round 1 and its plan is not final.
- The 5000 m² boundary output text depends on floating rounding, so the test asserts non-null only.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/parcels/consumer-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/LotMapBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/_schema/static-page.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/components/surfaces/web/StaticBinding.tsx
<!-- SECTION:PLAN:END -->
