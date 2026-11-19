# REPORT: BL-METER, task-334 SRCH.METER (Increment 1·B)

Status line (Spec 137 rule 3): BL-METER lane · task-334 BUILT · code commit 7577c4e8b, test commits c97b53448 and 669de237d, all through the real hooks; no push, no DB.

## What landed
- src/app/api/parcels/lookup/route.ts: the one openReport call stays where it was (after the strict parse) and now runs only for a hit whose report is produced (`body.page !== null`) and whose lot is not awaiting its semi question (`body.lotForm?.unsure !== true`). Two new log-only labels: `semi_pending`, `not_produced`. The not_evaluated rule (operator 1 b 2 a) is still checked first. openReport, the schema, the response shape and the client are unchanged. T13 (only the lookup route imports openReport) still holds.
- src/tests/parcel-lookup-gate.infra.test.ts: producer mocked with the committed v21 mobile response as the default (so the existing counted cases stay green), plus 9 SRCH.METER cases.

## Call-site table
| outcome of the lookup | before | after | evidence |
|---|---|---|---|
| candidates, no-match, lot map (multi_parcel / unlinked), dangling id | not reached | not reached | route.ts:118 needs resolved.match; tests "candidates, a miss, a lot map and a dangling id" and "a lot map response" |
| hit, page null (every lot until MB-44), evaluated option | openReport at route.ts:161 | not counted, meter `not_produced` | red.out line 731/733; green commit3.out line 730-733 |
| hit, unsure lot (semi question first), page sent | openReport (counted before the question) | not counted, meter `semi_pending`, q and parcelId paths | red.out line 735 |
| hit, no evaluated option | not_evaluated, not counted | unchanged | existing test "operator 1 b" green |
| hit, report produced, new lot | counted | counted once (one insert keyed on the lot) | test "a report produced for the found lot counts once" |
| hit, report produced, lot already counted this month | already_counted, no insert | unchanged | test "a second report ... counts nothing more" |
| new lot at the limit, no report produced | 403 REPORT_LIMIT_REACHED | served, 200 (nothing to charge) | red.out line 737 (expected 403 to be 200) |

A.6 (reports-left line, AC3): no change. src/lib/entitlements/index.ts:562-565 usageFor counts DISTINCT subject_key in usage_events (property_view, parcel_ref) in the window; readParcelToolUsage reads it through usageFor (:654); openReport inserts the same event (:608-609). Labels are log-only, never rows. No new field, no schema change.

## Evidence
- Red (RR-0225): red.out, a real commit attempt with only the test, task and context files staged: lines 731, 733, 735, 737 four failures, line 819 "Tests 4 failed | 44 passed (48)".
- Green: commit.out (code commit 7577c4e8b; related run 78 passed | 1 todo, the gate file 48 tests); commit2.out (c97b53448); commit3.out (669de237d, gate file 50 passed). Typecheck run before each (`npm run typecheck`, clean).
- Note on order: the first green attempt failed only on the task-file check (the task file was not in the diff), then the code commit landed with the task file; the tests and context file went in the next commit (explicit paths). The red proof is the red.out attempt, before any route change.
- Reviews: r1-plan.txt (21 findings) and r2-output.txt (12 findings, lens double and missed counting), every one triaged in TRIAGE.md. KEPT: label order (semi_pending before not_produced), the rollback line below, AC2 wording (one route, q and parcelId cases), and two test gaps (parcelId semi case, lot map case) fixed in 669de237d. No defect found in the route.
- Rollback: revert 7577c4e8b; no schema or data change; A.6 unaffected.

## OPERATOR items
1. Billing is effectively off until MB-44 produces pages. Grounded: report-page.ts:23-26 returns null for every lot, so the new gate never opens; but the real assembler already sends no evaluated option today (parcel-lookup-gate.infra.test.ts:110-113, consumer-lookup.ts:65-69), so production counted nothing before this change either. This is the ruling's wording applied to today's code, not a new loss. Recommendation: none needed now; when MB-44 lands, the page and the evaluated-option gate must both open (pinned in parcels-lookup-page.logic.test.ts T-B3 (7), whose owner note says MB-94 c / MB-44 flips it).
2. An unsure (possible semi) lot is never counted by this route. Grounded: the semi answer is a client param (mobile/app/(app)/parcel-tool/[parcelId].tsx:21-31); the route cannot see it. AC1 requires it not be counted until its report is produced. Owner of the count after the answer: the semi page task-319 (it must pass the answer to a counting call). Until then an unsure lot's report is free once pages exist. UNVERIFIED: no existing task names this count.

## UNVERIFIED / limits
- Mobile jest tests (mobile/__tests__) are not run by the commit hook; I did not run them (the client is unchanged).
- The brief's standing rules name run-panel.mjs and its --verify; I did not run it (retired, per the operator's binding instruction).
- Context pack ENOENT for doc-2 / doc-16 (generator defect already reported by BL-ROUTE).
