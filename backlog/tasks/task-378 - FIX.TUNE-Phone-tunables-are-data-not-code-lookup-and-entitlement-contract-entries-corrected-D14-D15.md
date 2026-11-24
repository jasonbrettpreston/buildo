---
id: TASK-378
title: >-
  FIX.TUNE Phone tunables are data, not code; lookup and entitlement contract
  entries corrected (D14, D15)
status: RUNNING
assignee:
  - '@lane-BL-FIXTUNE'
created_date: '2026-11-20T14:00:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix A
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-FIXTUNE/REPORT.md
type: build
ordinal: 78012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY-2.md (task-368 second job, on the second handbook pass). Scope now: D14 mobile/src/lib/semiQuestion.ts:16-17 SEMI_CONTINUE_WAIT_MS = 60_000 and mobile/src/hooks/useParcelLookup.ts:137 staleTime: 0 are typed in code against Spec 126:189 P4 ("All tunables are data; zero thresholds in src/") and Spec 128:30 Rule 3 ("every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an on_invalid posture"): declare both in the surface config the way mobile SearchBinding.tsx:36 reads SEARCH_SLICE.config.debounce_ms; values unchanged (60 s, 0 s); the 60 s VALUE is an open operator timeframe and is not decided here. D15 scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json:175 lists "semi" in the response field_whitelist though it is a request parameter (src/app/api/parcels/lookup/types.ts:44-45); contract_parcels_entitlement.descriptor.json:326-331 cites useParcelLookup.ts:96 where the entitlement hook is :134: correct both. Also the retry count in useParcelLookup.ts (failureCount < 3): confirm on the head whether Rule 3 binds it and include or list it. Files: mobile/src/lib/semiQuestion.ts, mobile/src/hooks/useParcelLookup.ts, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, docs/reports/generated/127-surface-registry.md, mobile/__tests__/, mobile/src/generated/surfaces/, mobile/src/lib/sliceConfig.ts, scripts/surfaces/_schema/, scripts/surfaces/emit-mobile-surfaces.mjs, scripts/surfaces/parcel_product/F01/surfaces/, src/app/api/permits/[id]/route.ts, src/components/permits/BuildingMassing.tsx, src/lib/massing/, src/lib/parcels/geometry.ts, src/lib/surfaces/generated/, src/tests/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each defect confirmed on the head before fixing, with file:line
- [ ] #2 Tests red first, then green through the real hooks; no behaviour or value changes
- [ ] #3 Compliance lens once per governing rule list with the list whole and the rulings pasted; a separate grounder verdict on file
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
FIX.TUNE plan. D14: add optional config keys continue_wait_ms (semi surface, 60000) and entitlement_stale_ms (search surface, 0) to the surface schema, the generated type and the mobile emitter CONFIG_KEYS; regenerate slices; semiQuestion.ts and useParcelEntitlement read the slice (values unchanged). D15: drop semi from the lookup contract inputs.field_whitelist; entitlement contract cites the hook line. LEN: src/lib/parcels/geometry.ts and src/lib/massing/geometry.ts read pinned parcels_m_to_ft via pinnedSetting (task-372 pattern). Not done, listed: phone area-factor copies (no mobile read path for the seed; a new generated output needs a ruling), retry count and the two 60_000 stale times in useParcelLookup.ts, Rule 3 bounds/on_invalid for the new keys (debounce_ms precedent has none), DB mirror migration. Tests first: src/tests/fix-tune.logic.test.ts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 added from the task-372 grounder: the length factor is still typed: src/lib/parcels/geometry.ts:6 M_TO_FT = 3.28084 (used at :20 and lot-size-entry.ts:170,174), src/lib/massing/geometry.ts:32; a pinned variable parcels_m_to_ft already exists (seed near :8212). Spec 136 fe.44 covers every area and length. Bring these under the registered variable in this task by the pattern task-372 used for SQM_TO_SQFT; the two phone copies of the area factor (mobile/src/lib/leadDetailFormat.ts:15, parcelCostFormat.ts:11) stay the dated baseline of gate B until fixed here or by its own task. Also owed from task-372: a DB mirror migration for maxbld_report_lot_size_implausible_min_sqm and _max_sqm (admin visibility only; nothing reads the DB rows; number claimed from the ID ledger; operator typed GO for any DB job).

2026-11-20 taken on the board at lane launch (lane BL-FIXTUNE, worktree /Users/brettpreston_macmini/Buildo-wt-fixtune, branch wf1/inc1b-fixtune), RR-0240

2026-11-20 BL-FIXTUNE: D14, D15 and the length factor fixed red-first; findings untriaged in docs/reports/lanes/2026-11-20/BL-FIXTUNE/FINDINGS.md, grounder owed. Left listed: phone area-factor copies, retry count, two staleTime 60_000, Rule 3 bounds for the new keys, DB mirror migration (ID ledger, operator typed GO). Phone-test green unproven until Mobile CI.

2026-11-20 fold round (coordinator grounder A to E): retry and both stale times in the search surface config, one slice reader, massing formatter takes the factor, cites :161; phone area-factor copies stopped (schema refuses a non-integer config value); new lens findings untriaged in FINDINGS.md.

2026-11-20 fold round 2: formatHeight N/A guard, test retitled, min_query_len read through sliceNumber, cite :162; client-reach claim corrected in the report.

Retro review by a separate grounder 2026-11-20 (task-405), code as on the board; GROUNDER.md at ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-FIXTUNE/GROUNDER.md (sha256 dead04318ac8…, 125 findings: 45 CONFIRMED, 80 REJECTED): DEFECTS before a push: (1) Spec 128 Rule 3 not met for the four page settings: owner task-395 (built, registers them). (2) the four module-scope sliceNumber reads throw at bundle load if a key carries the string UNRESEARCHED, which the schema allows and no gate refuses: a bad slice would crash every screen importing the hook; task-395's check skips non-numbers, so it is NOT closed there. (3) continue_wait_ms accepts 0 and the stale times have no maximum: closed by task-395's bounds. (4) red.out and commit.out cited by the report are not in the lane directory; round-1 red unproven. (5) the 11 web search goldens had a hash replaced by sed, no capture run. (6) behaviour change: a permits payload with no feet_per_metre shows N/A for height. (7) the plan stage was never reviewed (1 file with no REVIEW header); four compliance lists are stale and five outputs missing: the lens set is owed again. (8) src/tests/ui.test.tsx:652 retypes the formatter with 3.28084 (a copy test); scripts/lib/units.js:34 and scripts/seed-parcels.js:36 hold typed copies of the factor.
<!-- SECTION:NOTES:END -->
