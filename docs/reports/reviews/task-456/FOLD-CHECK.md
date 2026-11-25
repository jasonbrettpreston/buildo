# Fold check: task-456 plan (PLAN-456-v1 as folded, round 1 with FOLD-456.json, then re-bound after task-454), final state

Checked by: Cairn-Ground-P456b (the re-binding grounder; Cairn-Ground-P456 wrote the first fold and its check, RR-0423, MORNING-DECISIONS.md:2171)

Why this file was rewritten: task-456 was ruled and committed (747117461) before task-454 landed. 454 landed at 908b0252e (merge of wf2/sfx6b). Its diff (git diff 1faff1554 908b0252e) changed the lookup and entitlement routes, lookup-flow, SearchBinding.tsx, customer-report-read.logic.test.ts, parcels-entitlement.infra.test.ts and others, so cited lines moved and the launch tool refused four verdict lines. This check covers the round-1 fold (27 pairs, unchanged and kept) and the re-bind (14 pairs, 4 verdict lines).

Basis: ~/Buildo-wt-board, branch wf2/board, head 908b0252e, the uncommitted working copy (the task file and GROUNDER-PLAN.md modified, nothing else). Read-only. Everything ran in memory with node and the board's own planHash (scripts/hooks/check-lane-close.mjs:602), imported and run, plus a replica of the checker's quote test (check-lane-close.mjs:366-378: squashed whitespace, quote on the cited line, distinct quotes, 20 or more characters, 20th character not a space, reason of 30 or more characters unless CONFIRMED).

(1) PASS. The re-bind pairs of FOLD-REBIND.json are all present once in the Implementation Plan: the head sentence (454 landed; Cairn-Ground-P456b), the facts row (entitlement/route.ts:52; lookup/route.ts:65-66, :77-82, :96-97), step 1 (SearchBinding.tsx:238), step 7 (mocks at parcels-entitlement.infra.test.ts:22-26 with the readSearchSettings answer and the not-500 assertion; red edits at entitlement:34 and :52; builder at :36; keys at entitlement :45, lot-size :77, lookup :96-97), step 9 (leak case :378; OLD_SHA case :201), step 3 (RR-0478, MORNING-DECISIONS.md:2502), (C) order (454 has landed; scripted pool at :90-95 and throw case :342-349; TASK-454 is in dependencies; all steps built on 454's tip) and (D) D1 (RR-0475 item 4, MORNING-DECISIONS.md:2481). The orchestrator's fold tool counted 14 pairs, 0 bad; I said 13 in my hand-back, 14 is right. The old texts each occurred once before the fold and the new texts are present.

(2) PASS. Why each moved line is right at 908b0252e, read by me: entitlement/route.ts:34 holds `if (!ctx) return unauthorized();`, :45 the key `parcels-entitlement:${ctx.uid}`, :52 `readParcelToolUsage(pool, ctx.uid)`. lookup/route.ts:66 is the 401, :77 `new URL(request.url).searchParams`, :96-97 the two keys. lot-size/route.ts:77 is unchanged. SearchBinding.tsx:238 holds `...reportsLeft(s),`. parcels-entitlement.infra.test.ts:22-26 are the mocks, :36 the request builder, :42 SEARCH_DEFAULTS, :45-46 isSearchSettings. customer-report-read.logic.test.ts :378 is the leak case, :201 the OLD_SHA case, :90-95 the settings script, :342 the thrown-read case.

(3) PASS. Plan hash: running planHash on the task as it stands gives d8dc5c8a63fe, equal to the last line of GROUNDER-PLAN.md ("Plan: task-456 sha256:d8dc5c8a63fe"). It changed from fdbb4cffcabf because the plan text changed (the 14 pairs).

(4) PASS. Verdict lines: 45 found in GROUNDER-PLAN.md, 0 fail the quote test (every quote on its cited line, distinct, 20 or more characters with a non-space 20th character, reasons long enough). The four re-numbered lines are:
- plan-plan-review-deepseek#7 now src/app/api/parcels/entitlement/route.ts:45 (was :32)
- plan-plan-review-deepseek#8 now src/app/api/parcels/lookup/route.ts:77 (was :76)
- in#3 now src/tests/parcels-entitlement.infra.test.ts:36 (was :32)
- rg#3 now src/tests/customer-report-read.logic.test.ts:378 (was :371)
Id, verdict, quote text and reason are unchanged on all four. The Ruled lines are unchanged because no lens file moved. The 28 lens ids and 17 seat ids are all ruled once.

(5) PASS. TRIAGE-PLAN.md: 27 outcome lines (26 folded, 1 pile), all 27 quotes found in the task text. No TRIAGE line needed a change, because its quotes are plan text and the fold kept the strings it cites ("454 lands first, then 456", "share one file, customer-report-read.logic.test.ts", "would fail on a TypeError, not on the leak", "both planted columns stay, and the").

(6) PASS. Round block unchanged: exactly one line "Plan review round 1: 26 folded, 0 task, 0 ruling, 0 wontfix, 1 pile" and one SECTION:PLAN:END marker; the 17 HIGH and MED outcome lines sit before the marker. No fold pair touched the marker. The Description, the Acceptance Criteria and the Files line (12 entries) were not edited. The front matter lists TASK-452 and TASK-454 under dependencies, outside the plan hash.

(7) PASS. The plan against 454 as landed, step by step (details in the re-bind report). Steps 1 to 6, 8 and 10 hold; step 7 now says the pool mock must answer the readSearchSettings read (a missing row is a 500 since 454) and assert not 500; step 9 cites moved lines only; the sign-up allow-list entry is confirmed by the operator (RR-0478); the container run is approved (RR-0475 item 4). The plan names no typed limit, resolveAddress or candidate cap, so nothing else changes.

(8) Left open, stated. I could not run any test (forbidden here), so the claims that the new security file's mocks work and that no 500 slips through are checked by the lane's red and green runs. The 39 `it(` lines of customer-report-read (a grep count over `^  it(` shows 39 earlier; my later multi-line count matched 0 because of indentation, so I rely on the first count) were not re-counted by a method that proves the same. I did not read the lane close-out.

Verdict: PASS

Plan: task-456 sha256:d8dc5c8a63fe
