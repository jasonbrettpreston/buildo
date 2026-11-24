---
id: TASK-451
title: >-
  SEARCHFIX.3 Lot card: "Not available" for an implausible lot size, "at the
  back", "or report it", screen-reader labels, plain-page header links
status: BUILT
assignee:
  - '@lane-BL-SFX3'
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-24T18:06:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies:
  - TASK-450
references:
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
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-24/BL-SFX3/REPORT.md
  - docs/reports/lanes/2026-11-24/BL-SFX3/GROUNDER.md
  - docs/reports/lanes/2026-11-24/BL-SFX3/TRIAGE.md
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

Files: src/lib/parcels/consumer-lookup.ts, mobile/src/components/surfaces/LotMapBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json, scripts/surfaces/_schema/static-page.json, src/components/surfaces/web/StaticBinding.tsx, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/static-web-binding.ui.test.tsx, src/tests/surfaces/lot-map-help-link.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, mobile/__tests__/lotMapPage.behaviour.test.tsx, mobile/__tests__/lotMapScreens.golden.test.ts, scripts/analysis/lot-map-data-check.mjs, src/tests/fixtures/surfaces/, mobile/__tests__/fixtures/surfaces/mobile_parcel_disambiguation_map.goldens.json, mobile/__tests__/fixtures/lotMap.situations.json, scripts/surfaces/parcel_product/F06/surfaces/web_help.content.json, scripts/surfaces/parcel_product/F06/surfaces/web_terms.content.json, scripts/surfaces/parcel_product/F06/surfaces/web_privacy.content.json, scripts/surfaces/parcel_product/F06/surfaces/web_maxbld_error.content.json, scripts/surfaces/_schema/census/mobile-product.json, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, src/tests/surfaces/search-follow-ups.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, .cursor/MCFRONTEND-QUEUE.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A lot size outside the plausible range reads "Not available" on the card and in its screen-reader label
- [ ] #2 A lot with no fronting street reads "at the back"
- [ ] #3 The no-lot line ends "or report it" and links to the wrong-lot help topic
- [ ] #4 The screen-reader label contains the visible card text
- [ ] #5 The lot-map smoke test renders the four error states as errors
- [x] #6 Objective C.3 carries a dated note: no neighbour lots
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

Read-only. I ran no tests, hooks or generators and wrote no file. The only commands I ran were `backlog ... --help` and one `node -e` read of a fixture. Cites were read at board head 0841db559. The plan grounder re-read them at ddad097a8 (the commits since are records only). MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. "450" means task-450 as it stands in the working tree: its card is modified and not yet committed.

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
  - scripts/violations/generate-surface-registry.mjs for the census mirror and the two generated registry files (its flags are --check, --self-test and --emit-descriptors; it has no --write).
  - The web STATIC goldens: no committed writer. Use the same one-off in-memory buildGoldens call 450 uses (surface-goldens.ts:8-9). No tool is committed.

## 3. The change, file by file, in build order
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

## 4. Tests first (red, then green)
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

## 5. Limits, and what could fail or surprise
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

## 6. Who owns which hunk (450 runs first; re-read at the merge, edit by anchor text, not line)
- static-page.json:
  - 450 owns the "wrong-lot" mailto part after :30, the schema enum and help.mailto.wrong_lot.
  - 451 owns $comment :2, the four header sections and the nav.* keys.
  - Both touch web_help.content.json, on different lines.
