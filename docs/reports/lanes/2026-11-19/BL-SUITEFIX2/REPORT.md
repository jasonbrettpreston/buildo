# REPORT BL-SUITEFIX2 task-353 (SUITE.FIX-2, Increment 1·B)
Status line (Spec 137 rule 3): six of the seven station failures are fixed in commit 44789da8c on wf1/inc1b-suitefix2 (unpushed); the seventh (C-9m, the 44 px pin against the approved 48 px semi buttons) is an operator item and stays red.

## The five lines for the operator
1. What failed: the station suite had 7 red cases on the combined head: a register lock listed as "not yet written" whose test file now exists (FE-39), the search page now has 11 states where the check pinned 10, a phone page file importing a library it may not (the semi page), and the semi page's 48 px buttons against a check that pins 44 px.
2. What was fixed and nothing weakened: FE-39 is listed as "landed, flip pending" with a dated comment; the state count and name list moved 10 to 11 with a dated comment; the semi page's library call moved into the hooks file where it is allowed. No test deleted, skipped or loosened; every case still checks what it checked.
3. The 44 px item (yours): the check says every phone Button is exactly 44 px; the mock you approved (RR-0309) draws the semi page's Continue and Try again at 48 px. Options: (A) list 48 px as a second accepted size for Button (data, plus three hard-coded expected messages in the check change); (B) change the semi buttons to 44 px (moves an approved pixel). I recommend A. UNVERIFIED on a device: 48 px is not measured, only read from the goldens and the class.
4. The next suite run must prove: the four FE-09 cases, the FE-07 case and C-2 pass (the pre-commit related run showed them pass), and that C-9m is the only red case until you rule.
5. Unproven: C-9m's fix (not made); the mobile jest test I edited (not run: lane rule); the full suite; lot-map-data-check (needs a database).

## Table
| failure | cause (file:line, commit, lane) | fix | proof |
| FE-09 x4 (test:126,160,204,215) | "FE-39 OWED but exists src/tests/surfaces/engine-inputs-bind.logic.test.ts": register line 61 last cell (OWED) vs the lock file added by 40cbd77b1 (BL-MB94C, task-121) | register-locks-resolve.infra.test.ts FLIP_PENDING = ['FE-39'] with dated comment (file's own MF-37 pattern, :20-22); row not flipped (operator) | commit.out: "register-locks-resolve.infra.test.ts (15 tests)" passed |
| FE-07 (test:86) | descriptor mobile_parcel_search states now 11: state hit, golden reports_left, ace05ccee (BL-A6, task-320); both reports_left.web.json and .mobile.json tracked | title "all 11", list gains 'reports_left', dated comment | commit.out: "search-parity.golden.test.ts (8 tests)" passed (incl. the 2 parity cases over the new state) |
| C-2 (test:272) | mobile/app/(app)/parcel-tool/semi-question.tsx:15 imports @tanstack/react-query in a mount file (bindings.json mounts[]; mount_internal allows @/hooks/ only), 9fea46277 (BL-SEMI2, task-319) | new useSetParcelLookup in mobile/src/hooks/useParcelLookup.ts (same key and value); mount calls it; jest mock in semiQuestionPage.behaviour.test.tsx follows with the same assertions (:85,:109); bindings.json untouched | attempt1.out (refused commit with surface-conformance staged): "C-2 the import boundary ... passed"; only C-9m failed |
| C-9m (test:896) | 3 Button nodes at min-h-[48px]: semi answered, ask (children/1/children/0/children/4) and error (children/1/children/0/children/0/children/1) goldens, 9fea46277 (BL-SEMI2); test shows the first only | NONE (operator item) | red.out; attempt1.out shows exactly this one line failing |

## The 44 px item in full
Rule: surface-conformance.logic.test.ts:870 (mobileTouchProblems: exactly one min-h- token, and a listed one), title :889 "carries min-h-[44px] and no other min-h-"; data scripts/surfaces/_schema/bindings.json touch_targets.mobile {Button: ["min-h-[44px]"], Input: ["min-h-[44px]"]}; MF-35 plan v3 section 4 row 5 "Only min-h-[44px] gives 44" (NativeWind rem 14 so min-h-11 is 38.5).
Approved design: semi mock, 48 px Continue and Try again (RR-0309 MORNING-DECISIONS.md:1199 "Mock approved. Looks good!"; semi DELTA.md section 2 item 3); built class "mt-6 min-h-[48px] w-full rounded-xl".
Floor text: Spec 128:265 ASK-19 ("A measured value below 44 is a FINDING"), Spec 126:351 ("touch-target floor (44×44)"); web touch_targets already lists 50 and 60 px sizes (bindings.json $comment). So the specs say floor, the test says exact token.
Why I did not do the data-only option: adding min-h-[48px] to Button's list also changes three hard-coded expectations "needs exactly min-h-[44px]" (test:909-913, the list is joined with "|") and two jest messages (mobile/__tests__/parcelScreens.golden.test.ts, reportScreens.golden.test.ts), and the test title says "no other"; that is not a change that needs no ruling.
Grounded: the finding and the cause (verified by node walk of all 76 sized nodes, the suite's own failure line, git -S for min-h-[48px]: 9fea46277). Recommendation: A (floor semantics, three-way precedent of web 50/60); UNVERIFIED: no device measurement; not verified by a repo review round on this option (r1 gave the same observation, TRIAGE R8/K2).

## Checks (checks.out): all clean before and after
surface-validate, emit-mobile-surfaces, generate-surface-registry, consumer-registry, generate-target-files, search/lotmap/semi golden --check, spec-split-check, generated-docs, decision-log, emit-mobile-theme: rc=0 BEFORE and AFTER. lot-map-data-check needs a database URL: NOT RUN (UNVERIFIED). typecheck (npm run typecheck) clean.
Hook tail (commit.out): "Test Files 2 passed (2) Tests 23 passed (23)" / "GATE OK" / "POLICY CHECKS OK (commit-msg): 5 file(s)" / "[wf1/inc1b-suitefix2 44789da8c]".
Related run with the third file: attempt1.out (commit refused): "Test Files 1 failed | 2 passed (3) Tests 1 failed | 66 passed (67)", the one failure C-9m. A commit with surface-conformance.logic.test.ts staged cannot land while C-9m is red; so that file is not in the commit and its C-2 proof is the refused attempt (a dated comment I added there for the attempt was removed again, not committed).

## BL-W2 and BL-PROOF2
Commits of task-123 (1ee2c3964, ace93fc92, 3364b5636): all generator checks clean (consumer-registry fresh, target-files, surface-validate). Their pins are in files outside the three failing ones; no further failure found by reasoning. BL-PROOF2 added proof-slice tests only (no pin of these three files). The full suite not run: UNVERIFIED.

## Review (r1-plan.txt, TRIAGE.md): KEPT K1-K4 (other jest mock sites checked: none renders the semi page; C-9m framing; PROOF2 hedge closed; operator item); rest rejected with lines.

## UNVERIFIED
- The mobile jest file semiQuestionPage.behaviour.test.tsx (edited mock) was not run (no runner rule); typecheck may not cover mobile/.
- C-9m status after the operator rules; full suite; lot-map-data-check (database); device pixel height of 48 px.
- Follow-up not done (scope): mounts[] is a hand list, so an unlisted mount escapes C-2 (r1 R6).

STATUS: blocked (6 of 7 fixed and committed; C-9m waits on the operator)
