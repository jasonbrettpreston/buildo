# Seat: reality-check: task-367 plan (PLAN-367-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: I read wf2/board at head 1da9f842d (branch wf2/board). The plan says it read b32ea9b4c. I checked: b32ea9b4c is an ancestor of 1da9f842d, so the plan's tree is contained in mine. I read the whole task file, the Spec 135/136 lines named, RULE-CHECKS.md:23, converted-surfaces.json, surface.schema.json, all 95 tracked descriptors (JSON.parse), the 41 declared files (TypeScript AST plus grep), the mobile router calls, parcelSearchMatch.ts, the .cursor/MCFRONTEND-QUEUE.md rows, Spec 126:82, handbook-rule-map.logic.test.ts, register-locks-resolve.infra.test.ts, the task-442 card, ~/Buildo-scratch/ids, and read-only `git show`/`git diff` on the three branches. I wrote no file and ran no test runner. One `node -e` call had a mistyped scratch path in a writeFileSync. I saw no error output, so I do not know whether it wrote an empty file under /private/tmp. I also wrote one list to the scratchpad. Both are outside the repo.

## Checked and TRUE (re-measured)
- Spec 136: `grep -c '^- \*\*fe\.'` gives 58 and `grep -c 'Status: OWED'` gives 22.
- RULE-CHECKS.md:23 says 57 (+1 pending, fe.58), 29, 8, 20.
- The rule texts match at the cited lines, and each is followed by its lock-owed line:
  - fe.49 at 136:178 (lock 136:179, row 135:71).
  - fe.51 at 136:184 (lock 136:185, row 135:73).
  - fe.54 at 136:193 (lock 136:194, row 135:76).
  - fe.58 at 136:205-206, and its row at 135:80 says "the lock is task-367's".
- Spec 135 rules 3 and 5 are at :14 and :16. OWED_LOCK_RE is at register-locks-resolve.infra.test.ts:19, not :18.
- converted-surfaces.json has `programme_scopes` ["parcel_product","parcel_admin"] and `expected_count` 33.
- In-scope descriptors: 45 (33 SURFACE and 12 CONTRACT).
- In-scope SURFACE descriptors: 33. 25 of them have `inputs.answer === 'contract'`.
- No in-scope contract reader lacks a state with `name === 'error'`, and no in-scope contract reader has `errors.answer` equal to none.
- Out of scope, 8 contract readers have no error state and are unaffected by T1 (6 estate_other, 2 platform_shared):
  - estate_other: mobile_flight_job_detail, mobile_map, web_builder_detail, web_builders_list, web_dashboard, web_permit_detail.
  - platform_shared: web_subscribe_success and shell_app_tabs.
- The field shape is real:
  - `inputs.answer` takes contract, props, none, app_outputs or device.
  - `states[]` entries are `{name, golden}`.
  - `errors.answer` takes envelope, inline, none, boundary, redirect (and UNRESEARCHED in the schema).
  - The schema `errors` block sits at about :2075-2090.
- T2 file set: 41 tracked .ts/.tsx files (31 parcel_product + 10 parcel_admin; 20 mobile and 21 src). 55 raw paths, of which 14 are URL paths or untracked (e.g. /api/..., /admin/roles, mobile/src/components/parcel/SponsorSlot.tsx).
- T2 hits: 0 for lead_parcels in any in-scope descriptor and 0 AST hits in the 41 files.
- The three parcel routes import envelope and error-mapping at the cited lines (lookup 40 and 48, entitlement 19-20, lot-size 25-26).
- T3: PARCEL_TAB_ROUTE is at parcelSearchMatch.ts:252-256, with three routes (lookup, tracked, account).
- T3 pushes: exactly two direct tab pushes in the mobile files, `parcel-tool/_layout.tsx:48` `router.push(PARCEL_TAB_ROUTE[tab])` and `tracked.tsx:99` `router.push(PARCEL_TAB_ROUTE.account)`. Every other tab use is `router.replace(PARCEL_TAB_ROUTE.lookup)`.
- The queue rows are at :353 (MF-49), :376 (MF-50), :382 (MF-51), :394 (MF-52).
- Spec 126:82 holds both the "convention, not checked by the lock" quote and "tab switch uses `navigate`". It names audit flags #1, #6, #12 as owed by MF-49/MF-50, MF-35/MF-52, MF-51/MF-52, which matches the plan's owners.
- parcelScreens.golden.test.ts:217-220 checks for lead imports (useLeadFeed, useFlightBoard) over a list of files in mobile jest.
- handbook-rule-map.logic.test.ts: NEW_LOCKS at :258, status OWED at :273, `existsSync` false at :274, `owed >= 21` at :281, the Status regex at :283.
- Register lock test: FLIP_PENDING is `['FE-39']`.
- The task-442 card takes fe.05, fe.18 and fe.27, and reserves its OWED rows "lock path reserved: task-367" (442:111).
- The MF-97 mention in the 442 plan's review files and the "Next free id: **MF-97**" line (queue :5) are consistent. ~/Buildo-scratch/ids ends at MF-96 and round-201 (round-loop1-* are a separate series). MF-97/round-202 are not yet in the ledger, which the plan allows.
- Branch landings:
  - thinroute touches parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, and that version has 0 lead_parcels.
  - areafactor touches one descriptor in scope-relevant space, estate_other/F90/surfaces/mobile_lead_detail.descriptor.json, so out of scope.
  - mfrules touches the queue, 135, 136 and surface-rule-map.json (and mf-rules-register.logic.test.ts).

