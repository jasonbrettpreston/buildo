# PLAN task-389 SRCH.LEGAL (lane BL-LEGAL)
Rule: Spec 126 section 0a principle 1 and 11b.2 (one binding per archetype, refs only); Spec 100 section 4 dated note 2026-11-10 (legal line under the input, now moved by the 2026-11-20 ruling); 08_agents.md section 7 rules 3, 4; PLAN-PROTOCOL.md:3.
Operator words (verbatim): "1 a 2 b 3 a 4 a 5 c 6 accept" (C3 b: legal line at the bottom as in v8 search.html:267-269), "Phone retires yes and web search yes", "5. Do the legal-line move (389) now as a small code change".

Finding: the web search binding already shows the legal sentence once, in the footer, last child (src/components/surfaces/web/SearchBinding.tsx:64,136; MF-91). The line under the input is already gone on the web. So web before = once at the bottom (footer); web after = unchanged. No web change, no web golden moves. (Confirmed: grep "legal" in web binding gives only footer lines 64,68,131,136,143,248.)

Change (phone only):
1. mobile/__tests__/parcelScreens.golden.test.ts: the MF-58 legal-line test now expects the legal node to be the LAST child of the column in every golden and named case (reports-left stays right after the pill; chips, notices, list, tail come before legal). Red first.
2. mobile/src/components/surfaces/SearchBinding.tsx: move `legal()` from after reportsLeft to the end of the column children (after tail); update the doc comment of legal(). className, testID, content key unchanged.
3. Regenerate goldens with scripts/surfaces/search-golden-capture.ts --write, then emit-mobile-surfaces.mjs --write (generated, never hand edited). Only the position of the legal node moves in each of the 11 mobile goldens (and their mobile copy mobile_parcel_search.goldens.json); the web goldens do not move.
4. Spec 100 dated note (M-246, prior text kept) recording the ruling: the 2026-11-10 note's placement "directly under the address input" is replaced by "last block of the page" (owed by BL-MOBILECI finding F-2). Task Implementation notes + AC via backlog CLI.
Not changed: wording, content key, className, testID, any other block order, web. No migration/fallback code (app in development).
Checks: every --check the hooks run for these files before and after (search-golden-capture --check, emit-mobile-surfaces --check, surface-validate); typecheck. Phone tests are not run locally: phone-test green is UNPROVEN until Mobile CI.
