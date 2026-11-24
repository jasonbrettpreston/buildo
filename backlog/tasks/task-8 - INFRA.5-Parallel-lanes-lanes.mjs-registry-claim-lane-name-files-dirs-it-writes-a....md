---
id: TASK-8
title: >-
  INFRA.5 Parallel lanes: lanes.mjs registry (claim lane name -> files/dirs it
  writes; a...
status: DONE
assignee:
  - '@lane-BL-INFRA5'
created_date: '2026-11-19T04:57:00Z'
updated_date: '2026-11-24T18:41:00Z'
due_date: '2026-11-26'
labels:
  - dead
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/INFRA.5
  - docs/specs/00-architecture/08_agents.md#L151 sha256=4811a9aa2efc
  - docs/reports/lanes/2026-11-19/BL-INFRA5/REPORT.md
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1014
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: INFRA.5 Parallel lanes: lanes.mjs registry (claim lane name -> files/dirs it writes; a second claim on the same or an enclosing/enclosed path is refused; release; expiry) + pack cache keyed by terms-file sha, a content fingerprint of the searched sources (measured about 2 s for 2 GB against a build of about 7 min) and the origin tip, used by run-panel.mjs

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS 0.5 day

Plan text at the snapshot: NOT COMPLETE: moves into the repo (small), the hook needs it; home check in the Increment 1·A panel
landingPush: none (scratch tooling; no push)
planNote: buildpass-tools: status BUILT; build pass found high finding GD-1 (lanes.mjs symlink) and TS-1 (missing red tests); fix lane owed (fresh build pass 2026-11-18)
planNote: reuse: status NOT COMPLETE: moves into the repo (small), the hook needs it; home check in the Increment 1·A panel ((operator 2026-11-18, MORNING-DECISIONS.md:744 "Add to the named list.." and :750 "yes to re-use obviosouly, yes drop"; shape decided by the Increment 1·A panel, lanes-20261117/inc1a-review/p1))
who (plan text): LANE-TOOLS lane (scratch tooling only, ~/Buildo-scratch/panel-tools/; no repo change, no DB)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- [x] #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- [ ] #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- [ ] #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- [ ] #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- [x] #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- [ ] #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)
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
1. Review round r1 on these plan steps (review mode on the G1 context file); triage in TRIAGE.md; fold only KEPT defects.
2. Red: write src/tests/backlog/lane-claims.logic.test.ts (claim then overlap refused naming the holder; release; expired claim ignored; check and owner answer; symlinked path resolves to the same claim; same JSON shape lane/paths/expires; registry path by env LANES_FILE). Commit attempt with only test + task-8 file + context file staged; refusal output is red.out.
3. Green: scripts/analysis/lane-claims.mjs, one module with CLI (claim, release, list, check, owner), ported from the scratch lanes.mjs: same JSON shape, same overlap rule, same TTL (12 h default, --ttl-h), mkdir lock + atomic write, realpath of nearest existing ancestor for claimed and checked paths; no dependency, no hook edit, no pack cache. Real commit through the hooks; hook tail is commit.out; npm run typecheck.
4. Output review (one lens: locking, concurrent writers, realpath edge cases) on the diff; triage; fix commit only for KEPT defects.
5. Reports into docs/reports/lanes/2026-11-19/BL-INFRA5/ in a last docs commit with Task: task-8; --add-ref; check the AC that hold with evidence (pack-cache AC not applicable, dropped by pass 2); final summary; status BUILT.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 relevancy pass (R7, RR-0214): KEPT: not replaced by BL.0 (.cursor/active_task.md planNote); moves into the repo, the lane-guard hook needs it (plan text).

2026-11-19 relevancy pass 2 (R9, after R8, RR-0219 and RR-0214; review r1 triaged in docs/reports/lanes/2026-11-19/BL-R9/TRIAGE.md): CHANGED: pack-cache half DROPPED from this task (its only reader was the retired scratch run-panel; INFRA.1 merged, see task-9). Claims-registry half stays: ~/.claude/hooks/lane-guard.mjs:111-128 (B5) reads the claims, and per-lane worktrees from backlog-lane.mjs (R8e 4e8c498a4, backlog-lane.mjs:6) isolate git writes only, not the lane dirs under ~/Buildo-scratch. Build in the repo per MORNING-DECISIONS.md:744 and :751 (lane-guard hook moves into scripts/hooks). Not DROPPED: no operator ruling names it. Scope now: a small repo claims module (claim, overlap refusal incl. symlink paths (finding GD-1), release, expiry) that the lane-guard hook in scripts/hooks reads; tests first.

2026-11-19 taken on the board at lane launch (lane BL-INFRA5, worktree /Users/brettpreston_macmini/Buildo-wt-infra5, branch wf1/inc1a-infra5), RR-0240

2026-11-19 lane BL-INFRA5: module scripts/analysis/lane-claims.mjs landed (commit eb57bad40) and output-review fixes (r2: lexical resolve of not-yet-existing suffix, registry dir created, finite ttl, lock deadline). Registry path env LANES_FILE, default ~/Buildo-scratch/panel-tools/lanes.json. Advisory single-host lock; hook switch is the orchestrator's step after the push.
Dated note 2026-11-19 (M-246, prior text kept; RR-0248 · task-8 · Backlog; operator, verbatim: "y - this is a major improvement")

2026-11-19 DONE: closing commits on origin/wf1/mb-rulings (push windows 3 and 4: 62de20da0, 7b8381cfd; station PASS); evidence per the task's final summary
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
lane-claims.mjs + 15 tests landed through the hooks (eb57bad40, fix 961f69994); red refused 13 failed, green 15 passed; pack-cache dropped by pass 2; reports in docs/reports/lanes/2026-11-19/BL-INFRA5
<!-- SECTION:FINAL_SUMMARY:END -->
