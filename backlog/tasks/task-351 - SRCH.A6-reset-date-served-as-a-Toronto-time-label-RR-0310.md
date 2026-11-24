---
id: TASK-351
title: SRCH.A6 reset date served as a Toronto-time label (RR-0310)
status: BUILT
assignee:
  - '@lane-BL-RESET'
created_date: '2026-11-19T21:29:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-320
references:
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1207
  - docs/reports/lanes/2026-11-19/BL-A6/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-RESET/REPORT.md
type: build
ordinal: 51012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: the reset date of the A.6 reports-left line moves to the server. GET /api/parcels/entitlement serves one more field, a ready label formatted in America/Toronto (the same "9 Dec 2026" shape the line shows today); the app and web bindings print the served text; the device-side formatter formatResetDate and the unratified derived name reset_date are removed if nothing else uses them (grep first). Nothing else on the search page moves. Operator, verbatim, 2026-11-19: "your recommendation is approved" (MORNING-DECISIONS.md:1207, RR-0310); the recommendation approved: the server sends the date already formatted in Toronto time; no date is derived on the device.

In plain words: a customer in Toronto whose billing month ends at, say, 9 pm on 8 December sees "until 8 Dec 2026" instead of "until 9 Dec 2026". Today the date shown is the UTC calendar day of the stored instant, which is one day late for an instant between 19:00 and 24:00 Toronto standard time (20:00 to 24:00 daylight time). The reset really happens at that instant, so the Toronto day is the one a Toronto customer expects.

