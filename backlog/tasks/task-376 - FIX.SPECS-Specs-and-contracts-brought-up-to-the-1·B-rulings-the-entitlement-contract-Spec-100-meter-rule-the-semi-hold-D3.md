---
id: TASK-376
title: >-
  FIX.SPECS Specs and contracts brought up to the 1·B rulings: the entitlement
  contract, Spec 100 meter rule, the semi hold (D3)
status: LATER
assignee: []
created_date: '2026-11-20T13:33:00Z'
labels: []
milestone: m-1
dependencies: []
type: build
ordinal: 76012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and GROUNDER.md (task-368), on the handbook pass of the pushed 1·B change. Operator 2026-11-20 (verbatim): "essential we have a non compliance build again - the entire reason for this approach". Scope now: D3 a behaviour-changing ruling updates all cited specs in the same commit (engineering standards section 14, :463): scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:7 says six fields, the route sends seven (src/app/api/parcels/entitlement/types.ts:12-18); docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:116 the meter rule does not mention the report-produced meter, the held page for an unsure lot (task-360) or the semi flag (RR-0278): dated notes in the M-246 form from the recorded decisions (decision-81 and the rulings register), prior text kept; regenerate generated files by their scripts. Do NOT write notes for the four conflicts C1 to C4: they wait on the operator. Records only; no product code. Files: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each defect is confirmed on the head before fixing, with file:line
- [ ] #2 Tests red first, then green through the real hooks
- [ ] #3 Compliance lens run once per governing rule list with the list whole; a separate grounder verdict on file
- [ ] #4 Every note quotes the operator words verbatim with the register id; no conflict C1 to C4 is settled by a note
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
