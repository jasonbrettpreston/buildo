---
id: TASK-376
title: >-
  FIX.SPECS Specs and contracts brought up to the 1·B rulings: the entitlement
  contract, Spec 100 meter rule, the semi hold (D3)
status: RUNNING
assignee:
  - '@lane-BL-FIXSPECS'
created_date: '2026-11-20T13:33:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix
  - McFix A
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-FIXSPECS/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-FIXSPECS/FINDINGS.md
type: build
ordinal: 76012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and GROUNDER.md (task-368), on the handbook pass of the pushed 1·B change. Operator 2026-11-20 (verbatim): "essential we have a non compliance build again - the entire reason for this approach". Scope now: D3 a behaviour-changing ruling updates all cited specs in the same commit (engineering standards section 14, :463): scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:7 says six fields, the route sends seven (src/app/api/parcels/entitlement/types.ts:12-18); docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:116 the meter rule does not mention the report-produced meter, the held page for an unsure lot (task-360) or the semi flag (RR-0278): dated notes in the M-246 form from the recorded decisions (decision-81 and the rulings register), prior text kept; regenerate generated files by their scripts. Do NOT write notes for the four conflicts C1 to C4: they wait on the operator. Records only; no product code. Files: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, docs/specs/02-web-admin/126_maxbld_surface_standard.md, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, docs/specs/00-architecture/00_system_map.md, docs/reports/generated/127-surface-registry.md, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/_schema/surface-rule-map.json, src/tests/spec-notes-1b.logic.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Plan (BL-FIXSPECS, stage 1). Confirmed on head: D3-a contract_parcels_entitlement.descriptor.json:7 and :216 say six fields, types.ts:12-18 has seven and inputs.field_whitelist lists seven; D3-b Spec 100 line 116 (1 b meter bullet) and line 138 (settled with no page shows the miss text) predate RR-0278 (decision-81), the held page (task-360, route.ts:~140-150) and the semi flag semi=answered (types.ts:44-45); D3-ext Spec 126 11a.7 note 2026-11-12 says page null for every lot until MB-44; footer MF-91/SRCH.FOOTER (RR-0270, RR-0273) is in no spec; contract_parcels_lookup.descriptor.json:6 says It reads no table today and changes no meter. Fix: (1) one new logic test src/tests/spec-notes-1b.logic.test.ts red first; (2) descriptor six->seven in the descriptor and its hand-kept census mirror (locked equal by search-reports-left.logic.test.ts:137); (3) lookup descriptor false sentence corrected by a dated correction that keeps the quoted prior text, descriptor and mirror; (4) dated notes M-246 in Spec 100 (3.2 end), Spec 126 11a.7 end, Spec 135 FE-31 row (footer). Operator words quoted verbatim with register ids; the semi flag and held page are written as task-360 lane design, not ruled (task-360 text: RR-0278 does not rule the semi flag). Not settled, listed: C1-C5, 48 vs 44 px, 60 s wait, D15 descriptor cite :96 (locked by an existing test), other D-groups. Rules: Spec 00 s14 :463; Spec 126:77 0b item 6; Spec 137 rule 10 (M-246); 08_agents.md s7 rules 3-4.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 grounder second job (docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY-2.md) extends D3: the footer ruling MF-91 / SRCH.FOOTER is in no spec (git grep finds nothing under docs/specs); Spec 126 11a.7 still names one cause of a null page; contract_parcels_lookup.descriptor.json:6 still says 'It reads no table today and changes no meter.' Add to scope: dated notes (M-246 form) in Spec 126 11a.7 and Spec 135, and correct the false descriptor sentence. Rule: Spec 126:77 section 0b item 6.

2026-11-20 taken on the board at lane launch (lane BL-FIXSPECS, worktree /Users/brettpreston_macmini/Buildo-wt-fixspecs, branch wf1/inc1b-fixspecs), RR-0240

2026-11-20 BL-FIXSPECS: defects confirmed on head with file:line (REPORT.md); notes and corrections written; 12 --check scripts before/after in checks-*.out; red.out then commit.out; compliance lens per resolved list (21), findings untriaged in FINDINGS.md; grounder owed; conflicts C1-C5, 48/44 px and the 60 s wait untouched. AC left unchecked: AC3 needs the separate grounder verdict.

2026-11-20 grounder fold fixes (coordinator): dropped the mobile legal-line clause from the Spec 135 footer note (operator ruled C3 b; BL-LEGAL task-389 writes the new position in Spec 100); removed the vacuous or brittle test cases (19 -> 14); deleted the closing sentence of the Spec 100 note; item (1) meter wording made precise.

Retro review by a separate grounder 2026-11-20 (task-405), work as on the board: file ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-FIXSPECS/RETRO-376.md. DEFECTS before a push: (1) Spec 100:127 item (1) ends 'This is the operator's words above' but describes built behaviour (count in the lookup route when page is non-null); where the count sits is ruled at MORNING-DECISIONS.md:1432 (RR-0331): add a dated note, do not edit the old one. (2) contract_parcels_lookup.descriptor.json:6 (and the generated 127 registry, census/contracts.json mirror) says candidates, a miss, a map and a dangling id are logged with the three labels; the route logs meter 'none' for those (route.ts:179-183). (3) Spec 135:53 FE-31 footer note puts orchestrator ruling text under 'operator, verbatim'; his words are only '1. once  -approved' and 'this is a shared component': dated correction. (4) lens files sit in lens/ where the close check does not read; the lane ran inc-1, the table gives inc-S and ms-S; no grounder file: the whole lens set is owed. (5) src/tests/spec-notes-1b.logic.test.ts pins the lane's own prose; nothing ties the notes to route.ts. Quotes, ids, seven entitlement keys checked and correct.
<!-- SECTION:NOTES:END -->
