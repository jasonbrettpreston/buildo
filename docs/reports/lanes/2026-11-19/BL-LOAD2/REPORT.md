# REPORT: BL-LOAD2, task-267 (LOAD.2), stage 1 (measured plan and impact map; no product code)
Date 2026-11-19. Worktree ~/Buildo-wt-load2, branch wf1/inc1b-load2, head at start 2e127dffa. Detail: PLAN.md, IMPACT.md, TRIAGE.md beside this file (repo copy docs/reports/lanes/2026-11-19/BL-LOAD2/).

## Six plain lines for the operator
1. What a person sees today between the pick and the report: a spinner and the words "Loading the report…" (ReportBinding.tsx:369-380); nothing else, and every lot ends on "No report for this lot yet." until the web live switch flips.
2. What the approved design draws: ten checks that tick off one by one (five city-wide facts, five about the lot), a pause, "The Building Possibilities Report for {address} is ready.", a quiet Skip, and a picture of the process behind it (small-pages-v8 what-we-checked, the Daylight demo).
3. The delta: twelve differences (PLAN.md 1.3); the main ones are that the lines are built on the server but never sent to the app, the app has no clock or button logic, and there is no picture component.
4. Can it be built now? Not whole. Two pieces are missing: the lines never reach the app (smallest piece: a fast read at the pick, so the animation can start while the report is still computing), and the picture has no existing component. The lines-only slice (existing components) can start as soon as D-1 and D-2 are answered.
5. Size: GUESS 13 to 16 files, one build lane, about a day, lines only; the Daylight scene port would be a new component kind, XL GUESS. Nothing here is measured by running the slice.
6. Decisions owed (six drafts, none decided): D-1 how the lines get to the screen; D-2 what is behind them at launch; D-3 Skip; D-4 what happens when there is no report (every lot until launch) and for a re-opened lot; D-5 how long before the screen gives up (shared with the failure page); D-6 what shows when the animation ends before the report arrives.

## The delta (built vs designed): 12 items, each with design and built lines in PLAN.md 1.3
1 body of ten lines vs one spinner; 2 address title and Skip vs Back only; 3 the checked tree reaches the app vs not wired (route.ts, schemas.ts:429-438); 4 the app clock vs none; 5 button only when page is in (RR-0176) vs mock auto-open (mock ending owed an update); 6 wait for the page with no cap vs no end-of-animation and no client time bound; 7 reduce motion / screen reader vs no AccessibilityInfo in the app; 8 gated lot wording vs nowhere to show it; 9 re-opened lot skip vs the app is not told the meter; 10 the scene vs no component; 11 two clocks (mock DEMO_TIMING, MIN 18,070 ms, vs server uniform pace of 23,000 ms); 12 the mock's option numbers are page data that arrive with the lookup.

## The contract (PLAN.md 1.4): what the app receives from the lookup route now
computed or stored page: 200 with page (compute sync, median 9.7 s, max 15.9 s); miss: 200, page null; held unsure lot: 200, page null, lotForm.unsure (redirect to the semi question); compute error: 500, three client retries, then the error text; 403 limit / 429: error text, not retried; time-out: none on the client, platform time-out unknown; the 60 s bound exists only on the semi Continue (semi-question.tsx:64). The lines (whatWeChecked) are NOT in the response. See details is the open panel of the same page view, so page non-null is both loads. Seam with LOAD.4 (task-317, BL-LOAD4): LOAD.2 owns lifecycle loading and the give-up timer, LOAD.4 renders lifecycle error; commit order LOAD.2 first.

## Stage-2 plan (PLAN.md section 3): size GUESS 13 to 16 files
Route fast read (no compute, no meter, null for a held lot), strict schema, hook, ReportBinding (checkedProps, one button predicate page !== null && elapsed >= min_ms), ReportPageHost (clock from the tree's arrival, give-up timer, reduce motion, one announcement), mount, content slice regeneration, descriptor/census/Spec 100 note, fixtures, Spec 126 note, queue row (id claimed at stage 2). Tests T1 to T13 red first. NOT built: the scene (unless D-2 says so), the web live render, the failure page (LOAD.4), the limit wall and failed-Continue (BL-TRIAGE D-4, D-1, unruled), any change to the 23,000 ms setting, any new setting.
Blocked until: D-1 and D-2 answered (smallest missing piece: the fast read; no task carries it, noted on task-343). Orchestrator: RR-0300 asks every blocker as an OPERATOR task; open one with D-1 to D-6 as its body (the brief says create no tasks, so none was created).

## Decision drafts: PLAN.md section 4 (D-1 to D-6, each with what the person sees under each answer, Grounded, Recommendation naming the lens)
D-1 A2 fast read in parallel (recommended); D-2 B3 lines now, scene later; D-3 C2 no Skip (C1 is an exception the operator must accept); D-4 E2 and F1 (E1 needs a ruling); D-5 G2 60 s flagged as a change to RR-0176 words; D-6 H1 existing spinner and text.

## Lenses (TRIAGE.md)
compliance, ux, error-paths, code-review ran on DeepSeek (deepseek-reasoner), once each, on PLAN.md + IMPACT.md; security not run (reason in TRIAGE.md). 30 findings: 21 kept (4 in part), 4 rejected with the line opened, 3 agreed rejects, 4 duplicates. Changed: D-4 (E1 to E2), D-5 relabelled, D-3 (C1 to C2, Skip's origin stated), D-1 grounding, new D-6, tests T9-T13, held-lot null read, clock epoch, one button predicate, give-up timer and owner. Standing disagreement (compliance vs ux on E2/C2) is stated in the plan. The first lens attempt was refused by the tool (160,506 chars over 120,000), then run on narrowed input.

## Checks (checks.out): 9 scripts, all exit 0 on head 2e127dffa (surface-validate, emit-mobile-surfaces, generate-surface-registry, report-schema, seed-report-v2 labels owed pre-existing, report-capture 72 goldens 0 stale, report-page-capture, report-fields gates FAIL report-only pre-existing RF-2,4,6,7,9, generate-target-files).

## Commit and hook tail: see commit.out (one docs commit, trailer Task: task-267).

## UNVERIFIED
whether a stored (W) page always carries the See details sections; the cost of the extra read at real data size (no DB); whether the new read grows the src SQL ledger closed set; the platform request timeout; the Cloud Run image behaviour of the compute; whether the orchestrator accepts the lane as grounder (no separate grounder agent ran); that the Daylight scene can be ported (not tried); the lens set ran once (max_fix_rounds 1) and the folded plan was not re-reviewed; the mock's ending (button instead of auto-open) is stale and not yet redrawn; no test or build was run (stage 1).

STATUS: ready
