# REPORT: BL-HB367, task-367 COMPLY.3 (stage 1, build)
1. What changed: three new tests check three McFrontend handbook rules that nothing checked before: every parcel screen that reads data says what the user sees when it fails (fe.54), no parcel screen links to the lead product (fe.49), and the parcel tabs do not "push" a tab (fe.51, with the two known pushes listed as owned exceptions). fe.49 and fe.54 now read RULED; fe.51 stays OWED until you answer Q-D.
2. Acceptance items 1-6 all printed what the plan expects: 3 test files; red.out shows "Test Files 3 failed (3)" with the four named lines; 20 OWED lines (the not-yes branch); both generator checks exit 0; both trailers present and 0 FE ids in each message; no app, descriptor or mobile file changed; all three SPEC LINK headers. Item 7 (pre-push list) is the orchestrator's and was not run.
3. Not built as the plan says: (a) the plan's commit 1 subject tail "FE-51 waits" was written "fe.51 waits", because the same plan section and the brief forbid any FE id in a message; (b) handbook-rule-map reads FLIP_PENDING from the register-locks-resolve file text instead of a second list (the constant is not exported); (c) the close dry-run used a throwaway git index, not a throwaway clone, because the disk is 99% full (6.0 GiB free, the tracked tree is 1.2 GB).
4. Unverified / not done: 35 of the 78 output lens runs failed at DeepSeek with "402 Insufficient Balance"; the output review is INCOMPLETE (43 outputs, 174 findings untriaged). No grounder has run. The closing commit is not made; the task stays RUNNING.
5. Operator-only blocker: top up the DeepSeek balance, then the orchestrator resumes this lane to run the 35 missing lenses (same input files, same names). Q-D (fe.51 RULED with two named, owned exceptions?) is still yours; many lens findings (1 CRIT, most HIGH) argue that RR-0413 already flips fe.51; that is for the grounder and you, not the lane.

## Commits (branch wf1/inc1b-hb367, nothing pushed)
- 7dc3b9132 commit 0 (alone and first): MF-98 queue row (RUNNING; FE rows owned: FE-49, FE-54.; Next free id MF-99 by dated note, MF-97 held by BL-FEDB442), prereg-MF-98-1.json (round 203, rules FE-09, FE-10, FE-16, FE-36; totals = prereg-MF-96-1.json), docs/reports/panels/MF-98.json. Hook tail: "GATE OK", "POLICY CHECKS OK (commit-msg)" (lane commit0.out).
- red attempt (refused, no commit): lane red.out = docs/reports/reviews/task-367/red.out: "Test Files  3 failed (3)", "Tests  3 failed | 8 passed (11)"; each failure at the (A) assertion: "mobile_parcel_search: reads a contract but declares no error state", "planted/lead-feed-import.tsx:1 lead screen import: LeadFeed from \"@/hooks/useLeadFeed\"", "mobile/app/(app)/parcel-tool/_layout.tsx:48 router.push(PARCEL_TAB_ROUTE[tab])", "mobile/app/(app)/parcel-tool/tracked.tsx:99 router.push(PARCEL_TAB_ROUTE.account)". No typecheck or lint line is the cause (0 such lines).
- d5e3695b9 commit 1 (work): the three tests (plants removed, two owned entries in), Spec 135 FE-49 and FE-54 cells RULED with the plan's dated note (prior cell text kept between the new status and the note), FE-51 added to FLIP_PENDING, handbook-rule-map edits (BUILT_BY_367, floor 21 minus RULED, RULED pattern), Spec 136 / rule map / rule-lists page regenerated, MF-98 next: line. Green (lane commit.out): "Test Files  5 passed (5)", "Tests  67 passed (67)" (register-locks-resolve 15, failure-state-declared 3, scope-fence 3, nav-tab-switch 5, handbook-rule-map 41).
- the records commit after d5e3695b9: output review round 1 inputs (78), the 43 outputs that ran, TASK, FINDINGS.md, context-r2.md, context-r3.md, red.out, task notes.

