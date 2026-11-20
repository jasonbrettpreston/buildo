# REPORT: BL-LOAD4, task-317 (LOAD.4 the load-failure page), STAGE 1, 2026-11-19
Head 0bc76d829, branch wf1/inc1b-load4. No product code, no push, no database, no checkout, no test runner.

## Six plain lines for the operator
1. What a person sees today when a lot's report cannot load: on the phone, one centred grey line "Could not load this report. Try again." with an outline Try again button, no address anywhere; a lot with no report shows the bare line "No report for this lot yet." with Back only (and until the live switch flips, every lot does: task-348). If the check never answers, the screen says "Loading the report…" for ever (no time limit). Too many searches, a refused plan and a drifted answer all show the same line with a Try again that cannot help.
2. What the design draws: one failure screen (small-pages v8): the lot's address in the top bar, the still picture, "We couldn't load this lot. Check your connection and try again.", a primary Try again and a quiet Back to Lookup. It draws nothing for a miss, a time-out of its own, or the refusals.
3. The delta: 11 items (address, sentence, buttons, left layout, picture, miss, retry only where it helps, time limit, the 3-retry wait of about 46 to 71 s, refusals on the report screen, web).
4. Can it be built now: no. It needs LOAD.2's stage 2 first (the address of the lot before the lookup answers, and the animation hand-over: task-267, still running) and your answers below. The web page cannot be built at all until the web report screen exists (task-285 / task-287 chain). Nothing else is missing; no route or database change is needed.
5. Size: M, GUESS (about 12 files, 3 to 5 new goldens, red tests first; one test cannot be proven red by a hook because no hook runs the mobile jest tests). L if you pick the design's sentence (LD-1 B) because the shared words are generated for four targets.
6. Decisions owed: LD-1 which sentence; LD-2 how long before the screen gives up (60 s recommended, the same figure the semi page already uses without a ruling); LD-3 whether a failure cuts the animation short; LD-5 whether a lot with no report wears the same frame; LD-6 only if LOAD.2 ships no picture. D-1 (failed Continue) and D-4 (limit wall) are named, unruled, not decided.

## Delta list (design line and built line: PLAN.md section 1c)
1 address in bar (build.mjs:803,814 vs ReportBinding.tsx:384-389); 2 sentence (build.mjs:816 vs report-presentation.json:89); 3 button hierarchy (build.mjs:817 vs reportPage.ts:35); 4 left axis (small-pages-v8 DECISIONS.md:159 vs reportPage.ts:32-33); 5 the "city" still (build.mjs:816 vs none, mobile/assets icons only); 6 miss (nothing drawn vs ReportBinding.tsx:400-401); 7 retry only where it helps (vs :373-377); 8 time-out (build.mjs:814 vs no bound: 0 hits for timeout|abort|signal); 9 retry ladder (useParcelLookup.ts:53-60, about 46 to 71 s, arithmetic on BL-LOAD1B's 9.7 and 15.9 s); 10 refusals on the report route (vs SemiQuestionBinding.tsx:43-65); 11 web (page.tsx:18-22 draws nothing).

## The contract (PLAN.md section 2; route.ts:100-165, 215-222)
computed page: 200 with `page`; miss: 200 `page: null` (hit has `match.address`; dangling id has `match: null`), no reason field; held unsure lot: `page: null` plus `lotForm.unsure`, redirected to the semi page; compute error: route 500 after 3 app retries; time-out: nothing arrives (no client bound, platform limit unknown); the 60 s wait exists on the semi Continue only; refusals: typed errors, 403 not split (D-4); address before any answer: not available (C5, LOAD.2's). See details is inside `page`, one failure not two. No route change needed in the minimum.

## Stage-2 plan and size (PLAN.md section 4)
Order: MF-94 row and prereg (docs, alone) -> red (R1 report-mobile.logic goldens, R2 report-failure.logic total state table, R3 content pin, R4 descriptor lock, R5 mobile jest) -> one green commit (ReportBinding, ReportPageHost, [parcelId].tsx, reportPage.ts, content, generated slice, descriptor, capture, goldens by script, Spec 126 note, queue row, task) -> docs commit. Existing View, Text, Button, SafeAreaView only. Not built: web, a reason field, the limit wall, the failed-Continue state, LOAD.2's animation/address/still. Size M GUESS.

## Seam with LOAD.2 (task-267; its plan is not written yet)
LOAD.2 owns the in-progress screen; LOAD.4 owns what replaces it. S1 order (LOAD.4 after LOAD.2 stage 2, one editor of reportScreenState); S2 address (hard prerequisite); S3 the still; S4 early failure (the cut-short transition would be LOAD.2's, to be relayed to BL-LOAD2).

## Decision drafts: PLAN.md section 6 (LD-1, LD-2, LD-3, LD-5, LD-6; D-1 and D-4 named only). Each has In plain words, Grounded, Recommendation and the lens.

## Lenses (DeepSeek, deepseek-reasoner, one run each, in parallel): compliance, ux, error-paths, code-review (r1-*.txt). All four returned FAIL; 31 lines adjudicated in TRIAGE.md: KEPT 18, PART 6, REJECTED 6 (plus one agreed lens REJECT). What they changed: LD-3 recommendation A to B (RR-0176's literal words); a time-out is the error frame, not a state; LifecycleState stays three (new members would emit unresolved keys); the bound is a mount timer, not a rejection inside the query (it would be retried 3 times: 4 x 60 s); `error` destructured at the mount; Try again shows loading while fetching (no dead or double tap); role alert on the failure line; address a hard prerequisite; seam S4 ownership; conditional LD-6; total fallback. Not run: security (no money/auth/PII surface), plan-review failure modes (not named in the brief).

## Commit and hook tail: see commit.out and the hand-back (one docs commit `docs(137_mcqueue): LOAD.4 stage 1: the measured plan and impact map`, trailer `Task: task-317`).

## UNVERIFIED
- Any behaviour on a device or by a test run (no runner, no device); TanStack v5 keeping status error while a refetch runs (the basis of the loading-while-fetching fold); the retry delays 1, 2, 4 s (default, not overridden in the code read); the platform request timeout; RN fetch default time-out.
- Whether S-sbind accepts accessibilityRole alert in a REPORT tree; whether a descriptor edit drifts the surface registry, census row or system map (checks run clean BEFORE the change only); whether a decl hash change from the shared words (LD-1 B) needs a DB seed or operator GO (not traced).
- Whether the route can send a page with no sections (E7, not folded).
- Whether the address-in-route option leaks to Sentry breadcrumbs (not chosen, not checked).
- The lens run used lane copies of the plan text because the pack file is over the 120,000-character bound; the repo copy of the final text is appended to docs/reports/reviews/task-317/context-2026-11-19.md.
- Task status was set WAITS by this lane at close as the brief orders; RR-0298 ("Status changes only by the launch script") is the orchestrator's to reconcile.
- MF-94 and a prereg round are unclaimed (stage 2).
STATUS: ready
