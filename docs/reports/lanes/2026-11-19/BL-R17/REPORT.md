# REPORT: BL-R17 (task-350, R17, Increment 1·B, record-only)

Status line (Spec 137 rule 3): BL-R17 lane, task-350, record-only, no code change, no push, no database. Review round r1 (r1-review.txt) triaged in TRIAGE.md; the round read pasted text only and opened no cited file, so no recommendation is called verified.

## 1. Decisions entered through backlog-decision.mjs (backlog/decisions/)
- decision-93 RR-0308, quote "Mock looks good", cite ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1188 (approved with one change: question heading as wide as the answer boxes).
- decision-94 RR-0309, quote "Mock approved. Looks good!", cite :1199 (regenerated mock approved as drawn).
- decision-95 RR-0310 (added by the coordinator mid-task), quote "your recommendation is approved", cite :1207; names task-320 and task-351.
- Dated notes on task-319 by the tool, plus my note (questions 1, 2, 4 approved as drawn, RR-0309; question 3 curly apostrophes NOT answered, no string changed). task-319 status unchanged (BUILT).

## 2. The eight A.6 questions sorted (docs/reports/lanes/2026-11-19/BL-A6/REPORT.md "Operator list")
1. Zero left, show or hide: OPEN design question -> task-352 item 1 (recommend show, as built).
2. No plan row: OPEN design question (task-340 left it; decision-92 says only "build it") -> task-352 item 2 (recommend no line, as built).
3. Reset date time zone: ALREADY RULED, RR-0310 (:1207) -> build task task-351 (LATER, m-1).
4. Ratify derived name reset_date: FALLS AWAY, task-351 removes the name and binds a served label as a contract value.
5. Web twin vs parity exception: ALREADY RULED (FE-07, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md:29; live switch off, ONE-35 b MORNING-DECISIONS.md:738); loose end, task-287.
6. Outside-Toronto order: OPEN design question (deviation from v8 search.html:305-306) -> task-352 item 3 (recommend keep the fixed slot, stated as a deviation).
7. Stale metering sentence: LOOSE END (hidden), NONE.
8. Three allowance settings must exist: LOOSE END (hidden), NONE.

## 3. OPERATOR task: task-352 (OPERATOR, m-1, type decision), three questions in plain words
1. When a customer has used every report, does the line still read "0 of 10 reports left until 9 Dec 2026" (recommended, as built) or disappear (they would learn of the limit only from a notice that today is the wrong one)?
2. For a person with no reports plan, no line (recommended, as built; v8 draws none) or a new sentence you would word?
3. In the "only available in Toronto" state, v8 puts the notice first and the line under it; the app keeps the line directly under the box in every state. Keep the fixed slot (recommended, a stated deviation) or follow v8 in that state?
Each carries Grounded and Recommendation lines; all three Recommendations read UNVERIFIED (r1 read the pasted grounding only).

