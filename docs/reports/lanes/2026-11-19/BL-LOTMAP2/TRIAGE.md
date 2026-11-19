# TRIAGE BL-LOTMAP2 (task-362) - grounder adjudication (Spec 08 5.3 round 2); every verdict against an opened file:line

## Head confirmation (before any change, head 34d90b858)
- UX-6 TRUE: mobile/src/lib/maxbldHelp.ts:19 `void Linking.openURL(helpUrl(topic, q));` (read). Design: v8 search.html:235; pattern already in the app: mobile/src/hooks/useSubscribeCheckout.ts:61 `await WebBrowser.openBrowserAsync(parsed.data.url)`, also usePortalSession.ts:55, onboarding/terms.tsx:146,162 (Terms and Privacy open in the in-app browser today); expo-web-browser ~15.0.11 mobile/package.json:46.
- UX-7b TRUE: `git grep -n "Pick a lot on the map" -- mobile scripts docs/specs` printed nothing; v8 choose-lot.html:278 draws it (only in state 1; the "Lot A chosen" state draws no hint, so hide-after-pick matches the mock).
- UX-7a FALSE per the task; not touched.

## Round 1 (plan) lenses: compliance, code-review, ux, error-paths (r1-*.txt, context-2026-11-19.md)
| # | Lens | Finding | Verdict | Evidence / action |
|---|---|---|---|---|
| 1 | compliance | semi-question.html:130 half of AC6 not planned | REJECTED as a build item | semi-question.html:130 is `.btn.p[aria-busy]`, the semi page busy rule; the lot map has no busy state; already pinned at mobile/__tests__/semiQuestionPage.behaviour.test.tsx:102 (BL-SEMI3). Named in the report. |
| 2 | compliance | plan stops at --write, no --check | KEPT (already in the steps) | checks.out BEFORE/AFTER run all --check scripts |
| 3 | compliance | typecheck + UNVERIFIED wording missing | KEPT | typecheck.out; REPORT carries UNVERIFIED for mobile jest |
| 4 | compliance | search page caller has no case | KEPT | parcelSearchScreen.behaviour.test.tsx new case (press parcel-search-report) |
| 5 | compliance | hint anchored to "Continue" not "Choose a lot" | REJECTED (same node) | LotMapBinding.tsx continueButton: label content select.none "Choose a lot" while route is null (content.json:11); one node |
| 6 | compliance | S-sbind data pin | KEPT (note only) | dated comments in both root tests |
| 7 | code-review | await/catch so a rejection is logged | KEPT | maxbldHelp.ts try { await ... } catch; rejecting case in maxbldHelp.test.ts |
| 8 | code-review | other Linking members when import removed | REJECTED | `grep -n Linking mobile/src/lib/maxbldHelp.ts` showed only lines 4, 8, 17 (comment, import, call) |
| 9 | code-review | route may not be the pick flag | REJECTED | LotMapBinding.tsx:214,216 already disabled from s.route === null; one predicate awaitingPick now |
| 10 | ux | hint under the Choose a lot button | KEPT | pick-hint node placed directly after the continue node (golden test asserts index+1) |
| 11 | ux | aria-describedby relation lost | KEPT | accessibilityHint content select.hint on the disabled button; same prop pattern as SearchBinding.tsx:83 |
| 12 | ux | silent help failure | OPERATOR ITEM, not built | design silent (RR-0233); a Linking fallback would contradict AC1 |
| 13 | ux | Android no Done | KEPT as close-out statement | AC5 says state it; stated in REPORT and maxbldHelp.ts doc comment |
| 14 | ux | pickHint vs v8 .small | KEPT (checked) | v8 choose-lot.html:79 `.small ... font:13px/18px color:t3`; built class reuses helpPrompt tokens text-xs (12px) text-report-soft: nearest existing tokens (RR-0282 no new tokens); noted UNVERIFIED on device |
| 15 | error-paths | in-flight guard for double tap | REJECTED | outside the six ACs; openBrowserAsync behaviour on a second call not measured (UNVERIFIED); PLAN-PROTOCOL.md:3 no scope creep |
| 16 | error-paths | rejection case missing | KEPT | maxbldHelp.test.ts case 3 |
| 17 | error-paths | return boolean | REJECTED | no designed retry/message to drive; scope |
| 18 | error-paths | one predicate | KEPT | awaitingPick |
| 19 | error-paths | missing content key blank | REJECTED (covered) | lotMapScreens.golden.test.ts "every content ref names a key" and SurfaceRenderer.tsx:79 throws on an unknown content key |

## Round 2 (output) lenses on the diff (r2-*.txt; context pasted-context.md)
| # | Lens | Finding | Verdict | Evidence / action |
|---|---|---|---|---|
| 1 | compliance | pin quote drops type="button" | KEPT, fixed | lotMapScreens.golden.test.ts quote now verbatim |
| 2 | compliance | CI/typecheck attach | KEPT (REPORT) | typecheck.out |
| 3 | compliance | Terms/Privacy links | REJECTED (out of scope) | task names Help only; they already use openBrowserAsync (terms.tsx:146,162) |
| 4 | code-review | disabled should use awaitingPick | KEPT, fixed | LotMapBinding.tsx disabled/accessibilityState use awaitingPick(s) |
| 5 | code-review | hint outside choose arm | REJECTED | `grep -n "continueButton(" LotMapBinding.tsx` : one use, line 249, the multi_parcel arm that also emits pickHint |
| 6 | code-review | floating promise at callers | REJECTED | callers pass the function as an action (`open_help: openHelp`), SurfaceRenderer.tsx:129 returns it into a handler; type is (…) => void; no no-floating-promises config found in mobile |
| 7 | code-review | restore mocks in afterEach | KEPT, fixed | maxbldHelp.test.ts afterEach restoreAllMocks |
| 8 | ux | silent failure | OPERATOR ITEM (same as R1-12) | |
| 9 | ux | layout jump on hint removal | OPERATOR ITEM / not built | design silent; the mock draws no hint in the chosen state (choose-lot.html: only line 278); reserving height is a design choice (RR-0233) |
| 10 | error-paths | no fallback, double tap, arm-scoped hint | same as above | REJECTED / OPERATOR ITEM |
| extra | grounder | stale comments saying Linking | KEPT, fixed | index.tsx:116 and disambiguate.tsx:50 comments updated |
