# BL-MCAPP313 · task-313 (MF-49) McApp card 1, the front door · stage 1 hand-back

Status line (Spec 137 rule 3): BL-MCAPP313 lane · MF-49 MaxBLD mobile app: the front door, inside the one Expo project (McApp card 1)

## Where it stands
- Worktree /Users/brettpreston_macmini/Buildo-wt-mcapp313, branch wf2/mcapp313, HEAD 36d27a43c (no lane commit landed).
- The whole work is STAGED (62 files, list in staged-files.txt). Two refused red attempts and two refused green attempts; no commit exists.
- Green attempt 2 passed every pre-commit check (typecheck, lint, the related run 22 files 689 tests green) and was refused by the
  commit-msg McBylaws/McFrontend gate (scripts/analysis/mcbylaws/gate.mjs --commit-msg), exact text:
    FAIL:C:no-rules
    FAIL:P:no-record
    GATE FAIL
  Cause (cite-arms.mjs:154-157, panel.mjs:82-84): the commit touches McFrontend surface paths and names McFrontend-Task: MF-49, but
  no prereg-MF-49-*.json exists in the parent tree and no docs/reports/panels/MF-49.json exists. The precedent is task-267's commit 0
  (0cb350264: prereg-MF-99-1.json round 204, panels/MF-99.json, row, task Files line by CLI). Per orchestrator item 6 I stopped here.
  Proposed commit 0 (not made): prereg-MF-49-1.json (a new round claimed in ~/Buildo-scratch/ids, totals equal to the newest
  prereg, rules[] RULED FE ids such as FE-05, FE-18, FE-31, FE-36; rulings RR-0499, RR-0501, RR-0503, RR-0504, RR-0506, RR-0509),
  panels/MF-49.json, the two paths on the task Files line; then the work commit as its child (git commit -o for commit 0 keeps the
  rest staged). It registers no new queue row (MF-49 exists). Needs the orchestrator's go, since it edits the task's Files line.

## Built (staged)
- S1/S2 server: getCurrentUserContext { needsTrade: false } overload (no user_profiles read; lead_gen status via getEntitlementStatus;
  stale trial -> applyTrialExpirationIfNeeded; thrown read -> null, logged); lookup, entitlement, lot-size routes pass it.
- M1 appShell.ts (leaf): APP_PRODUCT 'parcel_tool', MAXBLD_LOOKUP_ROUTE, decideMaxbldGate. M2 the MaxBLD arm of decideAuthGateRoute.
  M3 AuthGate passes product and reads the profile only for lead_gen. M4 (app)/_layout.tsx: body kept whole as LeadAppLayout, default
  export routes on APP_PRODUCT. M5 MaxbldAppGate.tsx (Opening / Redirect / Slot; give-up clock = REPORT_GIVE_UP_MS; DEV route_decision).
- M6 the Opening S-097 mobile_parcel_opening (S-097 claimed in ~/Buildo-scratch/ids/S-097): static-page.json screens row, content,
  descriptor, census, OpeningBinding.tsx, slice, capture script, 3 goldens, bindings (16 modules, 28 mounts), converted 19/35,
  binding_mobile_list, auth-class-parity P-1 row, policy-ledger chk3 rows (MD:2026-11-25:2598 "1a").
- M7 splash: image removed, #09090b kept. Proof: npx expo config --type prebuild ok; npx expo prebuild --no-install --platform all
  finished in a throwaway copy (placeholder Firebase files in the copy only; copy deleted): prebuild-imageless-splash.out.
- M8: Keyboard.dismiss() first in handleEmailSignIn. M9: icon.png 1024 RGB (sha256 4076f5c2...), adaptive-icon.png 1024 RGBA
  (b22be7e3...), favicon.png 48 (50166610...) rendered from ~/Buildo-scratch/mcfrontend/brand/house-mark.svg (RR-0509 mark alone);
  adaptive background #f4f1eb.
- Docs: dated notes Spec 116 §3, Spec 99 §5.3 and the §4 B1 row, Spec 100 §4, Spec 117 §5; entitlement route header; MF-49 row
  (title per RR-0510, status RUNNING, dated note with RR-0499/0501/0503/0504/0510 words). Generated: 127 registry and review queue,
  rule-lists-by-kind.md.
- Tests: T1, T2 (with real-handler negative cases a, b, c), T3 authGate, T4 appShell, T5 maxbldAppGate.behaviour, T6
  openingScreens.golden, T7 fence extension, T8 signIn.behaviour (Keyboard part only), T9 pins, T10 appIcon, routerTelemetry case.

## Evidence
- red-server.out: T1/T2 staged alone, refused (tsc: get-user-context.logic.test.ts expected 2 arguments, got 3).
- red-phone.out: T7/T9 staged with the phone code parked, refused: 13 failing tests in 6 files.
- green-attempt-1.out: refused by surface-conformance C-4, C-7, C-8m (fixed: two pins; MaxbldAppGate owned by shell_app_tabs).
- green.out: all pre-commit checks green (related run 22 files, 689 tests); refused only by the commit-msg gate (above).
- Current checks: emit-mobile-surfaces --check ok; generate-surface-registry --check clean (174 rows, 11 unowned); rule-lists page
  --check current; surface-validate --check current; all five golden captures --check ok; mobile tsc --noEmit clean.
