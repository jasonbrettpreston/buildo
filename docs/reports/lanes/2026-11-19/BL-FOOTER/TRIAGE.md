# TRIAGE r1 (plan review, lane BL-FOOTER, task-332). Source: r1-plan.txt (22 findings). Every line opened.
1. CRITICAL G2 beside not inside: KEPT. Fold: G2 becomes the first part (role line, pending) of the report footer section inside the shared tree; GAP.4 swaps pending for the value later. (MORNING-DECISIONS.md:1066 "G2 ... stays GAP.4's data line inside it")
2. CRITICAL G4/G5 undeclared in schema: REJECTED in part. The ruling says "the mobile report keeps its own binding until a mobile footer is ruled" (MORNING-DECISIONS.md:1066); a schema part or a G4 content flip would change the mobile report (mobile/src/components/surfaces/ReportBinding.tsx:290-294 renders the G4 part) and move every page golden fingerprint (report-page-capture.ts:30-33 hashes report-page.json). KEPT: a render-level test of the web report footer subtree (T6) and an UNVERIFIED/operator note in the report that G4/G5 stay undeclared for mobile.
3. HIGH missing key behaviour: REJECTED optional prop and fallback (a fallback string typed in code breaks FE-18, StaticBinding.tsx:3-8 header; resolveStaticRef throws on a missing key, StaticBinding.tsx:336-342). KEPT: a RED case that pickFooterText throws a named error on a missing key. The live web report route is not live (src/app/(maxbld)/parcel-tool/[parcelId]/page.tsx:17 throws).
4. HIGH operator words vs reading: REJECTED. The expansions are the operator's recorded answer (MORNING-DECISIONS.md:1061 "1. once  -approved", :1066 "this is a shared component", ruling text :1068 under RR-0233); the plan quotes both verbatim.
5. HIGH links live while disabled / routes exist: KEPT. Disabling is per control (SearchBinding.tsx renderWebNode uses `off` on TextInput and Button only); the href branch returns before the disabled Button. Routes exist and are public (src/lib/auth/host-policy.ts:51-53; pages under src/app/(maxbld)/parcel-tool/(static)/{terms,privacy,help}/page.tsx). Test: footer anchors carry no disabled attribute with disabled runtime.
6. HIGH parity subtraction: KEPT. The amended lock asserts exact diff sets: web minus footer subtree equals mobile minus the legal node, and each removed piece is present exactly once.
7. HIGH module location/cycle: REJECTED the move to a new shared dir (src/components/surfaces/web is the web binding home; ReportPage already imports from it, StaticBinding.tsx:37). KEPT: footerNode.ts imports nothing from StaticBinding or SearchBinding (defines its own structural types); a test pins that.
8. HIGH shared render equality: KEPT. Test: the same footer section through the three renderers lists the same hrefs and texts in the same order.
9. HIGH dependencies block: REJECTED, generator output (infra freeze; BL-R11 TRIAGE precedent); not in this task's scope.
10. HIGH doc-2/doc-16 ENOENT: REJECTED, generator defect, reported not fixed (same precedent).
11. MEDIUM storage block stale 35 s: REJECTED, same.
12. MEDIUM search.legal vs footer.legal drift: REJECTED, already pinned: src/tests/surfaces/static-page.logic.test.ts:90 asserts footer.legal equals search.legal.
13. MEDIUM mobile-named content file gets web keys: REJECTED. The brief names this file; web already reads it (src/lib/surfaces/maxbld-web.ts:19 "the one content file of mobile_parcel_search (shared with the app)"); churn accepted, stated in plan step 5.
14. MEDIUM hrefs in T2: KEPT.
15. MEDIUM a11y: KEPT the cheap part (a footer element and real anchors asserted in all three); REJECTED roles/focus-order extras (static footer is unchanged, no new a11y spec named).
16. MEDIUM scroll/sticky: KEPT as a stated choice: the footer scrolls with the page (v8 .wfoot is a normal block, search.html:244, search.txt:323); mt-auto so it sits at the page end.
17. MEDIUM role/layout skew: KEPT. footerNode throws a named error on an unknown role or a missing layout class; RED case.
18. MEDIUM pin 418 self-fulfilling: KEPT. Predicted before code: 414 + 4 new footer keys = 418 (surface-validate.logic.test.ts:85 pin); checked after.
19. MEDIUM element matrix status: REJECTED, elements-by-inc.json and matrix-verified.json are raw import snapshots (docs/reports/plan-import/raw/2026-11-19/); the queue row status line and dated note carry the status.
20. LOW order per user: KEPT (T2, T4, T6).
21. LOW quote strings: KEPT: tests quote "© MaxBLD" (no year; web_login.content.json:61), "Terms of Service", "Privacy Policy", "Help & Support".
22. LOW red evidence tracked: REJECTED; rule 18 puts red.out in the lane dir; the report quotes it.
23. NIT prior reviews: REJECTED, generator.

