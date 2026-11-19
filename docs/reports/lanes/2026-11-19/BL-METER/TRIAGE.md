# TRIAGE: BL-METER r1 plan review (r1-plan.txt, 21 findings; verdict text "FAIL on plan-readiness")
Opened files: ~/Buildo-wt-meter/src/app/api/parcels/lookup/route.ts, src/lib/parcels/report-page.ts, src/lib/entitlements/index.ts, src/lib/parcels/consumer-lookup.ts, src/app/api/parcels/lookup/types.ts

| # | finding | verdict | evidence |
|---|---|---|---|
| 1 | CRIT guard disables billing until MB-44 | KEEP the disclosure, REJECT as a defect | report-page.ts:23-26 returns null for every lot; ruling RR-0278 and the brief (Design limits) accept it. Today the real assembler already sends no evaluated option (parcel-lookup-gate.infra.test.ts:110-113 "The real assembler sends no evaluated option today"; consumer-lookup.ts:65-69 hasEvaluatedOption), so production counts nothing today as well. Stated plainly in REPORT.md as an OPERATOR-visible fact. |
| 2 | CRIT "same as today" is false | KEEP | Wording corrected in the report: today the meter charges at lookup for a hit with an evaluated option (route.ts:158-161), but no such hit exists on real data; after the move it charges only on a produced page. |
| 3 | HIGH `!== null` vs undefined | REJECT | types.ts:186 `page: ReportPageViewSchema.nullable()` is required, the parse at route.ts:149 yields null or an object; route.ts:112 sets page: null explicitly. I use `body.page !== null`. |
| 4 | HIGH lotForm.unsure not in body | REJECT | route.ts:113 and :142 put lotForm in the response; the log reads response.lotForm?.unsure (:182). The route cannot see the semi ANSWER, true: noted as an open limit (task-319). |
| 5 | HIGH label order makes semi_pending unreachable | KEEP | Order becomes: not_evaluated, semi_pending (unsure), not_produced (page null). Cheap and observable. |
| 6 | HIGH unsure+page case impossible | REJECT | Possible once MB-44 serves pages; the case is a lock for that state with a mocked producer, the same method as parcels-lookup-page.logic.test.ts:100. |
| 7 | HIGH golden fixture is fiction | REJECT in part | The fixture is the committed v21 mobile response (src/tests/fixtures/report-page/props/page_v21.mobile.json) already used by parcels-lookup-page.logic.test.ts:57. Cited in the test comment. |
| 8 | HIGH A.6 filter unverified | REJECT (verified) | index.ts:562-565: usageFor counts DISTINCT subject_key in usage_events with event property_view, subject_kind parcel_ref in the window; readParcelToolUsage calls usageFor (:654); openReport inserts the same event (:608-609). Labels are log-only, never rows. |
| 9 | HIGH pageResponse vs body.page lot identity | REJECT | One lot per request: parcelRef (:127) feeds readCustomerPageResponse (:130), page (:131) and the meter ref (:160); no second lot exists in the handler. |
| 10 | HIGH no rollback | KEEP (one line) | REPORT.md states: revert the route.ts commit; no schema, no data change. |
| 11 | MED AC2 report route | KEEP (clarify) | There is one route; the report screen calls it with ?parcelId= (mobile/app/(app)/parcel-tool/[parcelId].tsx:21). Cases cover both the q and the parcelId path in the same file. |
| 12 | MED file choice / infra skipped | REJECT | The gate file is the existing home of the route's meter cases (T8-T10) and the hook's related run runs it; red.out will show. |
| 13 | MED concurrency double count | REJECT (out of scope) | openReport is untouched (brief: move, not redesign); it takes the entitlement row FOR UPDATE (index.ts:589 onward, test "FOR UPDATE" in parcel-tool-meter.logic.test.ts). |
| 14 | MED month boundary tests | REJECT (out of scope) | reportPeriod boundary cases exist (parcel-tool-meter.logic.test.ts T6). |
| 15 | MED multi_parcel not grounded | REJECT | route.ts:118 the meter needs resolved.match -> parcelRef/body.parcel; a map response has match null (parcel-lookup-gate.infra.test.ts:212-217 and :345 already assert it). |
| 16 | MED RR-0278 not a registered decision | REJECT | RR-0278 is the brief's and task's cited ruling (MORNING-DECISIONS.md:1082, verbatim in the task description). |
| 17 | MED task-319 dependency | KEEP (report) | Named in REPORT.md as the owner of the unsure-lot count; no new task invented here. |
| 18 | MED response contract change | REJECT | Labels are log-only (the `meter` field of logInfo, route.ts:180); the response body and the client are unchanged. |
| 19 | LOW not_evaluated row missing in table | KEEP | Added to the report table. |
| 20 | LOW page read before parse | REJECT | Pre-existing, outside the task. |
| 21 | NIT ENOENT context / oracle | REJECT | Pack generator defect already reported (BL-ROUTE report); labels are log-only. |

Fold into the plan: items 2, 5, 10, 11, 17, 19 (labels and report text; the one code change is the label order).

# TRIAGE r2: output review (r2-output.txt, lens: double counting and missed counting; 12 findings)
| finding | verdict | evidence |
|---|---|---|
| HIGH unsure lot never counted | REJECT as a defect, DISCLOSED | AC1 (task-334) says an unsure lot is not counted until its report is produced; the route cannot see the semi answer ([parcelId].tsx:21-31 sets it client side). Owner of the after-answer count: the semi page task-319. Listed as the OPERATOR item in REPORT.md. |
| HIGH not_evaluated before semi_pending hides the semi population | REJECT | Order is unchanged operator rule 1 b 2 a first (route.ts:158); a not-evaluated lot is not charged either way; the log is observability only. |
| MED unsure and evaluated precedence untested | REJECT | The unsure+evaluated case IS the semi test (the default fixture attaches an evaluated option, test "an unsure lot ... counts nothing even with a page"). |
| MED body.page === null vs undefined | REJECT | types.ts:186 `page: ReportPageViewSchema.nullable()` is required; a missing key fails the strict parse (route.ts:149) before the meter. |
| MED parcel set, parcelRef null falls through | REJECT | route.ts:127 sets parcelRef in the same branch that sets payload; body.parcel non-null implies parcelRef non-null. |
| MED never charges until MB-44, REPORT_LIMIT dead | REJECT as defect, DISCLOSED | Same as r1 #1/#2: report-page.ts:23-26; real assembler has no evaluated option today (gate test :110-113). Stated in REPORT.md. |
| MED lot-map case not exercised in my test | KEEP | Added an explicit multi_parcel case (fix commit). |
| MED semi only on q path | KEEP | Added the parcelId semi case (fix commit). |
| LOW === true | REJECT | readLotForm returns a boolean (unsure typed in lot-form.ts and the response schema). |
| LOW __dirname | REJECT | the same pattern is used by src/tests/search-routing.logic.test.ts:63 (path.resolve(__dirname, ...)). |
| NIT not_produced conflation / meter union consumers | REJECT | log-only label; the union is local to the route (route.ts:155). |