- UNVERIFIED: every mobile jest test (not run by the hook; station). Device behaviour of Redirect/Slot, the keyboard cause of finding 7.

## Deviations and questions
1. Q2 A NOT built (question for the plan grounder): the plan wants Back = canGoBack ? back : replace with role and label AND the typed
   email and password kept (T8, sign-in.tsx:566-569 comment "Preserve email + password"). Opening the form by pushing
   /(auth)/sign-in?method=email makes a new screen instance, so router.back() drops what was typed. sign-up.tsx,
   nav-by-route.logic.test.ts, phoneGate.coverage.test.ts, useAuth.test.ts are untouched.
2. C-4 (surface-conformance.logic.test.ts:431-434, a converted surface owns no component) contradicts the plan's M5 note that the
   Opening's census row owns MaxbldAppGate.tsx; I moved ownership to shell_app_tabs (the layout that mounts it); unowned stays 11.
3. Try again is two button rows (retry_offline, retry_error), one when-flag each. Descriptor guards: session authenticated,
   entitlement none; error classes offline and 500.
4. The task has no acceptance criteria lines (plan section 7 owes them; G1 says do not edit Acceptance). Not added.
5. The S-097 ledger claim is a mkdir outside the claimed write scope (~/Buildo-scratch/ids/S-097), per the ID-ledger rule.

STATUS: blocked

## Round 2 after the plan grounder (hb.txt), 2026-11-26
- Commit 0 landed: d64c6aacd (prereg-MF-49-1.json round 205, claimed ~/Buildo-scratch/ids/round-205; docs/reports/panels/MF-49.json;
  task file with the Files line paths, the grounder's four notes and six acceptance criteria). Hooks: GATE OK (commit0.out).
  No new queue row registered (MF-49 exists).
- Q2 is off this card (plan Q2 B); nothing built for it.
- Phone run (grounder F): typecheck clean; run 1 found one failure (Try again after the give-up did not re-render, phone-tests-run1.out),
  fixed in MaxbldAppGate.tsx (clock start is state); run 2: 11 suites, 178 of 178 passed (phone-tests.out).
- Work commit REFUSED by the commit-msg policy check (green.out), exact text:
    FAIL:LEDGER ledger row chk3-new-component@mobile/src/components/surfaces/OpeningBinding.tsx: no verbatim operator quote
    FAIL:LEDGER ledger row chk3-new-component@mobile/src/components/parcel/MaxbldAppGate.tsx: no verbatim operator quote
    POLICY CHECKS FAIL: 0 finding(s), 2 ledger error(s), 0 orphan row(s)
  Cause: scripts/analysis/policy-checks/lib.mjs:64 needs a quote of 12 or more characters; the two rows quote "1a" (RR-0499,
  MD:2026-11-25:2598). Every pre-commit check and the McBylaws/McFrontend gate passed (GATE OK; related run 22 files, 689 tests).
  The whole work (62 files incl. the clock fix) is staged on top of d64c6aacd.

STATUS: blocked

## Round 3, 2026-11-26
- The two chk3-new-component ledger rows now cite MD:2026-11-26:2698 (RR-0520), quote taken byte for byte from that line
  ("Approved - The approval sentence for McApp card 1's two new components (the start-up page and the front-door gate)").
- Work commit landed: e904d8d3e (child of commit 0 d64c6aacd). Hooks: pre-commit green (related run 22 files, 689 tests),
  McBylaws/McFrontend GATE OK, POLICY CHECKS OK (green.out). Station suite, output review and grounder are owed.

STATUS: ready

## Round 4, 2026-11-26 (take the origin tip)
- Merged origin/wf1/mb-rulings 02367cda8 as merge commit b31fc6bc3 (parents e904d8d3e and 02367cda8); no conflict.
  Attempt 1 was refused by validate-commit-msg.sh for my own subject type "merge(...)" (not an allowed type; merge-attempt-1.out);
  retried as chore(137_mcqueue) with the same text; all hooks green (GATE OK, POLICY CHECKS OK; merge.out).
- After the merge: emit-mobile-surfaces --check ok, generate-surface-registry --check clean, rule-lists page --check current.
- DoD cites 08_agents.md:462/:490/:505; the quotes sit at :500/:528/:545 now (stale before the merge too; DoD text not edited).

STATUS: ready

## Close, 2026-11-26
- Round 1 (grounder Cairn-Ground-O313, outside the repo, grounder/r1/): 31 ids, 10 CONFIRMED, one HIGH (p2#1) fixed in 2f95dc250
  (station pass); records a76b3cca6.
- Round 2 (grounder Cairn-Ground-O313b): records fbf08ca6d, 28 ids, 11 CONFIRMED (2 LOW, 9 NIT, recorded), 17 REJECTED; no fix.
- Commit A 90652539d: dated notes RR-0520 (MD:2698) and RR-0521 (MD:2702), the Review round 1 history line.
- Commit B: this report, GROUNDER.md and TRIAGE.md (round 2, byte for byte), the refs, the acceptance criteria, BUILT.

STATUS: ready
