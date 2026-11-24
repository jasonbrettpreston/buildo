---
id: TASK-390
title: >-
  PAGE.TABLE Page table extended for interactive pages; pilot: the semi question
  page drawn from table rows
status: RUNNING
assignee:
  - '@lane-BL-PAGETABLE'
created_date: '2026-11-20T15:24:00Z'
updated_date: '2026-11-24T00:48:00Z'
labels:
  - McFix
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-PAGETABLE/REPORT.md
type: build
ordinal: 90012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Built once: the section kinds the pilot needs (bar, notice, choices, button, status, text), a when field (one positive flag name from a closed per-surface list, declared the way DERIVED_NAMES is), a targets field (web, mobile; default both), closed action and icon lists; the validator cases in the form of static-page.logic.test.ts T1 and T2 with planted defects; the rows copied into the generated phone slice by the emit script with its --check; a phone rows-to-props-tree builder feeding the UNCHANGED SurfaceRenderer.tsx. Pilot: mobile_parcel_semi_question (4 states, 8 goldens): SemiQuestionBinding.tsx shrinks to flags and values only. STOP RULE: if the 8 goldens cannot be reproduced byte for byte, stop, build nothing further, report why. Smallest schema: no expressions, no negation, no nesting beyond what the static kinds have. A dated note on Spec 126 section 11b.2 is drafted for task-388, not written here. Operator 2026-11-20 (verbatim): "approved ... 1. Go on the schema extension plus the semi pilot, with the stop rule. 2. Convert the other three pages only after the pilot passes. 3. Leave the reports as components ... - remember the app is not beign used - we are in development" and earlier "I think we should do things right in a standardized, modularized without spaggetti code type way." Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 "Sizing: page structure as data" and "Operator APPROVES the conversion". Target form (Spec 126:59, :74, :921, :928; fe.02): page block order, texts, actions and which block shows under a named flag are DATA rows of the page table scripts/surfaces/_schema/static-page.json (schema static-page.schema.json), drawn by shared section-kind renderers; derivation, geometry, input state and fetch stay code; style class tables stay typed per platform; the report renderers are NOT converted. Acceptance: the page goldens are reproduced byte for byte by the generic builder from the table row (list every golden that moves and why; none should). Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/static-page.schema.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/emit-mobile-surfaces.mjs, scripts/surfaces/screen-checks.mjs, scripts/surfaces/surface-validate.mjs, scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_list.descriptor.json, scripts/surfaces/_schema/census/mobile-product.json, mobile/src/components/surfaces/PageTableBinding.tsx, mobile/src/components/surfaces/SemiQuestionBinding.tsx, mobile/src/generated/surfaces/mobile_parcel_semi_question.json, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/page-table.logic.test.ts, src/tests/surfaces/page-arm.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, docs/reports/policy/policy-ledger.json, docs/reports/lanes/2026-11-20/BL-PAGETABLE/, mobile/__tests__/pageTable.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts

