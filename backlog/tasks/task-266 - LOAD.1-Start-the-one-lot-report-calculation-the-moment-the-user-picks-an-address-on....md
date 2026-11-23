---
id: TASK-266
title: >-
  LOAD.1 Start the one-lot report calculation the moment the user picks an
  address on...
status: BUILT
assignee:
  - '@lane-BL-LOAD1B'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-23T16:06:00Z'
due_date: '2026-11-26'
labels:
  - S
  - plan:LOAD.1
  - unverified
  - McFixReborn
milestone: m-1
dependencies:
  - TASK-123
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/LOAD.1
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md sha256=0f3d8ba74a49
  - >-
    ~/Buildo-scratch/lanes-20261117/storage-ondemand/REPORT.md#L8
    sha256=b253e641293a
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/storage-policy/REVIEW.md
  - docs/reports/lanes/2026-11-19/BL-LOAD1/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-LOAD1/PLAN.md
  - docs/reports/lanes/2026-11-19/BL-LOAD1/IMPACT.md
  - docs/reports/lanes/2026-11-19/BL-LOAD1B/REPORT.md
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2002
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: LOAD.1 Start the one-lot report calculation the moment the user picks an address on the search page (lookup hit), so the loading screen covers it + ; the compute is the producer ST.P1 (stores the record); a lot with a current record is read, not recomputed

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: PLANNED (panel review owed)
slicePart: public route
planNote: storage-policy: title + ; the compute is the producer ST.P1 (stores the record); a lot with a current record is read, not recomputed (the compute is now a store-on-first-open)
planNote: storage-policy: dependsOn 1.3,ST.P1 (needs the producer)
who (plan text): lane
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [x] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [x] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [x] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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
1. (AC#1) Pre-register the expected moves, committed alone: prereg-MB-44-2.json, round 198 claimed by mkdir in ~/Buildo-scratch/ids (lane BL-LOAD1B).
2. (AC#2) Failing tests C1 to C9 plus the T7 and T10 re-pins are written into docs/reports/lanes/2026-11-19/BL-LOAD1/PLAN.md section 4 (stage 1, one repo review round r1) and into src/tests/customer-report-compute.logic.test.ts, red first.
3. (AC#3) write_scope declared in the stage-2 brief: ~/Buildo-scratch/lanes-20261119/inc1b/load1b and ~/Buildo-wt-load1b.
4. (AC#4) Review: stage 1 ran one generic round (not a panel); stage 2 runs the repo review round on the output (lens templates if present), every finding adjudicated against the files in TRIAGE.md.
5. (AC#5) The lane (tool-bearing) re-reads every cited line of the fold; claims without a pasted output line are marked UNVERIFIED.
6. (AC#6) Measure first (C8 types filter, per-request lookups cost, file-only), red attempt (tests and task file only, red.out), green landing: src/lib/parcels/report-compute.ts behind the existing web-live switch only, the route expression at route.ts:134, exported pageForVerdict, lot-facts read extracted in read-stored.ts, generated files, notes, through the real hooks.
7. (AC#7) OUTPUT review record committed with the work (docs/reports/lanes/2026-11-19/BL-LOAD1B/).
8. (AC#8) No McFrontend build in LOAD.1; queue rows for LOAD.2 and LOAD.4 are theirs. Not built: record write ST.P1, stamp check ST.P2, web path, LOAD.2, LOAD.4, tester surface, session gate, admin condition, new switch, off-thread run, 5.11.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): KEPT (deps task-123 1.3 m-3, task-265 ST.P1 m-13): plan storage-policy dependsOn 1.3,ST.P1; RR-0178 builds W now. Chain: 123 -> 122 (6c.8a) -> 62 (push 6); 265 -> 259 (L.6), 82 (5.11). task-265 lands at push 12 (its landingPush), so 1·B completes only then unless ST.P1 is built earlier: raised as OPERATOR task-325 (timeframe), dependency not changed. Page element: supporting function of G.2 processing screen. Panel and build pass owed.

Dated note 2026-11-19 (M-246, prior text kept; RR-0271 · task-266 · Backlog; operator, verbatim: "2. y")

2026-11-19 R12 (task-327, RR-0271, decision-79; operator, verbatim: "2. y", MORNING-DECISIONS.md:1061; prior text kept): scope of LOAD.1 after the ST.P1 split (task-325 Option A, verified by review r1 of task-326): LOAD.1 carries the compute half for the app search page: on the pick, the lookup route runs the one-lot pure core and feeds the page response; no write, no read first; numbers show only inside the tester and admin gate until MB-38 shadow passes (.cursor/MCBYLAWS-QUEUE.md:785). Dependencies now: task-123 only (task-265 dropped). U1 (who owns the rows-to-page-response adapter), U2 (inline one-lot compute against the route time limit) and U3 (MB-94 part f, the tester gate, has not landed, .cursor/MCBYLAWS-QUEUE.md:685) stay UNVERIFIED, carried from R11 (docs/reports/lanes/2026-11-19/BL-R11/REPORT.md section 3).

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-266 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-341 (the LOAD chain and the two 6c tasks); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.

Dated note 2026-11-19 (M-246, prior text kept; RR-0301 · task-266 · Backlog; operator, verbatim: "task 341 approved")

2026-11-19 (R16, task-347, RR-0300): OPERATOR task-348 (D1) decides who sees real numbers before launch; LOAD.1's compute must sit behind the same gate as W (the web live switch) or the tester gate, or numbers computed here would show at the flip before MB-38. D2 is ruled: a lot with no current stored result is a miss in W and LOAD.1 computes at the pick (MORNING-DECISIONS.md:704-705, :1057, :1061). Status and dependencies unchanged.

2026-11-19 taken on the board at lane launch (lane BL-LOAD1, worktree /Users/brettpreston_macmini/Buildo-wt-load1, branch wf1/inc1b-load1), RR-0240

2026-11-19 taken on the board at lane launch (lane BL-LOAD1, worktree /Users/brettpreston_macmini/Buildo-wt-load1, branch wf1/inc1b-load1), RR-0240

Dated note 2026-11-19 (lane BL-LOAD1, stage 1; prior text kept): the measured plan and impact map are in docs/reports/lanes/2026-11-19/BL-LOAD1/ (PLAN.md, IMPACT.md, REPORT.md, TRIAGE.md, r1-plan.txt). LOAD.1 at its smallest: one added step at src/app/api/parcels/lookup/route.ts:134, 'stored page, else computed page' by the same pure core the step uses (materializeRows), projected by the shared src/lib/report-projection/project.ts; no write, no new key. U1 ANSWERED: W's build shared the adapter (project.ts takes rows in memory); only a row mapping is new. U2: feasible in code (core exported, pure, synchronous; no request-time entry exists, that is LOAD.1's build); STORAGE lane times 0.1 to 33.6 s as built, median 10.9 s, 0.24 s without the garden-suite split (page binds only detached_house and detached_houseplex today); blocks one instance; platform time limit, image load of the core and memory are UNVERIFIED. U3: no tester marker exists, profiles.is_admin does; MB-94 part (f) is not built and no task owns it. task-348 is PARTLY ruled: decision-79 (MORNING-DECISIONS.md:1061; MCBYLAWS-QUEUE.md:786, the cite :785 is one line off) rules WHO sees numbers before MB-38 (testers and admins only); WHEN the gate exists and WHAT marks a session is not ruled; under answer A LOAD.1 is dark code. Correction to BL-W: W's null is four causes (switch off, no parcel, not stored, stale), so the compute checks the switch itself. Decision draft D-1 (narrows task-348): A keep the one switch only; B1 also admit a signed-in admin (recommended, after an image-load proof); B2 part (f) forward. Stage 2 size GUESS about one day, about 7 files. Files: src/app/api/parcels/lookup/route.ts, src/lib/parcels/report-page.ts, src/lib/parcels/report-compute.ts, src/tests/customer-report-compute.logic.test.ts, src/tests/customer-report-read.logic.test.ts, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, docs/reports/generated/127-surface-registry.md, scripts/steps/_schema/src-sql-ledger.json, scripts/steps/_schema/consumer-registry.json, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, .cursor/MCBYLAWS-QUEUE.md, .cursor/MCFRONTEND-QUEUE.md. Stage 1 plan done; stage 2 build waits on the orchestrator.

2026-11-19 taken on the board at lane launch (lane BL-LOAD1B, worktree /Users/brettpreston_macmini/Buildo-wt-load1b, branch wf1/inc1b-load1b), RR-0240

2026-11-19 (task-359, GR-6) correction to the note of 2026-11-19 (R16) above: MORNING-DECISIONS.md:704-705 do not say 'a miss in W'. :704 rules the storage and the stamp (a record with another stamp is never served and is recomputed; no record for lots nobody opened). The word miss for W is in task-123 :58 and :67 and docs/reports/lanes/2026-11-19/BL-W2/REPORT.md:5; the verified direction for LOAD.1 and the null report slot is MORNING-DECISIONS.md:1057 (task-325). Prior text kept.

Dated note 2026-11-19 (M-246, prior text kept; lane BL-LOAD1B, stage 2, step 0 measured file-only, no database): (1) C8 types filter: cutting the building-types seed list to the page option types (detached_house, detached_houseplex) gives 2825 equal rows and 0 differing rows over the golden 25 (content_sha excluded: it hashes the seed list); the filtered compute takes a mean 44 ms per lot against a median 9.7 s (min 0.13 s, p90 13.6 s, max 15.9 s) for the full 325 rows (measure.out). The core has no types parameter, so the entry runs the full compute (no change to scripts/, Standard 10.2); a types option is a later task. (2) Rebuilding the core lookups per request on the golden dictionaries (108 texts, 112 units) costs 0.61 ms; at the real size (2,874 texts, 1,025 units) it is UNMEASURED. (3) fetchParcelById selects id (src/lib/admin/parcel-lookup.ts:55 lists it in the identity group), but the entry reads the lot facts through the shared stored read instead, because the batch parcels read lacks the K2 heritage and ravine columns the page binds. Gate: the existing web live switch only (decision D-1 / task-348 not ruled); the compute is dark code at landing, as W is.

2026-11-19 (lane BL-LOAD1B) integrated with the board: git merge wf2/board (merge ba7953933; only task-266 and task-343 conflicted, both kept); the 15 file-only checks pass on the merged head; the related run re-proved customer-report-compute (25 tests), customer-report-read (36), parcels-lookup-page (22), parcel-lookup-gate (56) and search-routing (13).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
LOAD.1 built behind the existing web live switch only (dark code at landing, as W is; D-1 task-348 not ruled). Commits 7134366c2 (prereg-MB-44-2 alone, round 198) and b5d77c14b (code and tests; hook: 19 test files, 485 tests passed, GATE OK); report commit follows. Tests C1 to C9, T7 and T10 re-pinned, red first (red.out: typecheck refusal). Output review: lenses compliance, code-review, error-paths, security (TRIAGE.md). AC4 (plan lens set) and AC5 (separate grounder) NOT met and left unchecked: stage 1 ran one generic round; this lane grounded the output round itself. Deviations flagged: readLotFacts extraction, src SQL ledger closed set 29 to 30 (needs operator review), T10 two importers, no rebase onto wf2/board (denied). Launch preconditions on task-343.
<!-- SECTION:FINAL_SUMMARY:END -->