## rc#1 LOW: wrong line numbers for two test anchors, and the thinroute descriptor path is not given
Plan: section 0 item 3 and section 3: "OWED_LOCK_RE at register-locks-resolve.infra.test.ts:18" and "FLIP_PENDING (:26 ...)". Section 8 item 3 and section 6: "(register-locks-resolve.infra.test.ts:26)" for the FLIP_PENDING edit.
Evidence: register-locks-resolve.infra.test.ts:19 reads `const OWED_LOCK_RE = /^src\/tests\/surfaces\/[^/]+\.test\.tsx?$/;` and :30 reads `const FLIP_PENDING: readonly string[] = ['FE-39'];`. Line :26 is a comment line. The OQ1=n fallback names :26 as the edit site.
Fix: replace :18 with :19 and :26 with :30. Each row cell reads "RULED ..." only when the test's status parse accepts it.

## rc#2 LOW: lead text in declared files appears at a second place the plan does not mention
Plan: T2 "Today: ... The only lead text in these files is a comment, at mobile/src/hooks/useTrackedLots.ts:22, which the AST skips."
Evidence: grep over the 41 files also hits mobile/src/lib/trackedLots.ts:70-71, a comment reading "...must not be harmonised onto the query-param style the root `[lead]` / `[flight-job]` routes use." AST string and identifier walk gave 0 hits, so the AST still passes. Only a grep-based finder would trip.
Fix: say "two comments (useTrackedLots.ts:22, trackedLots.ts:70-71)" and add a control for a block comment with `[lead]`, so the AST claim is exercised.

## rc#3 LOW: T3's finder misses pushes of a route held in a variable; two such pushes exist in this tree and neither pushes a tab route today
Plan: T3 Limits: "A route held in a variable is missed."
Evidence: parcel-tool/index.tsx:87 `router.push(route);` inside `navigate = useCallback((route: string) => ...)`, and parcel-tool/disambiguate.tsx:42 `const push = useCallback((route: string) => router.push(route), [router]);`. The plan names the limit, but not these two sites. Their callers pass lot, select and map routes, so I found no tab route reaching them. UNVERIFIED: I did not trace every caller of `navigate` and `push`.
Fix: name both sites in the Limits line so the build seat does not count them as a gap found later.

## rc#4 NIT: the "20 mobile files" for T3 are the mobile subset of a derived list, not a list in the plan
Plan: T3 Reads "The mobile files among T2's set: 20 today."
Evidence: my rebuild gives 20 mobile and 21 src among the 41. This is TRUE. The only issue is that the number depends on `x-draft.files` of three descriptors that name URL paths or an untracked file (SponsorSlot.tsx is listed as a file but is not tracked as .ts/.tsx under that rule). 14 of 55 declared entries are filtered out by the tracked-.ts/.tsx filter.
Fix: optional, state that the filter drops 14 of 55 declared entries so the floors (files >= 30) are set against 41, not 55.

## Notes on lenses with no finding
- Fence breach beyond one hop: I found no real breach inside the 41 files or in mobile/app/(app)/parcel-tool, mobile/src/components/parcel and the parcel lib and hook files by grep. The only lead text near them is a comment at mobile/src/hooks/useParcelLookup.ts:29 ("mirrors useLeadDetail"), a file not in the declared set. The plan's one-hop limit is therefore acceptable. The real lead pushes at mobile/app/_layout.tsx:408-472, (app)/index.tsx:133 and (app)/map.tsx:72 are lead-gen code, outside any declared file, which is correct.
- Overlap: nothing else in src/tests names the three lock paths. They appear only in Specs 135/136 and 00_system_map.md, so G6 looks clear for the cell text. `handbook-rule-map.logic.test.ts:402` (owedInText vs the gate's OWED rows) is derived from the register and will stay consistent after the flip. The plan did not list that case among its edits, and it needs none.
- Owners: MF-49 and MF-50 rows do not mention tab navigation in their own text. The ownership comes only from Spec 126:82 and the nav-by-route list (nav-by-route.logic.test.ts:301-312, 331-332 name MF-49/MF-50 for other exceptions). The plan's claim that they are the owners holds on Spec 126:82, not on the rows' own words. This is a documentation fact, not a defect.
- mfrules branch: it also edits src/tests/surfaces/mf-rules-register.logic.test.ts (116 lines changed), a file the plan does not list in the 388 landing paragraph. It rewrites the FE-45 row in 135. I did not read that test. UNVERIFIED whether it pins anything on FE-49, FE-51 or FE-54.

STATUS: 4 findings (0 CRITICAL, 0 HIGH, 0 MED, 3 LOW, 1 NIT); every number in the plan re-measured TRUE on the tree, only line-number and completeness slips found.
