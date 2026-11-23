---
id: TASK-12
title: >-
  GAP.13 Search follow-ups to the current design: the ruled tagline 'Lot
  Intelligence'...
status: DONE
assignee:
  - '@lane-BL-GAP13'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-23T16:06:00Z'
due_date: '2026-11-26'
labels:
  - S
  - plan:GAP.13
  - evidence:ready
  - unverified
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#S/GAP.13
  - >-
    scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json#L24
    sha256=ab51c893d4f7
  - ~/Buildo-scratch/lanes-20261117/inc-plan/gaps/MBQ.md#L89 sha256=231be0ea41ef
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/avail-search/SEARCH-AVAILABILITY.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-1b/p1/SEATS.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-1b-adj/REPORT.md
  - /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-1b-bp/q.md
  - >-
    /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-1b-bp/p1/SEATS.md
  - /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-1b-bp/q2.md
  - .cursor/MCFRONTEND-QUEUE.md#L133
  - .cursor/MCFRONTEND-QUEUE.md#L394
  - docs/reports/lanes/2026-11-19/BL-GAP13/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-GAP13/TRIAGE.md
  - docs/reports/lanes/2026-11-19/BL-GAP13/r1-plan.txt
  - docs/reports/lanes/2026-11-19/BL-GAP13/r2-output.txt
documentation:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 2001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: GAP.13 Search follow-ups to the current design: the ruled tagline 'Lot Intelligence' (origin still reads 'Lot & Zoning Intelligence'; MF-35 was DONE before the ruling), the Clear (x) button in the search box, and the lot map changes the design adds to MF-53 (heading 'This address covers N lots. Which one do you mean?', building footprint layer, street name on the road, lot card line 'has the house / faces the street' replacing area, frontage and zoning, map tap selects as the card does); amends MF-53 plan.v4:72 by dated note; the map's search pill with x already exists

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 1.5 days

