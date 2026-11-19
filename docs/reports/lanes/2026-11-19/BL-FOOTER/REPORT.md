# REPORT: BL-FOOTER (task-332, SRCH.FOOTER, MF-91, Increment 1·B)
Status line (Spec 137 rule 3): BL-FOOTER lane · task-332 · BUILT on wf1/inc1b-footer, not pushed, no DB. Commits: fbdf150a5 (prereg 1 + panel record MF-91, docs), 7788ecc92 (the build, through the real hooks), then the lane-report docs commit.

## Evidence
- Red (red.out): commit attempt with only the tests, task file and context file staged refused at the typecheck step: `src/tests/surfaces/site-footer.logic.test.ts(15,98): error TS2307: Cannot find module '../../components/surfaces/web/footerNode'` and `Property 'footer' does not exist on type 'IntrinsicAttributes & { view: PageView; }'`.
- Green (commit.out): `Test Files  13 passed (13)` / `Tests  171 passed (171)`, then the commit landed (36 files, 1443 insertions, 185 deletions). Two earlier attempts in the same file were refused by my own test defects and by the pin tests (below).
- `npm run typecheck` rc=0 on the commit. Goldens current: `search goldens ok (10)`, `surfaces ok (4 surfaces, 29 goldens)`, `page goldens current (40 and the landing sample)`; web goldens rewrite `changed 0` on re-run.
- `node scripts/surfaces/surface-validate.mjs --check`: NOT all ok. It prints only the two findings that were on the tip before my change (`SV-SBIND mobile_parcel_disambiguation_map/multi_parcel_2.mobile.json: unknown contract field contract_parcels_lookup.map.lots.0.frontageStreet ...` and the 3plus twin; from SRCH.LOTCARD 2b01c2237); my change adds none (same two lines before and after).
- Review: r1-plan.txt (22 findings) + TRIAGE.md; r2-output.txt (13 findings, one lens) triaged in TRIAGE.md: no KEPT defect, no fix commit.

## Acceptance criteria
1. Shared footer extracted, one export: src/components/surfaces/web/footerNode.ts (`footerNode`), imported by StaticBinding.tsx, SearchBinding.tsx, ReportPage.tsx; test T1 (site-footer.logic.test.ts) pins one definition, three importers, no binding imported by the module. Static footer tree pinned by T4; no static golden moved.
2. Footer node last in the web SearchBinding tree: legal (existing key search.legal), Terms of Service /terms, Privacy Policy /privacy, Help & Support /help, © MaxBLD, in v8 order (search.txt:323); four keys footer.terms/privacy/help/copyright in scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json (same wording as web_login.content.json:58-61 and the static content files; a content file is one surface's namespace, so the wording is repeated under the F01 file). Tests T2, T5, site-footer.ui (a).
3. search.legal appears once per web tree (in the footer) and once per mobile golden (T3); the web line under the input is removed, mobile keeps it. The FE-07 parity lock now names the two ruled differences as exact diff sets (search-parity.golden.test.ts).
4. Web report: ReportPage footer = G2 (pending, inside the footer, first), G3 line, the three links (G5), the copyright (G4), from the same builder (site-footer.ui (c), (d)). ReportPage takes a required `footer` prop (the four strings); callers: the landing sample (StaticReport.footer from maxbld-landing.ts), admin report-preview, tests. G2 value stays GAP.4 task-127.
5. Mobile unchanged: no mobile source file edited. Moved by script only: the ten mobile search goldens' fingerprint line (one line each, e.g. static.mobile.json content sha c4d024b19bc6e0c6 -> c30390405a516189), mobile/src/generated/surfaces/mobile_parcel_search.json (+4 keys, input_sha), mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json. Props trees unchanged (`search goldens ok (10)`).
6. Goldens by repo scripts: ten web search goldens by buildGoldens (surface-goldens.ts:95, lane script webgold.ts calls it, as the GAP.13 lane did), mobile by search-golden-capture.ts --write and emit-mobile-surfaces.mjs --write. Red first through the hook.

## Goldens that moved and why
- 10 x src/tests/fixtures/surfaces/mobile_parcel_search/*.web.json: legal node removed from the column, footer node added, fingerprint line (content file hash).
- 10 x *.mobile.json: fingerprint line only. Report page goldens: none moved (report-page.json and report-presentation.json untouched). Static goldens: none moved.

## Pins (S-sbind strings, surface-validate.logic.test.ts:85 and surface-conformance.logic.test.ts:247)
NOT moved in the build commit (moved afterwards, see the Addendum). Measured with screen-checks.mjs sbindArm: 422 strings with my four keys; the tip measured 418 before them against the pin 414 (SRCH.LOTCARD added keys without moving it). Both tests already fail on the tip (the frontageStreet findings) and the hook refuses a commit that touches them, so the pin move (414 -> 422, dated comment prepared in my first attempt) belongs with the commit that clears the LOTCARD finding. ORCHESTRATOR ITEM.

## Decisions worth a look
- G4/G5: no schema part added and report-page.json untouched, because the ruling keeps the mobile report on its own binding (MORNING-DECISIONS.md:1066) and any schema edit moves the mobile report's fingerprints and the G4 part it renders. The web G4 copyright and G5 links therefore come from the shared footer strings, not from page parts; the schema's G4 stays `pending` (mobile). The page test's every-part-text check exempts role copyright with a dated comment.
- Landing sample (inside web_landing) now shows the report footer with the three links: a visible change to the landing sample region from the same ruling.

## UNVERIFIED
- Mobile jest suites are not run by the commit hook nor the station suite's root run.
- Visual layout of the search footer (full width, mt-auto, 320/430 px) and the report footer styling: not rendered in a browser.
- The prereg round number 195 is my pick (round is only checked as an integer).


## Addendum (after rebase onto the board head; commits f99d25451 prereg, d2cd0d5a2 build, 6a5042964 reports, c168b4ef4 pins)
The shas in the sections above are superseded by the orchestrator's rebase. Pins: BL-LOTFIX moved 414 -> 418; commit c168b4ef4 moved surface-validate.logic.test.ts and surface-conformance.logic.test.ts 418 -> 422, exactly the four footer.* keys (F01 content file lines 2-5). The real `surface-validate --check` stdout equals the expected line in the test character by character (it ends "S-sbind ok (17 surfaces, 422 strings)"); the pre-commit related run passed "Test Files  2 passed (2) / Tests  95 passed (95)" (commit2.out). Re-run after the rebase: typecheck rc=0, search-golden-capture --check "search goldens ok (10)", emit-mobile-surfaces --check "surfaces ok (4 surfaces, 29 goldens)", web golden rewrite "changed 0", report-page-capture --check "page goldens current (40 and the landing sample)", generate-target-files --check rc=0; surface-validate --check is now fully ok (the two frontageStreet findings are gone).
Kept as stated: report-page.json is untouched; the web report copyright and links come from the shared footer strings and the schema G4 stays pending for the mobile binding (RR-0273: the mobile report keeps its own binding).
