---
id: TASK-1
title: BL.0 Backlog home of the increment plan (McLane)
status: RUNNING
assignee:
  - '@lane'
created_date: '2026-11-19T04:57:00Z'
due_date: '2026-11-26'
labels:
  - F
  - plan:BL.0
milestone: m-0
dependencies: []
references:
  - docs/reports/plan-import/raw/2026-11-19/sequence.json#F/BL.0
  - .cursor/active_task.md sha256=99303efe87b6
  - >-
    ~/Buildo-scratch/lanes-20261119/boardmove-v2/project-review/REPORT.md
    sha256=ae6d6802ed35
  - >-
    ~/Buildo-scratch/lanes-20261119/boardmove-v2/handbook-process/REPORT.md
    sha256=69881fef8fb5
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L843
    sha256=441ccc6f62a4
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L864
    sha256=e3b0c44298fc
  - >-
    ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L870
    sha256=f95885fcdc74
documentation:
  - backlog/docs/increments/doc-1 - Increment-F-requirements.md
priority: low
type: build
project: McIncrement
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: GUESS: R1-R2 half a day, R3 one lane day, R4-R7 the same day as the push; not timed

Plan text at the snapshot: RUNNING: Backlog-home plan v8 (loader + three gates + Backlog browser), approved by the operator 2026-11-19 (RR-0219); steps R1-R2 in lane BL-R1
slicePart: supporting function
planNote: Plan file (the record of this task): .cursor/active_task.md, Status Implementation v8 (RR-0205, RR-0207, RR-0208, RR-0210, RR-0212, RR-0219).
planNote: Overlaps CHK.0, CHK.7 and INFRA.3 (relevancy pass of milestone F at R7); CHK.1-6, CHK.8, INFRA.1, 4, 5, 6 and QUEUE.PULL are not replaced.
who (plan text): lane
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 R1. Dry run in a temp project (half a day): `backlog init`; config.yml statuses, types, projects, DoD, `zero_padded_ids`; one of each `milestone add`, `doc create` + `doc update --content` with the largest real body (increment 1, 51 KB, read back byte-equal), `decision create`, `task create` with every flag used (`--depends-on` format, `--ref path#Lnn`, `-a @lane-E`, `--due-date`, `--draft`, `--modified-file`), `task edit` (`--plan` on RUNNING, `--append-notes`, `--check-ac`); whether a root `backlog.config.yml` overrides `backlog/config.yml` (the `auto_commit` override path, §4); one browser drag committed through the real hooks and the pre-commit chain's runtime on a `backlog/`-only commit; the pilot's `auto-board.zsh` parser against a queue head carrying `task-N`; record the flags and results in `docs/reports/plan-import/FLAGS.md`; delete the temp project. `process-tables.md` from HP Part C in the C2 form. Red tests 1-11 on the synthetic and census fixtures.
- [ ] #2 R2. Snapshot: D5 landed or its fallback noted; `status-evidence.mjs` (scratch) re-run at the tip; byte copies + SHA256SUMS + BL0.json committed alone through the hooks.
- [ ] #3 R3. Loader + G1 + G2 + G3 + `backlog-next.mjs` + tests green; run the loader once; `backlog doctor`; the import report; commits: (a) scripts + tests, (b) `backlog/` + report with trailer `Task: <BL.0's id>`; wire G3 in `.husky/commit-msg` and the lane-guard check; the OUTPUT panel on the scripts (DeepSeek lens set, grounder round-2, record `docs/reports/panels/BL.0.json`, 08 §7 rules 3-4).
- [ ] #4 R4. Dated notes (Spec 137 McLane, Spec 08, CLAUDE.md block, queue heads, standing-rules line, .gitignore) with the exact text in the commit.
- [ ] #5 R5. Rebase onto the current suite-green programme tip; station suite; your `y` push.
- [ ] #6 R6. `~/Buildo-wt-board` on `wf2/board` at the pushed tip (node_modules linked); `auto_commit: true` committed there; browser plist on 6421; the fetch job's ff step; one drag committed through the hooks; `check_active_branches` noted; BOARD-STATUS.txt line.
- [ ] #7 R7. First use, same day: `wf1/inc1a-checks` (CHK.5, CHK.3) re-cut onto the tip that carries the import (MCINC-4, 08:490) and briefed by G1; its commits carry `Task:`. Relevancy pass of milestone F against this plan through the panel (BL.0 overlaps CHK.0, CHK.7 and INFRA.3; CHK.1-6, CHK.8, INFRA.1, 4, 5, 6 and QUEUE.PULL are not replaced), then milestone by milestone (operator 2026-11-19, :857). The queue-row corrections from the audit (3 expired MF rows at MCFRONTEND-QUEUE.md:61, :203, :348; 10 LANDED-not-DONE flags), the 6 held-unruled items and CO.2 become tasks or comments in that docs commit.
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
