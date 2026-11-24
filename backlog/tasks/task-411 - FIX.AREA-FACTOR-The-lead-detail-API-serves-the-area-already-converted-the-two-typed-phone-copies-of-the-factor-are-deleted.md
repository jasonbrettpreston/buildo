---
id: TASK-411
title: >-
  FIX.AREA-FACTOR The lead-detail API serves the area already converted; the two
  typed phone copies of the factor are deleted
status: RUNNING
assignee:
  - '@lane-BL-AREAFACTOR'
created_date: '2026-11-20T18:27:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix A
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-AREAFACTOR/REPORT.md
type: build
ordinal: 111012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder of task-395, 2026-11-20 (verify each fact before building): the earlier resolution (the factor reaches the phone as a generated-slice number) is false: neither screen has a slice. Facts: mobile leadDetailFormat.ts:15 types 10.7639 and is used by [lead].tsx via formatSqft on cost.modeled_gfa_sqm from GET /api/leads/detail/:id; parcelCostFormat.ts:11 types it too and is imported only by its own test and the web parity oracle src/tests/admin-report-preview-live.logic.test.ts:129; the pinned setting parcels_sqm_to_sqft is already read at src/lib/parcels/geometry.ts:6 (SQM_TO_SQFT). Build: the lead-detail API serves an optional cost.modeled_gfa_sqft computed from SQM_TO_SQFT; the phone Zod schema takes it and formatSqft only formats; both typed copies deleted; the parity test re-pointed to literal expected strings. No new surface, no slice. Rule: operator ruling MORNING-DECISIONS.md:241 'The conversion factor lives in content/settings, never in code'; Spec 136 fe.44. Also noted by the grounder, not in this task: the permits route serves feet_per_metre (route.ts:267) for client maths, which strains fe.44 the same way. Files: src/app/api/leads/detail/[id]/route.ts, mobile/src/lib/leadDetailFormat.ts, mobile/src/lib/parcelCostFormat.ts, src/tests/admin-report-preview-live.logic.test.ts, src/lib/leads/lead-detail-query.ts, src/app/api/leads/detail/[id]/types.ts, mobile/src/lib/schemas.ts, mobile/app/(app)/[lead].tsx, mobile/__tests__/leadDetailFormat.test.ts, mobile/__tests__/parcelCostFormat.test.ts, mobile/__tests__/useLeadDetail.test.ts, src/tests/leads-detail.infra.test.ts, src/tests/lead-detail-query.coa.infra.test.ts, mobile/__tests__/leadDetailScreen.sqft.behaviour.test.tsx, scripts/surfaces/estate_other/F90/surfaces/mobile_lead_detail.descriptor.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/report-presentation.json, scripts/surfaces/_schema/seed-report-v2.mjs, docs/specs/03-mobile/91_mobile_lead_feed.md, mobile/maestro/lead-detail.yaml, docs/reference/maxbld-report-v2-schema.md, scripts/surfaces/_schema/report-v2.decl.json, scripts/surfaces/_schema/report-v2-seed/schema-v2-proposal.json, src/tests/fixtures/surfaces/report/*.json, src/tests/fixtures/report-page/*.json, scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json, docs/reports/red-evidence/task-411/
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
PLAN task-411 (lane BL-AREAFACTOR). Rule: Spec 136 fe.44 (docs/specs/02-web-admin/136_mcfrontend_handbook.md:163 "the conversion factor is content/settings, never code"); operator ruling MORNING-DECISIONS.md:241 "The conversion factor lives in content/settings, never in code"; Spec 126 section 0a principle 1. Principles served: standardized, understandable, simple.
Facts opened before building: route path GET /api/leads/detail/:id is src/app/api/leads/detail/[id]/route.ts (correct); the cost block is built in src/lib/leads/lead-detail-query.ts toCost (permit) and toCoaCost (CoA), so the Files line was extended through the CLI (lead-detail-query.ts, types.ts, mobile schemas.ts, [lead].tsx, three mobile tests, two server tests); route.ts itself needs no edit. SQM_TO_SQFT is read from the pinned setting at src/lib/parcels/geometry.ts:6. Phone copies: mobile/src/lib/leadDetailFormat.ts:15 (used by [lead].tsx:81) and mobile/src/lib/parcelCostFormat.ts:11 (formatSqft:86 imported only by its test and the web parity test :129; no screen).
Steps (tests first, red through the real hooks):
1. Server tests: toLeadDetail and toCoaLeadDetail serve cost.modeled_gfa_sqft = modeled_gfa_sqm * SQM_TO_SQFT (null when sqm null); the route test sees the field. Phone tests: formatSqft takes sqft and only formats; schema accepts and optional field; no factor constant in either helper; parity test uses literal expected strings (no import of the phone file).
2. Build (as built, amended in the fix round 2026-11-20): lead-detail-query.ts imports SQM_TO_SQFT from @/lib/parcels/geometry and adds modeled_gfa_sqft to both cost maps (null when the area is null); types.ts has the field required on the server type (both producers set it); mobile schemas.ts adds it optional nullable (an older server or cached response omits it); [lead].tsx passes cost.modeled_gfa_sqft; leadDetailFormat.ts formatSqft(sqft) formats only, factor and its export deleted; parcelCostFormat.ts loses the factor and its square-metre formatSqft, and keeps one export renamed formatServedSqft (takes served square feet, name carries its unit) because the presentation registry names it as formats.area.alt_formatter (report-schema RS-4), renamed in the registry seed and JSON together; the contract is described with modeled_gfa_sqft in the mobile_lead_detail descriptor, the mobile-product census and Spec 91; maestro lead-detail.yaml comment corrected; web parity test: literal sq ft strings plus one web-to-phone assertion (formatServedSqft of the pinned-factor product equals the web fmt); one phone ui test for [lead].tsx (field present, null, absent; Mobile CI only).
3. Checks the hooks run for the touched slices before and after; lens set at plan and output; FINDINGS.md untriaged; leave RUNNING, grounder owed. Phone tests cannot run locally: phone-test green is unproven until Mobile CI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-AREAFACTOR, worktree /Users/brettpreston_macmini/Buildo-wt-areafactor, branch wf1/inc1b-areafactor), RR-0240

Operator ruling 2026-11-20 (MORNING-DECISIONS.md entry 'Operator RULES on five open items', item 5; his words: "yes to all"): task-411 is accepted as built: the server sends one converted square-feet figure and the phone only rounds it and appends the unit word; the both-units-and-toggle half of the unit ruling (:241, FE-44) applies to the report only, not to lead detail (Spec 126:1132). The CONFLICT findings on that half are settled by this.

2026-11-20 BL-AREAFACTOR facts opened before building: operator quote MORNING-DECISIONS.md:1476 "Let the grounder resolve them all as long as the result is compliant" and ruling MORNING-DECISIONS.md:241 "The conversion factor lives in content/settings, never in code" both checked on their lines; route path GET /api/leads/detail/:id is src/app/api/leads/detail/[id]/route.ts (matches the Files line) but the cost block is built in src/lib/leads/lead-detail-query.ts (toCost, toCoaCost), so the Files line was extended through the CLI (lead-detail-query.ts, [id]/types.ts, mobile schemas.ts, [lead].tsx, three mobile tests, two server tests); route.ts needs no edit. Facts 1-4 of the description confirmed: leadDetailFormat.ts typed 10.7639 and [lead].tsx called formatSqft(cost.modeled_gfa_sqm); parcelCostFormat.ts typed it and formatSqft was imported only by its test and the web parity test; SQM_TO_SQFT read at src/lib/parcels/geometry.ts:6.
2026-11-20 BL-AREAFACTOR built: API serves optional cost.modeled_gfa_sqft (modeled_gfa_sqm times SQM_TO_SQFT; null when the area is null) for permit and CoA leads; phone schema takes it; formatSqft only formats; both typed factors deleted (parcelCostFormat.formatSqft stays exported, now taking square feet and only formatting, because the first commit attempt was refused by report-schema RS-4: the presentation registry scripts/surfaces/_schema/report-presentation.json:48 names it as formats.area.alt_formatter, a consumer the task facts missed); web parity test uses literal strings. Red proven by a refused commit attempt (2 server tests failed); phone tests cannot run locally, phone-test green is UNVERIFIED until Mobile CI. Lens set run (plan and output); findings untriaged in docs/reports/lanes/2026-11-20/BL-AREAFACTOR/FINDINGS.md. Task left RUNNING: grounder owed.
2026-11-20 BL-AREAFACTOR: commit 5b58e9ea0 (pre-rebase sha) was filed under MF-83 as the home row of the units ruling, by the lane's choice (RR-0332 allows a McFix task to file under the row that built what it fixes), after the gate refused a commit with no McFrontend task (FAIL:C:no-mf-task, FAIL:P:no-record). It lands only the factor half; the units rule lock stays OWED (src/tests/surfaces/report-units.logic.test.ts is not written here). The units rule id was dropped from the commit message after the gate refused FAIL:C:owed:FE-44 (an owed rule may be cited only when its lock lands with red evidence in the same commit). The fix round 3 restamped 105 goldens fingerprint-only after the formats.area registry rename (docs/reports/red-evidence/task-411/restamp-fingerprint-only.txt: other changes 0); Files line extended through the CLI for the regenerated schema files and goldens. Lenses not re-run since round 2 (by instruction).
<!-- SECTION:NOTES:END -->