## 4. The time-zone question in full (now ANSWERED, RR-0310; grounding kept in task-351)
- Served field: resetsOn = end.toISOString(), a UTC instant (src/lib/entitlements/index.ts:570, read :657); the anchor is entitlements.current_period_end (Stripe item period end via src/lib/stripe/client.ts:114-115; TIMESTAMPTZ, migrations/228_entitlements.sql:26) else created_at (:560), stepped by whole UTC months (:524-530, :542-548), so it keeps the anchor's UTC time of day. Wire type: z.string().datetime().nullable() (src/app/api/parcels/entitlement/types.ts:17, comment "the page formats it"; mobile/src/lib/schemas.ts:451).
- Formatter BL-A6 built: formatResetDate, mobile/src/lib/parcelSearchCore.ts:87-95, re-writes the UTC characters (no zone). Wrong day only when the UTC time of day is 00:00-04:59 (standard time) or 00:00-03:59 (daylight): the UTC date is one later than the Toronto date. MEASURED with node: 2026-12-09T02:00:00Z is 8 Dec in Toronto, 2026-12-09T05:00:00Z is 9 Dec; 2026-07-10T03:30:00Z is 9 Jul, 04:30:00Z is 10 Jul. Who: a Toronto customer whose anchor time falls in the band, every month; a traveller sees the same under a fixed Toronto zone (a business date). Share of customers in the band: UNVERIFIED (needs a database query).
- Existing repo pattern: the server formats user-shown dates in America/Toronto: src/lib/parcels/lot-size-entry.ts:112-118 formatDateDmy, src/lib/parcels/what-we-checked.ts:36-37, :54, display rule date_dmy (scripts/surfaces/_schema/report-page.json:837), FE-35 and FE-37 "server-formatted" (135 register), Spec 101:111 (Toronto date). Device-formatted dates exist only in the deletion-date modal (mobile/app/_layout.tsx:249, device zone) and admin pages. The setting pipeline_timezone (scripts/seeds/logic_variables.json:9682) governs step clocks, not display.
- Options and what moved (the operator chose C): A leave UTC (no change; wrong day in the band). B format on the device in America/Toronto or the device zone (a client formatter with Intl; strains FE-05 and FE-07 parity; Intl zones on Hermes UNVERIFIED; goldens would depend on the machine zone unless pinned). C the server sends a ready label formatted in America/Toronto (follows the existing pattern; one additive contract field; device formatter removed; goldens hold the served string so they cannot depend on the machine zone). Moves under C: about 19 files listed in task-351 (size GUESS, not measured). Finding: Intl en-GB prints September as "Sept" (MEASURED on node v24.22.0), so the existing formatDateDmy must not be reused unchanged; task-351 says so.
- "How other apps deal with this": general practice, unverified against any source: instants are stored in UTC; a calendar date shown to a person is computed in a stated zone (the viewer's or the business's) before truncating to a day. The orchestrator answered the operator directly.

## 5. task-351 (new build task, LATER, m-1): "SRCH.A6 reset date served as a Toronto-time label (RR-0310)"
Scope now line, declaration sites each with file:line, pattern cites, seven acceptance checks (evening edge, twelve months, identical web and mobile string, device grep proof, zone-independent goldens, contract additive, nothing else moves), Files line, runs under MF-35 (as task-320 did), depends on task-320.

## 6. Loose ends appended to task-343 (--append-notes only; description untouched)
13 lines plus a header: (BL-A6) limit wall not built and every 403 shows the subscription notice (parcelSearchMatch.ts:295-300), stale metering sentence, line absent if a settings key is missing, web twin inert and no web reader, reset date UTC day (task-351); (BL-SEMI2) mobile jest not run, top bar safe-area unchecked, prereg rounds 194 and 195 no ledger claim (`FAIL no-ledger-dir round-195`), semi question 3 unanswered (task-319); (BL-PROOF2) later stages have no task, runner called only by hand (task-268), no key file for the 25 lots; (BL-W) MB-44 status line expiry and live checks (task-123). BL-R16 adds nothing new.
New count of unowned lines: 18 now read `tied up by: NONE` (10 before, 8 added; checked with grep -c = 19 including the legend sentence, which is excluded).

## 7. Checks and review
- backlog doctor: "No duplicate IDs, self-referential dependencies, or dependency cycles found."
- Review r1: 25 findings, TRIAGE.md: KEPT or partly kept 10 (web gate cite, size labels, verified tags, full-path cites, DST probe measured, D3 reworded as a deviation, loose-end recommendations), REJECTED 15 (generator defects and scope), each with opened file:line.
- Gate and commit lines: see the end of this file.

## UNVERIFIED
1. Share of customers whose period end is in the Toronto-evening band (no database). 2. Live presence of the three allowance settings. 3. Hermes Intl behaviour (not needed under option C). 4. Sizes in task-351 and task-352 (GUESS). 5. The three task-352 recommendations (r1 read pasted text only). 6. Whether the web gate behaves after the switch flips. 7. Location of the inc-1 answer key for the 25 lots.

Commit: a02ba26ba (hook tail in commit.out: GATE OK; POLICY CHECKS OK (commit-msg): 0 file(s)).