Files: scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/static-page.schema.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/emit-mobile-surfaces.mjs, scripts/surfaces/screen-checks.mjs, scripts/surfaces/surface-validate.mjs, scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_list.descriptor.json, scripts/surfaces/_schema/census/mobile-product.json, mobile/src/components/surfaces/PageTableBinding.tsx, mobile/src/components/surfaces/SemiQuestionBinding.tsx, mobile/src/generated/surfaces/mobile_parcel_semi_question.json, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/page-table.logic.test.ts, src/tests/surfaces/page-arm.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, docs/reports/policy/policy-ledger.json, docs/reports/lanes/2026-11-20/BL-PAGETABLE/, mobile/__tests__/pageTable.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

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
Goal: the phone semi question page (mobile_parcel_semi_question) is drawn from rows of the page table (scripts/surfaces/_schema/static-page.json, schema static-page.schema.json) through the UNCHANGED mobile SurfaceRenderer.tsx; its 8 goldens (src/tests/fixtures/surfaces/mobile_parcel_semi_question/*.mobile.json) stay byte for byte. Nothing a person sees changes. STOP RULE: if a golden cannot be reproduced byte for byte, stop and report which bytes differ.

Rule: Spec 126 section 0a principle 1 and 11b.2 (page structure is data; derivation, geometry, input state and fetch stay code; style class tables stay typed per platform); fe.02; operator 2026-11-20 "approved ... 1. Go on the schema extension plus the semi pilot, with the stop rule ... remember the app is not being used - we are in development" (no migration or fallback code).

Changes (smallest):
1. static-page.schema.json: a new top-level `screens` (surface id -> {prefix, contract, sections[]}). Closed section kinds bar, status, text, notice, choices, button, each with the optional `when` (ONE positive flag name, a lowercase name: no expression, no negation, no list) and optional `targets` (subset of web, mobile; default both). Closed lists for action (back, retry, push, select) and icon (ChevronLeft, AlertTriangle, Info). Every shown text is a content key, never a typed value or number. `pages` and the static kinds are untouched.
2. static-page.json: `screens.mobile_parcel_semi_question` = 8 sections: bar(back), status(loading), 3 notices (rate limit, entitlement, error with parts for plain error / schema drift / retry button), text(question), choices(answers), button(continue).
3. mobile/src/components/surfaces/PageTableBinding.tsx (new, import-free, pure): pageProps(screen, flags, values, styles) builds the props tree the renderer already draws. Throws on a when naming no flag. Registered in bindings.json modules (LIST, binding_mobile_list). Style class tables stay typed in the binding that calls it (PageStyles argument).
4. SemiQuestionBinding.tsx shrinks to: the declared closed flag list SEMI_QUESTION_FLAG_NAMES, the situation -> flags and values derivation, the typed PageStyles table (from the existing lotMap constants), semiQuestionProps = pageProps(slice.page, ...), semiQuestionData unchanged.
5. emit-mobile-surfaces.mjs: copies the screen rows into the generated slice (`page`) for a surface that has a screen; --check covers it.
6. Tests first: static-page.logic.test.ts T1 planted defects for screens + T9 (screen totality, flags in the declared list, content keys exist, slice equals table, binding keeps flags and values only); new page-table.logic.test.ts B1-B5 for the builder. Red through a commit attempt with only tests and the task file staged. Goldens proven by `tsx --tsconfig mobile/tsconfig.json scripts/surfaces/semi-question-golden-capture.ts --check` (the existing capture check); the mobile jest golden test is UNVERIFIED locally (Mobile CI).
Out of scope: SurfaceRenderer.tsx, semiQuestion.ts (lane BL-FIXTUNE), the other three pages, the reports, the web, the Spec 126 dated note (task-388), any migration or compatibility code.
Goldens expected to move: none.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-PAGETABLE, worktree /Users/brettpreston_macmini/Buildo-wt-pagetable, branch wf1/inc1b-pagetable), RR-0240

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder, 2026-11-20 (the lane verifies each cited fact before building): the 8 CONFLICT findings: (a) the builder cases B1 to B6 move to mobile/__tests__ as a jest-node test (Spec 98:76-77; Spec 100:164), row and schema assertions stay in the root suite; red/green then comes from Mobile CI: say so. (b) the field targets is renamed platforms, values web and mobile (Spec 126:238-248), dated note in the schema $comment. (c) flagsOf is declared as a deviations[] row on binding_mobile_list with the closed flag list (Spec 128:55), adjudicator the grounder verdict, dated; no code.

2026-11-20 build by lane BL-PAGETABLE: screens in static-page.json/.schema.json, PageTableBinding.tsx, SemiQuestionBinding.tsx shrunk, emit copies rows into the slice. Evidence: GOLDEN-PROOF.txt (8 goldens ok; old vs new binding 180 situations, 0 differ). Phone jest UNVERIFIED until Mobile CI. Findings untriaged: docs/reports/lanes/2026-11-20/BL-PAGETABLE/FINDINGS.md; grounder owed.

2026-11-20 fix round 2 (grounder): S-page arm fails on an unreadable or empty table (expects one screen per builder caller); out-compliance-surface-126-p2 re-run; review files moved to the lane report root. Grounder re-ruling owed for p2. Evidence: docs/reports/lanes/2026-11-20/BL-PAGETABLE/REPORT.md.

2026-11-20 the 46 lens inputs (in-plan-compliance-*, in-out-compliance-*) copied byte for byte beside their outputs in docs/reports/lanes/2026-11-20/BL-PAGETABLE/ for the close check.

2026-11-20 round 3 red: tests for the arm hardening and the platforms rename; builder cases B1-B6 moved to mobile/__tests__/pageTable.logic.test.ts (red/green from Mobile CI).

2026-11-23 RR-0435: after the fold, the surface-validate test pins carry the fourth arm S-page; path added to the Files line.
<!-- SECTION:NOTES:END -->
