Grounder: Cairn-Ground-G3A
Ruled: out-compliance-agents-s5-1to3.txt sha256:baee5b4e338d findings:3
Ruled: out-compliance-agents-s7-s11.txt sha256:8ae31466030c findings:3
Ruled: out-compliance-queue-137.txt sha256:0e6409219980 findings:0 ("BUG: none", "DEFER: none"; the REJECT/MET lines are not findings)
Ruled: out-compliance-orchestrator-doc17.txt sha256:1af58286a090 findings:3
Ruled: out-compliance-surface-136-p1.txt sha256:fe8088dc9a30 findings:2
Ruled: out-compliance-surface-136-p2.txt sha256:15df1e35f303 findings:1
Ruled: out-compliance-surface-136-p3.txt sha256:9d7cbd33b395 findings:3
Ruled: out-compliance-surface-136-p4.txt sha256:6edccef04dcf findings:4
Ruled: out-compliance-surface-136-p5.txt sha256:9202f6fda511 findings:4
Ruled: out-compliance-surface-136-p6.txt sha256:abde22aef465 findings:4
Ruled: out-compliance-surface-136-p7.txt sha256:51b072e53332 findings:4
Ruled: out-compliance-surface-136-p8.txt sha256:7836d705804f findings:2
Ruled: out-compliance-surface-136-p9.txt sha256:329c4a9f0932 findings:4
Ruled: out-compliance-surface-136-p10.txt sha256:84db62fd683d findings:6
Ruled: out-compliance-surface-136-p11.txt sha256:646c6c47ecf6 findings:4
Ruled: out-compliance-surface-136-p12.txt sha256:ede294fe94f5 findings:5
Ruled: out-compliance-surface-136-p13.txt sha256:d3432e53d642 findings:6
Ruled: out-compliance-surface-136-p14.txt sha256:5a7a3e420c52 findings:3
Ruled: out-compliance-surface-136-p15.txt sha256:355266c4c720 findings:4
(65 findings in all: 8 HIGH, 28 MED, 29 LOW, no CRIT. `git diff --stat 8dba70e8e HEAD` touches no G3 file I relied on. Read-only throughout.)

Rule texts read from Spec 136 (docs/specs/02-web-admin/136_mcfrontend_handbook.md). Status as printed there: fe.47 OWED (lock tunables-are-data, task-434, status LATER), fe.25 OWED, fe.39 OWED, fe.56 OWED (lock-planted-defect). fe.36 and fe.31 RULED.

