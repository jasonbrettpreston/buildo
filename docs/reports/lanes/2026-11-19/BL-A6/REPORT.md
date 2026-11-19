# REPORT: BL-A6 (task-320, SRCH.A6, Increment 1·B)

Status line (Spec 137 rule 3): BL-A6 lane · task-320 built: the reports-left line is on the app search page, bound to the existing entitlement read; commits 953b0988f, e311411de, 1703b3104 on branch wf1/inc1b-a6 (unpushed) · write only under ~/Buildo-scratch/lanes-20261119/inc1b/a6 and ~/Buildo-wt-a6; no push, no DB.

## The six plain lines for the operator
1. What it shows: under the search box, "6 of 10 reports left until 9 Dec 2026" (v8 search.html:267), made of three fields the server already serves at GET /api/parcels/entitlement: reportsLeft, reportsLimit and resetsOn; nothing is calculated in the app, the date is only re-written (9 Dec 2026) from the served date.
2. States built: one line for every plan (trial, Basic, Pro, admin-managed look the same, as v8 draws one line); a served 0 shows as "0 of 10 reports left until ...".
3. States NOT built because v8 does not draw them on the search page: no plan, lapsed plan, loading, read failed. In all of them the line is simply absent (no new wording). The limit-reached wall (report-limit.html) is a separate screen, not built here.
4. Rules complied with: RR-0307 (MORNING-DECISIONS.md:1182); Spec 126 §11b.7 A2 and the MF-45 note (126:1045, :1109); FE-05 no maths (135:27), FE-18 and FE-32 served fields (135:40, :54), FE-07 parity (135:29, search-parity.golden.test.ts); content keys; existing Text part and existing contract; counting stays with SRCH.METER (task-334).
5. Unproven: the mobile jest suites are not run by the hook, no device check, the live allowance values (10, 25) and migration 322 on dev are not queried, the gate accepted `McFrontend-Task: MF-35` (POLICY CHECKS OK) but the web twin shows nothing until the live switch flips.
6. Questions owed (none blocked the build): zero left shown or hidden; the reset date's time zone (UTC date as served vs Toronto); ratify the new derived name reset_date; web twin vs a parity exception; outside-Toronto order; the allowance settings must all exist or the line is absent for everyone. Full list below.

## Binding table (state, v8 string, content key, served field, component reused, test)
| # | state | v8 string | content key | served field | component reused | test |
|---|---|---|---|---|---|---|
| 1 | entitled, count left (any plan) | "6 of 10 reports left until 9 Dec 2026" | search.reports_left = "{left} of {allowance} reports left until {reset}" | reportsLeft, reportsLimit (contract refs contract_parcels_entitlement.*), resetsOn via derived reset_date | existing Text in the column View, testID parcel-search-reports-left (mobile SearchBinding.tsx reportsLeft, web SearchBinding.tsx reportsLeft) | src/tests/surfaces/search-reports-left.logic.test.ts (a),(b),(d); search-web-binding.ui.test.tsx (e) renders "6 of 10 reports left until 9 Dec 2026" |
| 2 | zero left | same template, served 0 | same | reportsLeft 0 | same | reportsLeftShown test: 0 shown |
| 3 | no plan, lapsed plan, limits unreadable (fields null) | not drawn: absent | none | null | none | reportsLeftShown null cases; golden (c) |
| 4 | loading, read failed | not drawn: absent | none | none | none | no entitlement in the ten other goldens (c); index.tsx drops data on error |
Goldens: state `hit`, golden reports_left (mobile+web, built by search-golden-capture.ts --write and the repo builder buildGoldens); the state name had to be from the closed vocabulary (SV-DESC refused reports_left).

