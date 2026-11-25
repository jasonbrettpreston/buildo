# Seat: reality-check: task-267 plan (PLAN-267-v2)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board worktree HEAD 19c094fa3 (wf2/board); the plan names 2fd2f6042 as its head and I did not diff the two. Files read:
- PLAN-v2.md, the approved mock (text), PHONE-WALK-FINDINGS, RR-0492 (MD:2567), the task-267 and task-317 files (the task files only partly), FINDINGS-PLAN.md (not read).
- src/app/api/parcels/lookup/route.ts, src/lib/parcels/lookup-flow.ts, src/lib/parcels/what-we-checked.ts, src/lib/parcels/report-check-pace.ts, src/lib/entitlements/index.ts:540-625, src/lib/surfaces/report/core.ts (grep), src/lib/parcels/report-compute.ts (header).
- mobile: useParcelLookup.ts, ReportPageHost.tsx, [parcelId].tsx, apiClient.ts (grep), queryClient.ts (grep).
- phone-next-3101.log; BL-LOAD1 PLAN and REPORT; BL-LOAD1B REPORT and TRIAGE.
- Test stack, read-only: logic_variables, data_quality_snapshots, and one SELECT on three lots (counts and flags only).
Not done: no test runner; the rest of the task-267/317 files and the lens outputs were not read.

RR-0492 (read before the findings): a failure or a lot with no report now shows right away. This changes RR-0490 3b, and PLAN-267-v2 still says "wait until the lines end" in section 3 (O4), test C5 ("failure only at 23000"), C6 ("Back to search at 23000") and the reportScreenState row "error during the lines, then checking until the end". The check lines stay on the ending screens. A report that arrives still completes the animation.

Checked and clean
- The three pace settings are on the stack: report_check_min_ms 23000, skip_after 0, ready_hold 1500. maxbld_page_continue_wait_ms is 60000 and lookup_retry_max is 3.
- The citywide snapshot row is on the stack: newest 2026-11-11, with all five counts non-zero (496,536 lots). So the citywide lines render; no group is omitted.
- Meter code claim: q hit and parcelId counting rows. A new lot counts 1 on the first request that returns a page. An already-counted lot writes 0 (openReport returns already_counted at index.ts:606). At limit, a new lot gets 403 with 0 rows. That is the same before and after, for the three plan cases.
- Log record: phone-next-3101.log has 80 lookup lines. All 38 hit lines with a lot are meter not_evaluated, and 42 are none. So the test stack counts 0 rows today and counts 0 after. G3 (new lot counted 1) is mock-only and cannot be shown on the phone (see rc#5).
- The phone sends a q request and then a parcelId request on every pick. M1 and M3 are confirmed. The plan removes the double compute: the q hit sends no page.

## rc#1 HIGH: the fast read ("lines") can sit behind the compute on one instance
Plan: section 4 step 2 and O1-A2, the lines need a fast read "from 0 s" while the report builds.
Evidence: BL-LOAD1B/REPORT.md:8 says "the compute is synchronous and blocks one instance 3.9 to 15.9 s per lot here (33.6 s meas...". TRIAGE.md:21 says "no deadline, no singleflight, retries multiply: REJECTED", so it is recorded as a launch precondition. lookup-flow.ts:87 has the compute as a plain await with no worker.
Fix: say that the phone sends the fast read first and the compute read only after the fast read settles (or in the same request order). Add a test of that order. Mark the instance blocking as UNVERIFIED on a real platform; no platform timeout was read.

## rc#2 HIGH: the retries and "Try again" can stack computes behind the 60 s give-up
Plan: section 3(d) "screen 4 comes after the 3 retries or at 60 s"; section 6 "a failing compute runs up to 4 times"; step 6 "Try again ... otherwise it refetches".
Evidence: LOOKUP_RETRY_MAX=3 (useParcelLookup.ts:61) with the library's default delay; the compute is 11 to 33.6 s. A compute failing at about 20 s gives 4 tries by about 87 s, so the 60 s give-up wins every time a compute takes 13 s or longer to fail. The query keeps retrying behind screen 4, and each try can complete and count. fetchWithAuth carries no AbortController (grep of apiClient.ts found no timeout or signal). refetch() on Try again then starts a fifth compute.
Fix: state that on give-up the retries are stopped (or the query is left to finish) and that Try again re-reads the cache before it fetches. Add the case "failing compute at 20 s" to the timing table and tests.

## rc#3 MED: no priced lot today means the following (what a tester sees), under RR-0492
Plan: section 3(b) and 3(d); the "what a tester sees" question.
Evidence: the report switch is typed false (finding 16, maxbld-web.ts:19), and report-compute.ts answers null "before any read" while it is off. With the switch off, every lot has no page, so every lot ends on screen 5. Under RR-0492 that is right away: about 0.1 to 0.2 s after the pick, with only the first verb ("Loading the lot...") showing and no lines. The plan's reading of "23 s of lines then screen 5" is the old RR-0490 3b behaviour and is gone. With the switch on locally (the walk's third round):
- Stored lots: no lines; the page opens at once.
- Computed lots (41 Derwyn 21.7 s, 683 Danforth null in 108 ms): lines, then screen 2 for computed, and an instant screen 5 for 683.
- Unpriced options: page served, meter not_evaluated, counted 0, opens "Not yet evaluated" (RR-0485 item 4 / task-343 not built).
The fast read still builds the checked view for a lot that will have no report; that is wasted work and a half-drawn line sequence flashes before the miss. The checked tree is not gated by the switch.
Fix: write this table into the plan. Decide whether the miss screen draws the lines from the start or only the lines done by then.

