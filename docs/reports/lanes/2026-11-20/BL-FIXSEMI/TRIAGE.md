# TRIAGE round 1 (plan altitude), lane BL-FIXSEMI, task-373
Files: r0-plan.txt (plan-review-deepseek on the G1 context file, as the brief names), r1-compliance-<pack>.txt (10 packs: Spec 99 x3, Spec 90, Spec 100 x2, Spec 136 s2, std s5, std s9, rulings), r1-error-paths-rulings-p1.txt, r1-code-review-rulings-p1.txt. No verdicts by this lane; KEEP/REJECT is a plan-edit decision only; the separate grounder rules.

KEEP (plan changed)
- K1 error-paths/code-review: no try/catch/finally named. Plan now names it (page keeps try/catch/finally from semi-question.tsx:62-72 on head).
- K2 error-paths: mutation retry inherited. Plan: retry: 0 pinned in the hook options.
- K3 own check prompted by Spec 90 section 7 (offline mutation queue) and error-paths: TanStack default networkMode 'online' pauses a mutation while offline, so the boundedWait inside mutationFn would never start and the page would stay busy. Plan: networkMode: 'always' pinned (keeps task-361 behaviour: fail at once, error state), tested through an exported options builder (pattern: usePatchProfile buildPatchProfileOptions).
- K4 code-review: test must reach the function. Plan: module-scope exported answeredParcelLookup(parcelId) and buildAnswerParcelLookupOptions().
- K5 compliance Spec 99 / Spec 100: D12 identity is per state (isFetching true vs false on the SAME state), never across states; add the served-page state. Plan edited.
- K6 compliance Spec 99 B1 table: row form is Query key | Owner hook | Notes; the key has no parameter (user's own plan, not per parcel) so no parcelId; Notes cell required (persistence). Plan edited (persistence: read useParcelEntitlement/persistFilter.ts before writing the note).
- K7 AC1: paste head file:line for each defect in REPORT.md.
- K8 AC3 step missing from the numbered plan text of the first draft: present in task plan step 6; copy to plan.md.

REJECT (opened line)
- R1 r0-plan: all generator/context-file defects (missing doc-2/doc-16, truncated quotes, undefined quotes): about backlog-brief.mjs, not this change; outside task-373 scope (TKT-1). Real part kept: none needed beyond K-items. (r0 "unmount mid-wait / retry / empty-id ordering" siblings: covered by K1, K2 and the page-level empty-id guard kept before the mutation call.)
- R2 Spec 90 s7 offline queue: applies to saving mutations (a lead save); this is a GET lookup (semi-question.tsx:64 calls fetchParcelLookup, a read) that must fail at once offline to show the error state (task-361 behaviour, semiQuestionPage.behaviour.test.tsx 'failed fetch'); K3 is the real hazard. Not queued.
- R3 Spec 90 s7 "dual source of truth": the lookup stays in ['parcel-lookup', id] only; the page stores through the existing useSetParcelLookup after the mount check (head: useParcelLookup.ts:108-114); no second store.
- R4 Spec 99 s10 amendment: the B1 table's own text (99:226) says "Adding a new server query requires a row here"; the row is bookkeeping the rule asks for, not a new bridge pattern; the grounder confirmed D4 as a docs defect (GROUNDER.md:71). No amendment.
- R5 Spec 100 s6 "no render tree": the repo's own render tests exist (reportScreen.mount.behaviour.test.tsx) and the task-361 cases are render tests; note 2026-11-12 governs the report route.
- R6 task-323 scope ("page mock link only") against D4/D12: the task is the grounder-confirmed defects (task-373 Description), not task-323.
- R7 "paste Spec 99 not in context": my packs carry Spec 99 whole in 3 parts; the r1 runs were each given one part; section 8.3 and 4 B1 were present in parts 2 and 1/2 respectively (a single part cannot judge cross-part clauses: stated as a tool limit).
- R8 fe.xx (Spec 136) clauses on bindings: no binding file is changed.
- R9 abort-controller / idempotency: boundedWait cannot abort fetchWithAuth (brief forbids touching the 60 s mechanism and the page behaviour); lookup with semi flag is server-side counted once per produced report (task-319); unchanged from head. Noted as UNVERIFIED for the grounder.
- R10 McTest scenario row (fe.40): no scenario row cited for this slice; UNVERIFIED, grounder question.

# TRIAGE round 2 (output altitude; diff output.diff 18111 chars), same method
Files: r2-compliance-<10 packs>.txt, r2-error-paths-rulings-p1.txt, r2-code-review-rulings-p1.txt (see FINDINGS.md count), r2-regression-regression-p1.txt (plan-review-deepseek template used as the regression lens, head semi page and head cases as context).

KEEP (changed in the tree)
- K9 regression/code-review: `length > 100` proxy in the gate test is arbitrary: replaced by `not.toBe('null')` (reportScreen.gateStability.behaviour.test.tsx).
- K10 regression: callers must catch mutateAsync: contract comment added on useAnswerParcelLookup (useParcelLookup.ts).
Opened and found true, no change needed (premises the regression lens listed): [parcelId].tsx imports only useParcelLookup from the hook module (line 17), so the gate test's one-export mock is enough; useParcelEntitlement uses useQuery (useParcelLookup.ts); persistFilter.ts:28 NOT_PERSISTED lists 'parcel-entitlement'; page_v21.mobile.json is read by the existing mount test; no other test mounts semi-question.tsx (grep of mobile/__tests__: only semiQuestionPage.behaviour.test.tsx mounts it; the others read goldens or the route string).

REJECT (opened line)
- R11 compliance "Spec 99 s10 needs a WF1 amendment for the row": same as R4; the row is the registry's own stated requirement (99:226).
- R12 compliance "Spec 90 s7 offline queue": same as R2; a lookup is a read; queuing would hide the error state. Left to the grounder (the lens quotes a clause about saving mutations).
- R13 "Spec 99/100 clause not pasted": each pack is one part; the clause sits in another part (tool limit of splitting).
- R14 "Spec 136 fe.01 build starts after increment 2": fe.01 is about McFrontend build scope; 1.B surfaces are already built under task-323; not a clause of this fix.
- R15 factory rule std 5.1 (src/tests/factories.ts) for mobile tests: that rule is written for the root src tests; mobile jest tests inline fixtures throughout (semiQuestionPage.behaviour.test.tsx `data`, reportScreen.mount.behaviour.test.tsx `hit`); the new cases follow the nearest pattern. Grounder to confirm the scope of 5.1 over mobile/__tests__.
- R16 section 5.2 file-name pattern (*.ui.test.tsx): mobile tests are named `.behaviour.test.tsx` (existing files); following the existing pattern.
- R17 "Spec 99 s3 matrix row for entitlement fields": s3 is the store-field matrix (GROUNDER.md:243 F-336 REJECTED notbound, same reason).
- R18 abort/idempotency of the timed-out fetch (error-paths, regression): task-361 behaviour kept; boundedWait does not abort (semiQuestion.ts:26-33; the brief keeps the wait as built). UNVERIFIED whether the server counts a second semi=answered lookup twice; grounder item.
- R19 "mock hides the TanStack mutation in the page test": true limit; the options and function are pinned in useParcelLookup.test.ts; no local runner for mobile jest.
- R20 SRCH.A6 row "unrelated to task-373": the row is D4, named in the task title.
- K11 code-review: it.each table typed (it.each<[string, unknown, boolean]>) and the dead mockReplace clear removed.
- R21 code-review "source-text assertion": kept as one extra guard beside the wiring assertion (mockAnswerCalls); the wiring is asserted in the same case.
- R22 code-review "no test feeds the options to useMutation": a one-line wrapper (useParcelLookup.ts); no local mobile runner to render the hook; UNVERIFIED, grounder item.
- R23 code-review "stub useSetParcelLookup/useParcelEntitlement in the gate test mock": route imports only useParcelLookup (checked above).
