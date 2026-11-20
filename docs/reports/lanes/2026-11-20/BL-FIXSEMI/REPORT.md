# REPORT: BL-FIXSEMI, task-373 FIX.SEMI (Increment 1·B)

## Five plain lines for the operator
1. What changes for a person: nothing. The semi page, its busy state, its 60 s wait and its error state behave as task-361 built them.
2. What each fix does: D5 the Continue lookup now runs through the app's query layer (a TanStack mutation in the lookup hook file) instead of a hand-made fetch in the page; D4 the reports-left query key is now listed in the Spec 99 registry; D12 one new test pins that the report screen does not change when a background refresh starts or stops.
3. Phone-test green is UNPROVEN until Mobile CI runs after the push: nothing local runs mobile jest, so none of the new or old phone cases were run by this lane.
4. Unverified: whether the server counts a second semi=answered lookup twice after a timed-out first one (existing task-361 behaviour, not changed); whether the grounder wants the cache write moved into the mutation (it stays in the page after the mount check so an unmounted page stores nothing, as the existing case asserts); the 60 s constant is untouched.
5. Operator item: none new (the 60 s constant stays the open item from task-361). Grounder owed; task left RUNNING.

## 1. Defects confirmed on the head (AC1), base 9336f2639
- D5: mobile/app/(app)/parcel-tool/semi-question.tsx:64 `result = await boundedWait(fetchParcelLookup({ parcelId: id, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);` and :74 `storeLookup(id, result);` (git show 9336f2639). Rule Spec 99:219 "Every server fetch MUST go through TanStack Query".
- D4: mobile/src/hooks/useParcelLookup.ts:134 (head) `queryKey: ['parcel-entitlement']`; the registry (99:230-235) ended at `['parcel-lookup', parcelId]`; rule 99:226.
- D12: mobile/app/(app)/parcel-tool/[parcelId].tsx:23,30,33 use isFetching only in the redirect effect; `grep isFetching mobile/__tests__/reportScreen.mount.behaviour.test.tsx` found nothing; rule Spec 99 8.3 (99:702-704).

## 2. What changed
- mobile/src/hooks/useParcelLookup.ts: `answeredParcelLookup(parcelId)` = boundedWait(fetchParcelLookup({parcelId, semi:'answered'}), SEMI_CONTINUE_WAIT_MS); `buildAnswerParcelLookupOptions()` = { mutationFn, retry: 0, networkMode: 'always' }; `useAnswerParcelLookup()` = useMutation(options) (the form of useSaveLead / useRemoveFromBoard). networkMode 'always' because the library default pauses a mutation offline, so the bounded wait would never start (found by this lane's own check, TRIAGE K3). The 60 s constant stays in mobile/src/lib/semiQuestion.ts:16, imported, not changed.
- mobile/app/(app)/parcel-tool/semi-question.tsx: Continue calls `answerLookup(id)` (mutateAsync); the submittingRef latch, busy state, empty-id guard, mountedRef guard, try/catch/finally, storeLookup after the mount check and router.replace are as on the head.
- docs/specs/03-mobile/99_mobile_state_architecture.md: one registry row for `['parcel-entitlement']` in the table's form (Query key | Owner hook | Notes).
- Tests (cases added only): mobile/__tests__/useParcelLookup.test.ts (5 cases: answered request, bounded wait with fake timers, failure passes through, schema drift, options pins); mobile/__tests__/semiQuestionPage.behaviour.test.tsx (the module mock gains `useAnswerParcelLookup` built on the same mocked fetch and the real boundedWait; one new case; every existing assertion untouched); new mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx (5 states, isFetching true vs false, tree equal per state).

## 3. Tests red then green (AC2), stated plainly
- red.out: commit 33173dea6 (only the 3 test files and the task file staged). The hook ran: the static checks, root `npm run typecheck`, lint, and skipped the related run ("no staged src/ or scripts/ source files"). It ran NO phone test, and the root typecheck does not cover mobile, so the commit LANDED: the red proof is therefore the mobile typecheck on that tree (typecheck-before.out: TS2724/TS2305 for `answeredParcelLookup` and `buildAnswerParcelLookupOptions`), not a failing run. The D12 test cannot be red (the gate was already stable); it is the missing test itself.
- green: the final commit's hook tail is commit.out. No mobile jest ran. Mobile CI after the push is the only proof: UNVERIFIED until then.

## 4. Mobile typecheck (`cd mobile && npm run typecheck`)
- before (head state + red tests): typecheck-before.out 16 errors: 13 environmental (modules @testing-library/react-native, class-variance-authority, @rn-primitives/slot, tailwind-merge not in the shared node_modules, plus two implicit-any lines that follow from the missing module: reportPage.behaviour.test.tsx(40), semiQuestionPage.behaviour.test.tsx(73)), 1 for the new gate test file (same missing module), 2 for the missing hook exports (red).
- after: typecheck-after.out 14 errors: the same 13 environmental plus the new gate test file's missing-module line; the 2 hook-export errors are gone. No new error on a changed line other than that environmental module line.

## 5. Lens set (AC3), no verdicts from this lane
Run with the rule lists whole (Spec 99 whole in 3 parts, Spec 90 whole, Spec 100 whole in 2 parts, Spec 136 section 2, standards 5 and 9, plus a rulings pack) at plan (r1) and output (r2). Counts of BUG/DEFER lines by lens: r1 compliance 50, error-paths 7, code-review 5; r2 compliance 37, error-paths 6, code-review 5, regression 13 (plan-review-deepseek template as the regression lens; there is no regression template). Every finding by id is in FINDINGS.md; KEEP/REJECT with opened lines in TRIAGE.md (K1-K11 kept, R1-R23 rejected). Limits: each pack part is judged alone, so clauses in another part are reported "not pasted"; the lenses' own PASS lines are not relied on. Round 0 (the brief's plan command) reviewed the context file, which is a generator output (r0-plan.txt); rejected as out of scope except where noted.

## 6. UNVERIFIED
Mobile CI green; server double-count after a timed-out first lookup; whether Spec 90 s7 (offline mutation queue) is meant to cover this read-as-mutation (this lane read it as covering saves, R2/R12); Spec 99 s10 wording on the registry row (R4); std 5.1 factory scope over mobile tests (R15); McTest scenario row for this slice (R10); the hook's options reaching useMutation (one line, no local mobile runner).

STATUS: ready (grounder owed; task-373 left RUNNING)
