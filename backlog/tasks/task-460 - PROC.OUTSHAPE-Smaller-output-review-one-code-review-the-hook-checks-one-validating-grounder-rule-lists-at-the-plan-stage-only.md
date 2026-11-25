---
id: TASK-460
title: >-
  PROC.OUTSHAPE Smaller output review: one code review, the hook checks, one
  validating grounder; rule lists at the plan stage only
status: BUILT
assignee:
  - '@lane-BL-PROC460'
created_date: '2026-11-24T18:04:00Z'
updated_date: '2026-11-25T18:00:00Z'
labels:
  - ProcessImprovement
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-460/GROUNDER-PLAN.md
  - docs/reports/reviews/task-460/TRIAGE-PLAN.md
  - docs/reports/reviews/task-460/seat-integration-1.md
  - docs/reports/reviews/task-460/seat-reality-check-1.md
  - docs/reports/reviews/task-460/seat-regression-1.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-24/BL-PROC460/REPORT.md
  - docs/reports/lanes/2026-11-24/BL-PROC460/GROUNDER.md
  - docs/reports/lanes/2026-11-24/BL-PROC460/TRIAGE.md
type: fix
ordinal: 154210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0457 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2367), RR-0458 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2372) and RR-0459 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2377). Operator, verbatim: "I agree let's see the plan below"; "the output approach can stay for all front-end back end etc."; "Let's not do it. Create the task and go! Add label to it - ProcessImprovement." (the last: no error-paths review at the output stage).

What changes, for the OUTPUT review of every build or fix task (front end and back end): one code-review lens on the diff; the commit hook's checks as today; one separate read-only grounder that validates (the diff against the plan as folded and each acceptance line, the code-review findings, each changed descriptor against the code it describes, the milestone objectives against the diff, red then green). Every rule list is off at output through the existing output_off line and stays on at the plan stage. The plan stage is unchanged. A fix task never had lists at the plan stage, so after this card it has none at either stage (ruled, plan Q1). Whether the security lens stays at output on API, library, money, auth, PII and admin paths is the open Q7 of the plan: nothing is built for it until he answers. Switches or text changes only (RR-0450, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325); no new mechanism (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

Source: the read-only grounder check Cairn-Ground-OUTSHAPE, saved word for word at ~/Buildo-scratch/lanes-20261124/outshape/GROUNDER-OUTSHAPE.txt (the change table with file:line, the descriptor duty sentences, the Spec 08 dated note text, the tests that pin the old shape, risks, UNVERIFIED). Morning evidence: output reviews of tasks 449, 450 and 453 raised 453 findings, 63 confirmed, 1 fixed; plan reviews raised 326, 204 confirmed, 200 folded.

Must not: change the plan stage, the close check's grounder rules, the round limits (RR-0385) or the no-fold-before-the-grounder rule (RR-0359); delete a lens template; add a table key or a scoping mechanism. Sequencing: lands after lane BL-SFX3 (task-451) closes; no open lane is merged onto it before its close.

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, .claude/review-templates/README.md, docs/specs/00-architecture/08_agents.md, docs/reports/generated/rule-lists-by-kind.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The table check passes with output_off naming lists that are not every-task lists; an unknown id is still refused
- [x] #2 The output lens set of a build or fix task is the code review alone for every Files line (unless the operator keeps the security lens at output, plan Q7: then security joins it where the Files line triggers it); the plan lens set is unchanged
- [x] #3 A build or fix lane closes with the code review output, its records and plan evidence and no compliance, engineering, ux or error-paths output files (and no security file unless Q7 keeps it); emptying output_off puts every list back
- [x] #4 A check or doc task still gets every list at either stage
- [x] #5 The launch brief names the code review plus the descriptor and milestone-objective duties of the grounder, and names no compliance run at output
- [x] #6 The Spec 08 dated note and the README lines are present and the compliance-file cap cases of task-423 (a) and (e) stay green
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

