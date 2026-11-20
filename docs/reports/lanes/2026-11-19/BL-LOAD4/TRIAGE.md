# TRIAGE: BL-LOAD4 (task-317 stage 1), lens round r1, 2026-11-19
Lenses (DeepSeek deepseek-reasoner, templates .claude/review-templates/lens-<name>.md, run once each, in parallel): compliance, ux, error-paths, code-review. Files: r1-compliance.txt, r1-ux.txt, r1-error-paths.txt, r1-code-review.txt. Material given: plan-under-review.md (PLAN.md + IMPACT.md as first written) and pasted-context.md (the quotes and code excerpts). Process notes: (1) the brief says append the plan to docs/reports/reviews/task-317/context-2026-11-19.md: done (section "Plan steps under review (lane BL-LOAD4)", sha below), but that file is 148,916 characters with the pack, over the tool's 120,000 bound (first attempt refused, r1 files overwritten), so the lenses ran on the lane copies of the same text; (2) lens templates take the plan as the file and the context as --context. Verdicts as written: all four FAIL. Grounder: this lane, each finding opened against the file named. Lens text is not verification; "verified" below means my own opened line or check output.
Key: KEPT = folded into PLAN.md; PART = part folded; REJECTED = reason with file:line.

## Compliance (K1..K8; 3 MET and 1 REJECT lines of the lens not repeated)
K1 HIGH LD-3 recommendation re-scopes RR-0176: PART-KEPT. RR-0176 (MORNING-DECISIONS.md:785 and its block lines 780-786) says "always runs to completion" with no success/failure qualifier; the title says "fails to load after the animation". Recommendation changed from A to B; A kept as the other answer with the honest note. (PLAN.md LD-3.)
K2 MED banner template not used for 429/403/drift: REJECTED. The design's own failure state is a paragraph plus buttons (build.mjs:816-817), not a banner; the REPORT mapping has no Alert (bindings.json mapping.mobile.REPORT: ScrollView, View, Text, Button, Input, ActivityIndicator, SafeAreaView, Svg, SvgPolygon, SvgLine; opened); Alert is in mapping.mobile.LIST only. Recorded in PLAN.md section 7.
K3 MED address only where the response gave it (design needs it for time-out too): KEPT. S2 made a hard prerequisite; dangling id (route.ts:131 match null) has no address, bar carries no title node.
K4 MED no still: PART. S3 now routes the question to the operator as conditional LD-6; stage 2 waits for LOAD.2's still or the answer.
K5 MED recommend B on words / "follows v8" untrue for the sentence: PART. LD-1 recommendation kept (A: cost of B opened: seed-report-v2.mjs:619 generates report-presentation.json:89, 4 error goldens, decl hash), the text no longer claims the sentence follows v8; the gap is stated in the draft.
K6 LOW timeout as a distinct state not named by the design: KEPT. build.mjs:814 note "failed or timed out" is one state; timeout folded into `error` in R2, goldens and IMPACT.
K7 LOW role alert missing: KEPT (also U2). ReportBinding.tsx:372 `accessibilityRole: 'text'`; design `role="alert"` build.mjs:816; GREEN now sets alert with a golden; NotificationToast.tsx:124 shows the role exists in the app; whether S-sbind accepts it: UNVERIFIED.
K8 MED miss frame proposed at operator scope: REJECTED as a defect (duplicate): the plan already makes LD-5 an operator item and builds nothing before the answers (PLAN.md section 4 "Cannot be built TODAY without ... answers to LD-1, LD-2, LD-3, LD-5").

## UX (U1..U8)
U1 HIGH hung request never reaches the frame: KEPT as is (already delta 8 and LD-2; bound lands with the frame, same commit).
U2 HIGH role alert: KEPT (= K7).
U3 HIGH no lot named on error/time-out: KEPT (= K3).
U4 MED Try again gives no visible change for up to a minute: KEPT, opened ([parcelId].tsx:37 `void refetch()`; TanStack v5 keeps status error while refetching: mobile/package.json:29 "^5.99.2", behaviour of v5 error-refetch UNVERIFIED by run). Folded: while isFetching with no page the state is `loading`, which also restarts the bound.
U5 MED sentence and button must agree per class: KEPT as clarification (PLAN.md section 7: the content keys, all existing wording).
U6 MED miss is the tester's only screen before launch: REJECTED as a defect (duplicate of LD-5 and task-348; PLAN.md 1a last bullet already states it).
U7 MED which Back control: KEPT. One new key "Back to Lookup" from the design (build.mjs:817) beside the kept top Back (ReportBinding.tsx:384-389, SCREEN_CONTENT_KEYS :394).
U8 LOW no still: KEPT as named departure (= K4, delta 5).