## rc#4 MED: longest compute and how each case plays (the operator's "33 seconds")
Evidence: BL-LOAD1/PLAN.md:31 and REPORT.md:8, citing storage-ondemand REPORT.md:37: 20 lots, min 0.12 s, median 10.9 s, p90 27.2 s, max 33.6 s as built. The phone walk (phone-next-3101.log, compute_ms): 11.3 s, 18.0 s, 21.1 s, 21.7 s, 23.2 s.
How each plays against 23 s and 60 s:
- Under 23 s (most lots, and everything seen on the phone): screen 1 to screen 2, with the button at 23 s.
- 23 to 33.6 s (about the top 10 percent, p90 27.2): screen 3 (spinner and "Loading the report..."), then the button the moment the page lands.
- 60 s reached: only a compute that fails and retries, or a slow or queued instance (rc#1). That is the 60 s case, not the measured 33.6 s one.
- Null miss (683 Danforth, 108 ms): screen 5 at once.
- A report that lands after 60 s stays counted on the server; see rc#2 and rc#5.
Fix: the answer to his question is that 60 s is a failure bound, not an animation length; the plan's 3(d) should say so (it does not mention 33.6 s).

## rc#5 MED: the count moves to a request the user may not finish watching
Plan: section 3(a) "the usage rows are identical before and after".
Evidence: route.ts:114-123 inserts when `body.page` exists and the lot is evaluated. After the plan, that is the parcelId request, which the phone sends on mount. If the user presses Back, kills the app, or hits the 60 s give-up while the compute runs, the server still finishes, counts, and the page is never shown (the Try again then hits already_counted). Before the plan the same happened at the q hit, including while still typing (findings 17, 25, 32), so the plan is better than today, but "identical" is true only for completed opens.
Fix: reword 3(a) to "rows for an open that is finished are identical; an abandoned open is still counted once". Optionally add a test for Back during the compute.

## rc#6 MED: the at-limit user waits for a compute before the wall
Plan: section 3(a) "at-limit new lot: 0, but the 403 wall moves from the search page to the report screen".
Evidence: route.ts:114-123: the meter runs after runLookupFlow, so the at-limit 403 comes after the full compute (11 to 33.6 s). The fast read is not metered (step 2, "the meter code is unchanged"), so it returns the checked view for an at-limit user and the lines play. Under RR-0492 "right away" the wall can only be right away if the fast read says it. usageFor is exported under A2 anyway (step 2).
Fix: have the fast read return the limit state for a new lot so the wall shows at once and no compute runs; add a test case for it.

## rc#7 LOW: the lines the plan builds do not match the mock's words
Evidence: the mock shows "Lot: 3,480 sq ft", "84 by-law checks across 2 house types", "512,000 lots scanned". The producer is what-we-checked.ts: fmtArea gives m² ("Lot: 327 m²" for 41 Derwyn). Test stack values by lot, from the three lines of data:
- 41 Derwyn (5293897): 327 m², 177 limits across 5 house types, not in ravine, not heritage, 301 decisions nearby.
- 50 Wallingford (5133208): 1,104 m², 176 across 5, in a ravine area (is_in_ravine_protection_area true), not heritage, 38 decisions.
- 683 Danforth (5361889): 294 m², no resolution row, so "By-law limits not yet evaluated" (no bylaw date), not ravine, not heritage, 159 decisions.
Each has 10 facts and a step of floor((23000-1500)/11) = 1954 ms. Citywide is 496,536 lots (the mock says 512,000). The operator's other sentences use sq ft; the lines would be in m². Not flagged by the plan.
Fix: note in section 3 that the lines are in m² and that real counts replace the mock's; decide whether the area line converts.

## rc#8 LOW: the producer sends a "ready" sentence before the page is in
Evidence: core.ts:187 builds tree.ready with at_ms = ready_ms; what-we-checked.ts gives ready_ms = (facts+1)*s = 21,494 ms (before min_ms 23,000). The plan's screens 3 to 5 have no ready sentence, only the spinner or the failure.
Fix: add a rule and a test that the ready line draws only when the page is in (C3 only tests the spinner).

## rc#9 LOW: the stored-lot skip rule cites a function that does the opposite
Plan: section 3(b) "a stored lot, or already counted: showsWhatWeChecked".
Evidence: what-we-checked.ts:49-51: `showsWhatWeChecked = (meter) => meter === 'counted' || meter === 'unmetered'`. A stored page on a first-time open is meter counted, so the existing rule shows the lines. The mock row ("opened before, or stored: no lines") is a new rule, and the "opened before" part also depends on the 24 h phone cache: compute stores no record (BL-LOAD1/PLAN.md:19), so an already-counted lot on a fresh phone or after 24 h is computed again, 11 to 33.6 s, with no lines and a bare spinner, not "opens directly".
Fix: name it a new rule in the notes, and add the cold-cache already-counted case to the table.

## rc#10 NIT: the `checked` tree does not apply to the lead-gen path as written
Evidence: showsWhatWeChecked counts 'unmetered' as show-lines, including opened lots. The plan's skip rule does not say what the fast read does for the unmetered path.
Fix: one clause.

UNVERIFIED: whether the viewOf checked view passes the mobile Zod schema without a core change; the platform request timeout; whether surface-descriptor.d.ts moves on emit; whether report-checked.logic.test.ts pins the key list (all as in plan section 9, none read by me).

STATUS: 10 findings (0 CRITICAL, 2 HIGH, 4 MED, 3 LOW, 1 NIT); the meter table holds for finished opens (0 counted rows on the test stack either way), but RR-0492 breaks the plan's wait-for-lines endings and the concurrency, retry and at-limit timings are unsafe as written.