## Checks (checks.out, pasted)
BEFORE: surface-validate "S-screen ok (17 surfaces, 98 goldens) · S-sbind ok (17 surfaces, 424 strings)"; emit-mobile-surfaces "surfaces ok (4 surfaces, 29 goldens)"; generate-surface-registry "clean — no drift (171 rows, 171 descriptors)"; consumer-registry "is fresh"; generate-target-files rc=0; search goldens "search goldens ok (10)".
AFTER (final tree, AFTER 3 in checks.out): "S-desc ok (examined 33 in scope: converted 17, pending 3, parked 9, report 4) · S-screen ok (17 surfaces, 100 goldens) · S-sbind ok (17 surfaces, 425 strings)"; "surfaces ok (4 surfaces, 30 goldens)"; "[surface-registry] clean — no drift (171 rows, 171 descriptors)"; "scripts/steps/_schema/consumer-registry.json is fresh"; generate-target-files rc=0; "search goldens ok (11)". `npm run typecheck`: tsc --noEmit, no output (rc 0), also after the fix commit. The first AFTER run showed the two real refusals (closed state vocabulary, content-key pattern ^[a-z0-9_]+(\.[a-z0-9_]+)+$, census drift); both fixed, no check worked around.
Red: red.out is a refused commit attempt with only the tests, task file and context file staged: it was refused at the typecheck stage ("error TS2305: Module ... has no exported member 'formatResetDate'") before the related test run, so red is a type-level refusal, not a failed assertion (UNVERIFIED as test-run red).
Green hook tail (commit.out, e311411de): "Test Files  8 passed (8) / Tests  160 passed (160)", "GATE OK", "POLICY CHECKS OK (commit-msg): 15 file(s)". Fix commit 1703b3104: "POLICY CHECKS OK (commit-msg): 3 file(s)". Earlier refusals on the way (all read, none bypassed): three tests with hard counts (admin-media 69 -> 70, site-footer 10 -> 11, my own test), the Files: line of the task (check-task-files), and the FE id cited in my message (FAIL:C:cite-not-in-rules:FE-07), fixed by data and wording.

## Commits (branch wf1/inc1b-a6, unpushed)
- 953b0988f docs: RR-0307 decision-92, task-340 closed (`-s DONE`), task-320 dependency on task-71 removed, Scope now and Files lines (commit1.out).
- e311411de feat: the line, both binding trees, content key, hook, schema, descriptors and census mirror, goldens, slice, registry, pins as data with dated comments (424 -> 425, 98 -> 100, admin-media 69 -> 70), MF-35 queue note (M-246 form quoting the operator), context file with the research, binding table and operator list.
- 1703b3104 fix: output review folds (failed re-read draws no line; real calendar dates; token-guarded focus read; deviation text says reset_date is not covered by the old adjudication).
- docs commit with this report: see the last commit of the branch (docs/reports/lanes/2026-11-19/BL-A6/).

## Reviews
r1 plan review (r1-plan.txt, verdict FAIL on plan-readiness): 30 findings triaged in TRIAGE.md, the KEPT ones folded into the context file before any code (node-local absent rule, cache and persistence policy, formatter table and cases, execution-level web test, ref-set assertion, census equality). r2 output review (one lens): 18 findings triaged, five KEPT and fixed in 1703b3104.

## Findings worth the orchestrator's eye
- The query client persists every query except user-profile (mobile/src/lib/persistFilter.ts); a reports-left count would have survived a restart: `parcel-entitlement` is now excluded. Sign-out clears the client (authStore.ts:105-106).
- The search page's classifier maps every 403 to the subscription notice (parcelSearchMatch.ts:295-300), including a REPORT_LIMIT_REACHED answer; where the limit wall is shown is not built.
- readReportLimits fails if any of the three allowance settings is missing or out of bounds (index.ts:483-505): the line is then absent for everyone. Live presence UNVERIFIED.
- The search descriptor's `metering` text ("Nothing here is counted") is stale since SRCH.METER; left alone (scope).
- The generated context pack carries defects (literal "undefined" in Storage set-up lines, truncated quotes): not edited, outside scope.

## Operator list (questions owed; the build did not wait on any)
1. Zero left: show "0 of 10 reports left until ..." (built) or hide the line at the limit?
2. No plan row (task-340's open question): built as no line (lead_gen-only users are unmetered).
3. Reset date time zone: the date is the UTC calendar date of the served instant; a period end between 19:00 and 24:00 Toronto standard time (20:00-24:00 daylight time) shows one day later than the Toronto date. Keep, format in America/Toronto on the device, or serve a label from the read.
4. Ratify the derived name reset_date (extends the closed list of P35-D14 a; the descriptor says it is unratified).
5. Web twin: tree built for the parity lock, inert until MAXBLD_WEB_LIVE flips (LS.12, task-287); or rule a parity exception.
6. Outside Toronto: v8 puts the line after the notice; built in one fixed slot under the box.
7. Stale `metering` sentence in the descriptor.
8. All three allowance settings (plan, trial, pro) must be present.

## UNVERIFIED
- Mobile jest suites (parcelScreens golden test, parcelSearchMatch, hook, offline filter) written to the same cases where touched but not run by the hook or the station root run; no device or simulator check of the line, its look, the focus refetch, or Hermes.
- Live values of the plan limits (10, 25, trial 10) and migration 322 on dev: read from the seed and the migration file, not queried (no DB).
- How often a period end falls in the Toronto-evening window (needs a DB query).
- The red step is a typecheck-stage refusal, not a failed assertion.
- The full suite (push station) was not run; only the hook's related run (8 files, 160 tests) and the generator checks.
- Review premise queries 1-5 of r1 (database) not run.

STATUS: ready