## 2. Table (id | severity | verdict | reason)
agents-s7-s11#1 | HIGH | NOT-APPLICABLE | 08_agents §11.1 governs a plan or fold claim ("A plan or fold may not contain a claim..."). lot-map-data-check.mjs is a read-only tool; refuse() pins 127.0.0.1:55322 (:39-47).
agents-s7-s11#2 | MED | NOT-APPLICABLE | §7 rule 10 note covers a task's `references`. A code comment cites ~/Buildo-scratch (mjs:3), but the repo copy exists (docs/reports/lanes/2026-11-19/BL-LOTCARD/REPORT.md:20). Cosmetic, LOW-class.
p1#1 | MED | CONFIRMED | C1 below.
p10#1 | HIGH | CONFIRMED | D1 below (primary).
p10#2 | HIGH | CONFIRMED | D2 below.
p10#3 | HIGH | CONFIRMED | D2 (same defect class, same file).
p10#4 | HIGH | CONFIRMED | D2.
p10#5 | MED | REFUTED | The flat by-name whitelist is the stated design: screen-checks.mjs:337-339 ("checked by name only: the whitelist is flat"). The "4 field(s)" is generator prose.
p10#6 | MED | NOT-APPLICABLE | fe.31 scope is "a converted non-REPORT surface". SV-DESC walks only manifest `converted` SURFACE entries (screen-checks.mjs:211-216). contract_parcels_lookup is kind CONTRACT and is not in converted-surfaces.json (0 hits).
p11#1 | MED | DUPLICATE of p10#1 | D1.
p11#2 | MED | REFUTED | binding-sources.json is the REPORT schema's set (report-checks.mjs:38). Screen goldens use bindings.json ref_kinds, pinned by `toEqual(['content','contract','derived','part'])` (contract-binding.logic.test.ts:35). A new kind turns that lock red.
p11#3 | MED | REFUTED | `parcels`, `catalogue`, `user_input` and `ad_slot` are not in ref_kinds (bindings.json:91). A golden ref of those kinds fails as "unknown binding kind" (screen-checks.mjs:371).
p12#1 | MED | REFUTED-BY-RULING | `derived` was ruled into ref_kinds: bindings.json $comment dated note 2026-11-10 (MF-35, P35-D14 a, "a declared deviation with a closed list of names"). Test pin: contract-binding.logic.test.ts:33-35.
p12#2 | MED | REFUTED | errors.429 is declared in the descriptor with fields ["retryAfterSeconds"] (the Retry-After header). contractRefProblems checks the path (screen-checks.mjs:350-355). Red cases: contract-binding.logic.test.ts:86,99,101.
p12#3 | MED | NOT-APPLICABLE | fe.24 is the catalogue-row rule (generator GEN-ROW-NO-FIELD etc.; Spec 135 FE-24), not the web search binding. The "[object Object]" fall-through (SearchBinding.tsx:336, 345-346) is only reachable from a golden shape that SV-SBIND already rejects. Recorded as a NIT.
p12#4 | MED | REFUTED | lot-map-help-link.logic.test.ts:91-113 asserts the help row/link on every committed golden and that every golden is classified, so it is red by construction. Red-first is recorded in task-321 plan step 1. The fe.56 planted-defect lock is OWED (Spec 136 line 200).
p13#1 | HIGH | REFUTED-BY-RULING | Spec 135 FE-36 cites the operator "yes" to landing with named exceptions (135:58; test header :4-8, :293-296). The list only shrinks (EXCEPTION_AUDIT_ROWS :334, pinned :365-366). The sign-in/up files are not G3 files.
p13#2 | HIGH | REFUTED | `kind` is checked: exceptions are pinned (:365-366) and flags must read "owed: MF-n" (:368). A phone sheet counts as disclosure under the lock's own definition (header :14-16). Audit #17 is outside the six ruled violations.
p13#3 | MED | UNDETERMINED | NAV-1 only fires on a string-literal setter whose state is a same-file JSX branch (test:21-23). Widening it is a design call. I found no live instance. Question Q1.
p13#4 | MED | UNDETERMINED | DIRS (:39-43) covers (maxbld), parcel-tool, (auth) and report-preview. The omitted mobile screens (flight-board, [lead], map, settings) are Buildo screens. Whether the other src/app/admin/* pages count as "MaxBLD screens" is not decided in the text I read. Question Q2.
p13#5 | MED | NOT-APPLICABLE | The "named CI step" clause is FE-09 rule 5's third clause, openly recorded as PROSE-ONLY (register-locks-resolve.infra.test.ts:8-9). fe.25's own lock is OWED (answer-key-e2e.db.test.ts).
p14#1 | MED | CONFIRMED | C2 below.
p15#1 | MED | REFUTED-BY-RULING | Spec 126:925 "REPORT keeps the landed renderer (§11a; Spec 135 FE-24)". The 306 findings are pinned shrink-only (surface-conformance.logic.test.ts:36-39).
p15#2 | MED | REFUTED | types.ts:42 (3..120) is the server bound of the registered variable. Both directions are locked (conformance test :1031-1033), so a silent drift cannot happen. The variable's value, not its bounds, is what the admin edits.
p3#1 | MED | REFUTED | The golden's `push` is the renderer's action name. The host maps it: semi-question.tsx:84 `push: ... continueToReport`, which does `router.replace(route)` at :72. The behaviour test pins the replace.
p4#1 | MED | DUPLICATE of p10#1 | D1.
p4#2 | MED | REFUTED | Wrong layer. Withholding is locked server-side by src/tests/consumer-parcel-lookup-legacy-hide.logic.test.ts (fe.38 "Enforced by"). The hook test double only needs a payload the client schema accepts.
p4#3 | MED | REFUTED | The card's accessible name is the server address datum (SearchBinding.tsx:167). No English copy is typed in code, and `derived` is a ruled kind.
p4#4 | MED | REFUTED-BY-RULING | Spec 78 O-12 "A user's entry replaces the estimate only for that user", RULED 2026-10-18 (78:722). Spec 78:1032 repeats "O-12 unchanged" (operator "Approve all", Q-4). fe.19 concerns the lot-size entry. See Q3.
p5#1 | MED | DUPLICATE of p10#1 | D1 (SEARCH_CANDIDATE_LIMIT :22, SEARCH_RECENT_MAX :28).
p5#2 | MED | DUPLICATE of p4#4 | O-12 ruling.
p7#1 | MED | REFUTED | The read exists: src/lib/surfaces/maxbld-support.ts:12-30 (migration 314_maxbld_support_inbox.sql), called at (static)/help/page.tsx:21. The page table names the read on each mailto part, and an unset or failed read leaves the parts out (fe.37). Only the $comment "does not exist on the tip" is stale (NIT).
p7#2 | MED | NOT-APPLICABLE | binding_web_report has archetype REPORT (web-product.json:5411-5413). fe.31 is "a converted non-REPORT surface", and REPORT entries sit in the manifest `report` list (screen-checks.mjs:205).
p7#3 | MED | REFUTED-BY-RULING | MORNING-DECISIONS.md:1063 "Ruling 2 (task-325...): Option A adopted: ST.P1 is split at the record write; LOAD.1 carries the compute half (no write, no read-first)". fe.39 is OWED.
p8#1 | HIGH | REFUTED | The phone reads the registered row: useParcelLookup.ts:56 `sliceNumber(searchSlice,'lookup_stale_ms')`, used at :83 and :107. `staleness.stale_time_ms` in the descriptor (:197) is a declaration of the cache effect, not a tunable the runtime reads.
p8#2 | MED | DUPLICATE of p10#1 | The real literal is the server's 60/min (route.ts:59).

