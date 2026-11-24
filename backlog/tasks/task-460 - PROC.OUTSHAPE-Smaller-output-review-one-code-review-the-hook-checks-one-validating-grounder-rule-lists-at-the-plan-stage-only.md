---
id: TASK-460
title: >-
  PROC.OUTSHAPE Smaller output review: one code review, the hook checks, one
  validating grounder; rule lists at the plan stage only
status: LATER
assignee: []
created_date: '2026-11-24T18:04:00Z'
updated_date: '2026-11-24T18:15:00Z'
labels:
  - ProcessImprovement
milestone: m-1
dependencies: []
type: fix
ordinal: 154210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0457 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2367), RR-0458 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2372) and RR-0459 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2377). Operator, verbatim: "I agree let's see the plan below"; "the output approach can stay for all front-end back end etc."; "Let's not do it. Create the task and go! Add label to it - ProcessImprovement." (the last: no error-paths review at the output stage).

What changes, for the OUTPUT review of every build or fix task (front end and back end): one code-review lens on the diff; the commit hook's checks as today; one separate read-only grounder that validates (the diff against the plan as folded and each acceptance line, the code-review findings, each changed descriptor against the code it describes, the milestone objectives against the diff, red then green). Every rule list is off at output through the existing output_off line and stays on at the plan stage. The plan stage is unchanged. Switches or text changes only (RR-0450, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325); no new mechanism (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

Source: the read-only grounder check Cairn-Ground-OUTSHAPE, saved word for word at ~/Buildo-scratch/lanes-20261124/outshape/GROUNDER-OUTSHAPE.txt (the change table with file:line, the descriptor duty sentences, the Spec 08 dated note text, the tests that pin the old shape, risks, UNVERIFIED). Morning evidence: output reviews of tasks 449, 450 and 453 raised 453 findings, 63 confirmed, 1 fixed; plan reviews raised 326, 204 confirmed, 200 folded.

Must not: change the plan stage, the close check's grounder rules, the round limits (RR-0385) or the no-fold-before-the-grounder rule (RR-0359); delete a lens template; add a table key or a scoping mechanism. Sequencing: lands after lane BL-SFX3 (task-451) closes; no open lane is merged onto it before its close.

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, .claude/review-templates/README.md, docs/specs/00-architecture/08_agents.md, docs/reports/generated/rule-lists-by-kind.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The table check passes with output_off naming lists that are not every-task lists; an unknown id is still refused
- [ ] #2 The output lens set of a build or fix task is the code review alone for every Files line; the plan lens set is unchanged
- [ ] #3 A build or fix lane closes with the code review output, its records and plan evidence and no compliance, engineering, ux, error-paths or security output files; emptying output_off puts every list back
- [ ] #4 A check or doc task still gets every list at either stage
- [ ] #5 The launch brief names the code review plus the descriptor and milestone-objective duties of the grounder, and names no compliance run at output
- [ ] #6 The Spec 08 dated note and the README lines are present and the dated-note cap tests stay green
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
Planner: Cairn-Plan-460
Plan id: PLAN-460-v1