## Error paths (E1..E7)
E1 HIGH elapsed not reset on retry, dead Try again: KEPT. `timedOut` cleared by Try again; isFetching shows loading (R2, R5).
E2 HIGH double tap starts two lookups: PART. Folded (Try again is not on screen while loading, so one lookup at a time from this screen). Server-side dedup of concurrent computes is LOAD.1's and task-343's (BL-LOAD1B REPORT.md line 4; route.ts meter already_counted per BL-SEMI3 REPORT.md line 46): not changed here.
E3 MED attempt 4 still running after the bound, late settle: KEPT. PLAN.md GREEN: a late page replaces the frame, a late miss changes nothing; the attempt's cost stays LOAD.1's. The BL-METER2 overwrite race is task-343 loose end 1 (task-343 line 151), not changed here.
E4 MED state function not total: KEPT. Fallback `error` retryable, pinned by an unknown error instance in R2.
E5 MED retry on a miss with a hit: REJECTED. A retry re-runs the blocking compute (BL-LOAD1B REPORT.md line 4) for an answer that cannot change until the switch flips or the stamp moves (src/lib/parcels/report-compute.ts:75 literal switch; BL-LOAD1B REPORT.md line 3 "a lot the engine cannot compute is the same null as a miss"). Added to LD-5 grounding.
E6 MED LD-3 answer unowned: KEPT. Seam S4: cut-short transition is LOAD.2's, relayed by the orchestrator; if LD-3 = B nothing extra.
E7 LOW empty page renders an empty report: REJECTED for this task (a page-core defect, not a load failure; MF-57 core output, not named by the card; whether the route can send an empty page: UNVERIFIED, cannot see mobilePageView's guarantee in this pass). Not folded.

## Code review (C1..C8)
C1 HIGH new union members emit unresolved keys: KEPT. Verified: ReportBinding.tsx:30 `LifecycleState = 'loading' | 'miss' | 'error'`, :370-372 `report-${state}` and `states.lifecycle.${state}`. LifecycleState stays three; the refusal class is a separate field.
C2 HIGH mount has no error object: KEPT in part. Verified [parcelId].tsx:23 destructures `{ data, isError, isFetching, refetch }`; the hook returns the whole useQuery result (useParcelLookup.ts:70-76), so `error` is added at the mount; the hook is touched only for the retry clause (the lens's "add to the hook's return" REJECTED: useQuery already returns it).
C3 HIGH bound has no route into reportScreenState: KEPT. Verified semiQuestion.ts:26-35 wraps a promise; the report lookup is a query, so the bound is a mount timer with a `timedOut` flag; only the 60 s constant and neutral naming are reused (PLAN.md GREEN and IMPACT).
C4 MED 401 / 400 have no state: PART. Total fallback `error` (401, AccountDeleted, transport); 400 (malformed id) = miss line without Try again (useParcelLookup.ts:57 does not retry 400).
C5 MED SemiContinueTimeoutError name in a report path: KEPT as a stage-2 naming note (neutral name when shared); no timeout class is reused unchanged.
C6 LOW rename classifyParcelSearchError: REJECTED. It is already the shared classifier of the lot-map and semi pages (semiQuestion.ts:12 import, :66 call); a rename is scope beyond the card (PLAN-PROTOCOL.md:3 no scope creep).
C7 LOW empty address renders an empty Text: KEPT (S2: no title node when no address; a stage-2 test).
C8 REJECT line of the lens (boundedWait late settle): agree, a no-op.

## Totals
Compliance 8 findings: KEPT 3 (K3, K6, K7), PART 3 (K1, K4, K5), REJECTED 2 (K2, K8). UX 8: KEPT 7 (U1, U2, U3, U4, U5, U7, U8), REJECTED 1 (U6). Error paths 7: KEPT 4 (E1, E3, E4, E6), PART 1 (E2), REJECTED 2 (E5, E7). Code review 8: KEPT 4 (C1, C3, C5, C7), PART 2 (C2, C4), REJECTED 1 (C6); the lens's own REJECT line (C8) agreed. Total 31 lens lines: KEPT 18, PART 6, REJECTED 6, plus C8 (the lens's own REJECT, agreed) (some counted once per lens though the same defect: K3=U3, K7=U2).
What the lenses changed in the plan: LD-3 recommendation A to B; timeout folded into the error frame; LifecycleState kept three; the bound a mount timer; error destructured at the mount; Try again shows loading while fetching; role alert; address a hard prerequisite; seam S4 ownership; LD-6 conditional; total fallback; the "follows v8" claim corrected.
Not run: the security lens (no money/auth/PII surface in the minimum; the address-in-URL option was not chosen, the address source is LOAD.2's). The plan-review (failure modes, data reality) template was not run (the brief names compliance, ux, error-paths, code-review).
