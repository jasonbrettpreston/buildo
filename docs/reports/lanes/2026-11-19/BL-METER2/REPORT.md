# REPORT BL-METER2 · task-360 SRCH.METER-2 (head 115cc957d, code commit e37346052)

## The five plain lines for the operator
1. Before: for a possible-semi lot the lookup sent the report page before the question was answered and did not count it (a direct caller got it free); the report screen could flash "No report for this lot yet." for a moment before jumping to the question. Now: the page is not sent until the answer (semi=answered), and the report screen shows the loading state, not the miss text, until it jumps to the question. After the answer the report shows and the lot counts once; a refresh of the answered report keeps showing it (the screen now passes the answered marker to the lookup).
2. Not built: the evaluated-option gate RC-1 (a page can still go out for a lot with no evaluated option and not be counted: ruled "1 b 2 a", no owner; left as it is); the meter rules are unchanged; the semi flag stays a request flag (the answer changes nothing in the report until 7.25, stored answer on task-213/task-209).
3. Operator item: none (no design choice was open; no new string).
4. Lenses: compliance, code-review, ux, error-paths, security ran at the plan stage (r1-*.txt) and again on the diff (r2-*.txt); plan round changed AC wording only (no code change), output round changed two things: the report screen keeps the error state (isError no longer hidden while the question is owed) and the held-lot test now asserts the stored read is not called. All findings in TRIAGE.md (30 rows, KEPT or REJECTED with file:line).
5. Unproven: the mobile jest cases (useParcelLookup.test.ts, reportScreen.mount.behaviour.test.tsx) are not run by the hook (task-343 line 10): UNVERIFIED until CI or device; no device walk of the held pick, the redirect, or the post-Continue report. One race UNVERIFIED (loose end): a no-flag fetch still in flight from the question page resolving after Continue could write page null over the answered entry.

## Confirmed on head before fixing (route read as it is NOW, with the LOAD.1 compute)
- RC-2 TRUE: route.ts (before) built the page via readCustomerPageResponse then computeCustomerPageResponse before the meter and sent it; the meter line only labelled semi_pending. Red proof: red.out, 4 failed | 54 passed in parcel-lookup-gate.infra.test.ts (the three held-lot cases and the unflagged case; the clear-lot guard case passed).
- SE-1 TRUE: useParcelLookup.ts:83-91 (before) sent only parcelId. SE-2 TRUE: lotForm.ts needsSemiQuestion uses the param locally only. UX-2c TRUE: reportScreenState(data,isError) on the settled render before the effect.
- Placement: lotForm read moved ahead of W; `held = lotForm?.unsure === true && semi !== 'answered'`; held skips W and the compute (route.ts:146-155 region). The compute is not run at all for a held lot (test asserts both mocks not called).

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| 1 | checked | parcel-lookup-gate.infra.test.ts "an unsure lot ... NO page ... neither the stored read nor the compute run": page null, meter semi_pending, meterCalls 0 (openReport not reached), W and compute not called. Red: red.out (4 failed); green: commit.out e37346052 "parcel-lookup-gate.infra.test.ts (58 tests)", "Tests 129 passed". |
| 2 | checked | existing cases parcel-lookup-gate.infra.test.ts:346 (semi=answered returns page, one insert, meter counted), :363 already_counted, :378 no evaluated option stays not_evaluated; all green on the new route (commit.out). The stub parcel carries the costMenu EVALUATED line (test file line ~124). New guard case: a clear lot with stored miss still reaches the compute and counts. |
| 3 | checked (no change needed) | parcels-lookup-page.logic.test.ts has no unsure:true case (grep unsure: 1 hit, default mock unsure:false line 41); "parcels-lookup-page.logic.test.ts (22 tests)" green in commit.out. |
| 4 | UNCHECKED (UNVERIFIED) | useParcelLookup.test.ts case "parcelLookupParams sends semi=answered only when the route param is exactly answered" (exact, '', 'Answered', 'yes', 'answered ', 'true', undefined). Reasoning: parcelLookupParams returns {parcelId, semi:'answered'} iff semi === 'answered' (useParcelLookup.ts), else {parcelId}; the expect lines match that. Mobile jest not run. |
| 5 | UNCHECKED (UNVERIFIED) | reportScreen.mount.behaviour.test.tsx "SRCH.METER-2 the held report screen" (4 cases): held unsure page null shows LIFE.loading, not LIFE.miss, one replace to the question route; answered shows the page, no redirect; clear lot still shows miss; param forwarded. Reasoning: with ask true the screen passes data undefined and isError false to reportScreenState, which returns loading. Mobile jest not run. |
| 6 | checked | `npm run typecheck` exit 0 (checks.out AFTER); `git grep -n "semi_pending\|const held"` route.ts prints the held branch (:146) and the meter label (:178,:182) (checks.out). Root tsc only; mobile tsc has pre-existing missing-module errors in this worktree, none in the touched files except the missing @testing-library types (same as sibling tests). |
| 7 | checked | `git grep -n "useParcelLookup(" mobile`: [parcelId].tsx:23 passes semiParam, semi-question.tsx:28 passes none, hook definition :92 (checks.out). ReportBinding.tsx untouched (git show --stat e37346052). |
| 8 | checked (route half); mobile half UNVERIFIED | route: semi=answered counts once and the second lookup is already_counted (infra :346, :363); route string pinned at mobile/__tests__/lotForm.test.ts:50; semi-question.tsx:65-71 fetches with semi:'answered' and stores under the report key (read, not run). |