Basis: written at board head 5af0f7be2 and read again at head f5b3e1ff4 (branch wf2/board): every file on the Files line is still byte-identical to 283cb3857 except docs/reports/generated/rule-lists-by-kind.md, which the task-451 fold regenerated; task-451 is BUILT and 6bcfa5ce6 is an ancestor of that head. Nothing was written. No tests were run. Two read-only in-memory node calls were made (resolve and lensSet on this card's Files line, and the list sizes).

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
- RR-0391 MORNING-DECISIONS.md:1968-1969 "Teh missing one is security" and "add it."; RR-0394 :1987 "Security a" (security runs on an API route or library Files line); RR-0418 :2145 the four lenses. They are earlier than RR-0457 to RR-0459 and name security, which is why Q7 is asked.
- check-lane-close.mjs:855 (F10): a task whose Files line names the table is judged with "every_task: baseTable.every_task, output_off: baseTable.output_off".

## 2. What the plan reuses
- outputLists, rule-lists.mjs:306. It already drops any id, not only every_task ids. It is read by check-lane-close.mjs:525 and backlog-lane.mjs:184.
- The close check skips the compliance set when no list is left: check-lane-close.mjs:526 `if (ls.length)`. GROUNDER.md is still required for build or fix (:579-580). A Ruled line and a verdict per finding are needed for every lens file present in the lane folder, in set.out or not (:353-358, :577).
- The lens set loop is check-lane-close.mjs:530-563 (the loop line is :531) over lensSet(...).out. No edit to check-lane-close.mjs is needed, so the close check's grounder rules are untouched.
- The F10 pin (:852-855) and the task-453 planted-defect tests (check-lane-close.logic.test.ts:1268-1281) are the "emptying output_off puts every list back" proof.
- The seat report form at close (check-lane-close.mjs:147-153, `Seat: <name> <repo path> sha256:<12>`, finding lines `name#N SEV`) is NOT used for the validating grounder (open choice Q4, ruled): outcomeErrors refuses a seat file with no finding line (:178), so a clean validation could not be filed, and the grounder would rule its own findings.
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
  - :549, attack 27. A stale out-error-paths.txt would lose its file_sha256 binding to the diff (the close binds only lenses in set.out), but it still needs a Ruled line and its findings still need verdicts (:353-358, :577).
- The marker "Compliance lens, ONCE PER RULE LIST" is read by the --spec merge (backlog-lane.mjs:228) and by the D2 regex (test :332). The new text keeps it.
- The page must be regenerated, not left alone. Spec 08 is the file of agents-s7-s11 and agents-s5-1to3, so the tooling kind's character count changes and the page check would refuse the commit.
- Size: about 18 source lines in 5 files plus the regenerated page. About 75 test lines in 4 files, not about 40 in 3. The extra comes from the pins above and the AC #5 and AC #6 cases.

## 4. The change, in build order (after the red tests of section 5)
1. scripts/analysis/rule-lists.mjs
   - :160-161, validate. Old: `if (!(table.every_task ?? []).includes(id))`, message "is not in every_task". New: `if (!Object.hasOwn(table.lists ?? {}, id)) bad.push(\`output_off: list ${id} is not defined\`)`. The non-array message becomes "must be a list of list ids". The comment says task-460. A typo still fails closed.
   - :194, lensSet. Old: out = code-review plus ux, error-paths and security. New: `out: [...(code ? ['code-review'] : [])],`. The other task types already give [] (check, doc and a blank type are code=false at :188, read in memory), so nothing new is lost there. :193 (plan) is untouched. This line, the Spec 08 note and the tests that pin security at output are the LAST step built, after the operator answers Q7; the build does not guess it. The doc comment at :185-187 gains one clause (task-460, RR-0459).
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
     - and ends GROUNDER.md with a Validation section, one line per duty above, each naming what it read (file:line) or none; a finding it raises there is fixed in the lane's own round or reported, never filed as a seat report (Q4).
4. .claude/review-templates/README.md
   - :99 and :100 (compliance and engineering) Altitude becomes "plan and output (not at the output of a build or fix task: output_off, task-460)".
   - :102 (ux) and :103 (error-paths) become "plan (task-460: not at output)"; :104 (security) follows the answer to Q7.
   - :146 gains one Task-460 sentence.
   - :153 item 4 mirrors the validation duties.
   - :154 item 5 drops out-error-paths, out-ux and out-security from the "also needs" list and reads "one compliance lens output per attached list that output_off leaves on". The grounder's table missed this line, and it would be false otherwise.
5. docs/specs/00-architecture/08_agents.md: one new line after :358, about 900 characters (RR-0429, keep it short: the first draft was 726; the cap cases count compliance files, not note length):
   "   Dated note 2026-11-24 (M-246, prior text kept; task-460 PROC.OUTSHAPE; RR-0457, RR-0458, RR-0459; operator, verbatim, MORNING-DECISIONS.md:2372 "the output approach can stay for all front-end back end etc."): the output review of a build or fix task is the code-review lens on the diff, the commit hook's checks and one separate read-only grounder that also validates the diff against the plan and each acceptance line, each changed descriptor against its code and the milestone objectives against the diff; every rule list is off at output (rule-lists.json output_off). This supersedes, for those tasks, the output half of this rule, of the task-438 note and RR-0385 item 2 (engineering at output), of RR-0418 (the four lenses at output) and of the 6.4 OUTPUT column (Co, UX, Sec); a fix task never had rule lists at its plan stage, so it has none at either. Security at output is stated after Q7 is answered."
6. docs/reports/generated/rule-lists-by-kind.md: regenerate with `node scripts/analysis/rule-lists.mjs page --write` after steps 1 and 5. Never edit it by hand.

Commits: rule-lists.mjs and rule-lists.json are protected_paths (rule-lists.json:23) and are staged in the SAME commit (the old validate refuses the new 58-id output_off). The work commit is separate from the closing commit, as usual. Rollback, if a close is refused after landing: empty output_off, restore the old lensSet out line, remove the Spec 08 note and regenerate the page, in one commit. No file is outside the Files line, and check-lane-close.mjs is not edited.

## 5. Tests first (red unless marked "lock")
rule-lists.logic.test.ts:
- T1 (AC1), a new case in the task-453 describe at :1111: validate accepts `output_off: ['step-132']`, and `['nope']` is refused with /list nope is not defined/. Red: today it is refused with "is not in every_task". :1128 is edited to the new message, and so is the title at :1126 (a grep found no other place of the old text except the rule-lists.json comment at :8, which step 2 rewrites). `['constructor']` is refused too (own keys only).
- T2 (AC1), edit of :1114-1118: `t.output_off` equals `Object.keys(t.lists)` (58) and every_task equals ['plan-protocol']. Red.
- T3 (AC2), a new case: for type build and fix, `lensSet(...).out` equals ['code-review'] for the six kinds' Files lines plus 'src/components/x.tsx', 'src/lib/stripe/x.ts', 'src/app/api/parcels/search/route.ts', 'src/app/admin/page.tsx', 'mobile/app/(app)/x.tsx' and 'scripts/analysis/x.mjs'. `plan` equals the pinned old sets, e.g. src/lib gives [plan-review-deepseek, error-paths, security]. Red.
- Edits: :709 and :718 move to `r.plan` plus `out` toEqual ['code-review']. :732 out becomes ['code-review']. :739 out becomes toEqual ['code-review']. :715, :745-746 and S4 :748-752 stay locks.
- T4 (AC6), a new case: 08_agents.md contains "task-460 PROC.OUTSHAPE" in section 7 before "5. **Panel sizing". The README contains "Task-460" and the :154 text without out-error-paths. Red.
- Locks: the cap cases :932 and :980 (at most 3 files; the tooling lists are 143,119 characters in memory plus about 620) and the page check :462 after regenerating.

rule-lists-table.logic.test.ts:
- T5 is not built (plan-error-paths#6): T2 already pins output_off to Object.keys(lists), so a list added later without an entry fails T2 in CI, and a committed rollback edits T2 with the data, as the task-453 pin did. That emptying output_off puts every list back is proved by the planted-table test at check-lane-close.logic.test.ts:1275, which stays.

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

Q7 and the security pins: everything that pins security at output (rule-lists.logic :709, :718, :732 and :739 and the security Files lines of T3; check-lane-close.logic :217, :221 and :224; backlog-lane.logic :368-372 and :385-387 and the lens-security part of T10) is written and run only after the operator answers Q7. Option A edits them as listed above. Option B leaves them as they are (green before and after) and T3 expects ['code-review', 'security'] on the security Files lines. In every case C1(c) (:226-228) and the :156 harness line stay as extra-file controls (an extra out file passes with a Ruled line), T6 has a second case that keeps out-error-paths.txt with its Ruled line and closes 0, and T10 also asserts that a build brief still holds "Compliance lens, ONCE PER RULE LIST" (the marker backlog-lane.mjs:228 and the D2 regex read) and that a check brief keeps the list text.

Red proof: the failing run saved in the lane folder before any code edit.

## 6. Limits, risks and surprises
- SURPRISE 1: today a fix task gets rule lists at OUTPUT only: the close asks them at check-lane-close.mjs:468 and :525 (build there means build or fix), the launch brief names them (backlog-lane.mjs:184 and :213 take the resolved lists for any type) and backlog-lane.logic.test.ts:983-987 loops build and fix. It never gets them at the plan stage: plan-prep sends lists only for build (rule-lists.mjs:661 `type === 'build' ? r.lists : []`), and the fix plan gate asks plan lenses only (check-lane-close.mjs:658-662). After this card a fix task has no rule list at either stage. "Stays on at the plan stage" is true for build tasks only. Open now: 14 LATER and 2 RUNNING fix cards; this card is fix. Ruled, not asked (Q1): accepted, because RR-0458 applies the output approach to all cards and RR-0450 allows switches or text changes only; keeping lists for fix tasks would need a type test in hook code outside the Files line (check-lane-close.mjs:525, backlog-lane.mjs:184) or lists at the fix plan stage, which the card forbids. The close-out reply states the consequence.
- SURPRISE 2: the engineering seat goes at output too (eng-* are rule lists). This supersedes RR-0385 item 2's "and at output". The note names it (Q2).
- Known loss: lens-code-review.md:16-21 tells the code review it is "NOT responsible for" spec compliance, ux, "retry, time-out, double-submit, empty data" or exploit paths. At output only the grounder's duties stand in for them. RR-0459 accepted this for error paths; ux is settled by the shape he agreed (RR-0457, RR-0458); security is NOT settled by his words (RR-0391 and RR-0394 ordered it by name), so Q7 asks him. The template is not edited.
- The one fix of the morning came from ms-S compliance (out-compliance-ms-S#1, task-449). The milestone duty is its cover.
- The close proves presence only. Nothing proves the descriptor or milestone duties were done.
- Pipeline and by-law cards lose step-132 section 6 and bylaw-133 OWED rows at output. The by-law gate (.husky/pre-commit:19) and step-validate (:49) stay.
- A list added later is on at output until its id is added: this fails toward more review. T2 refuses the table in CI. Pre-commit related tests skip a commit that changes only JSON (.husky/pre-commit:56), so the refusal may first show in CI.
- This card's own reviews, so the lane is not surprised:
  - Plan (type fix): plan-plan-review-deepseek and plan-error-paths. No list outputs. Seats integration, reality-check and regression; GROUNDER-PLAN.md; FOLD-CHECK.md.
  - Output: by F10 (:855) its output_off is the range base's ["plan-protocol"]. The close asks out-compliance-agents-s5-1to3, -agents-s7-s11, -inc-S and -ms-S, plus out-engineering-eng-all (resolved in memory: agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol, inc-S, ms-S).
  - The lens set is the branch's own lensSet (not pinned), so only out-code-review is required. The launch brief, made by board code from the board's own table (backlog-lane.mjs:78), still holds the old output_off until this lands, so it names the same compliance and engineering files the close asks, and it also names error-paths (not run: Q5).
  - Joined form allowed per RR-0374. Same cause as task-453's F10 note.
- Sequencing:
  - BL-SFX3 (task-451) is closed: 6bcfa5ce6 BUILT, an ancestor of HEAD, folded at 5af0f7be2. The card's condition is met.
  - task-452 (LATER build) has plan evidence on the board (docs/reports/reviews/task-452/, including in-plan-compliance-five-words.txt). Its plan gate is unchanged by this card.
  - If 452 launches before this lands, its brief asks for the lists. A later board merge into its lane lowers the lens files only: the close judges by the range base table (check-lane-close.mjs:855), so out-compliance and out-engineering files stay asked while that table is the launch one; extra files need only Ruled lines. Task-461 (LATER fix, a mobile/ Files line) launched before the landing is asked code-review, ux and error-paths plus the lists; launched after, code-review only (and security only if Q7 keeps it, on a security path).
  - Recommend landing this before 452 launches, or not merging the board into 452 before its close.
  - The generated page conflicts with any lane that edits a list document. Regenerate on merge.

## 7. Notes owed (backlog CLI only, never a hand edit)
- Implementation Notes on task-460: the RR-0459 words verbatim (DoD #5); the red-run evidence; the 58 ids; Q1 and Q2 as ruled.
- A PROTECTED FILES line naming rule-lists.json and rule-lists.mjs, as task-453 had (RR-0419, MD:2150). Added with `backlog task edit task-460`. The line also tells a later list card to add its id to output_off (T2 pins it to every list key).
- The one Spec 08 dated note above. No Spec 137 note is owed.

## 8. Open choices (not decided)
- Q1 (RULED, not an operator question; section 6, Surprise 1). A fix task has rule lists at output only today and none at either stage after this card.
  - A: accept, as the card literally reads.
  - B: lists stay at output for fix tasks. Two one-line type tests in check-lane-close.mjs:525 and backlog-lane.mjs:184: hook code in a protected path outside the Files line, not a switch or a text change.
  - C: lists at the fix plan stage. Refused by the card ("change the plan stage").
  - Ruled A: RR-0458 (MORNING-DECISIONS.md:2372, the output approach can stay for all front-end back end etc.) and RR-0450 (:2325). The plan builds A and the close-out reply says so.
- Q2. Engineering off at output (card: "every rule list") or kept (RR-0385 item 2). Recommend off, as RR-0458 is later and the put-to at MD:2367 said "All spec rule lists". The note states the supersession. RULED off: the eng-* lists are lists of docs/specs/00_engineering_standards.md in the table, RR-0457 put the shape as All spec rule lists (MORNING-DECISIONS.md:2366) and he agreed (:2367), later than RR-0385 item 2 (:1918). The planted ui-app defect lock at backlog-lane.logic.test.ts:419-437 moves to a type check brief, which resolves eng-back and eng-shared for an API route as a build does (resolved in memory); its red-then-green run is kept in the lane folder.
- Q3. output_off holds all 58 ids (pinned as `Object.keys(lists)`) or only the 43 attachable. Recommend 58: one rule, one test. RULED 58: the card says every rule list and RR-0457 put it as All spec rule lists (MORNING-DECISIONS.md:2366); the 15 lists no row attaches today are in it, so one attached later is off at output at once.
- Q4. The grounder records its own findings as a seat report in the lane folder (`Seat: validate <path> sha256:<12>`, lines `validate#N SEV`), so the close's verdict and TRIAGE rules apply (reuse). The alternative is prose in GROUNDER.md, which is not tracked. RULED the other way (in#1, plan-error-paths#5): prose in GROUNDER.md, a Validation section, no seat form: outcomeErrors refuses a seat file with no finding line (check-lane-close.mjs:178), so a clean validation could not be filed, and the grounder would rule its own findings. The close still proves presence only, and the card may not change its grounder rules.
- Q5. This card's own output: run error-paths as its brief names (accepted if present) or skip it. RULED skip (RR-0459: no error-paths review at output; from its own branch lensSet the close of this lane asks code-review as its only lens). The orchestrator tells the lane so in the launch message; a file written anyway needs a Ruled line and verdicts.
- Q6. The text edits beyond the grounder's table (rule-lists.mjs:549, the backlog-lane.mjs:190 word, README :99-100 and :154). Recommend yes: text only, and they keep the docs true. RULED yes (AC #6 names the README lines; RR-0450 allows text changes; the :154 list would be false otherwise).
- Q7 (OPERATOR QUESTION, the only one). Should the security review stay at the output stage on a task whose Files line is an API route, library, money, auth, PII or admin path? A: off, as the card is put (code review alone at output, security at the plan stage only; costs the Spec 08 note naming :263 and RR-0391, and the security test edits above). B: keep (the :194 line keeps the security term, so one more output file and ruling on those cards; no security test edit, about 8 fewer test lines than A). C: off as a lens, plus one grounder duty sentence to read each changed file of such a path for exploit paths (backlog-lane.mjs:191 and README :153, about 2 lines, one more T10 assertion). Recommend B (RR-0391 MORNING-DECISIONS.md:1968-1969 add it; RR-0394 :1987 Security a; fails toward more review; the same one line). Meanwhile the build does everything else; if no answer has come when it reaches that line, it stops there and reports.

## 9. UNVERIFIED
- No test was run. Red and green are predicted from reading.
- That the scenario harness closes a `type: 'check'` task (T9). That T6 passes with zero findings and no TRIAGE.md.
- Settled by reading: close mode accepts any seat name but refuses a seat file with no finding line (check-lane-close.mjs:178), so Q4 uses prose.
- That the type-check brief keeps every :411-451 string.
- That the page diff is only the sentence and the agents-s7-s11 and agents-s5-1to3 counts.
- The cap result (arithmetic only).
- The exact MD line of each RR quote beyond the lines opened.
- How surface-validate is invoked inside its infra test.

Plan review round 1: 24 folded, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/reviews/task-460/GROUNDER-PLAN.md; triage docs/reports/reviews/task-460/TRIAGE-PLAN.md
plan-error-paths#5 MED folded ends GROUNDER.md wit
in#1 MED folded is NOT used for the 
rc#1 MED folded After this card a fi
rc#3 MED folded it still needs a Rul
rg#1 HIGH folded security is NOT sett
rg#2 MED folded Ruled, not asked (Q1
rg#3 MED folded are lists of docs/sp
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24 taken on the board at lane launch (lane BL-PROC460, worktree /Users/brettpreston_macmini/Buildo-wt-proc460, branch wf2/inc1b-proc460), RR-0240

2026-11-24 build started (lane BL-PROC460). Plan Q7 (security at output) is UNANSWERED: MORNING-DECISIONS.md read to its last entry (RR-0461, :2385); no Q7 ruling. Deviation from plan step 1 order, recorded here: the lensSet out line is edited now ONLY to drop ux and error-paths (common to Q7 options A, B and C; RR-0459 MD:2377 and RR-0457/0458); the security term of that line is left exactly as it is today, the security test pins are not edited, and the Spec 08 note names security as pending Q7. Removing or keeping security waits for the operator's Q7 answer. Red tests first: T1, T2, T3, T4, T6, T7, T8, T9, T10 written before any code edit.

2026-11-24 plan Q7 answered: RR-0464 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2399-2403). Operator, verbatim: "for task 460 what security answer do we need. yes security doesn run on the output" and his selection, verbatim: "C: grounder reads instead". Ruled (RR-0464): option C; the security lens is off at output and stays at the plan stage; the validating grounder's duty gains one sentence: read the changed sensitive files for exploit paths. Build: lensSet out drops the security term (plan set unchanged), security pins edited to plan yes / output no, README security row, Spec 08 note last sentence, one grounder duty sentence in the brief. Board (wf2/board) merged into the lane branch at 8491e7c4f before the lens run.

2026-11-24 output review round 1 run on the whole change (base e61a12e0a, head 5a807f972 after the board merge; context docs/reports/reviews/task-460/context-r3.md): code-review (1 part, error-paths skipped per plan Q5 and RR-0459, no security per RR-0464), compliance agents-s5-1to3, agents-s7-s11 (2 parts), inc-S (2 parts), ms-S, engineering eng-all (3 parts), as the board table still requires (output_off [plan-protocol] at the range base, check-lane-close.mjs:855). 27 BUG/DEFER lines in docs/reports/lanes/2026-11-24/BL-PROC460/FINDINGS.md. Grounder owed.

2026-11-24 fix round (round 1 grounder Cairn-Ground-O460 at 07aa4155a: 27 ids, 14 CONFIRMED (4 MED = 2 text defects, 8 LOW, 2 NIT), 13 REJECTED). Red first: T4b (README item 5 guards the list files by task type) and T11 (the layout sentence names the output lenses above). Fix 1: README item 5, two in-place replacements; Fix 2: one phrase in scripts/analysis/backlog-lane.mjs. No board merge in this round (the orchestrator folds after the close).

2026-11-24 fix commit 7de2c9777 (red-r2: T4b and T11 failed; green-r2: 2 files, 179 passed). Round-1 grounder and triage kept byte for byte outside the lane folder: docs/reports/reviews/task-460/GROUNDER-OUT-R1.md and TRIAGE-OUT-R1.md (FIXSHA set to 7de2c9777). Output review round 2 re-made under the same names on the new diff (base e61a12e0a, head 7de2c9777; context-r4.md; eng-all now 4 parts): 31 BUG/DEFER lines, 1 HIGH (out-engineering-eng-all-p2#1). No board merge this round. Grounder owed (round 2).

2026-11-24 (orchestrator): pushed to origin wf1/mb-rulings at 9fedd48cb by the operator (push.log 2026-11-25T01:18:38Z rc=0). Proof per RR-0460: full local phone run on that tip before the push, 59 of 59 suites, 908 of 908 tests (~/Buildo-scratch/lanes-20261124/gate-phone-9fedd48cb.out); push station on that tip, every step rc=0 including mobile-typecheck and mobile-tests, STATION PASS 9fedd48cb (~/Buildo-scratch/push-station/pass/9fedd48cb323eb72cb3c46d816382169b9867e44.pass; ~/Buildo-scratch/lanes-20261124/station-9fedd48cb.out), worktree clean after; Mobile CI run 45524945847 on 9fedd48cb: conclusion success, job Jest + TypeCheck success, Maestro and EAS jobs skipped as configured.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
What landed (work 77286d717, 585733c10, fix 7de2c9777; every commit through the real hooks, last green 179 passed, earlier 370 passed): the output review of a build or fix task is the code review on the diff, the hook checks and one validating grounder (diff against plan and acceptance lines, code-review findings, changed descriptors, milestone objectives, changed sensitive files for exploit paths, red then green); every rule list is off at output (rule-lists.json output_off names all 58 lists); security off at output per RR-0464; plan stage unchanged; a check or doc task keeps every list.

Review round 1: 7 fixed, 0 task, 0 ruling, 0 wontfix, 7 pile; grounder docs/reports/reviews/task-460/GROUNDER-OUT-R1.md; triage docs/reports/reviews/task-460/TRIAGE-OUT-R1.md
out-compliance-agents-s5-1to3#1 MED fixed 7de2c97
out-compliance-agents-s7-s11-p1#1 MED fixed 7de2c97
out-compliance-inc-S-p1#1 MED fixed 7de2c97
out-compliance-ms-S#3 MED fixed 7de2c97

Review round 2: 0 fixed, 0 task, 0 ruling, 0 wontfix, 12 pile; grounder docs/reports/lanes/2026-11-24/BL-PROC460/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-PROC460/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