## 3. CONFIRMED DEFECTS
D1. Unregistered tunables (p10#1, with p11#1, p4#1, p5#1, p8#2).
- Rule: fe.47 / Spec 128 Rule 3: "every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an on_invalid posture"; "All tunables are data; zero thresholds in src/".
- Where:
  - src/app/api/parcels/lookup/route.ts:57-60: SLOW_QUERY_MS=500, RATE_WINDOW_SEC=60, SEARCH_LIMIT_PER_MIN=60, LOOKUP_LIMIT_PER_MIN=30.
  - src/app/api/parcels/entitlement/route.ts:24-25: window 60, limit 30.
  - mobile/src/constants/parcelSearch.ts:22: SEARCH_CANDIDATE_LIMIT=10, a page size, re-exported at SearchBinding.tsx:39 and used at parcel-tool/index.tsx:73.
  - parcelSearch.ts:28: SEARCH_RECENT_MAX=3 (a list length; weaker case).
  - The server LIMIT 10/11 in src/lib/admin/parcel-lookup.ts is outside the G3 list.
  - contract_parcels_lookup.descriptor.json config.why admits it: "not yet registered: the follow-up card ... moves them to admin settings".
- What happens: nothing wrong for users today. The values are right, and an admin cannot change them without a code deploy. This is a breach of the rule's letter.
- Scope check: the operator's MD:1494 ("yes follow the rules register them", task-395) registered only the six page settings. No backlog card covers these literals (grep of backlog/tasks found none). The fe.47 lock is task-434, status LATER.
- Not included: lot-size RATE_WINDOW_SEC 86_400 (route.ts:36). It is ruled "a day" (D-4) and its count is a registered setting.
- Smallest fix: seed rows plus a migration for these literals, with the routes and phone reading them as task-395 did, and the descriptor config.logic_variables filled in. This is not line-size.
- Owner: no existing card. Nearest are task-395 (RUNNING) and task-378; the lock is task-434. Needs a decision (Q4).

D2. Stale and contradictory declarations in contract_parcels_lookup (p10#2, p10#3, p10#4).
- File: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json. Its census source row is scripts/surfaces/_schema/census/contracts.json:22050.
- Rule: fe.03 "declarations checked against live contracts"; fe.38 "a hit with no evaluated option is not counted".
- What is stale:
  - metering.why still reads "Each new lot ... a parcel_tool holder opens ... writes one usage_events row". The code and the file's own docs text use the ruled report-produced meter (route.ts:113-127; RR-0278; task-376 corrected docs.data_story only).
  - emits says answer "none", ledger_events [], and "no ledger INSERT". x-draft.writes_audit_row is false. metering.ledger_event is "property_view", and openReport INSERTs into usage_events (src/lib/entitlements/index.ts:609).
  - inputs.why says "6 table(s)" but lists 7. inputs.tables omits usage_events, parcel_maxbld_scenarios, bylaw_resolution_lot_stamps and the LOAD.1 tables, while docs.data_story says 9 tables.
  - Line cites are stale: the descriptor says index.ts:494-514, and openReport is now at :590. The route cites :124 and :132-137 have also moved since the STD.ROUTE refactor.
- Impact: no wrong charge or payload. Code, meter and tests are correct. A reader or future generator is told the wrong meter and "no writes".
- Smallest fix: edit the census row and the descriptor together: metering.why/unit to the page-produced rule with not_produced, semi_pending and not_evaluated; emits and writes_audit_row to the property_view write via openReport; inputs.why count; add the missing tables; refresh the cites. Then run the surface generators' --check. Line-size.
- Owner: task-376 (FIX.SPECS), with task-266 and task-383 (all in the file's task list).

C1. Lot-map render smoke renders four error states as non-error (p1#1).
- Rule: fe.33 "each binding renders its archetype's goldens on each platform".
- Where: mobile/__tests__/lotMapPage.behaviour.test.tsx:68-82. The it.each lists error, rate_limited, unauthorized and schema_drift, but every case is built with `error: null, schemaDrift: false`. lotMapScreens.golden.test.ts:33-40 builds them with errorOf(i.error, name) and `schemaDrift: i.error === 'schema_drift'`.
- What happens: those four screens are never rendered through SurfaceRenderer in jest, so a notice or retry regression there would not show. The props goldens still cover them.
- Smallest fix: line 82, `error: null` → `error: errorOf(i.error, k)` and `schemaDrift: false` → `schemaDrift: i.error === 'schema_drift'`, with errorOf copied from the golden test.
- Owner: task-322 / task-354 / task-362 (the file's tasks). Line-size, test only.

C2. Mobile jest never renders the reports_left state (p14#1).
- Rule: fe.33, same words.
- Where: mobile/__tests__/surfaceRenderer.smoke.test.tsx:35 GOLDEN_SITUATIONS omits `reports_left`, though the situation exists in fixtures/parcelSearch.situations.json. parcelSearchScreen.behaviour.test.tsx:20 says that line is "pinned by the search goldens, not here". search-web-binding.ui.test.tsx:148 admits "mobile jest ... UNVERIFIED".
- What happens: the new "N of M reports left until <date>" line is verified on phone only as a props golden plus a structural capture, never rendered.
- Smallest fix: add 'reports_left' to line 35, and add one getByText for the reports-left testID line.
- Owner: task-320 (the state's creator, commit ace05ccee). Line-size, test only.

## 4. LOW / NIT (recorded only)
LOW: agents-s5-1to3#1, #2, #3; agents-s7-s11#3; orchestrator-doc17#1, #2, #3; p1#2; p2#1; p3#2, p3#3; p5#3, p5#4; p6#1, p6#2, p6#3, p6#4; p7#4; p9#1, p9#2, p9#3, p9#4; p11#4; p12#5; p13#6; p14#2, p14#3; p15#3, p15#4.
- p9#3 repeats the D1 rate-limit literal.
- p13#6 repeats the D1 candidate-limit theme in an oracle test.
- p9#1 (descriptor product vs note) is a real small descriptor inconsistency, LOW-class, same file family as D2.
- Mis-rated: none looks HIGH-class on its face.
- NITs found while ruling: the static-page.json $comment "does not exist on the tip" (the inbox now exists); the lot-map-data-check.mjs:3 cite to ~/Buildo-scratch; the web resolveWebValue fall-through.

## 5. Totals (36 CRITICAL/HIGH/MED findings)
- Confirmed: 6 findings, forming 4 defects (D1, D2, C1, C2). The 6 are p1#1, p10#1, p10#2, p10#3, p10#4, p14#1.
- Refuted: 12 (p10#5, p11#2, p11#3, p12#2, p12#4, p13#2, p15#2, p3#1, p4#2, p4#3, p7#1, p8#1).
- Refuted-by-ruling: 5 (p12#1, p13#1, p15#1, p4#4, p7#3).
- Not-applicable: 6 (agents-s7-s11#1, agents-s7-s11#2, p10#6, p12#3, p13#5, p7#2).
- Duplicate: 5 (p11#1, p4#1, p5#1, p8#2 of p10#1; p5#2 of p4#4).
- Duplicate-of-earlier: 0.
- Undetermined: 2 (p13#3, p13#4).

Operator questions:
- Q1. Should the navigation lock (NAV-1) also catch boolean or non-literal state swapping a view (for example `open ? <A/> : <B/>`), or stay on the audited string-literal shape?
- Q2. Are the src/app/admin/* pages other than report-preview "MaxBLD screens" for the navigation lock (Spec 135 FE-36 and FE-51)?
- Q3. Spec 78 O-12 (an entered fact is private to its user) and fe.19 (entered facts are shared) read differently. Do you confirm O-12 still governs the semi-form answer while fe.19 governs only the lot-size entry?
- Q4. Do you want the lookup and entitlement rate limits (60 and 30 per minute), the 500 ms slow-query line, the candidate cap 10 and the recent-searches max 3 registered now, as task-395 did for the six page settings, or left for task-434's tunables lock?

## 6. UNVERIFIED
- No test or generator was run (read-only brief). Every refutation is by reading the code and tests.
- D2: I could not tell whether the descriptor is hand-edited or regenerated from the census row. Both are named in the fix, and a --check run should settle it.
- C2: I did not confirm that the reports_left situation renders in the smoke helper without an extra entitlement mock. Mobile CI (run 44741125636) was not inspected.
- p13#4: the intended scope of "MaxBLD screen" (the NAV-AUDIT-20261111 scratch file) was not opened.
- p7#3: MD:1063 is read as an operator ruling by its "Ruling 2 ... adopted" wording. Its RR number was not looked up.
- p12#1: the operator's own words behind P35-D14 "a" live in scratch plan records I did not open. The bindings.json dated note and the pinned test were read.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/app/api/parcels/lookup/route.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/__tests__/lotMapPage.behaviour.test.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/__tests__/surfaceRenderer.smoke.test.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/constants/parcelSearch.ts
