# Seat: reality-check: task-452 plan (PLAN-452-v2)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head e192b5e3e. The plan says it was read at 9fdbe4ac1. `git diff --stat 9fdbe4ac1 HEAD` shows only task and review markdown, so no code the plan cites moved. Read: the full task file (Implementation Plan, 326 lines); src/features/leads/api/error-mapping.ts; the lookup, lot-size and entitlement routes; src/lib/entitlements/index.ts (readParcelToolUsage, ENTITLEMENT_STATUSES, ACTIVE_SUBSCRIPTION_STATUSES); entitlement/types.ts; mobile apiClient.ts, errors.ts, useParcelLookup.ts, schemas.ts, parcelSearchMatch.ts, ReportPageHost.tsx, PageTableBinding.tsx, SemiQuestionBinding.tsx, semi-question.tsx and index.tsx; static-page.json and its schema; bindings.json; converted-surfaces.json; the three surface pin tests; the mobile tests the plan cites; ~/Buildo-scratch/mcfrontend/small-pages-v8/report-limit.html; phone-full-a12d535f5.out; git show --stat for the shas. DB: one read-only SELECT on the local test stack (entitlement counts by product and status). Nothing was run and nothing was written.

## Checked and clean
- The two 403s match. error-mapping.ts:29 is SUBSCRIPTION_REQUIRED, status 403, no details. :38 is REPORT_LIMIT_REACHED, status 403, details `{ reportsLimit, resetsOn }`, where resetsOn is an ISO timestamp (:33-34 doc comment).
- Sender lines are right: lookup route.ts:73, :112, :113 and lot-size route.ts:58. ENTRY_OFF at lot-size :51 is a separate 403 with its own code, so it stays a plain ApiError.
- Entitlement read per customer state (index.ts:640-675, types.ts):
  - No parcel_tool row: status null and every other field null.
  - Status not in {trial, active, past_due, admin_managed} (that is, expired or cancelled_pending_deletion): the status string with every count null.
  - Active-set status: reportsLimit is a positive integer, and resetsOnDisplay is a "9 Dec 2026" string, or null if the date is invalid.
  - On a limit 403 the customer is in the active set, so the read gives a number and a date. The plan's gate (a number plus a resetsOnDisplay, else null) is consistent.
  - A 'reactivate' only for status 'expired' is real: `status` is in the enum, and the mobile schema (schemas.ts:449) takes `status` as a string or null.