Grounded (every line opened in worktree wf2/inc1b-r17):
- The served field: resetsOn is the END of the billing month, end.toISOString(), a UTC instant with a Z (src/lib/entitlements/index.ts:570; read at :657). It is the anchor (entitlements.current_period_end, a Stripe item period end written by the webhook, else created_at, :560; column TIMESTAMPTZ, migrations/228_entitlements.sql:26; Stripe value src/lib/stripe/client.ts:114-115) stepped by whole months in UTC (addMonthsClamped, :524-530; reportPeriod :542-548), so it keeps the anchor's UTC time of day. On the wire it is a string, z.string().datetime().nullable() (src/app/api/parcels/entitlement/types.ts:17, comment "the page formats it"; mobile client copy mobile/src/lib/schemas.ts:451).
- The formatter BL-A6 built: formatResetDate (mobile/src/lib/parcelSearchCore.ts:87-95) re-writes the UTC characters of the string (regex ISO_INSTANT :83, no zone conversion, fixed month table :79). Wrong day: only when the UTC time of day is 00:00 to 04:59 (standard time) or 00:00 to 03:59 (daylight time); then the UTC date is one later than the Toronto date. Who: a Toronto customer whose anchor time of day falls in that band, every month; a customer travelling abroad sees the same Toronto-fixed date under this fix (the billing date is a business date, not the device's). How many customers fall in the band is UNVERIFIED (needs a database query: the band is 5 of 24 hours if signup times were uniform, a GUESS).
- Existing repo pattern for a date shown to a user: the server formats it in America/Toronto. src/lib/parcels/lot-size-entry.ts:112-118 formatDateDmy ("date_dmy: "10 Nov 2026", Toronto time", Intl.DateTimeFormat en-GB with timeZone America/Toronto); src/lib/parcels/what-we-checked.ts:36-37 ("Dates are shown as the calendar date in Toronto", DATE_ZONE) and :54 fmtDate; the display rule date_dmy is used in scripts/surfaces/_schema/report-page.json:837; Spec 135 FE-35 and FE-37 ("server-formatted value (FE-05)", "server-formatted string") say the same for other surfaces; Spec 101:111 keeps its dedup calendar date in America/Toronto. The only device-side formatted dates are non-surface or admin ones (mobile/app/_layout.tsx:249 device zone, deletion date in an account modal; admin pages in src/app/admin and src/components). The pipeline setting pipeline_timezone (scripts/seeds/logic_variables.json:9682, enum UTC or America/Toronto) governs step clocks, not user display.
- Rules: FE-05 no maths in the UI (docs/specs/*/135*.md:27); FE-18 and FE-32 a displayed value binds to a served contract field (135:40, :54); FE-07 mobile and web render the same declaration (135:29); DB fields are the key (RR-0233 scope, MORNING-DECISIONS.md:925); RR-0310 (:1207).
- Design: small-pages-v8 search.html:267 draws "6 of 10 reports left until 9 Dec 2026" and report-limit.html:286, :298, :310 draw "Your count resets on 9 Dec 2026"; the mocks name no time zone. The limit wall (403 REPORT_LIMIT_REACHED) also serves resetsOn (src/features/leads/api/error-mapping.ts:34-38); that screen is not built and is out of this task (its own label is a follow-up owed to the wall task; listed as a loose end on task-343).

Declaration sites to change (each file:line is the current line):
1. src/lib/entitlements/index.ts:616-623 (ParcelToolUsage gains the label field), :632 (empty), :657 (set from u.resetsOn; the label is produced from the same instant by the existing formatDateDmy, imported not copied; name of the field: resetsOnLabel is a GUESS and must be claimed in the id ledger or ruled first).
2. src/app/api/parcels/entitlement/types.ts:17 (new strict member, nullable string); the route needs no change (src/app/api/parcels/entitlement/route.ts:39-40 parses the whole usage).
3. scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:83 (field_whitelist) and the census mirror scripts/surfaces/_schema/census/contracts.json:22724 and :22970; contract is additive_only so resetsOn stays.
4. mobile/src/lib/schemas.ts:451 (client schema, plain object not strict: add the member).
5. mobile/src/lib/parcelSearchCore.ts:72-74 (types), :87-95 (formatResetDate removed), :99 (reportsLeftShown tests the served label is a non-empty string instead of calling the formatter); mobile/src/lib/parcelSearchMatch.ts:357 and mobile/app/(app)/parcel-tool/index.tsx:78 (pass the label through).
6. mobile/src/components/surfaces/SearchBinding.tsx:46 (DERIVED_NAMES drops reset_date), :95-103 (reset var becomes entitlement('<label field>'), a contract value), :255 (derived write removed); src/components/surfaces/web/SearchBinding.tsx:151 and :275 the same; scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json:472 and scripts/surfaces/_schema/census/mobile-product.json:7999 (the reset_date deviation text removed; contract_ref :79-81 already lists the entitlement contract by reference), and the regenerated mobile/src/generated/surfaces/mobile_parcel_search.json.
7. Goldens and fixtures: src/tests/fixtures/surfaces/mobile_parcel_search/reports_left.mobile.json and reports_left.web.json, mobile/__tests__/fixtures/parcelSearch.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json (regenerated by scripts/surfaces/search-golden-capture.ts --write, never by hand).
8. Tests: src/tests/surfaces/search-reports-left.logic.test.ts:109 onward (formatResetDate cases move to a server test of the label), src/tests/parcels-entitlement.infra.test.ts, src/tests/parcel-tool-meter.logic.test.ts, src/tests/parcel-lookup-gate.infra.test.ts and src/tests/mctest/drills.logic.test.ts only where they name resetsOn (they keep the instant, so expected untouched: MEASURED only by running them).

Acceptance criteria are the checks below (also on this task as AC).

Size: GUESS about 20 files, one lane; not measured. Runs under MF-35 (the A.6 line is its follow-up, as task-320 ran: .cursor/MCFRONTEND-QUEUE.md:133; no new MF id). Depends on task-320 (BUILT). Pins that move on purpose: surface-validate S-sbind strings 425 (no string added or removed expected), goldens 100 (no new state), reports_left golden text unchanged for a UTC-day-equals-Toronto-day instant.

Pattern followed (cites above): server formats dates in America/Toronto with the existing formatDateDmy; the client prints the served string; one contract field, no new component, no new setting.

Risk, MEASURED on node v24.22.0 (node -e, Intl.DateTimeFormat en-GB, America/Toronto): 2026-09-10T12:00:00Z prints "10 Sept 2026" (the v8 shape is "Sep"; the existing formatDateDmy would print Sept). 2026-12-09T02:00:00Z prints "8 Dec 2026" and 2026-12-09T05:00:00Z prints "9 Dec 2026" (the evening edge). So the label must come from a formatter with a fixed month table over Toronto calendar parts (formatToParts with a numeric month), not the en-GB short name; the existing formatDateDmy is reused only if it is first corrected, which changes its Sept output for the lot-size page: a named reason and a ruling-free fix owed in this task (test all twelve months).

Files: src/lib/entitlements/index.ts, src/lib/parcels/lot-size-entry.ts, src/app/api/parcels/entitlement/types.ts, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, mobile/src/lib/schemas.ts, mobile/src/lib/parcelSearchCore.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/app/(app)/parcel-tool/index.tsx, mobile/src/components/surfaces/SearchBinding.tsx, src/components/surfaces/web/SearchBinding.tsx, mobile/src/generated/surfaces/, src/tests/fixtures/surfaces/mobile_parcel_search/, mobile/__tests__/fixtures/parcelSearch.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json, src/tests/surfaces/search-reports-left.logic.test.ts, src/tests/surfaces/search-web-binding.ui.test.tsx, src/tests/parcels-entitlement.infra.test.ts, src/tests/parcel-tool-meter.logic.test.ts, src/tests/parcel-reset-label.logic.test.ts, .cursor/MCFRONTEND-QUEUE.md, docs/reports/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An instant between 19:00 and 24:00 Toronto standard time (e.g. 2026-12-09T02:00:00Z) is served the label for the Toronto day (8 Dec 2026); 2026-12-09T05:00:00Z is served 9 Dec 2026; a server test pins both and one instant in daylight time (2026-07-10T03:30:00Z -> 9 Jul 2026)
- [x] #2 All twelve months are served as the v8 shape (Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec; September is Sep, not Sept) by a test over twelve instants
- [x] #3 Mobile and web print the identical served string: the reports_left mobile and web goldens carry the same text and the root web-binding execution test asserts it
- [x] #4 No date arithmetic or formatting on the device: git grep -n -E 'formatResetDate|reset_date|toLocale|Intl\.|getUTC' over mobile/src/lib/parcelSearchCore.ts, both SearchBinding files and mobile/app/(app)/parcel-tool/index.tsx prints nothing for the reset date; DERIVED_NAMES has no reset_date
- [x] #5 Goldens do not depend on the machine zone: the label is produced on the server from fixed instants and the goldens hold the served string; the server test passes with TZ=UTC and TZ=Pacific/Auckland
- [x] #6 The contract stays additive_only: resetsOn is unchanged on the wire; the new field is in the descriptor whitelist and the census mirror; surface-validate, consumer-registry, generate-target-files and generate-surface-registry --check are clean; S-sbind string count unchanged at 425
- [x] #7 Nothing else on the search page moves: the other ten search goldens and the lot map and semi goldens are byte-identical
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. (AC1,AC2,AC5) Red tests first, then add formatDateDmyFixed beside formatDateDmy in src/lib/parcels/lot-size-entry.ts (Toronto calendar parts, fixed Jan..Dec table; formatDateDmy untouched) and serve resetsOnDisplay from readParcelToolUsage (src/lib/entitlements/index.ts) and the strict route schema (src/app/api/parcels/entitlement/types.ts); server test pins 2026-12-09T02:00Z->8 Dec 2026, 05:00Z->9 Dec 2026, 2026-07-10T03:30Z->9 Jul 2026, twelve months, TZ=UTC and TZ=Pacific/Auckland. 2. (AC6) Contract descriptor field_whitelist, census mirror (contracts.json x2), mobile client schema; additive_only, resetsOn unchanged. 3. (AC3,AC4) Both search bindings bind the reset var to the contract ref contract_parcels_entitlement.resetsOnDisplay; remove formatResetDate, DERIVED_NAMES reset_date and the derived write; situation fixture carries the served label; web binding execution test asserts the same text on web and mobile. 4. (AC5,AC7) Regenerate goldens, mobile slice, registry only by their scripts; other ten search goldens, lot map and semi goldens byte-identical. 5. Checks before and after, typecheck, review round, reports, close.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-19 (M-246, prior text kept; RR-0310 · task-351 · Backlog; operator, verbatim: "your recommendation is approved")

2026-11-19 taken on the board at lane launch (lane BL-RESET, worktree /Users/brettpreston_macmini/Buildo-wt-reset, branch wf1/inc1b-reset), RR-0240

AC evidence (commit 2d3474ee6): AC1/AC2/AC5 src/tests/parcel-reset-label.logic.test.ts green in the hook run (8 tests, TZ=UTC and TZ=Pacific/Auckland child processes); AC3 web execution test search-web-binding.ui.test.tsx (e) and both reports_left goldens carry the ref contract_parcels_entitlement.resetsOnDisplay; AC4 git grep prints nothing; AC6 S-sbind ok 425 strings, registry, consumer-registry, target-files clean; AC7 props of the other goldens unchanged, only the descriptor fingerprint line moves in the ten search goldens (generated). Not run: mobile jest. See docs/reports/lanes/2026-11-19/BL-RESET/REPORT.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Served resetsOnDisplay (Toronto date, fixed month names) on GET /api/parcels/entitlement; both search bindings print it; formatResetDate and derived name reset_date removed. Commit 2d3474ee6, hook: 67 test files passed, GATE OK, POLICY CHECKS OK. Mobile jest not run locally. Operator item: Sept on the lot-size page.
<!-- SECTION:FINAL_SUMMARY:END -->