## Acceptance (plan section 8), pasted on the task with --append-notes
```
AC1: 3
AC2: red.out 'Test Files  3 failed (3)' lines: 1; 'mobile_parcel_search: reads a contract but declares no error state' 3; useLeadFeed 1; _layout.tsx 1; tracked.tsx 1
AC3: Status: OWED count 20 (NOT-YES branch: 20)
AC3 generate-surface-handbook --check exit 0 ; rule-lists page --check exit 0
AC4: trailers: 2 of 2; FE-id count in message: 0 (commit 0: 0)
AC5: diff --stat cf5c7be06..HEAD over mobile src/app src/lib src/components scripts/surfaces (minus the rule map) prints []
AC6: all three start "// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md"
```
Ran by the lane: items 1-6. Waits for the orchestrator: item 7 (pre-push list at the push station).

## Output review (round 1, INCOMPLETE)
- Context: docs/reports/reviews/task-367/context-r3.md (fresh, from backlog-brief.mjs --board ~/Buildo-wt-board). Diff: the brief's command, base cf5c7be06 (launch commit), 98,960 bytes.
- Ran (43): code-review-p1; compliance agents-s5-1to3 p1-2, agents-s7-s11 p1-2, bylaw-133 p1-9, five-words p1-2, inc-S p1-2, ms-S, orchestrator-doc17 p1-2, plan-protocol p1-4, policy-124-s2-s5 p1-6, queue-137 p1-2, surface-126 p1 and p10-p17, surface-127 p2.
- Missing (35, DeepSeek "402 Insufficient Balance" after a first "429 ... concurrency limit of 6 based on your remaining balance"): surface-126 p2-p9 and p18; surface-127 p1, p3; surface-128 p1-p4; surface-135 p1-p12; surface-136 p1-p2; engineering eng-all p1-p3; error-paths-p1; security-p1; ux-p1. Re-run: `PAR=3 node ~/Buildo-scratch/lanes-20261119/inc1b/hb367-lane/tools/run-lenses.mjs docs/reports/reviews/task-367/context-r3.md` in the worktree (skips outputs that exist).
- Findings of the 43, untriaged, by id: docs/reports/lanes/2026-11-23/BL-HB367/FINDINGS.md: 174 (1 CRIT, 42 HIGH, 71 MED, 60 LOW). The lane gives no verdicts.

## Close check dry run (real scripts/hooks/check-lane-close.mjs, throwaway index with the task staged BUILT; worktree untouched)
EXIT 1. Refusals, all expected while the review is incomplete and the grounder is owed: missing refs REPORT.md and GROUNDER.md; no valid compliance output for surface-136, surface-126, surface-127, surface-128, surface-135 (the missing parts); no engineering output; out-ux, out-error-paths, out-security missing; GROUNDER.md missing. No refusal about chunk stamps, the WHOLE-change path list, input hashes or finding-line parsing for the committed material. Full text: lane close-dry.out.

## Deviations, each with its reason
- Commit 1 subject "fe.51 waits" (plan text "FE-51 waits"): plan section 6 "No FE-nn id is written in the message" and acceptance #4 (0 FE ids) and the brief ("NO FE-nn token in any commit message") would all fail with the literal text.
- Spec 135 cells: the plan's new status text and dated note are verbatim; the old OWED cell text is kept after the new status (M-246 "prior text kept", 137:109), so "the cell read as before" points at it.
- Prereg class/panel: panel class T (tests) at docs/reports/panels/MF-98.json:4; totals taken from prereg-MF-96-1.json (newest), evidence: all 14 expected_* keys equal (node JSON compare) between prereg-MF-96-1.json and prereg-MF-98-1.json.
- nav-tab-switch keeps its own copy of the scope-fence file-set code (about 12 lines) instead of importing scope-fence.logic.test.ts, because importing a test file would register its tests twice.

STATUS: blocked: DeepSeek balance exhausted (35 of 78 output lenses unrun); build commits 0 and 1 landed through the hooks, red then green; task RUNNING, grounder owed. Question: will you top up the DeepSeek balance so the lane can finish the output review?
