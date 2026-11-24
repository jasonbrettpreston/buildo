---
id: TASK-395
title: >-
  FIX.CONFIG-BOUNDS Every page setting carries bounds and a stated failure
  behaviour (Spec 128 Rule 3)
status: RUNNING
assignee:
  - '@lane-BL-CFGBOUNDS'
created_date: '2026-11-20T15:54:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-378
references:
  - docs/reports/lanes/2026-11-20/BL-CFGBOUNDS/REPORT.md
type: fix
ordinal: 95012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the separate grounder on task-378 (2026-11-20): Spec 128 Rule 3 (docs/specs/02-web-admin/128_surface_standard_policy.md:30) says every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an on_invalid posture. No surface config key meets it today: debounce_ms and min_query_len (the older ones) and the keys task-378 adds have at most a minimum of 0, no maximum and no on_invalid. Operator, 2026-11-20, verbatim, on this item and the massing thresholds: 'you need to resolve these?' (orchestrator reading: resolve both). Scope: for EVERY key in the surface config, bounds and the failure behaviour declared in the existing surface schema and descriptors and refused by the existing validate check when absent; a planted-defect test (a key with no bounds is refused). How the rule's words 'registered logic variable' are met (bounds in the surface schema, or a row in the settings seed) is NOT decided: the lane brings the options with the rule text and the lens findings; the operator rules. Values do not change. Also remove or bind the typed SEARCH_DEBOUNCE_MS = 400 in mobile/src/constants/parcelSearch.ts that sits beside the slice value. After task-378 folds. Files: scripts/surfaces/_schema/surface.schema.json, scripts/surfaces/emit-mobile-surfaces.mjs, scripts/surfaces/surface-validate.mjs, scripts/surfaces/census/mobile-product.json, mobile/src/constants/parcelSearch.ts, src/tests/surfaces/surface-conformance.logic.test.ts, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/census/web-product.json, scripts/surfaces/parcel_product/F01/surfaces/, scripts/surfaces/platform_shared/F14/surfaces/, mobile/src/generated/surfaces/, mobile/src/lib/sliceConfig.ts, mobile/src/lib/semiQuestion.ts, mobile/src/hooks/useParcelLookup.ts, mobile/src/components/surfaces/SearchBinding.tsx, mobile/__tests__/, src/lib/surfaces/generated/, src/tests/fixtures/surfaces/, docs/specs/02-web-admin/128_surface_standard_policy.md, src/tests/fix-tune.logic.test.ts, docs/reports/generated/127-surface-registry.md, scripts/seeds/logic_variables.json, scripts/generate-logic-variable-groups.mjs, scripts/steps/_schema/programme-items.json, src/features/admin-controls/generated/, docs/reference/logic-variables-registry.md, docs/reports/red-evidence/task-395/, docs/reference/maxbld-report-field-inventory.md, docs/reference/maxbld-report-field-inventory.json, src/tests/control-panel.logic.test.ts, src/tests/surfaces/mcfront-proof.infra.test.ts
Files line extended 2026-11-20 by lane BL-CFGBOUNDS: the census path corrected to scripts/surfaces/_schema/census/; added the regenerated and touched files (descriptors, slices, phone readers, tests, Spec 128 note).
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
# PLAN task-395 FIX.CONFIG-BOUNDS (lane BL-CFGBOUNDS)

## Facts the resolution rests on, each opened (grounder resolution: task-395 Implementation Notes; operator words ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476)
- F1 operator words at :1476 read exactly: Operator, verbatim: "Let the grounder resolve them all as long as the result is compliant". TRUE.
- F2 the phone reads only the generated slice: mobile/src/hooks/useParcelLookup.ts:55-58 and mobile/src/lib/semiQuestion.ts:18 read `searchSlice.config` / `slice.config` through sliceNumber; SearchBinding.tsx:36-37 reads SEARCH_SLICE.config directly. TRUE for the six config keys.
- F3 sliceNumber exists: mobile/src/lib/sliceConfig.ts:7, throws when missing or not finite, no bounds. TRUE.
- F4 seed row exists and is pinned: scripts/seeds/logic_variables.json:8182 parcels_sqm_to_sqft default 10.7639 min 10.7639 max 10.7639 type number (pinnedSetting, src/lib/report-projection/pinned-settings.ts:9, accepts it); migrations/262_parcels_unit_constants.sql. TRUE.
- F5 what surface-validate checks on config today: the ONE descriptor validator is the schema-compiled src/lib/surfaces/generated/validate-descriptor.mjs (SV-DESC, screen-checks.mjs:214); config keys debounce_ms, min_query_len, continue_wait_ms, entitlement_stale_ms, lookup_retry_max, lookup_stale_ms are `integer, minimum 0` or UNRESEARCHED; nothing checks a maximum, bounds or a failure behaviour. TRUE (the gap).
- F6 NOT TRUE AS STATED (a gap, not one of the four named facts): "the phone area factor reaches the phone as a generated-slice number". The two typed copies are mobile/src/lib/leadDetailFormat.ts:15 (read by mobile/app/(app)/[lead].tsx:31, the old lead screen) and mobile/src/lib/parcelCostFormat.ts:11 (imported by no screen: only mobile/__tests__/parcelCostFormat.test.ts). Neither screen has a converted surface or a generated slice (mobile/src/generated/surfaces holds mobile_parcel_detail, mobile_parcel_disambiguation_map, mobile_parcel_search, mobile_parcel_semi_question). A slice key needs a surface that owns the screen; making one is a new surface conversion, not an existing mechanism. The area-factor part is therefore NOT built; it returns to the grounder/operator. The bounds part does not depend on it.

