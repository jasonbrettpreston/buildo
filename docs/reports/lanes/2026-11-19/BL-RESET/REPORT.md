# REPORT: BL-RESET (task-351, SRCH.A6 reset date served as a Toronto-time label)

## Five plain lines for the operator
1. A customer now sees the reset date as the Toronto calendar day of the real reset instant: a billing month ending at 9 pm Toronto on 8 December reads "until 8 Dec 2026" (before: "until 9 Dec 2026", the UTC day). It differs from before only for resets between 19:00 and 24:00 Toronto standard time (20:00 to 24:00 daylight time).
2. Phone and web print the same served text: the server sends `resetsOnDisplay` ("9 Dec 2026") and both search bindings print that field as a contract value; the web execution test and both reports_left goldens carry the same ref.
3. Removed: the device-side formatter `formatResetDate` (and its month and day tables) and the derived name `reset_date` (both bindings, the descriptor deviation text and its census mirror). No date is derived on the device.
4. "Sept" item: the lot-size page and What we checked still print "Sept" for September (existing formatDateDmy, untouched by order); the new label prints "Sep" as v8 draws it. Operator item below.
5. Unproven: the mobile jest files were not run here (no mobile jest file changed; the GitHub Mobile CI job runs after the next push); how many customers sit in the affected hours is UNVERIFIED (needs a DB query, none run); the phone and web were not seen on a device.

## Acceptance criteria
| AC | Verdict | Evidence |
|---|---|---|
| 1 evening edge, daylight instant | MET | src/tests/parcel-reset-label.logic.test.ts (a): 2026-12-09T02:00Z -> "8 Dec 2026", 05:00Z -> "9 Dec 2026", 2026-07-10T03:30Z -> "9 Jul 2026"; green in commit.out ("src/tests/parcel-reset-label.logic.test.ts (8 tests)") |
| 2 twelve months, Sep not Sept | MET | same file (b): twelve mid-month instants -> Jan..Dec, plus "10 Sep 2026"; (e) pins formatDateDmy still "10 Sept 2026" |
| 3 mobile and web same text | MET (web executed; mobile jest not run) | reports_left.mobile.json and reports_left.web.json both hold ref `contract_parcels_entitlement.resetsOnDisplay` (git diff); search-web-binding.ui.test.tsx (e) asserts "6 of 10 reports left until 9 Dec 2026" and the contract data `{reportsLeft:6, reportsLimit:10, resetsOnDisplay:"9 Dec 2026"}`; mobile tree is covered by search-golden-capture --check ("search goldens ok (11)") |
| 4 no date maths on device | MET | `git grep -n -E 'formatResetDate\|reset_date\|toLocale\|Intl\.DateTimeFormat\|getUTC'` over parcelSearchCore.ts, parcelSearchMatch.ts, schemas.ts, both SearchBinding files, parcel-tool/index.tsx: no output (grep rc=1, checks.out tail); DERIVED_NAMES (mobile SearchBinding.tsx:46) has no reset_date |
| 5 goldens independent of machine zone | MET | parcel-reset-label.logic.test.ts (d) spawns the formatter under TZ=UTC and TZ=Pacific/Auckland (child processes), both green in the commit hook run; goldens hold refs and the fixture holds the served string "9 Dec 2026" |
| 6 contract additive, checks clean, S-sbind 425 | MET | checks.out AFTER-final: "S-sbind ok (17 surfaces, 425 strings)", "S-screen ok (17 surfaces, 100 goldens)", "[surface-registry] clean", "consumer-registry.json is fresh", generate-target-files rc=0, emit-mobile "surfaces ok (4 surfaces, 30 goldens)"; resetsOn untouched in types.ts, whitelist and census gain resetsOnDisplay |
| 7 nothing else on the page moves | PARTLY, wording | Props of the other ten search goldens, lot-map (11) and semi (8) goldens are unchanged (lotmap/semi checks ok, no diff). The other ten search goldens are NOT byte-identical: each changes in exactly one line, the descriptor fingerprint sha (`fb2c60227166d0fc` -> `367762939cd181c5`), because the descriptor text changed (deviation text); that is the generator's own output (search-golden-capture --write, buildGoldens). |