Basis: board head 5af0f7be2. Every file on the Files line is byte-identical to 283cb3857 except docs/reports/generated/rule-lists-by-kind.md, which the task-451 fold regenerated. Nothing was written. No tests were run. Two read-only in-memory node calls were made (resolve and lensSet on this card's Files line, and the list sizes).

## 1. Rules quoted first (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md)
- RR-0457 MD:2367 "I agree let's see the plan below". The put-to said "Plan stage unchanged".
- RR-0458 MD:2372 "the output approach can stay for all front-end back end etc." and "this should be simple".
- RR-0459 MD:2377 "Let's not do it. Create the task and go! Add label to it - ProcessImprovement." This means no error-paths at output.
- RR-0450 MD:2325-2326 "We just want to turn off or change the text etc?". Ruled: "The changes are to be switches or text changes only."
- RR-0392 MD:1975 "I don't think we need any other infastrcuture beyond this".
- RR-0452 MD:2336 "Plan approved with one change - do not add the addiitonal 3 questions".
- RR-0385 MD:1918 item 2: "a review seat named `engineering`, separate from compliance, at plan and at output". MD:1919 item 3: "two rounds at most". This card keeps the rounds.
- RR-0359 MD:1687 "That's ridiculous to fold before the grounder review". Kept.
- RR-0429 MD:2202 "Keep notes short." Ruled: "The cap is not raised."
- Spec 08 08_agents.md:351 rule 4: "Run the set at plan AND output for WF1/WF2". :319 "Every WF runs a PLAN roster ... and, after implementation, an OUTPUT roster". The last dated note is the task-453 note at :358.
- plan-protocol.md:3 "a single lane task takes the Spec 08 section 7 lens set that the launch script and the close check enforce (`scripts/analysis/rule-lists.mjs` lensSet". This stays true: lensSet is still the one source.
- check-lane-close.mjs:855 (F10): a task whose Files line names the table is judged with "every_task: baseTable.every_task, output_off: baseTable.output_off".

## 2. What the plan reuses
- outputLists, rule-lists.mjs:306. It already drops any id, not only every_task ids. It is read by check-lane-close.mjs:525 and backlog-lane.mjs:184.
- The close check skips the compliance set when no list is left: check-lane-close.mjs:526 `if (ls.length)`. GROUNDER.md is still required for build or fix (:569-571). Ruled lines are needed only for the lens files present (:353-358).
- The lens set loop is check-lane-close.mjs:529-563 over lensSet(...).out. No edit to check-lane-close.mjs is needed, so the close check's grounder rules are untouched.
- The F10 pin (:852-855) and the task-453 planted-defect tests (check-lane-close.logic.test.ts:1268-1281) are the "emptying output_off puts every list back" proof.
- The seat report form at close (check-lane-close.mjs:147-153, `Seat: <name> <repo path> sha256:<12>`, finding lines `name#N SEV`) can carry the grounder's own findings (open choice Q4).
- The page generator: `node scripts/analysis/rule-lists.mjs page --write`. Its check runs at .husky/pre-commit:44.

## 3. Settling the grounder's UNVERIFIED items and corrections
- The lensSet out line is rule-lists.mjs:194, not :193 (:193 is plan). The grounder string in backlog-lane.mjs is at :191, not :189. `per` is at :188 and `layout` at :190.
- Zero lists at close: nothing else is required (see section 2). Confirmed by reading :489-571.
- surface-validate runs in no hook (.husky, package.json and scripts/hooks grep). It runs only through its tests, e.g. src/tests/surfaces/surface-validate.infra.test.ts, in the CI "Vitest" step (.github/workflows/test.yml:64-67) and in pre-commit related runs.
- Lens pins the grounder missed in backlog-lane.logic.test.ts:
  - :336-350 (A3: `cmds.length >= 2` and `lens-input --list L`)
  - :411-451 (task-423(d): out-compliance-mobile-98, out-engineering-eng-*, ONCE PER RULE LIST, lens-error-paths.md)
  - :589 (out-compliance-mobile-98 in a real build brief)
  - :310 (layout text, only if open choice Q6 is taken)
- Pins the grounder missed in check-lane-close.logic.test.ts:
  - :549, attack 27. A stale out-error-paths.txt would no longer be checked, because the close verifies only lenses in set.out.
- The marker "Compliance lens, ONCE PER RULE LIST" is read by the --spec merge (backlog-lane.mjs:228) and by the D2 regex (test :332). The new text keeps it.
- The page must be regenerated, not left alone. Spec 08 is the file of agents-s7-s11 and agents-s5-1to3, so the tooling kind's character count changes and the page check would refuse the commit.
- Size: about 18 source lines in 5 files plus the regenerated page. About 75 test lines in 4 files, not about 40 in 3. The extra comes from the pins above and the AC #5 and AC #6 cases.

## 4. The change, in build order (after the red tests of section 5)
1. scripts/analysis/rule-lists.mjs
   - :160-161, validate. Old: `if (!(table.every_task ?? []).includes(id))`, message "is not in every_task". New: `if (!table.lists?.[id]) bad.push(\`output_off: list ${id} is not defined\`)`. The non-array message becomes "must be a list of list ids". The comment says task-460. A typo still fails closed.
   - :194, lensSet. Old: out = code-review plus ux, error-paths and security. New: `out: [...(code ? ['code-review'] : [])],`. :193 (plan) is untouched. The doc comment at :185-187 gains one clause (task-460, RR-0459).
   - :549, page sentence (text). New wording: "...the plan protocol; the output review of a build or fix task receives none of the lists (output_off)...".
2. scripts/analysis/rule-lists.json
   - :238 output_off becomes all 58 `lists` ids in table order:
     five-words, plan-protocol, step-132, airtight-124a, airtight-v3-122, airtight-v2-122, airtight-122a, eng-all, eng-front, eng-back, eng-shared, bylaw-133, storage-doc16, surface-136, surface-126, surface-127, surface-135, surface-128, mobile-90, mobile-98, mobile-99, mobile-100, mobile-96, queue-137, agents-s7-s11, agents-s5-1to3, orchestrator-doc17,
     inc-F, inc-S, inc-1-2, inc-1, inc-3, inc-4, inc-5, inc-6, inc-6c, inc-7, inc-8, inc-9, inc-10, inc-L, inc-AL,
     ms-F, ms-S, ms-1-2, ms-1, ms-3, ms-4, ms-5, ms-6, ms-6c, ms-7, ms-8, ms-9, ms-10, ms-L, ms-AL, policy-124-s2-s5.
     43 of these are attachable today (12 by rows, plan-protocol, 15 inc, 15 ms). See Q3.
   - every_task stays ["plan-protocol"], so the plan stage and verifyResolved are unchanged.
   - :8 $comment gains one clause: output_off may name any defined list; task-460 names every list; a check or doc task keeps every list; emptying the line puts them back.
3. scripts/analysis/backlog-lane.mjs
   - :188 per. When `code && outLs.length === 0` the brief prints: "Compliance lens, ONCE PER RULE LIST, at the output stage only: none for this task (every list it resolves is off: output_off in scripts/analysis/rule-lists.json); make no out-compliance or out-engineering file." The shared tail follows (TASK file, never edit a lens output, close refused without an out-<lens>.txt per lens named above and the grounder file, plan ruled once). The partial-off parenthetical becomes "(<ids> off: output_off)" and drops "plan-protocol is asked at the plan stage only".
   - :190 layout (Q6): "The compliance lens reviews the WHOLE change" becomes "Every output lens reviews the WHOLE change".
   - :191 grounder. A validation sentence is appended for code tasks only (`${code ? ... : ''}`): the grounder of a build or fix task also rules, in GROUNDER.md:
     - the diff against the plan as folded and each acceptance line;
     - the code-review findings;
     - each changed descriptor (the grounder's two duty sentences, word for word: scripts/**/*.descriptor.json, *.notes.json, scripts/surfaces/ files with their census row; each prose field TRUE or FALSE with a file:line quote; numbers and lists equal the code; an untied sentence is a finding);
     - the milestone objectives list of the task (its ms- list above) against the diff;
     - red then green for each named test;
     - plus the Q4 sentence for recording its own findings.
4. .claude/review-templates/README.md
   - :99 and :100 (compliance and engineering) Altitude becomes "plan and output (not at the output of a build or fix task: output_off, task-460)".
   - :102, :103 and :104 (ux, error-paths, security) become "plan (task-460: not at output)".
   - :146 gains one Task-460 sentence.
   - :153 item 4 mirrors the validation duties.
   - :154 item 5 drops out-error-paths, out-ux and out-security from the "also needs" list and reads "one compliance lens output per attached list that output_off leaves on". The grounder's table missed this line, and it would be false otherwise.
5. docs/specs/00-architecture/08_agents.md: one new line after :358, about 620 characters:
   "   Dated note 2026-11-24 (M-246, prior text kept; task-460 PROC.OUTSHAPE; RR-0457, RR-0458, RR-0459; operator, verbatim, MORNING-DECISIONS.md:2372 "the output approach can stay for all front-end back end etc."): the output review of a build or fix task is the code-review lens on the diff, the commit hook's checks and one separate read-only grounder that also validates the diff against the plan and each acceptance line, each changed descriptor against its code and the milestone objectives against the diff; every rule list is off at output (rule-lists.json output_off). This supersedes, for those tasks, the output half of this rule, of the task-438 note (engineering at output) and of the 6.4 OUTPUT column (Co, UX, Sec)."
6. docs/reports/generated/rule-lists-by-kind.md: regenerate with `node scripts/analysis/rule-lists.mjs page --write` after steps 1 and 5. Never edit it by hand.

Commits: rule-lists.mjs and rule-lists.json are protected_paths (rule-lists.json:23). The work commit is separate from the closing commit, as usual. No file is outside the Files line, and check-lane-close.mjs is not edited.

## 5. Tests first (red unless marked "lock")
rule-lists.logic.test.ts:
- T1 (AC1), a new case in the task-453 describe at :1111: validate accepts `output_off: ['step-132']`, and `['nope']` is refused with /list nope is not defined/. Red: today it is refused with "is not in every_task". :1128 is edited to the new message.
- T2 (AC1), edit of :1114-1118: `t.output_off` equals `Object.keys(t.lists)` (58) and every_task equals ['plan-protocol']. Red.
- T3 (AC2), a new case: for type build and fix, `lensSet(...).out` equals ['code-review'] for the six kinds' Files lines plus 'src/components/x.tsx', 'src/lib/stripe/x.ts', 'src/app/api/parcels/search/route.ts', 'src/app/admin/page.tsx', 'mobile/app/(app)/x.tsx' and 'scripts/analysis/x.mjs'. `plan` equals the pinned old sets, e.g. src/lib gives [plan-review-deepseek, error-paths, security]. Red.
- Edits: :709 and :718 move to `r.plan` plus `out` toEqual ['code-review']. :732 out becomes ['code-review']. :739 out becomes toEqual ['code-review']. :715, :745-746 and S4 :748-752 stay locks.
- T4 (AC6), a new case: 08_agents.md contains "task-460 PROC.OUTSHAPE" in section 7 before "5. **Panel sizing". The README contains "Task-460" and the :154 text without out-error-paths. Red.
- Locks: the cap cases :932 and :980 (at most 3 files; the tooling lists are 143,119 characters in memory plus about 620) and the page check :462 after regenerating.

rule-lists-table.logic.test.ts:
- T5 (AC1, drift guard), a new case: every key of `lists` is in output_off. Planted: a copied table with a new list and no output_off entry fails. Red until the data change.

check-lane-close.logic.test.ts:
- T6 (AC3), a new case: build and fix with `tableEdit output_off=['first','inc-F','ev','msf']`, mutate dropping every out-/in-out-compliance-* file and out-error-paths.txt, gives status 0. Red: out-error-paths is required today.
- T7 (AC3), inversions of :212 (second line), :216-217, :221 and :224 into "closes" (status 0). Files are 'src/a.ts, src/components/x.tsx', 'src/a.ts, src/lib/x.ts' and 'src/a.ts, src/app/api/x/route.ts', with out-error-paths dropped. Red.
- T8 (AC3 lock): :549 is retargeted to out-code-review.txt with 'only part of the diff', refused /file_sha256/. :1275 (output_off [] refuses the missing ev) stays.
- T9 (AC4 lock), a new case: a check task with output_off naming every list and no out-compliance-first is refused /out-compliance-first/.

backlog-lane.logic.test.ts:
- T10 (AC5), a new case: build and fix briefs name lens-code-review.md and "none for this task". They contain no lens-compliance/engineering/ux/error-paths/security.md and no "out-compliance-" or "out-engineering-". They contain "each changed descriptor", "TRUE or FALSE with a file:line quote" and "milestone objectives". Red.
- Edits:
  - :278-279 becomes code-review only.
  - :368-372 and :385-387 invert: no lens-security.md in a build brief.
  - :336-350 A3: `>= 1`; the `lens-input --list L` line moves to a check brief.
  - :411-451: the list-text assertions run on a `type: 'check'` brief; a build block asserts no out-compliance-.
  - :589 becomes not.toContain plus the marker.
  - :983-991: the build and fix half asserts "none for this task"; :990 (check) is a lock.
  - :310 (Q6).

Red proof: the failing run saved in the lane folder before any code edit.

## 6. Limits, risks and surprises
- SURPRISE 1: a fix task gets no rule list at either stage. Plan-prep sends lists only for build (rule-lists.mjs:654 `type === 'build' ? r.lists : []`), and the fix plan gate asks plan lenses only (check-lane-close.mjs:657-661). "Stays on at the plan stage" is true for build tasks only. Open now: 14 LATER and 2 RUNNING fix cards; this card is fix. Nothing in the build detects this, which is why it is Q1.
- SURPRISE 2: the engineering seat goes at output too (eng-* are rule lists). This supersedes RR-0385 item 2's "and at output". The note names it (Q2).
- Known loss: lens-code-review.md:16-21 tells the code review it is "NOT responsible for" spec compliance, ux, "retry, time-out, double-submit, empty data" or exploit paths. At output only the grounder's duties stand in for them. RR-0459 accepted this for error paths; for ux and security it is settled by the card. The template is not edited.
- The one fix of the morning came from ms-S compliance (out-compliance-ms-S#1, task-449). The milestone duty is its cover.
- The close proves presence only. Nothing proves the descriptor or milestone duties were done.
- Pipeline and by-law cards lose step-132 section 6 and bylaw-133 OWED rows at output. The by-law gate (.husky/pre-commit:21) and step-validate (:49) stay.
- A list added later is on at output until its id is added: this fails toward more review. T5 refuses the table in CI. Pre-commit related tests skip a commit that changes only JSON (.husky/pre-commit:55), so the refusal may first show in CI.
- This card's own reviews, so the lane is not surprised:
  - Plan (type fix): plan-plan-review-deepseek and plan-error-paths. No list outputs. Seats integration, reality-check and regression; GROUNDER-PLAN.md; FOLD-CHECK.md.
  - Output: by F10 (:855) its output_off is the range base's ["plan-protocol"]. The close asks out-compliance-agents-s5-1to3, -agents-s7-s11, -inc-S and -ms-S, plus out-engineering-eng-all (resolved in memory: agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol, inc-S, ms-S).
  - The lens set is the branch's own lensSet (not pinned), so only out-code-review is required. The launch brief, made by board code, also names error-paths.
  - Joined form allowed per RR-0374. Same cause as task-453's F10 note.
- Sequencing:
  - BL-SFX3 (task-451) is closed: 6bcfa5ce6 BUILT, an ancestor of HEAD, folded at 5af0f7be2. The card's condition is met.
  - task-452 (LATER build) has plan evidence on the board (docs/reports/reviews/task-452/, including in-plan-compliance-five-words.txt). Its plan gate is unchanged by this card.
  - If 452 launches before this lands, its brief asks for the lists. A later board merge into its lane only lowers what the close asks; extra files need only Ruled lines.
  - Recommend landing this before 452 launches, or not merging the board into 452 before its close.
  - The generated page conflicts with any lane that edits a list document. Regenerate on merge.

## 7. Notes owed (backlog CLI only, never a hand edit)
- Implementation Notes on task-460: the RR-0459 words verbatim (DoD #5); the red-run evidence; the 58 ids; Q1 and Q2 as ruled.
- A PROTECTED FILES line naming rule-lists.json and rule-lists.mjs, as task-453 had (RR-0419, MD:2150). Added with `backlog task edit task-460`.
- The one Spec 08 dated note above. No Spec 137 note is owed.

## 8. Open choices (not decided)
- Q1 (operator question). A fix task has no rule list at either stage.
  - A: accept, as the card literally reads.
  - B: lists stay at output for fix tasks. This changes check-lane-close.mjs:525 and backlog-lane.mjs:184 to `type === 'build'`: code outside the Files line.
  - C: lists at the fix plan stage. Refused by the card ("change the plan stage").
  - Recommend: put A against B to him in one line before the build. The plan builds A.
- Q2. Engineering off at output (card: "every rule list") or kept (RR-0385 item 2). Recommend off, as RR-0458 is later and the put-to at MD:2367 said "All spec rule lists". The note states the supersession.
- Q3. output_off holds all 58 ids (pinned as `Object.keys(lists)`) or only the 43 attachable. Recommend 58: one rule, one test.
- Q4. The grounder records its own findings as a seat report in the lane folder (`Seat: validate <path> sha256:<12>`, lines `validate#N SEV`), so the close's verdict and TRIAGE rules apply (reuse). The alternative is prose in GROUNDER.md, which is not tracked. Recommend the seat form.
- Q5. This card's own output: run error-paths as its brief names (accepted if present) or skip it. Recommend follow the brief.
- Q6. The text edits beyond the grounder's table (rule-lists.mjs:549, the backlog-lane.mjs:190 word, README :99-100 and :154). Recommend yes: text only, and they keep the docs true.

## 9. UNVERIFIED
- No test was run. Red and green are predicted from reading.
- That the scenario harness closes a `type: 'check'` task (T9). That T6 passes with zero findings and no TRIAGE.md.
- That outcomeErrors in close mode accepts a seat name other than the plan seats (Q4).
- That the type-check brief keeps every :411-451 string.
- That the page diff is only the sentence and the agents-s7-s11 and agents-s5-1to3 counts.
- The cap result (arithmetic only).
- The exact MD line of each RR quote beyond the lines opened.
- How surface-validate is invoked inside its infra test.
<!-- SECTION:PLAN:END -->