## Change (smallest, existing mechanisms: schema, census shards, generator, emitter, sliceNumber)
1. surface.schema.json config: new optional property `bounds` (object; per key: min number, max number, on_invalid fail|clamp, all three required, optional why) and, for each of the six number keys, an if/then: when the key is an integer, `bounds` is required and holds that key. The compiled validator (generated, C-6) refuses a descriptor whose numeric key has no bounds: this is what surface-validate (SV-DESC, ctx.validator) runs.
2. Source rows: census shards (scripts/surfaces/_schema/census/mobile-product.json, web-product.json) for mobile_parcel_search, mobile_parcel_semi_question and the three binding descriptors that hold 0/0 (binding_mobile_list, shared_mobile_surface_binding, binding_web_search); descriptors, d.ts, validator, registry doc regenerated by the committed generators (never hand-edited).
3. Emitter (emit-mobile-surfaces.mjs): the slice gains `bounds` for the keys it copies and REFUSES a value outside its own bounds or a missing bounds entry at generate time (one pure exported function). `config` stays byte-identical; no value changes.
4. Reader (sliceConfig.ts): sliceNumber(slice, key) takes the slice, reads config and bounds; absent bounds throws by key name; out of range: on_invalid fail throws, clamp returns the nearest bound. Callers (useParcelLookup.ts, semiQuestion.ts, SearchBinding.tsx) pass the slice. SearchBinding's direct config reads go through the reader.
5. Remove the dead second copy SEARCH_DEBOUNCE_MS = 400 in mobile/src/constants/parcelSearch.ts and re-point its two tests (parcelSearchMatch.test.ts, parcelScreens.golden.test.ts) to the slice; descriptor evidence cites updated.
6. Spec 128 dated note on Rule 3 (outside the generated markers), M-246 form, quoting :1476 exactly, naming option (b) and the unbuilt area-factor part.
7. Bounds values are LANE PROPOSALS, flagged for the grounder: debounce_ms [0,2000] clamp; min_query_len [3,120] clamp (3 = server floor src/app/api/parcels/lookup/types.ts:42, 120 = its max on the same line); continue_wait_ms [1000,300000] clamp; entitlement_stale_ms [0,3600000] clamp; lookup_retry_max [0,5] clamp; lookup_stale_ms [0,3600000] clamp; binding rows [0,0] fail. Every current value lies inside its bounds (400, 3, 60000, 0, 3, 60000, and 0/0).

## Tests (red first through the real hooks)
- src/tests/surfaces/surface-conformance.logic.test.ts: planted defects (a descriptor with a numeric config key and no bounds refused by the compiled validator; bounds with no on_invalid refused; every integer config property of the schema carries its if/then rule; emitter refuses an out-of-range value and a missing bounds entry; real tree clean, values unchanged).
- mobile/__tests__/sliceConfig.test.ts (new): reader fail, clamp, absent bounds; phone tests cannot run locally: phone-test green UNPROVEN until Mobile CI.
- Goldens: only the fingerprint hash of the search and semi descriptors moves (explained); no state content moves.

## Principles served: standardized, understandable, simple. Rule: Spec 126 section 0a principle 1 and 11b.2; Spec 128 Rule 3 (:30); Spec 136 fe.44; 08_agents.md section 7 rules 3 and 4.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added 2026-11-20 after task-378 folded (second grounder): also in this task: the phone area-factor copies mobile/src/lib/leadDetailFormat.ts:15 and mobile/src/lib/parcelCostFormat.ts:11 (10.7639 typed): the surface config schema accepts integers only (surface.schema.json), so a number-typed key is part of the bounds decision the operator rules; and SEARCH_DEBOUNCE_MS = 400 in mobile/src/constants/parcelSearch.ts is a dead second copy imported only by two phone tests.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder's recommendation of 2026-11-20: option (b): bounds and the failure behaviour declared per key in the surface schema, refused by surface-validate when absent, with a dated note on Spec 128 Rule 3 citing the words above (the phone reads only the generated slice, so a database-registered variable would be a control with no effect); the phone area factor reaches the phone as a generated-slice number resolved at generate time from the pinned seed row parcels_sqm_to_sqft (a number-typed key for pinned factors only). The lane verifies the grounder's facts before building and stops if one is false.

2026-11-20 taken on the board at lane launch (lane BL-CFGBOUNDS, worktree /Users/brettpreston_macmini/Buildo-wt-cfgbounds, branch wf1/inc1b-cfgbounds), RR-0240

Operator 2026-11-20, verbatim: "yes follow the rules register them." (MORNING-DECISIONS.md:1494), answering whether page settings with bounds in the page schema are acceptable or must be registered (Spec 128 Rule 3). The six settings are registered logic variables; the earlier grounder resolution (schema bounds with a dated note) is superseded. The area factor moved to task-411.

From the task-378 retro review (2026-11-20): one defect is NOT closed by this task as built: a page setting carrying the string UNRESEARCHED (schema x-draft-optional) passes the generator's bounds check (it skips non-numbers) and the phone's module-scope sliceNumber reads then throw at bundle load. Add: the schema or emitter refuses UNRESEARCHED for a registered page setting, with a planted-defect test. Goes in this task's next round.

2026-11-23 RR-0435: after the fold, two test pins follow this task (six expected setting keys; the seed file in the proof canary copy list); paths added to the Files line.
<!-- SECTION:NOTES:END -->