# TRIAGE r2 (output review, one lens, r2-output.txt; 13 findings). No KEPT defect, no fix commit.
1. HIGH static not byte-identical (empty group, order, line/copyright roles): REJECTED. The static schema allows only link and legal in a footer (static-page.schema.json roles, checkPart throws otherwise, StaticBinding.tsx checkPart) and every page's table is link,link,link,legal (scripts/surfaces/_schema/static-page.json:52-75); T4 (site-footer.logic.test.ts) pins the exact old node shape for four pages and passed in the commit hook (commit.out "13 passed"); `git diff --stat` of the commit shows no static golden changed.
2. HIGH data not shared (hrefs, texts): REJECTED. T5 asserts the static content files' footer.terms/privacy/help equal the F01 and login wording; static-page.json hrefs are /terms /privacy /help; the F01 copyright equals web_login.content.json:61 ("© MaxBLD", no year).
3. HIGH required prop, other call sites: REJECTED. `npm run typecheck` rc=0 on the commit: every ReportPage caller compiles with the prop.
4. HIGH StaticReport.footer optional: REJECTED. One producer (maxbld-landing.ts readLanding) supplies it; landing tests ran in the hook related run and passed; the render throws a named error without it (StaticBinding.tsx footerOf2).
5. HIGH readLanding eager throw: REJECTED. The degraded path covers stored-data reads (readCitywide, readAllowances); a missing committed content key is a build defect and T5 pins the four keys, like the landing's other committed-file imports.
6. MEDIUM report copyright part discarded / other roles ignored: REJECTED. By ruling the mobile binding keeps G4 (MORNING-DECISIONS.md:1066); the report footer roles are closed by the page table (report-page.json kinds.footer = sources, change, copyright), pinned by report-page.logic.test.ts.
7. MEDIUM FE-18 on search and static: REJECTED. resolveWebValue throws "unknown content key" (SearchBinding.tsx, existing, test search-web-binding.ui.test.tsx RED case) and resolveStaticRef throws (StaticBinding.tsx:336-342).
8. MEDIUM report drops testID: REJECTED. The report component uses data-section and structure, never test ids (ReportPage.tsx header); site-footer.ui.test.tsx (c) asserts the report footer by structure.
9. MEDIUM href before open_help: REJECTED. No node carries both; the only href Buttons are the footer links; the live-off test (a) asserts the anchors are not disabled.
10. MEDIUM MF-58 legal moved: REJECTED. RR-0270 "1. once  -approved" rules exactly this (MORNING-DECISIONS.md:1061); recorded in the MF-91 row dated note naming MF-58 and N8.
11. MEDIUM footer layout (sibling, gap-3): REJECTED. The static footer already uses gap classes on the same Stack (WEB_STATIC_LAYOUT.footer); the screen Stack is min-h-screen; visual check at 320/430 px not run: UNVERIFIED.
12. MEDIUM dead mobile keys: REJECTED. surface-validate --check reports no orphan content key (only the two pre-existing LOTCARD frontageStreet lines); the F01 file is the one content file of both targets (maxbld-web.ts:19).
13. MEDIUM `as WebNode` cast: REJECTED. FooterNode and WebNode are structurally the same shape; typecheck passes.