## Lenses (DeepSeek, run by this lane, adjudicated against the files in TRIAGE.md)
- Plan stage: compliance, code-review, ux, error-paths, security (r1-<lens>.txt on plan.md with the repo context file). Changed: AC3 premise verified at landing, AC4/AC5 test names fixed in the plan; no code change. The one HIGH (query key collision) was REJECTED with semi-question.tsx:65-71 as the proof, with the narrow race left UNVERIFIED.
- Output stage: same five on diff.patch with ctx.md (r2-<lens>.txt). Changed: reportScreen keeps `isError` (UX LOW kept); held-lot test asserts W not called. Rejected: AC3/AC8 "missing" (pre-existing cases and route-string pin cited), error-path items that are pre-existing, security "flag forgeable" (task note, unsure is server-read).
- "verified" in this report means: the hook's related run (commit.out) for the server tests; the named lens for nothing else.

## Pasted checks and hook tails
- checks.out: BEFORE and AFTER all exit=0; surface-validate S-sbind ok (17 surfaces, 426 strings) both times (the brief said 425; unchanged by this lane, no string added); emit-mobile-surfaces "surfaces ok (4 surfaces, 30 goldens)"; registry "clean — no drift (171 rows, 171 descriptors)"; consumer-registry fresh; generate-target-files exit 0; spec-split-check clean; search goldens ok (11); lotmap goldens ok (11); semi-question goldens ok (8).
- red.out (refused attempt, files: gate test + mobile tests + task file): "Test Files 1 failed (1) / Tests 4 failed | 54 passed (58)".
- commit.out (e37346052): "Test Files 4 passed (4) / Tests 129 passed (129)", "GATE OK", "WAITS CHK.5 chk5_tables is empty ...", "POLICY CHECKS OK (commit-msg): 6 file(s)".
- Refusals met and answered: check-task-files twice (reportScreen.mount.behaviour.test.tsx outside the task's Files line; the first widening left explanatory text in the entry, so the entry did not match; widened through the backlog CLI as a bare path, per BL-RESET's precedent). No McFrontend trailer was asked for.
- Rebase: `git rebase wf2/board` = "Current branch wf1/inc1b-meter2 is up to date."

## Commits
- e37346052 fix(100_mobile_parcel_cost_tool): an unsure lot's report page is held ... (code, tests, task file). The reports commit follows (sha in the final line of the task summary / git log).

## Loose ends (one line each, to task-343)
- Narrow race: a no-flag lookup in flight from the semi question page resolving after Continue could overwrite the answered cache entry with page null (useParcelLookup key excludes semi; semi-question.tsx:71). UNVERIFIED, unowned.
- RC-1 evaluated-option gate: no owner (left as is).
- When 7.25 lands the semi answer must be read from a stored answer (GAP.12 task-213), not this flag (already on task-209).
- Mobile jest for the two mobile cases: run on CI/device.
- S-sbind pin reads 426, the brief says 425 (pre-existing, not this lane).

## Not changed, by design
Meter rules, RC-1, any wording, lotForm.ts, semi-question.tsx, ReportBinding.tsx.
