---
id: TASK-389
title: >-
  SRCH.LEGAL The legal line on the phone search page moves to the bottom (C3
  ruled b)
status: RUNNING
assignee:
  - '@lane-BL-LEGAL'
created_date: '2026-11-20T15:16:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix
  - McFix A
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-LEGAL/REPORT.md
type: build
ordinal: 89012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator rulings 2026-11-20, verbatim: "1 a 2 b 3 a 4 a 5 c 6 accept" (C3 b: the legal line on the phone search page goes at the bottom as in the later mock, ~/Buildo-scratch/mcfrontend/small-pages-v8/search.html:267-269; it sits under the search box today) and "Phone retires yes and web search yes" (the web search page legal line also goes at the bottom, the same as the phone, if the web page shows that line: confirm in the plan). Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20. Evidence: docs/reports/lanes/2026-11-20/BL-VERIFYC/VERIFY.md (C3). Smallest change in the existing bindings and their goldens; text unchanged (content key); on the web the shared footer builder already carries a legal line: do not show the line twice, say what the web shows before and after. Timing: orchestrator recommendation item 5 ("Do the legal-line move (389) now as a small code change", MORNING-DECISIONS.md:1421), approved by the operator with "approved [the five items pasted] - remember the app is not beign used - we are in development" (:1422). [Corrected 2026-11-20: an earlier version of this description quoted item 5 as the operator own words; it was the orchestrator text.] Files: mobile/src/components/surfaces/SearchBinding.tsx, src/components/surfaces/web/SearchBinding.tsx, mobile/__tests__/parcelScreens.golden.test.ts, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, src/tests/fixtures/surfaces/mobile_parcel_search/, mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Goldens move only for the line position, each move listed
- [ ] #2 Lens set with the rule lists whole; a separate grounder verdict launched by the orchestrator
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
# PLAN task-389 SRCH.LEGAL (lane BL-LEGAL)
Rule: Spec 126 section 0a principle 1 and 11b.2 (one binding per archetype, refs only); Spec 100 section 4 dated note 2026-11-10 (legal line under the input, now moved by the 2026-11-20 ruling); 08_agents.md section 7 rules 3, 4; PLAN-PROTOCOL.md:3.
Operator words (verbatim): "1 a 2 b 3 a 4 a 5 c 6 accept" (C3 b: legal line at the bottom as in v8 search.html:267-269), "Phone retires yes and web search yes". Timing: orchestrator recommendation item 5 ("Do the legal-line move (389) now as a small code change", MORNING-DECISIONS.md:1421), approved by the operator with "approved [the five items pasted] - remember the app is not beign used - we are in development" (:1422).

Finding: the web search binding already shows the legal sentence once, in the footer, last child (src/components/surfaces/web/SearchBinding.tsx:64,136; MF-91). The line under the input is already gone on the web. So web before = once at the bottom (footer); web after = unchanged. No web change, no web golden moves. (Confirmed: grep "legal" in web binding gives only footer lines 64,68,131,136,143,248.)

Change (phone only):
1. mobile/__tests__/parcelScreens.golden.test.ts: the MF-58 legal-line test now expects the legal node to be the LAST child of the column in every golden and named case (reports-left stays right after the pill; chips, notices, list, tail come before legal). Red first.
2. mobile/src/components/surfaces/SearchBinding.tsx: move `legal()` from after reportsLeft to the end of the column children (after tail); update the doc comment of legal(). className, testID, content key unchanged.
3. Regenerate goldens with scripts/surfaces/search-golden-capture.ts --write, then emit-mobile-surfaces.mjs --write (generated, never hand edited). Only the position of the legal node moves in each of the 11 mobile goldens (and their mobile copy mobile_parcel_search.goldens.json); the web goldens do not move.
4. Spec 100 dated note (M-246, prior text kept) recording the ruling: the 2026-11-10 note's placement "directly under the address input" is replaced by "last block of the page" (owed by BL-MOBILECI finding F-2). Task Implementation notes + AC via backlog CLI.
Not changed: wording, content key, className, testID, any other block order, web. No migration/fallback code (app in development).
Checks: every --check the hooks run for these files before and after (search-golden-capture --check, emit-mobile-surfaces --check, surface-validate); typecheck. Phone tests are not run locally: phone-test green is UNPROVEN until Mobile CI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BL-LEGAL: legal() moved last in mobile searchProps; 10 mobile goldens + mobile copy regenerated (position only); web unchanged (already once in footer, MF-91); Spec 100 dated note added. Red not obtained through hooks (commit b9575315f landed: related run skips mobile/__tests__). Phone-test green UNPROVEN until Mobile CI. Lens outputs, FINDINGS.md untriaged, REPORT.md in docs/reports/lanes/2026-11-20/BL-LEGAL/. Grounder owed.

Retro review by a separate grounder 2026-11-20 (task-405); GROUNDER.md at ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-LEGAL/GROUNDER.md (sha256 4c815811ba5b…, 195 findings: 37 CONFIRMED, 158 REJECTED). The move is correct: the legal line is present once and last in all 11 phone states; goldens differ only by the moved node; web already had it last. DEFECTS before a push: (1) red never proven (commit 669de1246 skipped the related run). (2) Spec 100: the 2026-11-11 note at :150 still says the line is under the address input; the new note quotes 'Phone retires yes', which answers the retries question, not the legal line; no file:line for the operator words (MORNING-DECISIONS.md:1399, :1409). (3) stale prose saying 'under the input': src/components/surfaces/web/SearchBinding.tsx:132, mobile/src/constants/parcelSearch.ts:160, mobile/__tests__/parcelScreens.golden.test.ts:110, src/tests/surfaces/site-footer.logic.test.ts:8 and :76; src/tests/surfaces/search-parity.golden.test.ts:105 asserts only 'after the input': assert legal is the last key. (4) four compliance outputs stale (surface-126, 135, 136, mobile-100) and inc-S never run. (5) the grounder file is not committed. For task-392: notices, list, tail and a bottom legal row are not named as kinds on its card.
<!-- SECTION:NOTES:END -->
