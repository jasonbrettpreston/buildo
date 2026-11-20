Nothing changes for a person: the parcel search, lot-map, semi-question and report pages behave as before (same redirects, same back, same 400 ms search delay); only where the code lives changed. (mobile/app/(app)/parcel-tool/*.tsx; no golden, page test or fixture file was edited, so no golden moved)
Three shared hooks now exist (useSettledRedirect, useGoBack, useDebouncedValue in mobile/src/hooks/useParcelPageHooks.ts) and replace 3 redirect copies, 4 back copies and 1 debounce copy in the four parcel-tool pages.
Stays code: the search page's redirect effect (index.tsx) is NOT converted. The task counts it as a fourth copy; it is not: it keys a ref on the route string, resets it to null when the route goes, and calls navigate = addRecent + router.push (index.tsx:94-105), while the other three use a boolean ref and router.replace once. Converting it would change behaviour. Retry arrows (`void refetch()`) also stay: not one of the three hooks, and semi-question's differs.
UNVERIFIED: phone jest cannot run locally and the pre-commit hook does not run it, so green for the new test and for the page tests comes only from Mobile CI. Locally proven: mobile tsc shows the three missing-export errors before the build and none after; eslint on the touched files prints nothing.
Operator item: none. Note for the orchestrator: the "red" commit landed (5614c611b) because the hook skips phone tests; a red-by-construction test-only commit sits under the build commit on an unpushed branch (squash is an operator/rebase matter; no history rewrite was done).

# BL-HOOKS3 REPORT (task-381, STD.HOOKS)
## Facts opened before building (each rests on the grounder resolution in the task notes / MORNING-DECISIONS.md:1385 and the task text)
- back copies identical x4: index.tsx:115, disambiguate.tsx:53, semi-question.tsx:90, [parcelId].tsx:38 (before the change; git show 9618ef26c:...) TRUE.
- settled-redirect copies x3 (boolean ref + router.replace): disambiguate.tsx:34-40, semi-question.tsx:47-53, [parcelId].tsx:29-33 TRUE. index.tsx:94-105: FALSE as "a fourth copy" (route-keyed, resets, push + addRecent); nothing built for it.
- debounce: index.tsx:41-44 only copy TRUE.
- MORNING-DECISIONS.md:1476 is the operator delegation "Let the grounder resolve them all as long as the result is compliant"; the task notes in the file carry no separate grounder resolution for this task beyond the task text, so the build follows the task text and the facts above. UNVERIFIED whether another grounder note exists elsewhere.
## What was built
- mobile/src/hooks/useParcelPageHooks.ts (new, in mobile/src/hooks, the @/hooks home a mount may import). It is its own file, not added to useParcelLookup.ts (the Files line named that file), because five page tests replace the whole useParcelLookup module with a mock (parcelSearchScreen, lotMapPage, semiQuestionPage, reportScreen.mount, reportScreen.gateStability .test): hooks placed there would be undefined in those tests and force edits to them. The Files line was extended through the backlog CLI to add mobile/src/hooks/useParcelPageHooks.ts and mobile/__tests__/parcelPageHooks.test.tsx (check-task-files refused the test file at the first red attempt).
- useSettledRedirect(target, isFetching) returns markRedirected; semi-question calls it where it set its ref by hand.
- Pages: index, disambiguate, semi-question, [parcelId] now call the hooks; unused imports removed.
- Test: mobile/__tests__/parcelPageHooks.test.tsx: real hooks, only expo-router mocked: background refetch cannot re-fire the redirect; no fire while fetching or with no target; markRedirected blocks a later redirect; back vs cold-open replace; debounce holds, restarts, starts at first value.
## Evidence
- red: red.out (first attempt refused by check-task-files, second landed as 5614c611b because phone tests are not run by the hook) plus mobile tsc red proof: `__tests__/parcelPageHooks.test.tsx(17,10): error TS2305: Module '"@/hooks/useParcelLookup"' has no exported member 'useDebouncedValue'.` (and useGoBack, useSettledRedirect)
- green: commit 5b744d820 through the real hooks; commit.out holds `GATE OK` and `POLICY CHECKS OK (commit-msg): 6 file(s)`; the related-tests run was skipped by the hook ("no staged src/ or scripts/ source files").
- mobile tsc after the build: /tmp/hooks3-tsc-green.txt has no line for useParcelPageHooks or the parcel-tool pages; the only remaining parcelPageHooks line is the local missing-module error for @testing-library/react-native, which the same file shows for every existing test (local node_modules gap, not this change).
- `backlog doctor`: "No duplicate IDs, self-referential dependencies, or dependency cycles found."
## Lens set (DeepSeek, rule lists whole; lens-input split lists into parts)
- plan stage: plan-review-deepseek, plan-ux, plan-error-paths, plan-compliance for all 11 lists (mobile-99, surface-126 and surface-135 in parts) before any code; out stage: out-code-review, out-ux, out-error-paths, out-compliance for all 11 lists (surface-126 in 3 parts); all in docs/reports/lanes/2026-11-20/BL-HOOKS3/ with in- inputs and TASK = task-381. The plan-stage review file is named plan-review-deepseek.txt (renamed once from plan-plan-review-deepseek.txt before commit; content untouched).
- Findings untriaged in FINDINGS.md (same dir); no verdicts, no GROUNDER.md by the lane. Material of the out stage: the diff of mobile/ since 9618ef26c (docs/reports/reviews/task-381/change-2026-11-20.diff), the task file diff not included.
- Plan lens findings were not folded into code by the lane (no verdicts given); one plan wording slip (useSettledRedirect "returns void" and "returns markRedirected") was resolved in the build as returning markRedirected.
## Not done
- No push, no DB, no full suite, no checkout/reset/stash. Task left RUNNING; grounder owed. GROUNDER.md owed from a separate agent: the commit that sets the task BUILT is refused without it.
- Hooks' --check scripts for the surface files: ran inside the real commit (GATE OK).
STATUS: task-381 BL-HOOKS3 ready, RUNNING, grounder owed; phone-test green unproven until Mobile CI. Question: should the red-by-construction test commit 5614c611b be squashed into the build commit at the station?

## Plain additions after the grounder (2026-11-20)
- Red was a mobile typecheck missing-export error (TS2305 for the three hooks) plus a landed test-only commit; the pre-commit hook runs no phone test, so it never refused the test.
- The test file changed between the two commits (the first commit imported the hooks from useParcelLookup and mocked apiClient, authStore and Sentry; the second imports them from useParcelPageHooks and mocks only expo-router).
- Mobile CI is the first real run of these tests, and of the page tests after the change.
- The task card's count of four redirect copies was wrong: three is true (index.tsx's effect is a different route-keyed push).
- Doc-only fix commit: header cites corrected (Spec 126 11b cite replaced by bindings.json mount_internal and Spec 135 FE-31 words; Spec 99 6.5 cite reworded to what 6.5 says, "Gate conditions MUST be stable signals"; Spec 99 holds no redirect-once rule: grep for "redirect" in it found none); Spec 100 Target Files now lists useParcelPageHooks.ts and parcelPageHooks.test.tsx.