- Test stack data (one aggregate SELECT): lead_gen active 1; parcel_tool active 556, admin_managed 1, cancelled_pending_deletion 1, expired 1, past_due 1, trial 1. The expired state exists for the unauthorized situation. No parcel_tool row exists in the stack, but the null-status case is still legal.
- Mock literals, report-limit.html state 3 (:281-290, "3 · App · Monthly limit reached or trial · wall"). The strings are "You’ve used all 10 reports", "Your count resets on 9 Dec 2026.", "Lots you’ve opened this period still open.", "Your Tracked Lots stay.", "Your plan is managed on the web." and "Go to Tracked Lots". Together with wall.reactivate (copied from today's search.entitlement, content.json:13) they make the 7 keys: limit.title, limit.reset, limit.opened, limit.stay, plan, tracked, reactivate. "How are reports counted?" is at :288 and is excluded, as the plan says.
- Counts: the .out file reads "Test Suites: 58 passed, 58 total / Tests: 866 passed, 866 total". `find mobile/__tests__ -name '*.test.ts*'` gives 58 files, and mobile/src, mobile/__tests__ and scripts/surfaces are unchanged between a12d535f5 and HEAD. 451 (04c181564) is an ancestor of a12d535f5. So 59 files after wallScreens.golden is right.
- Pins read at the cited lines:
  - surface-conformance.logic.test.ts:245 holds "examined 33 ... converted 17".
  - :263 holds "17 surfaces, 100 goldens" and "17 surfaces, 436 strings".
  - surface-validate.logic.test.ts:93 holds "(18 states x 4; owed 13 states / 52 files)", "converted 17", "S-sbind ok (17 surfaces, 436 strings)" and "S-page ok (1 of 1 screens)". :95 holds `examined 33 in scope:`.
  - converted-surfaces.json:5 holds `"expected_count": 33`.
  - admin-media.golden.test.ts:38 holds `expect(fresh.size).toBe(70)`.
  - static-page.logic.test.ts:107 holds `expect(Object.keys(SCREENS)).toEqual([ID])`, so it does go red on purpose. :103 is BINDING and :114-118 is the no-JSX check.
- Cites: apiClient.ts:49-63, ACCOUNT_DELETED :54, catch :60, throw :63 and re-export :12; errors.ts ApiError :14-22; useParcelEntitlement :162; index.tsx:52; PARCEL_TAB_ROUTE :253-257; classifyParcelSearchError :298-301; the file ends at :366; static-page.json screens :1291 and prefix :1293; schema action enum :531-538 holds push; PageTableBinding notice vars :99-100; SemiQuestionBinding lists :28-37; semi-question.tsx no-ops :77-78; bindings.json module :20 and mounts :28-44; MOBILE_HOSTS :752 and MOBILE_PARTS :748; ReportPageHost props :34-35 and `top` :60; census refs run to S-095. The index.tsx `navigate` callback (:81-86) does call addRecent and router.push, as the plan says. The apiClient.test locks at :113 (ACCOUNT_DELETED) and :132 (generic 403) are right. The three report-mount mock lines (:22, :33, :35) and the expo-router mock at :21-24 are right, and that mock has no navigate today.
- Shas in section 8 exist with the subjects the plan gives: 9fdbe4ac1, a12d535f5, ee3634771 (450), fe88ecf71 (449), 04c181564 (451), 5af0f7be2 (fold of 451), acc1affa0 (461, touched only lotForm.test.ts plus a task file and a review record), 9b709f475 and 0f8eca7a9. 451's file list matches the plan's claim (static-page.json, mobile-product.json, static-page test, both pin tests, the two 127 files). 449 touches the 127 files, a spec file and census/contracts.json, none of which is on the 452 Files line. wf2/inc1b-proc460 exists and is not an ancestor of HEAD, so it has not landed.
- Projected pin arithmetic is internally consistent: 436 + 7 = 443, 100 + 2 = 102, 33 to 34, 17 to 18, then 357 adds 8 strings and 3 goldens to reach 451 and 105.

## rc#1 LOW: "ENTRY_OFF stays ApiError" is listed beside kept locks, but no mobile test covers it
Plan: section 6 AC1: "Kept locks :113 and :132 stay green both ways; ENTRY_OFF stays ApiError."
Evidence: `grep -rn ENTRY_OFF mobile/__tests__ mobile/src` returns nothing. The server sends it at lot-size/route.ts:51 as `err('ENTRY_OFF', 'Lot size entry is not open yet', 403)`. Only :113 and :132 exist as locks.
Fix: say "add one case: an ENTRY_OFF 403 stays ApiError(403)". It is a new assertion, and it would be green before the change.

## rc#2 NIT: "strings equal report-limit.html state 3" cannot hold for the whole of state 3
Plan: section 6 AC2, wallScreens.golden.
Evidence: state 3 (report-limit.html:284-288) also has the address line "48 Larchmere Avenue, Toronto", the header title and Back, and "How are reports counted?". The plan keeps the last one out and the host draws the others. The test is only true if it is scoped to the 6 wall literals. The reactivate state has no literal in the mock at all (it uses today's notice sentence).
Fix: write "the six wall literals of state 3; the reactivate sentence equals search.entitlement in the search content".

## rc#3 NIT: board head named in the plan is stale
Plan: header, "Cites were read at board head 9fdbe4ac1".
Evidence: head is e192b5e3e, and the only changes since are task and review markdown.
Fix: none needed. The reviewer should know the code cites still hold at e192b5e3e.

## rc#4 LOW (UNVERIFIED): S-golden figure "(18 states x 4; owed 13 states / 52 files)"
Plan: section 4, "S-golden ... is measured, not projected."
Evidence: read at surface-validate.logic.test.ts:93 as 18 states x 4, owed 13 states / 52 files. I did not run surface-validate, so I cannot say if two new mobile goldens move it. The plan already marks it as a projection (section 13).
Fix: none. The lane must record the measured value before and after.

STATUS: 4 findings (0 CRITICAL, 0 HIGH, 0 MED, 2 LOW, 2 NIT); every stated fact, count, pin, sha and mock literal checked is true, and only the ENTRY_OFF wording and the mock-scope wording need tightening.
