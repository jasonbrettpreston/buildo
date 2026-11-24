# BL-SFX2 · task-450 SEARCHFIX.2 · stage 1 report

STATUS: RUNNING, grounder owed (output review round 1 done; the lane does not rule its own findings).

## What landed (branch wf2/inc1b-sfx2, worktree /Users/brettpreston_macmini/Buildo-wt-sfx2; nothing pushed)
- ee3634771 fix(100_mobile_parcel_cost_tool): SEARCHFIX.2 search page fixes (task-450). 68 files. Hooks: GATE OK, POLICY CHECKS OK (commit-msg): 18 file(s); pre-commit related runs "Test Files 10 passed (10) Tests 186 passed (186)" and "Tests 13 passed (13)" (green.out).
- 3f4f616fe docs(99_mobile_state_architecture): task-319 dated note (L1), its own commit (check-task-files refuses a second task file beside code).
- Plan followed: PLAN-450-v1 (task Implementation Plan), steps 1-15, rulings Q8.1 B, Q8.2 reword, Q8.3 wrong-lot, Q8.4 (a).

## Acceptance criteria (each test written first)
1. No house number: refine line + rows kept. mobile/src/lib/parcelSearchMatch.ts hasHouseNumber, buildSearchSituation overCap = noNumber || cap; content list.refine "Add a house number to narrow it down."; tests parcelSearchMatch.test.ts describe "a street with no house number", parcelSearchScreen.behaviour AC1.
2. Settled miss on re-fetch keeps the line: showMiss drops !isFetching; truth-table and AC2 test.
3. Lot form with an extra field parses; enums stay: schemas.ts .strict() removed; schemas.test.ts 3 cases.
4. {min} from the setting: both bindings fill {min} from config.min_query_len via sliceNumber (derived name min_query_len); search-web-binding.ui.test + behaviour test.
5. Semi cold offline: semiQuestion.ts no data with a parcel id = loading; empty id -> Lookup; semiQuestionPage.behaviour 2 cases, semiQuestionScreens.golden reworded.
6. Help topic wrong-lot ("Wrong address or lot") in static-page.json + schema enum + web_help content; both search links use it.
Also: L3 (retryAfterSeconds == null, MF35-DF1 closed), Q19 shim deleted, Q8 curly apostrophe, R2/R4 descriptor text, R5 "two layout tables", Spec 99 §6.5 dated note (N4).

## Red / green evidence
- red.out: the commit attempt with only test, fixture and task files staged was refused: "Test Files 5 failed (5) Tests 8 failed | 133 passed (141)" (oracle x2, static-page T8, search-web-binding x3, surface-conformance C-1, surface-validate FE-13).
- Mobile jest tests are NOT reached by the pre-commit related run (src/ and scripts/ only): their red and green are UNVERIFIED until the push station (same as BL-LOTCARD, BL-SEMI). An in-memory tsx probe of the pure helpers gave the expected values (overCap true for "Gerrard St", false for "383 El"; showMiss true on re-fetch; RateLimitError(0) unexpected false; semi loading with id; lot form extra field parses, triplex refused). Mobile typecheck: no new error in touched files (one pre-existing TS7006 at semiQuestionPage.behaviour.test.tsx:73 from the missing testing-library types).
- surface-validate --check: 426 strings before, 427 after (surface-validate-before.out / -after.out).
- Generators: emit-mobile-surfaces --write (7 files), search-golden-capture --write (11), semi-question-golden-capture --write (8), emit again, buildGoldens one-line tsx caller (70 goldens, 12 rewritten); all --check ok.

## Deviations from the plan (recorded in task notes)
- The census scripts/surfaces/_schema/census/mobile-product.json is the source of the descriptors (generate-surface-registry --emit-descriptors); the plan's "census files (no reader)" did not hold. Census rows set equal to the edited descriptors; emit rewrote both descriptors byte-identical. Added to the Files line with the three generated pages the pre-commit checks regenerate (127-surface-registry.md, 127-surface-review-queue.md, rule-lists-by-kind.md).
- Commit trailer McFrontend-Task: MF-35 (the search page row; the gate refuses a surface commit without one); precedent task-395.
- The review diff (mkdiff.sh) is the brief's command plus those four Files-line paths.

## Output review round 1
- Context docs/reports/reviews/task-450/context-r3.md (backlog-brief.mjs). Lenses (DeepSeek, parallel): code-review p1-2, ux p1-2, error-paths p1-2, compliance per list (mobile-90 p1-3, mobile-98 p1-3, mobile-99 p1-8, surface-136 p1-4, step-132 p1-4, five-words p1-2, plan-protocol p1-3, inc-S p1-3, ms-S p1-2), engineering eng-all p1-4. 40 outputs, inputs beside them, in docs/reports/lanes/2026-11-24/BL-SFX2/.
- 171 findings: CRITICAL 0, HIGH 25, MED 57, LOW 82, NIT 7 (FINDINGS.md). Recurring HIGH themes for the grounder: showMiss without isFetching (first-fetch / previous-data flash claim); "Highway 27" fail-open vs AC1; descriptor text additions vs RR-0392; mobile red not proven by hook; Spec 00 §10.2 frontend may not edit scripts/; Q19 version-skew payload reads as a miss.
- Grounder owed: GROUNDER.md in that folder by a seat that is not this lane; then a fix round if confirmed.

## Not done
- Grounder, fix round, BUILT close: not this stage.
- No push, no suite, no DB.
