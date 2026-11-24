---
id: TASK-407
title: >-
  V2.LAYOUT The brief states where review files go and the close check reads
  that place
status: RUNNING
assignee:
  - '@lane-BL-V2LAYOUT'
created_date: '2026-11-20T17:12:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix V2
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-V2LAYOUT/REPORT.md
type: build
ordinal: 107012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator, 2026-11-20, verbatim: "That works. Let;s this - the 10th plan today on the same thing.  Let's review the McFix tasks realted to compliance and either substitue. This is the McFixV2 Plan. Hwo will I know it is actually working on a daily basis and no one has swtiched it off.  I still think you need to create the definitive complianc list McFront-end and all the tasks in the Increments.  Add to the board - review all teh currentMCfix tasks and ensure they are still relevant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator APPROVES McFix V2"). McFix V2 step 2. Found 2026-11-20: the close check reads lens outputs only at one folder depth (docs/reports/lanes/<date>/<lane>/plan-*.txt and out-*.txt with their in- files); lanes BL-PAGETABLE and BL-GATES filed theirs in subfolders (lens-plan/, lens-out/, stage2/), BL-FIXSPECS shows none at that depth, so the check sees no review at all; fix-round outputs named fix-*.txt are never read. Nothing told the lanes. Scope: one sentence in the brief text the launch script writes (the exact folder, the plan-/out-/in- names, a fix round filed as out-<lens>-r2 or the form the check can read: decide the smallest), and a planted-defect test that a lane directory with outputs in a subfolder is refused with a message that names the layout. No change to what the check requires. Acceptance: the brief of the next launched lane carries the sentence (open BRIEF.md and paste it); the test. Files: scripts/analysis/backlog-lane.mjs, scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
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
PLAN task-407 V2.LAYOUT (lane BL-V2LAYOUT). Rule: Spec 126 section 0a principle 1 and 11b.2; 08_agents.md section 7 rules 3, 4 and section 11.1; PLAN-PROTOCOL.md:3 simple, no scope creep.
Facts read (scripts/hooks/check-lane-close.mjs): the check takes lane files only at path depth 6 (docs/reports/lanes/<date>/<lane>/<file>, check():lanePaths filter p.length === 6), requires out-compliance-<list>.txt or -pN parts, out-<lens>.txt, at least one plan-*.txt, and reads EVERY plan-*.txt / out-*.txt (isLensOutput, rule-lists.mjs:224) for findings, needing a Ruled line and a verdict per finding. A name outside plan-/out- (fix-*.txt, r1-*.txt) is never read; a subfolder is never read.
Smallest form for a later round: out-<lens>[-<list id>]-r2.txt with in-<same name> beside it. The check ALREADY reads it for findings (no check change needed to read it), it does not replace the round-1 file. No new reading rule.
Steps (tests first through the real hooks):
1. Test commit A (red then green, own commit, no status move): in src/tests/backlog/check-lane-close.logic.test.ts (a) planted defect: lane dir has TASK plus outputs only in a subfolder (lens-out/) -> refused and the message names the layout (directly in the lane dir, no subfolder, plan-/out-/in- names); (b) an out-<lens>-r2.txt with a finding and no verdict is refused by id (proves the brief's round-2 form is read). 
2. scripts/hooks/check-lane-close.mjs (protected path): append one layout clause to the three refusal messages that say a file is missing (no compliance output, no lens output, no plan output) and the TASK message. Text only; what the check requires does not change.
3. scripts/analysis/backlog-lane.mjs lensLine: add one sentence to the lens-set text: exact folder, names plan-/out-/in- with -pN and -r2, no subfolder, fix-*.txt never read, compliance reviews the WHOLE change (split into parts, never trimmed). One test in src/tests/backlog/backlog-lane.logic.test.ts pins the sentence (Files line of the task extended through the CLI for that test file).
4. Proof: --dry-run on a real LATER task pasted; git ls-tree of BL-PAGETABLE and BL-GATES lane dirs, read-only, list what the check reads and does not.
Not done: no change to what the check requires; no move of other lanes' files; no verdicts, no grounder file.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PRIORITY, operator 2026-11-20 verbatim: "I also need certainty within the tasks that a rpiority is getting the right information about compliance to the reviewer.  Put extra stree" (MORNING-DECISIONS.md, entry "Operator APPROVES the McFix V2 launch"). The brief sentence also says: the compliance lens reviews the whole change; a diff over the bound is split, never trimmed.

2026-11-20 taken on the board at lane launch (lane BL-V2LAYOUT, worktree /Users/brettpreston_macmini/Buildo-wt-v2layout, branch wf1/inc1b-v2layout), RR-0240

2026-11-20 lane BL-V2LAYOUT ready: commits 5cc4ae052 (check message, own commit) and 0f3c32a61 (brief sentence); Files line extended with src/tests/backlog/backlog-lane.logic.test.ts; lens outputs and untriaged FINDINGS.md in docs/reports/lanes/2026-11-20/BL-V2LAYOUT; task left RUNNING, grounder owed.

2026-11-20 grounder fold, round 1 (coordinator message): whole-change sentence reworded to the lens-input mechanism, r1-/TRIAGE.md wording replaced, layout text parity-pinned across backlog-lane.mjs and check-lane-close.mjs, lens-plan/ and rN added.

2026-11-20 fold: brief text reworded (whole-change mechanism, plan-/out- output names, GROUNDER.md); task-358 pins at backlog-lane.logic.test.ts updated to the corrected text.

2026-11-20 GROUNDER.md copied into docs/reports/lanes/2026-11-20/BL-V2LAYOUT (sha256 3a6f90348d75...).

Step 4 audit by a separate grounder 2026-11-20 (file ~/Buildo-scratch/lanes-20261119/inc1b/retro/STEP4-LEDGER.md, sha256 d88e7548d70f…): of this task CONFIRMED and CONFLICT findings, 17: 11 fixed, 6 UNADDRESSED: the real BRIEF.md sentence never pasted into the task (plan-agents-s5-1to3#3, plan-eng-s5#5, plan-inc-S#1, plan-queue-137#5); the BL-FIXSPECS census claim not corrected (plan-agents-s7-s11#4); whether the BL-PAGETABLE, BL-GATES, BL-FIXSPECS files move to the read depth was never ruled (plan-review-deepseek#8). Not complete until each has an outcome.
<!-- SECTION:NOTES:END -->
