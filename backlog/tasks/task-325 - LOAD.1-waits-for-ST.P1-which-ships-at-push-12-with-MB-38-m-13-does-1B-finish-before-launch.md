---
id: TASK-325
title: >-
  LOAD.1 waits for ST.P1, which ships at push 12 with MB-38 (m-13): does 1B
  finish before launch?
status: DONE
assignee: []
created_date: '2026-11-19T14:56:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - gap
  - plan:LOAD.1
  - operator
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - ~/Buildo-scratch/lanes-20261117/storage-ondemand/REPORT.md#L8
  - ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L673
priority: medium
type: decision
project: McIncrement
ordinal: 27012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: task-266 LOAD.1 depends on task-123 (1.3 W read module, m-3) and task-265 (ST.P1 the store-on-first-open producer, m-13) because 'the compute is the producer ST.P1' (task-266 title; storage-policy planNote 'dependsOn 1.3,ST.P1 (needs the producer)'; RR-0178 builds W now). task-265 text: 'landingPush: push 12 with MB-38 (L.11)', 'run on dev only after L.5b, ships at push 12', and it depends on task-259 L.6 (MB-38 shadow and switch-over) and task-82 (5.11); task-123 waits 6c.8a (push 6). So the loading screen and the proof of 1·B (task-268) cannot complete until the producer ships at push 12, which is the launch group, although RR-0005 puts search before increment 1. Recommendation (verified by review r1 of task task-326 for the split and its scope; UNVERIFIED for U1 to U3 below; review output docs/reports/lanes/2026-11-19/BL-R11/r1-review.txt, triage TRIAGE.md there). Operator direction RR-0265 (MORNING-DECISIONS.md:1041): "we do want the search page to function now to drive the report which we need to validate in the next increments". Finding: ST.P1 waits on L.6 only for the record table (task-259 "the record table (created empty, no fill)"); the compute does not need the table, and the report path today computes nothing: the lookup route calls readCustomerPageResponse, which returns null for every lot (src/lib/parcels/report-page.ts:23-26; src/app/api/parcels/lookup/route.ts:130), so the app shows the approved miss text. Recommendation (Option A): split ST.P1 at the record write. (1) LOAD.1 (task-266) carries the compute half for the app (mobile) search page: on the pick, the lookup route (parcelId path) runs the one-lot pure core and feeds the page response through that one slot, the page view built by MF-57's core as today; no write, no read first; the loading screen (LOAD.2) covers the wait; no new table or storage shape (the store stays the McStorage policy's, operator scope). (2) ST.P1 (task-265, push 12) keeps the record write and the read-before-compute at the same call site, plus the stamp (ST.P2); the table stays L.6's. (3) Numbers show only inside the existing gate: tester and admin scope (golden 25 and MB-35 cohort, own switch, test-figures banner, MB-94 part f) until MB-38 shadow passes for that group (.cursor/MCBYLAWS-QUEUE.md:785); every other lot shows the approved miss text. Rollback is the switch (slot null). (4) Deferred to ST.P1: the record write, read-before-compute (a re-open recomputes in 1·B), the storage clause of PROOF.S criterion (d) (task-268, moved to the proof where ST.P1 lands), the stale-stamp read guard; policy invariants (purge, tracked refresh, stamp guard, no record for unopened lots) resume when ST.P1 lands. Deferred to 5.11 (task-82): garden-suite split speed (0.1 to 33.6 s as built, MEASURED by the STORAGE-ONDEMAND lane, not re-run here), so that option may exceed the screen; deferred to the cost task: cost lines for a computed unstored area (Spec 88 prices stored areas, ~/Buildo-scratch/lanes-20261117/storage-ondemand/REPORT.md:19) show "Not yet evaluated". (5) Dependency edits, made only after the operator confirms, each changed task keeping its panel and build pass: task-266 --depends-on task-123 (drop task-265); task-265 --depends-on task-82,task-259,task-266; task-268 criterion (d) edited; task-267 unchanged in rule, its wait mechanism (the response, not a record poll) confirmed at its build pass. 1·B then completes after push 6 and 1.3 W (landing push 9), not push 12. Option B (stub: wire the pick to the report, miss text for every lot) is not recommended: RR-0265 says the report is to be validated, and a report that shows the miss text for every lot validates nothing. UNVERIFIED: U1 who owns the rows-to-page-response adapter (a new customer-side module importing nothing from report-preview-live, so lock L1 stands; reusing src/lib/admin/report-preview-live/project.ts logic would need an L1 dated note); fix the owner at the LOAD.1 build-pass panel; U2 that an inline one-lot compute fits the customer route's platform time limit (policy v2 Concurrency row: UNVERIFIED) so the build adds a per-request time budget falling back to the miss text; U3 MB-94 part f (the tester gate and switch) has not landed (.cursor/MCBYLAWS-QUEUE.md:685), so the tester-scope step waits on it. Scope is the app: the web report route stays not found until LS.12 (src/app/(maxbld)/parcel-tool/[parcelId]/page.tsx:18; RR-0170, ONE-35 b).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator answer recorded verbatim through scripts/analysis/backlog-decision.mjs with its cite
- [ ] #2 task-265 and task-266 dependencies and landing push updated to the answer (dated note, prior text kept)
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): created by R10: LOAD.1 waits for ST.P1 at push 12 (OPERATOR, timeframe), Grounded and Recommendation in the description.

2026-11-19 R11 (task-326, RR-0265, RR-0232): operator direction "we do want the search page to function now to drive the report which we need to validate in the next increments" (MORNING-DECISIONS.md:1041); Recommendation line replaced by the review r1 version (split ST.P1 at the record write; U1 to U3 UNVERIFIED); status stays OPERATOR for the operator word; dependencies not yet edited.

Dated note 2026-11-19 (M-246, prior text kept; RR-0271 · task-325 · Backlog; operator, verbatim: "2. y")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decided 2026-11-19 (decision-79, RR-0271; operator, verbatim: "2. y", MORNING-DECISIONS.md:1061): Option A, ST.P1 (task-265) split at the record write; LOAD.1 (task-266) carries the compute half for the app search page; task-266 depends on task-123 only, task-265 on task-82, task-259, task-266.
<!-- SECTION:FINAL_SUMMARY:END -->
