---
id: TASK-399
title: >-
  FOLD.ADOPT A confirmed finding must carry an outcome; counted bulk rulings
  below HIGH
status: BUILT
assignee:
  - '@lane-BL-OUTCOME'
created_date: '2026-11-20T16:34:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix
  - McFix Z
  - McFix V2
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-399/GROUNDER-PANEL2.md
  - docs/reports/reviews/task-399/FILED-LOW.md
  - docs/reports/reviews/task-399/seat-integration-2.md
  - docs/reports/reviews/task-399/seat-reality-check-2.md
  - docs/reports/reviews/task-399/seat-ground-truth-2.md
  - docs/reports/reviews/task-399/FOLD-VALIDATION.md
  - docs/reports/reviews/task-399/CROSS-READ.md
  - docs/reports/lanes/2026-11-20/BL-OUTCOME/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-OUTCOME/FINDINGS.md
type: build
ordinal: 99012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validated before writing by a separate read-only grounder (2026-11-20; verdict relayed to the operator; it ran no tests). Operator, 2026-11-20, verbatim: "Add this as Mcfix Z tasks - and show me that it works - ensure to validate it before you build these tasks" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator ORDERS the McFix Z tasks"). Why: on 2026-11-20 eight lane branches were folded onto the board by a raw fast-forward merge with reviews done as messages and no GROUNDER.md; the close check (scripts/hooks/check-lane-close.mjs) runs only when a task moves to finished, so it never ran. The gap the operator named, verbatim: 'the compliance check would be done ... but not that the outcome would be adopted although the grounder worked'. Today a task can close with every finding CONFIRMED and nothing done. Scope (rewritten 2026-11-20 after the plan panel, the second pass and the correction round; the Implementation Plan field of this task, PLAN-399-v3, sha256 b23cbc4e06c0, GOVERNS where any earlier text of this task differs): every CONFIRMED or CONFLICT finding of the lane's grounder file, seat findings included, carries one outcome the close check verifies (the last line per finding id wins; the forms and their severity limits are the MODE TABLE of the plan), the outcomes of the higher-severity findings are shown on the task page in the Final Summary, and a close without them is refused. The counted form for lower severities named in this task's title is deleted: a low-priority finding goes to the review pile (RR-0338). Where the generated brief tells the lane to write its own plan with the plan flag, or closes without the round block, the plan overrides the brief: the plan is this task's text, reviewed and checked before launch; the lane does not re-plan. Acceptance: the acceptance criteria of this task (plan section 7). What stays unverifiable: that a fix fixes; that a follow-up task is done; that a grounder or a seat did its work. Decisions this task rests on: RR-0333, RR-0334, RR-0335, RR-0336, RR-0337, RR-0338, RR-0339, RR-0340. Files: scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts, .claude/review-templates/README.md, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, scripts/analysis/backlog-brief.mjs, src/tests/backlog/backlog-brief.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 (a) the planted-defect tests, red first then green, through the real commit-msg hook; paste the hook output.
- [x] #2 (b) On the real task-410 lane directory (committed on the board): node scripts/hooks/check-lane-close.mjs --outcomes docs/reports/lanes/2026-11-20/BL-V2WHOLE prints "checked 48 ids" and exits 1. Measured before git facts (rerun with CRIT read as CRITICAL): 9 have no line, 4 are task: on a CRITICAL or HIGH BUG, 1 is a wontfix above LOW, 34 pass the form checks; the git-fact checks may add refusals. Paste that output and the passing control of the planted suite. The exit-0 half is NOT this task's acceptance: it needs real fix commits in task-410's code (outside this task's Files) or operator rulings, so it is a card for the orchestrator's records of task-410.
- [x] #3 (c) On task-381's real GROUNDER.md, committed by the orchestrator to docs/reports/reviews/task-399/hooks3-GROUNDER.md (the scratch path is not repo; the branch holds no copy): 36 CONFIRMED, 0 CONFLICT; run against a lane directory holding it with no TRIAGE.md: "checked 36 ids", 36 refusal lines, exit 1.
- [x] #4 (d) The one command of 4.2 run on task-399 itself at its close; backlog task view task-399 --plain shows the round line and the finding lines; run twice, the Final Summary holds ONE round line (the replace-then-append order is only from backlog task edit --help until this run).
- [x] #5 (e) Do not mark BUILT until (a) to (d) are pasted on the task (:1517).
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
PLAN-399-v3 (build plan, self-contained: a lane executes it with no other file). Task: FOLD.ADOPT, a CONFIRMED finding must carry an outcome, and the outcome is visible on the task. v3 = v2 corrected by the second pass (FOLD-VALIDATION.md fv#1-18 and CROSS-READ.md xr#1-29, all ruled in GROUNDER-PLANS.md under SECOND PASS). Basis: board branch wf2/board head c15fab7ec (task-410 folded). Rules are cited by number first; file:line are at c15fab7ec and are hints.
Serves: supporting function of the compliance review every Increment 1.B task passes through; advances none of doc-2 elements A to G. Estimate: GUESS one lane day, not timed.

0. THE OPERATOR'S WORDS THIS PLAN RESTS ON (verbatim, MORNING-DECISIONS.md line in front; everything else here is the orchestrator's design and is marked so)
:1517 "don't makr the task complete until it actually works"
:1522 "you are probaley rebuilding stuff that already exists you do this all the time. 1-5 y"
:1546 "agreed - The grounder's recommendation: amend Rule 3 for lane build and fix tasks to the two-commit close."
:1557 "approved" (to the list of items 0 to 8 put to him; the "Yes, after 375" wording inside that list is the auditor's, not his)
:1572 his message pastes back two sentences that originate in the orchestrator's list (not his own wording): "Item 10: a grounder checks the folded plan before any build starts, so I cannot launch a build on an unchecked plan." and "Task 399: no close without an outcome for every confirmed finding, so I cannot let findings drop."; his own words there: "Can we add these to the three tasks remaining taks for the four steps.  run the full panel on them? We need to get this right?"
:1580 "the findings that are deemed low priorities are filed in a review pile for later" ... "We add these items to the existing tasks. And get them done!" ... "We test them to reasonable levels and move on"
:1585 "yes hardening rounds.  Today's were warranted, but not endless"
:1590 "can we address these in the plan? Let's get this right - add the the existing tasks and do a second pass on the recommendations"
The six steps, as the orchestrator listed them back to him (:1575 entry; his words :1576 "So we have six steps now correct? List them below"; the orchestrator READS his "Yes" at :1580 as yes to them, :1579 reading 4: a reading, not his words): 1 reviewer gets the right documents and the task, sized; 2 plan reviewed before code, findings cited, stored, posted to the task; 3 a separate grounder rules each finding, attached to the task; 4 confirmed findings folded and the folded plan checked by a grounder before build; 5 code built, reviewed, ruled; 6 every confirmed finding fixed or explained before close, visible on the task. This task is step 6 (and the outcome half of step 4, which task-375 uses).

1. WHAT AND WHY
It adds no rule. It makes the close refuse where the rules already speak: Spec 08 section 7 rule 3 (08_agents.md:346 "fold survivors, file rejections with reasons"), rule 6 (:350 BUG goes to WF3 before Green Light, DEFER goes to review_followups.md with reasons), section 5.3 (:225, rejections carry reasons). The check runs on every commit that moves a task to a finished status, whoever makes it (check-lane-close.mjs:338 region; the board job's commit included), so it binds the orchestrator on hooked commits. Not on a fold by merge (check() returns 0 on MERGE_HEAD; tasks 401 and 402 own that). A refusal in the board job's commit leaves every pending backlog edit in the tree (board-commit.zsh), so the orchestrator moves no task to a finished status through a board edit; a finished status is set only by a lane's closing commit.

2. HOW THIS TASK ITSELF IS LAUNCHED (the plan gate does not exist yet; these are the hand steps, by the orchestrator, in this order; commands run from ~/Buildo-wt-board)
This task launches BEFORE task-375's gate, so its plan check is this panel: the plan is this text, reviewed by the DeepSeek lens set plus the Integration, Reality-Check and Ground-truth seats, ruled by a separate grounder (GROUNDER-PLANS.md), folded, validated by FOLD-VALIDATION.md and CROSS-READ.md (Spec 08 11.2). It is written by the orchestrator, stored in docs/reports/reviews/task-399/ and committed there by hand (the board job commits only backlog/, so it never commits this folder; the launch refuses a board dirty outside backlog/).
 1. Append, never replace, ONE dated note (M-246, prior text kept): backlog task edit task-399 --append-notes "<note>". The note says: this plan (PLAN-399-v3) GOVERNS the approved FINAL BUILD NOTE (NOTE-399.md, approved at :1557) where they differ, on his :1572 and :1580 orders and the second pass; and lists each approved sentence it replaces: Files line unchanged -> five files plus backlog-brief.mjs and its test; Bulk form -> deleted; wontfix 60 characters -> 30 (the existing literal, check-lane-close.mjs:296); "refused ... with two lines" -> the last line wins; CONFLICT task: or ruling: -> ruling or fixed; ending "; not reviewed (exempt): <k> paths" -> deleted; acceptance "35 CONFIRMED" -> 36. Never --notes (it replaces and destroys the approved text).
 2. Rewrite the Description scope lines and the Files line in the same step so no line says bulk or 60: backlog task edit task-399 --description "<description>". The Description also states: where the generated brief says to run --plan or closes without the round block, this plan overrides it (the lane reads the OLD brief; :166 and :171 are changed by this task itself).
 3. backlog task edit task-399 --plan "<this text>" (the plan IS the task text; it replaces the plan field; measured: 30 KB accepted whole).
 4. backlog task edit task-399 --ac "<acceptance (a)>" --ac "<(b)>" --ac "<(c)>" --ac "<(d)>" (the task has none: they number 1 to 4).
 5. Record each verbatim ruling of section 0 as a backlog decision (backlog-decision.mjs), then add each RR number to the task text with --append-notes (the reviewer's Decisions section holds only decisions the body names). Open the cards of section 9 (this task records and opens; task-375 does not repeat them).
 6. Copy the panel records into docs/reports/reviews/task-399/: GROUNDER-PLANS.md as GROUNDER-PANEL2.md, FILED-LOW.md, seat-integration-2.md, seat-reality-check-2.md, seat-ground-truth-2.md, FOLD-VALIDATION.md, CROSS-READ.md and the plan-*.txt outputs. They keep the panel names and are not re-keyed (there is no gate yet).
 7. Re-run the plan compliance lens for agents-s5-1to3 and queue-137 on the v3 text (their files changed in the task-410 fold after the panel ran; the fold validator measured those two as the stale ones, 7 of 9 pass), with rule-lists.mjs lens-input and the review tool; the grounder rules the new findings in GROUNDER-PANEL2.md. The grounder's round-3 rulings (GROUNDER-R2.md) are appended to the GROUNDER-PANEL2.md copy and their sentence corrections applied word for word, then read back against the plan by the same grounder (Spec 08 11.2); this is the last panel round (his :1585): a CONFIRMED finding after it is folded by its own sentence or filed in FILED-LOW.md and opens no further panel.
 8. Post the review on the task, one --add-ref per repo path: backlog task edit task-399 --add-ref docs/reports/reviews/task-399/GROUNDER-PANEL2.md --add-ref docs/reports/reviews/task-399/FILED-LOW.md and the same for seat-integration-2.md, seat-reality-check-2.md, seat-ground-truth-2.md, FOLD-VALIDATION.md, CROSS-READ.md (measured: a 600-character path and 47 references are accepted; a comma splits one argument into two). Then append the plan round block under the plan field: backlog task edit task-399 --append-plan "Plan review round 1: <a> folded, <b> task, <c> ruling, <d> wontfix, <e> pile; grounder docs/reports/reviews/task-399/GROUNDER-PANEL2.md" followed by one line "<id> <SEV> folded <first 20 characters of the quote>" per CONFIRMED HIGH or MED finding of the 399 plan outputs (computed from the ruled file; about 6 KB for both tasks).
 9. Commit the folder by hand on wf2/board through the normal hooks: git add docs/reports/reviews/task-399, then git commit with a docs(08_agents): message (no Task trailer: docs commits are exempt).
 10. Launch: node scripts/analysis/backlog-lane.mjs --task task-399 --lane <new name> --dry-run, then without --dry-run.
Order: AFTER task-410 is folded (done at c15fab7ec), BEFORE task-375. What the OLD brief will tell the lane that v3 overrides: Take order 2 "backlog task edit --plan ..." (do not run it: the plan is the task text, checked), and the Close line "--final-summary ... -s DONE|BUILT" (use the command of 4.2); the lane changes those two lines itself (section 3).

WHO DOES WHAT AFTER THE GROUNDER RULES (written on the recommended answers: AWAITS OPERATOR, P4; if he says no, the fallback is the launch script's undo and a relaunch with fresh evidence, never a second call on the lane)
 a. The lane builds, runs its lens set, writes its seat files if any, leaves the task RUNNING "grounder owed" (4.7), and its one call ends.
 b. The orchestrator launches the separate grounder (and the tool-having seats) on the lane directory; they write GROUNDER.md and the seat files there.
 c. TRIAGE.md lines, task: cards and decision records are short mechanical steps written by the orchestrator (Spec 08 rule 9 note, 08_agents.md:354, his "E2a"). A confirmed finding that needs code goes back to the OWNING lane by a further Agent call on its worktree (the same note: "a multi-step build goes to the owning lane": settled by it and his "E2a"). The orchestrator moves no finished status by a board edit.
 d. A fix round: the owning lane commits the fix (trailer and task file in the diff), re-runs the affected lens outputs under a new name out-<lens>-rN.txt (their ids are new), the grounder re-rules; the last line per id then carries the new outcome. max_fix_rounds in the brief (2) is the bound for hardening rounds (his :1585 "not endless"); counted by hand, not checked.
 e. Closing: node scripts/hooks/check-lane-close.mjs --outcomes <lane dir> until it prints no refusal; add the GROUNDER.md reference to the task as soon as the grounder has ruled; then the one command of 4.2 in the records-only closing commit, made from the lane worktree.
 f. A plan change after launch: only by release and relaunch (the launch script's undo, fresh evidence) or by the lane as a dated deviation note; the orchestrator does not edit the Description, Acceptance or Plan of a RUNNING task.

3. FILES LINE (set through the backlog CLI before launch; it must be on the launch commit)
scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts, .claude/review-templates/README.md, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, scripts/analysis/backlog-brief.mjs and src/tests/backlog/backlog-brief.logic.test.ts (only the Take-order line :166, the Close line :171 and the test pin :58; task-375 changes the rest of the brief). No new script. v2 measured 9 rule lists for the first five files (node scripts/analysis/rule-lists.mjs resolve --type build --letter S; 7 without --type and --letter), none unmatched; the lane re-measures with the two added files (UNVERIFIED).

4. SCOPE (the check is in check-lane-close.mjs, one exported function outcomeErrors, pushing into errors and never returning early; 4.4 and 4.5 edit README.md, 08_agents.md and 137_mcqueue.md; section 3 adds the brief lines; tests in check-lane-close.logic.test.ts)
4.1 The outcome file. TRIAGE.md in the lane directory (docs/reports/lanes/<date>/<lane>/, beside GROUNDER.md). One outcome line per CONFIRMED or CONFLICT id of GROUNDER.md. The id is exactly what the grounder writes: <file stem>#<n>, where the stem is the lens output file name (for example out-compliance-queue-137-p2#3) or a seat id (section 4.4). ONLY THE LAST LINE FOR AN ID IS JUDGED; earlier lines are ignored (the real task-410 TRIAGE.md is cumulative: 278 lines for 118 ids). A last line that starts with a known id and fits no form is an error (a typo is not presence). A line for an id not in the current GROUNDER.md is ignored.
Forms (the rest of the line after the form word is the argument; quotes optional; paths may hold spaces, every task file name does):
MODE TABLE (one place; PLAN-375-v3 repeats it word for word)
  mode close (lane close, 399): forms fixed, task, ruling, wontfix, pile. CRITICAL, HIGH, MED close by fixed or ruling (task only when the finding's lens line begins DEFER). LOW and NIT close by ANY form whatever the kind (his :1580 overrides rule 6, 08_agents.md:350, for LOW and NIT; said in the dated note). Seat files are read from the lane directory. TRIAGE.md is required only when GROUNDER.md holds at least one CONFIRMED or CONFLICT id. The round line counts fixed.
  mode plan (launch gate, 375): forms folded, task, ruling, wontfix, pile; fixed is refused (the fix is made before a lane branch exists). folded:"<20+ characters present in the task text now>" takes the place of fixed for CRITICAL, HIGH, MED; the DEFER rule for task is the same; LOW and NIT any form. Seat files are read from docs/reports/reviews/<id>/. TRIAGE-PLAN.md is required only when GROUNDER-PLAN.md holds at least one CONFIRMED or CONFLICT id. The round line counts folded.
  A CONFLICT id takes ruling (or fixed in close, folded in plan) only; a CONFLICT waiting for the operator keeps the task RUNNING (close) or unlaunched (plan).
  <id> fixed:<sha> <path>   sha (7+ hex, resolved with git rev-parse) is an ancestor of HEAD, is in L..HEAD (L = the launch commit check-lane-close.mjs already computes), touches <path>, and no commit of the range has a body "This reverts commit <the full sha>". A sha that a rebase or amend rewrote is no longer an ancestor of HEAD and is refused; the orchestrator re-records the fixed: lines with the new shas after the last rebase.
  <id> task:task-N          the task file exists, its status is not DROPPED, and its text contains the id as a whole token (not x#1 inside x#12) or the cited path. Allowed only when the finding's lens line begins DEFER (rule 6: a BUG is fixed before Green Light).
  <id> ruling:RR-NNNN       or ruling:decision-N: the decision file exists (file name "decision-N - ...", or RR-NNNN in its title). The operator's answer must be recorded as a decision first (his answers cited in the four audited tasks live only as MORNING-DECISIONS.md lines; they are recorded before use).
  <id> wontfix:"<reason>"   explained, not fixed. Effective severity LOW or NIT only (the approved note's limit; v3 changes its reason minimum from 60 to 30 and says so in the dated note).
  <id> pile:"<reason>"      filed in the review pile for later: his words :1580, applied to effective severity LOW or NIT only. READING (orchestrator's): the pile is docs/reports/review_followups.md (rule 6 names it, with reasons); no lane can write it today (resolve --files docs/reports/review_followups.md is refused: no table row), so until the card of section 9 lands, pile lines in the lane's TRIAGE.md ARE the pile and the orchestrator copies them on the next review_followups.md touch.
  Reasons are measured after whitespace is squashed, at least 30 characters (the existing literal at check-lane-close.mjs:296; no new literal). There is no bulk form.
Effective severity = the grounder's severity (the first of CRITICAL, HIGH, MED, LOW, NIT as a whole word in the first 40 characters of the verdict's reason; the lens writes CRIT, read as CRITICAL), else the lens line's, else, if neither parses, CRITICAL (strictest). The mode table above says what closes what.
Each git fact (ancestor, touches, reverts, decision file, task file) arrives as a callback in closeErrors' input, as diffOf and readBase do, so closeErrors stays pure of git. A callback that throws or returns nothing becomes one error line tied to its id (never a throw out of the hook). The refusal prints one line per failing id: id, effective severity, the rule it cites, file:line of the verdict, and the form that would pass. The signature is outcomeErrors({ verdicts, triageText, lensKinds, facts, mode, seats }); the whole table above is built and tested here (including mode plan), so task-375 inherits it. The grounder block of closeErrors hands over its verdict map and findings (extraction detail: task-375 D5).
4.2 Visible on the task (step 6). At the close the task's Final Summary holds, in ONE command with the status move:
  backlog task edit task-N --check-ac <n> ... --final-summary "<what landed>" --append-final-summary "<block>" -s BUILT
(--final-summary replaces, --append-final-summary appends: backlog task edit --help). N = 1 + the number of "Review round" lines in the HEAD copy of the task's Final Summary (1 when none); a fix round re-runs the one command (replace then append), so one round line carries the latest counts. The block is: "Review round N: <a> fixed, <b> task, <c> ruling, <d> wontfix, <e> pile; grounder <repo path>; triage <repo path>" then one line per CONFIRMED or CONFLICT finding of effective severity CRITICAL, HIGH or MED: "<id> <SEV> <form word> <ref>" (ref = sha7, task-N, RR-NNNN or decision-N). The check recomputes the counts and the lines from GROUNDER.md and TRIAGE.md and refuses unless the task text contains the round line and each finding line; the refusal prints the exact block. LOW and NIT are counted, not listed (they are in the referenced TRIAGE.md). Fit, measured: task-410 has 19 such lines, 1,297 characters (CRIT read as CRITICAL); the four audited tasks have 125 HIGH or MED lens lines in total (about 9 KB over four tasks). Measured limits (fold validator, clone of the board): backlog accepts a 30,722-character Final Summary or Notes and task view --plain shows it whole; --final-summary then --append-final-summary in one edit replaces then appends and a rerun leaves one block; --check-ac of an index that does not exist makes the whole edit "No changes were applied" (the status move is lost with it).
4.3 Tool-having seats (Integration, Reality-Check, Ground-truth) enter the same file. A seat writes ONE report per task, in the tree the mode table names (the lane directory in close mode), one finding per line matching /^\s*(#+\s+)?([a-z0-9]+)#(\d+)\s+(CRITICAL|HIGH|MED|LOW|NIT)\b/ (for example "### rc2#1 HIGH: ..."; the fold validator showed the three real panel files parse 12, 18 and 20 findings with it). A Seat file with no such line is refused. GROUNDER.md names it "Seat: <name> <repo path> sha256:<12 hex>" (the first 12 hex of the file's sha256, written by the grounder). The check refuses when a Seat line's file is missing, its sha256 differs, or any finding id in it has no verdict line in GROUNDER.md or no outcome in TRIAGE.md (seat findings count as BUG kind). WHAT IT CANNOT PROVE: that the seat ran, or ran well; only that a named file with that hash exists and every finding in it was ruled and closed. No seat is REQUIRED at the lane close (Spec 08 6.4's output roster names Integration in every row, but he ordered the tool-having seats for these additions only: P3).
4.4 README.md:109 (The standard, step 2) is corrected from "KEEP or REJECT ... in TRIAGE.md" to "CONFIRMED, REJECTED or CONFLICT in GROUNDER.md; the lane's TRIAGE.md holds the outcome lines (forms: fixed, task, ruling, wontfix, pile)".
4.5 Two dated notes (M-246, prior text kept, quoting only the verbatim words of section 0): under rule 6 in 08_agents.md (the outcome forms; pile until the row exists; LOW and NIT taking any form on his :1580 words; the outcome check is part of the same omission guard as task-410's, 08_agents.md:239 note, and forgery routes are tasks 401 and 402) and in 137_mcqueue.md section 4 after the :138 note (TRIAGE.md and the new refusals). They land in the SAME commit as the check (eng-all section 14: a behaviour-changing rule updates every cited doc in one commit).
4.6 CLI entry (so a lane can run it before the close and acceptance has a command): node scripts/hooks/check-lane-close.mjs --outcomes <lane dir> prints "checked N ids" first, then one line per refusal, exit 1 on any refusal, else 0. It reads GROUNDER.md, TRIAGE.md and the Seat files of that directory and the git facts of the current repo.
4.7 Interim state (the ruling's "grounder owed" step, 08_agents.md:229): until the grounder has ruled and TRIAGE.md is complete, the lane leaves the task RUNNING and does not stage a finished status; it adds the GROUNDER.md reference to the task as soon as the grounder has ruled.

5. WHO IS AND IS NOT AFFECTED (explicit rules, not accidents)
- Applies to every commit that moves a task to a finished status (BUILT, DONE, MERGED) and whose task is a lane build or fix task. There is NO exemption key.
- The four audited tasks (396, 407, 406, 387; RUNNING; 153 CONFIRMED or CONFLICT findings between them, of which the audit counted 52 unaddressed): each closes only with its own TRIAGE.md. The orchestrator writes it as part of closing each one (fixed: with the real fix commit, task: for DEFER with an existing card, ruling: after recording his answer, pile/wontfix for LOW and NIT). The 52 unaddressed findings are fixed or filed first; exempting them would let findings drop (:1572). Not a one-time bypass.
- Running lanes (35 RUNNING at c15fab7ec, 29 with a lane assignee): launched before this folds; .husky/commit-msg runs the lane's OWN copy of the script, so a lane meets the new refusals only if its branch has merged the board; the orchestrator merges the board into each of 396, 407, 406, 387 before it closes them (others when they close). Their launch is not re-run.
- Tasks at BUILT (31 with a lane assignee, c15fab7ec): untouched. A move BUILT to DONE is already refused TODAY by task-410's check (check-lane-close.mjs:338 skips only the SAME status) and would be refused for all 31 after this (no TRIAGE.md); this task changes nothing there; P2 decides, and nothing is moved to DONE by a board edit meanwhile.

6. TESTS (red first through the real hook, DoD #2 of the task; each lock proven in both directions, 08_agents.md section 11.3; each spawned-CLI test first asserts exit status, no signal and the "checked N ids" line before any absence assertion, R-CP 124a:296)
Existing tests that go red and are fixed in the same commit: every scenario() test of src/tests/backlog/check-lane-close.logic.test.ts that expects exit 0 (27 of 86 tests expect 0, including the control) because the default scenario has a CONFIRMED finding and no TRIAGE.md; scenario() gains one helper that writes a valid TRIAGE.md.
Planted defects, each with a passing control (plus: the mode table for close and plan; seats read from the tree of the mode; a seat report whose lines are "### rc2#1 HIGH:"; N of the round line; a staged TRIAGE.md read from the index; a clean lane with no TRIAGE.md passes): no line for an id; two lines (the last is judged: an earlier wrong line does not matter, a wrong last line is refused); a malformed line (foo#1 fixed:abc, no path); a stale id line ignored; fake sha; sha not touching the path; sha outside L..HEAD; sha reverted by a later "This reverts commit <full sha>"; DROPPED or unknown task; task text without the id or path; x#1 against a task naming only x#12; unknown ruling id; wontfix or pile on a MED, HIGH or CRITICAL; task: on a BUG; wontfix reason under 30 characters after squashing; grounder severity LOW lowering a lens HIGH (passes with wontfix) and no parsable severity (treated CRITICAL); a CONFLICT closed by task:; a callback that throws (one error line, no throw); a lane with zero CONFIRMED ids and no TRIAGE.md (passes, prints "checked 0 ids"); Final Summary missing the round line, a finding line, or with wrong counts; a Seat line whose file is missing or whose sha differs; a seat finding id with no verdict; a seat finding id with no outcome. Fixtures use the existing helpers (text lines; no typed domain factory applies).

7. ACCEPTANCE (commands on real inputs, output pasted on the task)
(a) the planted-defect tests, red first then green, through the real commit-msg hook; paste the hook output.
(b) On the real task-410 lane directory (committed on the board): node scripts/hooks/check-lane-close.mjs --outcomes docs/reports/lanes/2026-11-20/BL-V2WHOLE prints "checked 48 ids" and exits 1. Measured before git facts (rerun with CRIT read as CRITICAL): 9 have no line, 4 are task: on a CRITICAL or HIGH BUG, 1 is a wontfix above LOW, 34 pass the form checks; the git-fact checks may add refusals. Paste that output and the passing control of the planted suite. The exit-0 half is NOT this task's acceptance: it needs real fix commits in task-410's code (outside this task's Files) or operator rulings, so it is a card for the orchestrator's records of task-410.
(c) On task-381's real GROUNDER.md, committed by the orchestrator to docs/reports/reviews/task-399/hooks3-GROUNDER.md (the scratch path is not repo; the branch holds no copy): 36 CONFIRMED, 0 CONFLICT; run against a lane directory holding it with no TRIAGE.md: "checked 36 ids", 36 refusal lines, exit 1.
(d) The one command of 4.2 run on task-399 itself at its close; backlog task view task-399 --plain shows the round line and the finding lines; run twice, the Final Summary holds ONE round line (the replace-then-append order is only from backlog task edit --help until this run).
(e) Do not mark BUILT until (a) to (d) are pasted on the task (:1517).

8. OPERATOR ITEMS: P1 to P5 are listed once, at the end of this file; P2 (BUILT to DONE) and P4 (WHO DOES WHAT) bind this plan.

9. LANDING AND CARDS
One commit holds the check, its tests, README.md:109 and the two dated notes (protected path: no task status move in it). A second, records-only commit closes the task (Rule 3 two-commit form, :1546; the closing commit stages only the lane directory, the review records, task files and decisions). Landing order with task-375: this task first; task-375 reuses outcomeErrors and adds mode 'plan'. Each code commit carries the trailer "Task: task-399" and the task file in the same diff (notes append, no status move; check-backlog-task.mjs, Spec 137 Rule 3, 137_mcqueue.md:98).
Cards to open (hand step 5; none built here): the review_followups.md table row (:1557 item 1, after 375; Spec 137 rule 2); the golden before-image exemption (:1557 item 2: a table row on its own card); re-run only the chunks that changed (:1557 item 7, after 375); H6 (BL-V2WHOLE GROUNDER.md:261: a code file changed outside the union Files line is in no chunk after a fold); the registration of existing gate literals as tooling_ variables (Spec 132 core.8, 132:154; this task adds none: the 30-character minimum is the existing literal at check-lane-close.mjs:296).

NOT IN SCOPE: judging that a fix fixes (a manual edit undoing a fix without a revert commit is not detected; a sha is accepted when it touches any path the lane names; the fold validator found every last-line fixed: line of the real task-410 file touches its cited path); a bulk form; the finished-to-finished skip; hunk splitting, a priority ranking of rules, replacing Specs 126 and 135 by the handbook (:1557 items 3 to 5: No); any new script, field or key.

WHAT THIS CAN AND CANNOT PROVE: every CONFIRMED finding of the lane's GROUNDER.md, including seat findings listed in it, has one outcome that is well formed and whose git facts hold; the outcomes are on the task page. It cannot prove that a fix is right, that the grounder ruled well or ran, that a seat ran, or that a finding nobody wrote down was ruled.
THE MECHANISM IS THE ORCHESTRATOR'S DESIGN on his :1572 and :1580 orders (his words name only "no close without an outcome for every confirmed finding" and "filed in a review pile"); the forms, the Seat line, the CLI mode and the severity grammar are additions of the orchestrator (DoD #8, 124a R-IZ).
RULES CITED (c15fab7ec): 08_agents.md rule 1 :344, rule 3 :346, rule 4 :347, rule 6 :350, section 5.3 :225 (note :229), 6.4 :312, 11.1 :469, 11.2 :473, 11.3 :477; 137_mcqueue.md Rule 3 :98 (notes :100, :136, :138); Spec 132 core.8 132:154; 124a R-CP :296; check-lane-close.mjs :50 VERDICT, :133 lensContexts, :296, :338.

OPERATOR ITEMS (yes or no each; the same five in PLAN-375-v3; each is built on the recommended answer, so a no names what is reverted)
P1 Are outputs reviewed before task-375 folds simply re-run, with no compatibility path? Recommend yes. Ground: his :1557 item 8 ("Hold other lanes' reviews until 375 folds"); 11 of 77 lane directories hold placeholder-hash outputs; RR-0328's words (decision-113, :1422) "remember the app is not beign used - we are in development" were said about page conversion. If no: revert 375 A4's placeholder refusal and open a card for a launch-time cutoff.
P2 May a task already BUILT move to DONE (any finished-to-finished move) without the proof running again? Recommend yes. Ground: check-lane-close.mjs:338 reruns it today; 31 BUILT lane tasks could not close. If no: they stay BUILT until each lane directory is regenerated; no DONE is set by a board edit.
P3 Is the Integration seat required on every build or fix plan (task-375's launch gate)? Recommend yes. Ground: Spec 08 6.4 (08_agents.md:312) names Integration in every plan roster row; his :1580 ordered the seats for these additions only. If no: one constant in 375 D2 is emptied; seat files that are listed are still checked.
P4 May the orchestrator send a further Agent call to the owning lane's worktree for a fix round, write TRIAGE.md, record decisions and make the closing commit from the lane worktree? Recommend yes. Ground: Spec 08 rule 9 note (08_agents.md:354, "the orchestrator does short mechanical steps itself; ... a multi-step build goes to the owning lane", his "E2a"), which settles the fix round to the owning lane; no recorded word of his covers the closing commit by the orchestrator. If no: each fix round and the close is a release and relaunch through the launch script with fresh plan evidence.
P5 Accept hand steps before each build launch (panel, evidence commit, references, round block, one launch command), with a card to script them? Recommend yes for now. Ground: the panel is agent work and the commit is one command; his words :954 "let me understand you now need to manually change the board or add a task - every single time - that's seems like alot of work and inefficient - wasnt the point of this to avoid just that". If no: task-375's gate cannot ship as D1 describes (it needs the evidence on the board).
Dropped as settled: the fix round going to the owning lane (rule 9 note :354, his "E2a").

Plan review round 1: 75 folded, 0 task, 0 ruling, 0 wontfix, 45 pile; grounder docs/reports/reviews/task-399/GROUNDER-PANEL2.md
plan-compliance-399-agents-s5-1to3#2 MED folded There is no bulk for
plan-compliance-399-agents-s7-s11#2 MED folded (c) On task-381's re
plan-compliance-399-agents-s7-s11#4 MED folded Each code commit car
plan-compliance-399-agents-s7-s11#6 MED folded READING (orchestrato
plan-compliance-399-airtight-124a#1 MED folded each spawned-CLI tes
plan-compliance-399-eng-all#3 MED folded One commit holds the
plan-compliance-399-ms-S#1 MED folded OPERATOR ITEMS: P1 t
plan-compliance-399-queue-137#3 MED folded Each code commit car
plan-compliance-399-step-132#2 MED folded Record each verbatim
plan-compliance-399-step-132#3 MED folded There is NO exemptio
plan-compliance-399-step-132#4 MED folded each spawned-CLI tes
plan-error-paths-399#2 MED folded a lane with zero CON
plan-error-paths-399#4 MED folded There is no bulk for
plan-error-paths-399#5 MED folded A sha that a rebase
plan-error-paths-399#6 MED folded A callback that thro
plan-error-paths-399#7 MED folded Effective severity =
plan-plan-review-deepseek-399#2 MED folded scripts/analysis/bac
plan-plan-review-deepseek-399#3 MED folded A sha that a rebase
plan-plan-review-deepseek-399#4 MED folded A last line that sta
plan-plan-review-deepseek-399#11 MED folded Effective severity =
plan-plan-review-deepseek-399#12 MED folded There is no bulk for
plan-plan-review-deepseek-399#13 MED folded There is no bulk for
plan-plan-review-deepseek-399#14 MED folded its text contains th
plan-plan-review-deepseek-399#15 MED folded The signature is out
plan-plan-review-deepseek-399#16 MED folded (d) The one command
plan-plan-review-deepseek-399#17 MED folded (c) On task-381's re
plan-plan-review-deepseek-399#22 MED folded a malformed line (fo
int2#3 HIGH folded mode plan (launch ga
int2#5 HIGH folded Running lanes (35 RU
int2#10 MED folded Commit the folder by
int2#11 MED folded Existing tests that
int2#12 MED folded sha (7+ hex, resolve
int2#18 MED folded Post the review on t
rc2#1 HIGH folded ONLY THE LAST LINE F
rc2#2 HIGH folded The four audited tas
rc2#3 MED folded Effective severity =
rc2#4 MED folded There is no bulk for
rc2#5 MED folded quotes optional; pat
rc2#6 MED folded A CONFLICT id takes
rc2#8 MED folded folded:"<20+ charact
gt2#4 MED folded file:line are at c15
gt2#5 MED folded Interim state (the r
gt2#6 MED folded after the :138 note
gt2#7 MED folded There is NO exemptio
gt2#8 MED folded Effective severity L
gt2#9 MED folded (b) On the real task
gt2#10 MED folded red first through th
gt2#11 MED folded the whole table abov
gt2#13 MED folded Cards to open (hand
gt2#19 MED folded filed in the review
fv#3 MED folded Post the review on t
fv#4 MED folded one finding per line
fv#5 MED folded A sha that a rebase
fv#8 MED folded 4. SCOPE (the check
fv#9 MED folded Re-run the plan comp
xr#1 HIGH folded this plan (PLAN-399-
xr#2 HIGH folded MODE TABLE (one plac
xr#3 HIGH folded The exit-0 half is N
xr#4 MED folded where the generated
xr#5 MED folded LOW and NIT close by
xr#9 MED folded A refusal in the boa
xr#10 MED folded runs the lane's OWN
xr#11 MED folded OPERATOR ITEMS (yes
xr#12 MED folded (not his own wording
xr#13 MED folded append the plan roun
xr#15 MED folded Record each verbatim
xr#16 MED folded N = 1 + the number o
xr#17 MED folded WHO DOES WHAT AFTER
xr#18 MED folded Post the review on t
xr#20 MED folded Seat files are read
xr#21 MED folded A plan change after
xr#22 MED folded this task records an
plan-compliance-399-agents-s7-s11-r2#1 MED folded The grounder's round
plan-compliance-399-agents-s7-s11-r2#2 MED folded READING (orchestrato
plan-compliance-399-agents-s7-s11-r2#3 MED folded LOW and NIT close by
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added 2026-11-20 from the operator words (MORNING-DECISIONS.md, entry "Operator AGREES: compliance documents attached to every task"): "citing not only the decision but the compliance rules ... compliance rules broken is listed in the response the fold fails". So: a CONFIRMED verdict from a compliance output names the rule it breaks (the rule-list id from the output file name plus the rule id or heading the finding cites), and check-fold prints, on refusal, the list of broken rules with their dispositions missing: one line per rule, rule list id, rule, file:line.

Grounder recommendation 2026-11-20 (STEP4-LEDGER.md PART C), to build AFTER task-410 folds and BEFORE task-375 (same function): this task already designs the per-finding disposition; three changes: (1) CONFLICT verdicts need an outcome too (only task: or ruling:, never wontfix:); (2) a task: outcome needs the named task's text to contain the finding id or the cited path; (3) the outcome lines live in the lane's TRIAGE.md (an existing form), one per id: '<id> fixed:<sha> <path>' (sha an ancestor of HEAD and not of the base, touching the path), '<id> task:task-N', '<id> ruling:RR-NNNN', '<id> wontfix:"<60+ chars>"' (LOW and NIT only). The close is refused naming every CONFIRMED or CONFLICT id without exactly one line. Measured need: 52 of 153 such findings on tasks 396, 407, 406, 387 had no change and no written reason.

Operator 2026-11-20, verbatim: "approved" (MORNING-DECISIONS.md entry "Operator APPROVES items 0 to 8"; item 0: "Append the two final notes to tasks 399 and 375"). FINAL BUILD NOTE from the four-step audit (FOUR-STEP-AUDIT.md, round 2 folded; file NOTE-399.md), appended verbatim; where it differs from earlier text of this task, this note governs:
BUILD-READY 2026-11-20 (audit ~/Buildo-scratch/lanes-20261119/inc1b/retro/FOUR-STEP-AUDIT.md, round 2 folded). This task ENFORCES rules that already exist; it adds no rule: Spec 08 section 7 rule 3 (08_agents.md:338 "fold survivors, file rejections with reasons"), rule 6 (:340 "BUG -> WF3 before Green Light; DEFER -> review_followups.md with reasons"), section 5.3 (:227 "Rejected findings are written to the plan with reasons"), section 10.3 (:452 "triage"). Operator, verbatim, MORNING-DECISIONS.md:1517: "don't makr the task complete until it actually works". Order: launch AFTER task-410 is folded onto wf2/board (the launch script cuts only from the board HEAD, backlog-lane.mjs:123; a branch cut from the 410 branch puts 410's files outside this task's Files line and the close refuses), BEFORE task-375.
Files line (unchanged): scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts. No other file, no new script. ("check-fold" in the earlier note means this check.)
SCOPE, all in check-lane-close.mjs (new block placed after the GROUNDER verdict block, pushing into `errors`, never returning early; the earlier returns at :144-:158 of the 410 head 065f85a02 are "gate cannot run" states, they refuse and never pass; the V2L15 change is NOT part of this task):
1. TRIAGE.md in the lane dir (the layout the check already reads). One line per CONFIRMED or CONFLICT id of GROUNDER.md, the id exactly as the grounder writes it (<file stem>#<n>, unique inside a lane dir because file names are):
   <id> fixed:<sha> <path>  (sha is an ancestor of HEAD, not of the range base, touches <path>, and no commit in the range carries "This reverts commit <sha>": git log --grep)
   <id> task:task-N  (the file exists, is not DROPPED, and its text contains the id or the cited path; a DEFER-class finding goes to a card: the review_followups.md home of rule 6 cannot be written by a lane today because docs/reports/review_followups.md matches no row of rule-lists.json: measured, `rule-lists.mjs resolve --files docs/reports/review_followups.md` is refused)
   <id> ruling:RR-NNNN  (the decision file exists)
   <id> wontfix:"<60+ characters>"  (a rejection with reasons, rule 3 and 5.3; LOW and NIT only)
   A CONFLICT id takes only task: or ruling:. The close is refused naming every id with no line or with two lines. On refusal print one line per missing id: rule list id (from the output file name), the rule the finding cites, file:line.
2. Bulk form for MED, LOW and NIT (CRITICAL and HIGH keep full lines): Bulk: <output file> <severity> count:<n> REJECTED "<60+ characters>"  or  Bulk: <output file> <severity> count:<n> DEFERRED task:task-N "<60+ characters>" (the card exists and is not DROPPED). n is recomputed from the file, so it cannot undercount.
3. At close the task's FINAL SUMMARY (backlog task edit --append-final-summary; not the notes, which the reviewer reads as rulings) holds: Review round N: <a> fixed, <b> task, <c> ruling, <d> wontfix, <e> bulk; grounder <path>; triage <path>. The counts must equal the counts recomputed from TRIAGE.md and GROUNDER.md; refused otherwise. The same line ends "; not reviewed (exempt): <k> paths", k recomputed by the check as the changed paths of the range that the table exempt globs leave out of the review material, so an exempt file is never silently unreviewed (Spec 08 section 11.1).
NOT IN SCOPE: judging that a fix fixes (a manual edit that undoes a fix without a revert commit is not detected: stated limit); the early-return change of V2L15; compliance references and the reviewer context (task-375); re-using unchanged chunks; any new tool or file form (TRIAGE.md is the lane file Spec 08 :347 already names).
ACCEPTANCE on real inputs, tests red first through the real hooks: (a) planted-defect tests with passing controls for: a missing line; a duplicate line; a fake sha; a sha not touching the path; a sha reverted by a later "This reverts commit" commit; a DROPPED or unknown task id; a task text without the id or path; an unknown ruling id; wontfix on a CONFLICT or a HIGH; a bulk count that does not match; a bulk DEFERRED without a task; a final summary whose counts differ. (b) Run the new block on task-381's real GROUNDER.md (branch wf1/inc1b-hooks3, ~/Buildo-scratch/lanes-20261119/inc1b/hooks3/GROUNDER.md): one error per CONFIRMED or CONFLICT line (35 CONFIRMED lines on that file; count the CONFLICT lines with grep) before a TRIAGE.md exists, and none after a real one. Own commit, before any close (the self-edit rule). Do not mark BUILT until the output of (b) is pasted on this task.

Dated note 2026-11-20 (M-246, prior text kept; RR-0333 · task-399 · Backlog; operator, verbatim: "don't makr the task complete until it actually works")

Dated note 2026-11-20 (M-246, prior text kept; RR-0334 · task-399 · Backlog; operator, verbatim: "you are probaley rebuilding stuff that already exists you do this all the time. 1-5 y")

Dated note 2026-11-20 (M-246, prior text kept; RR-0335 · task-399 · Backlog; operator, verbatim: "agreed - The grounder's recommendation: amend Rule 3 for lane build and fix tasks to the two-commit close.")

Dated note 2026-11-20 (M-246, prior text kept; RR-0336 · task-399 · Backlog; operator, verbatim: "approved")

Dated note 2026-11-20 (M-246, prior text kept; RR-0337 · task-399 · Backlog; operator, verbatim: "Can we add these to the three tasks remaining taks for the four steps.  run the full panel on them?")

Dated note 2026-11-20 (M-246, prior text kept; RR-0338 · task-399 · Backlog; operator, verbatim: "the findings that are deemed low priorities are filed in a review pile for later")

Dated note 2026-11-20 (M-246, prior text kept; RR-0339 · task-399 · Backlog; operator, verbatim: "yes hardening rounds.  Today's were warranted, but not endless.")

Dated note 2026-11-20 (M-246, prior text kept; RR-0340 · task-399 · Backlog; operator, verbatim: "can we address these in the plan? Let's get this right - add the the existing tasks and do a second pass on the recommendations")

2026-11-20 PLAN-399-v3 GOVERNS (appended, prior text kept, M-246). On the operator orders recorded as RR-0337, RR-0338, RR-0339 and RR-0340 the approved FINAL BUILD NOTE above (NOTE-399.md, RR-0336) went through the Spec 08 plan panel (DeepSeek lens set, Integration, Reality-Check and Ground-truth seats), a separate grounder, a fold, a second pass (fold validation and cross-read) and one correction round. The result is the Implementation Plan field of this task (PLAN-399-v3, sha256 b23cbc4e06c040a33e3b3cfd59b396584da0e082ea08ea7a6e664a9f20c79e74). Where it differs from the approved note, the plan governs. Approved sentences it replaces: "Files line (unchanged)" two files becomes five files plus backlog-brief.mjs and its test; "Bulk form for MED, LOW and NIT" is deleted; wontfix "60+ characters" becomes the existing 30-character literal and stays LOW and NIT only; "refused naming every id with no line or with two lines" becomes the last line per id wins; "A CONFLICT id takes only task: or ruling:" becomes ruling or fixed; the ending "; not reviewed (exempt): <k> paths" is deleted; acceptance "35 CONFIRMED" is 36. New, from RR-0338 and RR-0340: a pile: form for LOW and NIT; outcome lines for CRITICAL, HIGH and MED on the task page; seat findings ruled in the grounder file and covered by the same check. Open operator items P1 to P5 are listed at the end of the plan; the plan is written on the recommended answers and names what is reverted on a no. Panel records: docs/reports/reviews/task-399/.

2026-11-20 plan text corrected by one sentence (C1 of the round-3 grounder, docs/reports/reviews/task-399/GROUNDER-PANEL2.md): hand step 7 now states how the last round's fold is checked and that it is the last panel round. Plan sha256 now 60e3c08c3b85.

2026-11-20 taken on the board at lane launch (lane BL-OUTCOME, worktree /Users/brettpreston_macmini/Buildo-wt-outcome, branch wf1/inc1b-outcome), RR-0240

2026-11-20 BL-OUTCOME build start (lane note, plan unchanged): red commit attempt first (new tests plus the scenario helper that writes TRIAGE.md and the Final Summary), then the check, README.md:109, the two dated notes and the two brief lines in one commit through the real hooks. Plan facts verified by opening the files: check-lane-close.mjs VERDICT :50, reason minimum 30 at the grounder block (:296 at plan time), finished-status skip :338 region; brief lines :166 and :171; test pin :58.

2026-11-20 BL-OUTCOME dated deviation (one item, plan sentence cannot be built as written): the Files line (plan section 3) omits docs/reports/generated/rule-lists-by-kind.md, which scripts/analysis/rule-lists.mjs page --check (pre-commit) regenerates whenever 08_agents.md or 137_mcqueue.md changes (the page holds the spec hashes) and check-task-files refuses outside the Files line (hook output in commit.out). Only that generated path was appended to the Files line (task-410 carried the same path); nothing else of the description or the plan was touched.

2026-11-20 BL-OUTCOME acceptance evidence (commit d86373d7a through the real hooks; commit hook tail: "Test Files 2 passed (2), Tests 111 passed (111)", red first: "Tests 18 failed | 87 passed (105)" with the code absent from the tree).

(a) planted-defect tests red then green: red.out / commit.out in ~/Buildo-scratch/lanes-20261119/inc1b/outcome (copied to docs/reports/lanes/2026-11-20/BL-OUTCOME/); passing control "control: the default close ... passes" and "control: the --outcomes command on the same lane prints checked 1 ids and exits 0" are in the green 111.

(b) node scripts/hooks/check-lane-close.mjs --outcomes docs/reports/lanes/2026-11-20/BL-V2WHOLE (git facts included, no git-fact refusal added: 9 no line, 4 task: on a CRITICAL or HIGH BUG, 1 wontfix above LOW, 34 pass):
checked 48 ids
plan-compliance-agents-s5-1to3#3 MED: wontfix is not allowed for a MED DEFER finding (wontfix and pile are for LOW and NIT only) [Spec 08 section 7 rule 6 (08_agents.md:350): DEFER goes to review_followups.md with reasons; verdict scripts/analysis/rule-lists.mjs:312; form that passes: plan-compliance-agents-s5-1to3#3 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N]
plan-compliance-orchestrator-doc17#1 CRITICAL: task is not allowed for a CRITICAL BUG finding (task is for a DEFER finding; a BUG is fixed before Green Light) [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; verdict scripts/analysis/backlog-brief.mjs:140; form that passes: plan-compliance-orchestrator-doc17#1 fixed:<sha> <path the commit touches> | ruling:RR-NNNN or ruling:decision-N]
plan-compliance-orchestrator-doc17#2 HIGH: task is not allowed for a HIGH BUG finding (task is for a DEFER finding; a BUG is fixed before Green Light) [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; verdict scripts/analysis/backlog-brief.mjs:141; form that passes: plan-compliance-orchestrator-doc17#2 fixed:<sha> <path the commit touches> | ruling:RR-NNNN or ruling:decision-N]
plan-compliance-orchestrator-doc17#3 HIGH: task is not allowed for a HIGH BUG finding (task is for a DEFER finding; a BUG is fixed before Green Light) [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; verdict scripts/analysis/backlog-brief.mjs:60; form that passes: plan-compliance-orchestrator-doc17#3 fixed:<sha> <path the commit touches> | ruling:RR-NNNN or ruling:decision-N]
plan-plan-review-deepseek#4 HIGH: task is not allowed for a HIGH BUG finding (task is for a DEFER finding; a BUG is fixed before Green Light) [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; verdict scripts/deepseek-review.js:35; form that passes: plan-plan-review-deepseek#4 fixed:<sha> <path the commit touches> | ruling:RR-NNNN or ruling:decision-N]
out-compliance-agents-s5-1to3-p2#4 LOW: no outcome line in TRIAGE.md [Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later); verdict docs/specs/00-architecture/plan-protocol.md:28; form that passes: out-compliance-agents-s5-1to3-p2#4 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N | wontfix:"<reason, 30+ characters>" | pile:"<reason, 30+ characters>"]
out-compliance-agents-s5-1to3-p2#5 LOW: no outcome line in TRIAGE.md [Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later); verdict docs/specs/00-architecture/plan-protocol.md:32; form that passes: out-compliance-agents-s5-1to3-p2#5 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N | wontfix:"<reason, 30+ characters>" | pile:"<reason, 30+ characters>"]
out-compliance-eng-all-p3#4 LOW: no outcome line in TRIAGE.md [Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later); verdict scripts/hooks/check-lane-close.mjs:14; form that passes: out-compliance-eng-all-p3#4 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N | wontfix:"<reason, 30+ characters>" | pile:"<reason, 30+ characters>"]
out-compliance-five-words-p1#5 NIT: no outcome line in TRIAGE.md [Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later); verdict docs/specs/00-architecture/08_agents.md:239; form that passes: out-compliance-five-words-p1#5 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N | wontfix:"<reason, 30+ characters>" | pile:"<reason, 30+ characters>"]
out-compliance-five-words-p2#2 LOW: no outcome line in TRIAGE.md [Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later); verdict src/tests/backlog/check-lane-close.logic.test.ts:389; form that passes: out-compliance-five-words-p2#2 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N | wontfix:"<reason, 30+ characters>" | pile:"<reason, 30+ characters>"]
out-compliance-ms-S-p1#4 MED: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): DEFER goes to review_followups.md with reasons; verdict scripts/hooks/check-lane-close.mjs:133; form that passes: out-compliance-ms-S-p1#4 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N]
out-compliance-plan-protocol-p2#4 LOW: no outcome line in TRIAGE.md [Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later); verdict src/tests/backlog/check-lane-close.logic.test.ts:422; form that passes: out-compliance-plan-protocol-p2#4 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N | wontfix:"<reason, 30+ characters>" | pile:"<reason, 30+ characters>"]
out-compliance-policy-124-s2-s5-p1#1 LOW: no outcome line in TRIAGE.md [Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later); verdict scripts/hooks/check-lane-close.mjs:25; form that passes: out-compliance-policy-124-s2-s5-p1#1 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N | wontfix:"<reason, 30+ characters>" | pile:"<reason, 30+ characters>"]
out-compliance-policy-124-s2-s5-p3#2 LOW: no outcome line in TRIAGE.md [Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later); verdict scripts/hooks/check-lane-close.mjs:133; form that passes: out-compliance-policy-124-s2-s5-p3#2 fixed:<sha> <path the commit touches> | task:task-N (its text names this id) | ruling:RR-NNNN or ruling:decision-N | wontfix:"<reason, 30+ characters>" | pile:"<reason, 30+ characters>"]
exit=1

(c) task-381 GROUNDER.md (docs/reports/reviews/task-399/hooks3-GROUNDER.md) copied as GROUNDER.md alone into a directory with no TRIAGE.md (lines clipped to 170 characters here):
checked 36 ids
out-code-review#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; v
out-compliance-mobile-100#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold su
out-compliance-mobile-99#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold sur
out-compliance-surface-126-p2#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fol
out-compliance-surface-126-p2#3 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fol
out-compliance-surface-126-p2#4 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fol
out-compliance-surface-126-p3#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fol
out-compliance-surface-135#4 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold s
out-compliance-surface-135#5 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold s
out-compliance-surface-136#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold s
out-error-paths#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; v
out-error-paths#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; v
out-error-paths#4 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; v
out-ux#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; verdict mo
plan-compliance-inc-S#4 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold surviv
plan-compliance-mobile-90#3 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold su
plan-compliance-mobile-90#4 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold su
plan-compliance-mobile-96#5 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold su
plan-compliance-mobile-98#3 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold su
plan-compliance-mobile-98#4 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold su
plan-compliance-mobile-99-p2#4 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold
plan-compliance-surface-126-p1#6 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fo
plan-compliance-surface-126-p2#3 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fo
plan-compliance-surface-126-p4#3 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fo
plan-compliance-surface-127#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold 
plan-compliance-surface-127#3 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold 
plan-compliance-surface-127#6 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold 
plan-compliance-surface-128#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold 
plan-compliance-surface-128#4 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold 
plan-compliance-surface-135-p2#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fo
plan-compliance-surface-135-p2#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fo
plan-compliance-surface-136#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold 
plan-error-paths#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; 
plan-review-deepseek#1 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivo
plan-review-deepseek#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivo
plan-ux#2 CRITICAL: no outcome line in TRIAGE.md [Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors; verdict d
exit=1

2026-11-20 BL-OUTCOME dated correction of plan section 2d (fix round 1, grounder g399#3; prior text kept): a fix round does NOT file out-<lens>-rN.txt. The close hook requires every in- input and out- output to equal the diff of the WHOLE range at HEAD, so after any fix commit the lane re-makes every in- input with rule-lists.mjs lens-input and re-runs every lens output under the SAME names (superseded files are listed in the lane report). Re-running only the chunks that changed is card task-414 (operator approved, RR-0336 item 7). Also corrected here: plan 4.1 said task:task-N passes when the card's text holds the finding id OR the cited path; that path alternative let any card naming the file (or the closing task itself) close a deferral (grounder out-code-review#1). The form now requires the finding id as a whole token in the card's text and refuses the closing task itself; the dated note in 08_agents.md says the same.

Dated note 2026-11-20 (M-246, prior text kept; RR-0342 · task-399 · Backlog; operator, verbatim: "regression only required when code is changed and reality check is only required when a figure is changed or you can figure something else independently")

2026-11-20 (M-246, prior text kept) WHO DOES WHAT AFTER THE GROUNDER RULES of PLAN-399-v3 and the sentence of its section 5 saying the orchestrator writes TRIAGE.md are superseded on the operator's ruling (MORNING-DECISIONS.md:1605, verbatim: "agreed", to the question as put: the lane fixes and closes, the grounder verifies each fix, the orchestrator only routes): the lane writes its own outcome lines and makes the closing commit, a separate grounder verifies each fix resolves its finding, the orchestrator only routes. Fix round 1 was already run this way; this note records, it changes no code.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Task-399 built: the lane close refuses a CONFIRMED or CONFLICT finding with no verified outcome (TRIAGE.md forms fixed, task, ruling, wontfix, pile), shows the CRITICAL, HIGH and MED outcomes in this Final Summary, and has the --outcomes command. Code commits d86373d7a and bf773dd7f (hooks: 111 and 114 tests passed), evidence 032525629, grounder CLOSE-READY after fix round 1.

Review round 1: 6 fixed, 0 task, 0 ruling, 0 wontfix, 21 pile; grounder docs/reports/lanes/2026-11-20/BL-OUTCOME/GROUNDER.md; triage docs/reports/lanes/2026-11-20/BL-OUTCOME/TRIAGE.md
g399#1 HIGH fixed 0325256
g399#2 MED fixed 0325256
g399#3 MED fixed bf773dd
<!-- SECTION:FINAL_SUMMARY:END -->