## Decisions of the three open points
1. Field name `resetsOnDisplay`, not `resetsOnLabel`: pattern `<source>_display` of the served Toronto date `entered_at_display` (src/lib/parcels/lot-size-entry.ts:274; src/app/api/parcels/lot-size/types.ts:52), in the entitlement contract's camelCase. No id-ledger claim: the gate did not ask (no ledger kind for a field name; commit hooks passed).
2. Month shape: `formatDateDmyFixed` added beside `formatDateDmy` in lot-size-entry.ts (Toronto calendar parts, fixed Jan..Dec table, formatter hoisted to module scope); formatDateDmy output unchanged (pinned by test (e)); the new helper is used only for this label.
3. GUESS/UNVERIFIED items measured: "Sept" with Intl en-GB reproduced by the pin test; the instants of AC 1 pass; size was 45 files in the commit (guess was about 20: the 11 web and 11 mobile search goldens each carry a fingerprint line).

## Operator item: month shape on the other pages
Grounded: formatDateDmy (Intl en-GB) prints "Sept" for September: pinned by src/tests/parcel-reset-label.logic.test.ts (e) ("10 Sept 2026"); it feeds the lot-size page (src/lib/parcels/lot-size-entry.ts:274) and the report page rule date_dmy (scripts/surfaces/_schema/report-page.json:837); What we checked uses a different formatter (en-CA, what-we-checked.ts:54), so it does not print "Sept" (corrects the brief's wording; checked by reading).
Recommendation: switch formatDateDmy to the same fixed table in its own task so one month shape shows everywhere; UNVERIFIED: the v8 mocks of the lot-size page and report were not opened here, and the effect on the report goldens (date_dmy rows) was not measured.

## Behaviour notes (from the plan review, accepted by design)
- A reset anchor whose UTC time of day is in [04:00, 05:00) gives a label that differs by one day between winter and summer cycles (the label is the Toronto day of the real instant); pinned in test (c).
- Release order: the server field ships before or with the app. A new app on an old server fails the client parse of the entitlement read and draws no line (the line is unpushed; web live switch off). No device fallback (RR-0310).
- The limit wall's own resetsOn (error-mapping.ts:34-38) is still an instant; out of scope, listed as loose end on task-343.

## Reviews
r1 plan review (r1-plan.txt): 23 findings, triaged in TRIAGE.md; KEPT: winter/summer pin tests, TZ child-process proof, boundary tests, grep widening, invalid-date guard, hoisted formatter, measured counts. No output review round (one round allowed; plan round used).

## Checks and hook tails
checks.out holds BEFORE (head 7bd1b849a), AFTER-1 (see after1.out) and AFTER-final (head 2d3474ee6): all generator checks rc=0. Typecheck ran in the pre-commit hook (`tsc --noEmit`, no output).
Red (red.out): first refused attempt failed at typecheck ("'formatDateDmyFixed' no exported member", EntitlementLine mismatch): a type-level red like BL-A6 (UNVERIFIED as assertion red). Second attempt (code built, one test wrong) failed the related run: "Test Files 1 failed | 66 passed", the two TZ child cases "SyntaxError: Unexpected end of JSON input": a real assertion red; fixed by writing the probe to a temp file.
Refusals on the way (all read, none bypassed): SPEC-DIFF gate J (fixed by a Spec-diff: N-A line with a reason), check-task-files (Files: line of the task widened through the backlog CLI). Green (commit.out, 2d3474ee6): "Test Files 67 passed | 6 skipped (73)", "Tests 1426 passed | 32 skipped", "GATE OK", "POLICY CHECKS OK (commit-msg): 14 file(s)".

## Commits (branch wf1/inc1b-reset, unpushed)
- 2d3474ee6 feat(126_maxbld_surface_standard): the served label, contract and census, client schema, both bindings, descriptor, goldens, fixtures, tests, MF-35 queue note.
- docs commit with this report: the last commit of the branch.

## UNVERIFIED
- Number of customers in the affected hours (needs DB; none run).
- Mobile jest files unchanged and not run locally; GitHub Mobile CI runs them after the next push.
- Device look of the line (phone, web live switch off).
- Whether the report page date_dmy rows would change if formatDateDmy were fixed (not measured).
- No output review round was run.

STATUS: ready