- Descriptor :57 (the "older server ... falls back to the client derivation" line) is this card's, unconditionally: 450's final plan edits no line of the map descriptor (its steps 10 and 11 are the search and semi descriptors), and 450's grounder ruled it task-451's file (docs/reports/reviews/task-450/GROUNDER-PLAN.md, rg#2). Step 7 rewords it: an absent resolution reads as no_match. Re-read 450's diff at the merge.
- classifyParcelSearchError and deriveMatchType (used by lotMap.ts:87-88) belong to 450 (L3, Q19). 451 edits neither.
- The string count pins: 450 moves 426 to 427, and 451 moves 427 to 436 (+8 nav strings, +1 on the map file: ruled 8.1 b); measure with surface-validate --check before and after. 450's search descriptor needs the same census route (the census, not the descriptor, is the source: step 7), so both cards edit different entries of scripts/surfaces/_schema/census/mobile-product.json and regenerate the same two registry files: whoever lands second re-runs the generator.
- static-page.logic.test.ts: 450 owns T8 (:229-236); 451 owns T1, T4, T5. static-web-binding.ui.test.tsx: 451 owns it, apart from 450's optional TOPICS line.
- search-follow-ups.logic.test.ts belongs to task-456, which runs later, so 451 edits by test title.

## 7. Dated notes and card notes owed (backlog CLI at node_modules/.bin/backlog, never a hand edit)
- doc-2, through `backlog doc update doc-2 --content` (it replaces the whole body; prior text kept):
  - C.3 (:55): no neighbour lots, RR-0446 MD:2303.
  - C.7 (:59): built, with "at the back" by this card.
  - C.12 (:64): built (LotMapBinding.tsx:115).
  - B.6 and B.7 (:48-49): "report it" and wrong-lot.
  - C.9 (:61): the label no longer reads the facts; frontage and zoning are still sent (field_whitelist) but no longer shown or spoken.
- task-336: `backlog task edit 336 --append-notes` with ST3, V1, V3 and L7 closed. Read the task's notes first and append only if no note with that title is there (append-notes has no dedup key, so a second run would add the note twice); build the doc-2 body from a fresh read at write time, not from a copy taken earlier.
- .cursor/MCFRONTEND-QUEUE.md (a repo file, committed with the work as the SRCH.LOTCARD note was in 2b01c2237): one appended dated note on the MF-53 row, prior text kept, after :417: the lane note at :415 ("at the back" is not data and is not used) is superseded by FOLD-PLAN.md:57 and doc-2 C.7, and the :417 reason for the address_match topic ends because wrong-lot exists after 450. The superseding note task-450 left to this card.
- task-451: --plan, the acceptance checks, and --append-notes with the evidence and any 8.x answers as verbatim dated rows.

## 8. Open choices (ruled by the plan grounder, round 1; the rulings are in docs/reports/reviews/task-451/QUESTIONS-RULED.md)
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

## 9. UNVERIFIED
- Nothing was run: no tests, no generators, no device, no Next build.
- Settled by reading in round 1: the trailing space (web_landing.content.json:16), the --write flag (none; the flags are --check, --self-test and --emit-descriptors) and descriptor :57 (this card's, section 6). Still UNVERIFIED: that a nested Text onPress fires on a device (read as native; the jest press test and the button under the notice cover it).
- Settled by reading in round 1: the host table maps /login (host-policy.ts:43) and / (:50) to public rows, and the pages exist (src/app/(maxbld)/parcel-tool/login/page.tsx and the (static) home page).
- Descriptor :57 is this card's whatever 450 does (section 6); re-read 450's diff at the merge.
- The 5000 m² boundary output text depends on floating rounding, so the test asserts non-null only.

### Critical Files for Implementation
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24 taken on the board at lane launch (lane BL-SFX3, worktree /Users/brettpreston_macmini/Buildo-wt-sfx3, branch wf2/inc1b-sfx3), RR-0240

2026-11-24 build started (lane BL-SFX3): tests first per plan section 4; red is the refused commit attempt with only the test and task files staged (RR-0225). Mobile jest tests (lotMapPage.behaviour, lotMapScreens.golden) are not reached by the pre-commit related run (src/ and scripts/ only): their red and green are UNVERIFIED until the push station, as for task-450.

2026-11-24 deviation (lane BL-SFX3): mobile/__tests__/fixtures/lotMap.situations.json is added to the Files line (precedent task-450, which added the paths its generators needed). Reason: once the card label and the zoning line no longer read lot.null, no committed golden used the key, and surface-validate refused "SV-SBIND mobile_parcel_disambiguation_map: orphan content key lot.null" (the golden test lotMapScreens "every content key is used by a committed golden" holds the same rule). The fixture lot C of multi_parcel_3plus and multi_parcel_3plus_none (the lot whose response lacks the footprint and street fields) now has area null, so the multi_parcel_3plus golden shows the area null value "Not available" (AC1). No other fixture value changed.

2026-11-24 build (lane BL-SFX3), plan PLAN-451-v1 sections 3 and 4 followed. Red: the commit attempt with only the test and task files staged was refused, Test Files 7 failed, Tests 22 failed | 199 passed (lane red.out). Changes: consumer-lookup.ts num('') null (L2) and the map area null outside LOT_SIZE_PLAUSIBLE_M2 (ST3); map content lot.null Not available, the two no-street leads end at the back (V1, ruling 8.2 a), lot.label {lead}, {area}, select.label retired, unlinked.body ends 'or ' with unlinked.report and unlinked.stop (V2, ruling 8.1 b); LotMapBinding: inline report-it link (it reuses the existing link text class L.helpLinkText so it reads as a link), every help link topic wrong-lot (B.7), card label = lead + area, Continue label = its visible text, unreachable select.label branch deleted (V3); static-page.json header hero on web_help, web_terms, web_privacy and both web_maxbld_error states (H Q2, H Q4, ruling 8.5) and the R5 dated sentence; StaticBinding draws a wordmark-and-nav-only hero as the header and keeps the narrow column; nav.home MaxBLD and nav.sign_in Log in in the four content files (ruling 8.3); lot-map-data-check parseArgs error (L7); census entry and descriptor dated text and chain positions sources[4], [8], [15] (R3); doc-2 dated notes C.3 (AC6), C.7, C.12, B.6/B.7, C.9; MF-53 queue dated note. surface-validate --check 427 strings before, 436 after. Generators: emit-mobile-surfaces --write, lotmap-golden-capture --write (11), emit again, buildGoldens one-off (70 goldens, 5 rewritten), generate-surface-registry then --check clean. Mobile jest (lotMapPage.behaviour, lotMapScreens.golden): red and green UNVERIFIED until the push station; an in-memory tsx probe of the binding gave the expected card text, labels, the unlinked line, the four error notices and the single help topic wrong-lot (lane probe.out).

2026-11-24 deviation (lane BL-SFX3): static-web-binding.ui.test.tsx (c) also indexes the web_maxbld_error error page's prose (children[0] -> [1]); the plan's index-shift list named web_help only. Found by the green commit's related run (1 failed), fixed in the same work commit.

2026-11-24 work commit 04c181564 (hooks: GATE OK, POLICY CHECKS OK; pre-commit related run Test Files 17 passed | 1 skipped (18), Tests 419 passed | 7 skipped (426); lane green.out). The doc-2 dated notes (AC6 C.3, C.7, C.12, B.6/B.7, C.9) and the regenerated docs/reports/generated/rule-lists-by-kind.md (doc-2 grew) land in their own commit: check-task-files refuses a path outside the Files line beside code, and neither path is code.

2026-11-24 merge 182a28053 of wf2/board (fe88ecf71), ordered by the orchestrator; doc-2 conflict kept both sides, rule-lists page regenerated. Output review round 1 on the merged head: context-r3.md, 52 DeepSeek lens outputs (lens set per the board table: plan-protocol output_off; 9 compliance lists), 184 findings (HIGH 24, MED 72, LOW 82, NIT 4) in docs/reports/lanes/2026-11-24/BL-SFX3/FINDINGS.md. Grounder owed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SEARCHFIX.3 landed in 04c181564 (work; hooks GATE OK, POLICY CHECKS OK; pre-commit related run Test Files 17 passed | 1 skipped (18), Tests 419 passed | 7 skipped (426); red refused first with Test Files 7 failed, Tests 22 failed), 0e491221e (doc-2 dated notes incl. C.3 no neighbour lots, AC6 at doc-2 line 170), dd40a13d5 (task-336 dated note), merge 182a28053 of wf2/board, review records 63c96df49. Lot card: Not available for a size outside LOT_SIZE_PLAUSIBLE_M2, at the back for a lot with no fronting street, the no-lot line ends or report it linking the wrong-lot topic, the screen-reader label is the visible card text; plain pages get the header links; surface strings 427 to 436. Phone tests never run: AC4, AC5 and the phone halves of AC1 to AC3 are UNPROVEN until the Mobile CI job on the pushed tip shows lotMapPage.behaviour.test.tsx and lotMapScreens.golden.test.ts green and one device tap of report it is recorded. The card is not DONE and not called working. (The phone tests run only in the GitHub Mobile CI job after a push, not at the push station.)

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX3/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX3/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