Plan text at the snapshot: PLANNED
landingPush: with the next McFrontend push (operator y per push)
slicePart: (8) search hand-off
who (plan text): McFrontend lane (E); follow-up to MF-35 and MF-53, both DONE
element ids delivered: A.1, A.11, C.1, C.5, C.6, C.7, C.10
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [x] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [x] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [x] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [x] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [x] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [x] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [x] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [x] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [x] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [x] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. (AC1) Pre-register the expected moves, committed alone: the Plan steps section below in the context file plus the task file Files line (commit 1, docs only).
2. (AC2) Failing tests are written first into this plan (the binding table below names each) and reviewed at plan altitude by the repo review, one round, triaged in TRIAGE.md.
3. (AC3) write_scope: ~/Buildo-wt-gap13 and ~/Buildo-scratch/lanes-20261119/inc1b/gap13 (claimed through lanes.mjs).
4. (AC4) PLAN review: scripts/deepseek-review.js review mode on the context file with the plan template; every finding KEEP/REJECT with its opened line.
5. (AC5) KEPT findings folded into this plan before any code.
6. (AC6) Red: one new root test file src/tests/surfaces/search-follow-ups.logic.test.ts (content goldens, golden props, source locks) plus the two existing pins that name the old tagline, staged with the task file and context file; the pre-commit related run refuses (red.out). Green: content values, SearchBinding untouched except nothing, LotMapBinding multi_parcel heading, slice emitter, lotmap golden capture, search golden capture (new script, sibling of lotmap-golden-capture.ts and semi-question-golden-capture.ts, because no writer exists for the mobile search goldens and their fingerprints move with the content file), web goldens through the repo builder; real commit (commit.out); typecheck.
7. (AC7) One output review (lens: design fidelity to v8 and field binding) on the diff, triaged; reports copied into docs/reports/lanes/2026-11-19/BL-GAP13/ and added as task refs.
8. (AC8) Queue rows: no new MF id is claimed (the ID ledger is outside the write scope); the follow-up is recorded as dated notes (M-246) on MF-35 (tagline) and MF-53 (heading; amends plan.v4:72, the Layout guideline line), in .cursor/MCFRONTEND-QUEUE.md in the same commit.
Scope result of grounding: BUILT = A.1, C.1. NO WORK = C.6 (RR-0172 map road labels), C.10 (already built and tested). OPERATOR = A.11 (web parity), C.5 and C.7 (data not served).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): CHANGED (scope note, deps none, KEPT): the 2026-11-17 panel and adjudication settle the parts: GAP.13-a tagline and -b Clear (x) and -c heading build as ruled; -d footprint layer needs a data read (DATA CHECK owed by the build lane); -e street name needs no data read (RR-0172 'Map's road labels'); -f card line replaces ONLY the frontage and zoning line, the size line stays (search-1b-adj/REPORT.md section 4); -g map tap is already built, removed from the work; Q1 'faces the street' withdrawn (MORNING-DECISIONS.md:774 'why does this matter?'). Follow-up rows A (after MF-35, queue :133) and B (after MF-53, queue :394) are claimed by the build lane. Elements A.1 A.11 C.1 C.5 C.6 C.7 C.10. Panel and build pass ran 2026-11-17 (search-1b, search-1b-adj, search-1b-bp p1 and p2); records linked.

2026-11-19 taken on the board at lane launch (lane BL-GAP13, worktree /Users/brettpreston_macmini/Buildo-wt-gap13, branch wf1/inc1b-gap13), RR-0240

Files: src/tests/surfaces/search-follow-ups.logic.test.ts, mobile/__tests__/surfaceRenderer.smoke.test.tsx, src/tests/surfaces/parcel-legacy-oracle.logic.test.ts, scripts/surfaces/parcel_product/F01/surfaces/, scripts/surfaces/search-golden-capture.ts, mobile/src/components/surfaces/LotMapBinding.tsx, mobile/src/generated/surfaces/, mobile/__tests__/fixtures/surfaces/, src/tests/fixtures/surfaces/mobile_parcel_search/, src/tests/fixtures/surfaces/mobile_parcel_disambiguation_map/, .cursor/MCFRONTEND-QUEUE.md

2026-11-19 BL-GAP13 scope after grounding (r1 triaged): BUILD A.1 and C.1 with the MF-35 and MF-53 dated notes; NO WORK C.6 (RR-0172, map road labels; UNVERIFIED on device) and C.10 (built: LotMapBinding.tsx polygon tappable, lotMapPage.behaviour.test.tsx:85); OPERATOR A.11, C.5, C.7 (Grounded and Recommendation below, added at close). Red tests: src/tests/surfaces/search-follow-ups.logic.test.ts.

OPERATOR items (not built; each with Grounded and Recommendation).
A.11 Clear (x) in the search box. Grounded: v8 shows the x only in App frames (small-pages-v8/search.html:291 and :304; web frame :313 has an empty box); the FE-07 parity lock (src/tests/surfaces/search-parity.golden.test.ts:25-47) requires web and mobile goldens to carry the same refs, actions and testIDs; mapping.web.SEARCH is closed (scripts/surfaces/_schema/bindings.json: Stack, Group, Title, Text, TextInput, Button, Alert, Loader), so a web twin needs a component the table lacks; the app side needs no new action (set_input with an empty value exists, SurfaceRenderer.tsx:119-120). Recommendation (UNVERIFIED by repo review, one round not run on it): rule one of (a) add Mantine CloseButton (already in touch_targets.web) to mapping.web.SEARCH and ship both targets, (b) record a mobile-only exception in the parity lock; build follows in one small commit.
C.5 building footprint layer and C.7 card lead line (has the house / faces the street). Grounded: choose-lot.html:306 names the fields (footprint presence from the massing join; primary_frontage_street_name); neither is in the map descriptor field_whitelist (mobile_parcel_disambiguation_map.descriptor.json inputs.field_whitelist, pinned by the new root test) and src/lib/parcels/lot-map.ts:26 CONSUMER_MAP_COLS is locked both ways (consumer-parcel-lookup.infra.test.ts:208); search-1b-adj/REPORT.md GAP.13-d and -f. Recommendation (UNVERIFIED): rule the data read (serve the primary building outline and the street name through the lookup contract, with the DATA CHECK on the rehearsal stack first), then one build task covers C.5, C.7 and the card accessibility label; the 'faces the street' rule question was withdrawn (MORNING-DECISIONS.md:774) so the lead line follows the design words only.

Dated note 2026-11-19 (M-246, prior text kept; RR-0281 · task-12 · Backlog; operator, verbatim: "Task-330 is not required. We dont need a clear search.")

Dated note 2026-11-19 (M-246, prior text kept; RR-0284 · task-12 · Backlog; operator, verbatim: "if it a small change let's do it - we have the data - why not")

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push window 5: 78f552fbb at 16:56Z, station PASS 28367 tests)
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed 3d76daa0e on wf1/inc1b-gap13 (not pushed): A.1 tagline Lot Intelligence and C.1 heading with the existing lot_count, MF-35 and MF-53 dated notes (amends plan.v4:72). Hook result: commit.out 'Tests 15 passed (15)', 'POLICY CHECKS OK (commit-msg): 5 file(s)'. AC evidence: #1 pre-registration commit 9415ac389 (docs only); #2 failing tests in the plan (context file, Folded after r1) reviewed by r1-plan.txt; #3 write scope claimed via lanes.mjs (BL-GAP13: ~/Buildo-wt-gap13 and the lane scratch dir); #4 repo review r1 (deepseek-review.js review mode, TRIAGE.md) plus the 2026-11-17 panel search-1b/p1/SEATS.md; #5 every finding opened and triaged KEEP/REJECT by the tool-bearing lane (TRIAGE.md); #6 red.out (6 failed, commit refused) then green commit.out; #7 reports in docs/reports/lanes/2026-11-19/BL-GAP13/; #8 queue rows MF-35 and MF-53 carry the dated notes (no new MF id claimed; trailer McFrontend-Task: MF-53 required by the McBylaws arm C/P gate). NOT BUILT, OPERATOR: A.11 Clear (web parity), C.5 and C.7 (data not served); NO WORK: C.6, C.10. See REPORT.md.
<!-- SECTION:FINAL_SUMMARY:END -->
