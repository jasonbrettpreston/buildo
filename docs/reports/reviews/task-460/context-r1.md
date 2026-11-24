# Review context for task-460 (no plan id) written 2026-11-24 by backlog-brief.mjs (round 1)

## Task
task-460 PROC.OUTSHAPE Smaller output review: one code review, the hook checks, one validating grounder; rule lists at the plan stage only
status: LATER · milestone: m-1 · assignee: none · labels: ProcessImprovement

## Description
Card opened 2026-11-24 by the orchestrator from RR-0457 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2367), RR-0458 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2372) and RR-0459 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2377). Operator, verbatim: "I agree let's see the plan below"; "the output approach can stay for all front-end back end etc."; "Let's not do it. Create the task and go! Add label to it - ProcessImprovement." (the last: no error-paths review at the output stage).

What changes, for the OUTPUT review of every build or fix task (front end and back end): one code-review lens on the diff; the commit hook's checks as today; one separate read-only grounder that validates (the diff against the plan as folded and each acceptance line, the code-review findings, each changed descriptor against the code it describes, the milestone objectives against the diff, red then green). Every rule list is off at output through the existing output_off line and stays on at the plan stage. The plan stage is unchanged. Switches or text changes only (RR-0450, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325); no new mechanism (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

Source: the read-only grounder check Cairn-Ground-OUTSHAPE, saved word for word at ~/Buildo-scratch/lanes-20261124/outshape/GROUNDER-OUTSHAPE.txt (the change table with file:line, the descriptor duty sentences, the Spec 08 dated note text, the tests that pin the old shape, risks, UNVERIFIED). Morning evidence: output reviews of tasks 449, 450 and 453 raised 453 findings, 63 confirmed, 1 fixed; plan reviews raised 326, 204 confirmed, 200 folded.

Must not: change the plan stage, the close check's grounder rules, the round limits (RR-0385) or the no-fold-before-the-grounder rule (RR-0359); delete a lens template; add a table key or a scoping mechanism. Sequencing: lands after lane BL-SFX3 (task-451) closes; no open lane is merged onto it before its close.

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, .claude/review-templates/README.md, docs/specs/00-architecture/08_agents.md, docs/reports/generated/rule-lists-by-kind.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts

## Acceptance criteria
- #1 The table check passes with output_off naming lists that are not every-task lists; an unknown id is still refused
- #2 The output lens set of a build or fix task is the code review alone for every Files line; the plan lens set is unchanged
- #3 A build or fix lane closes with the code review output, its records and plan evidence and no compliance, engineering, ux, error-paths or security output files; emptying output_off puts every list back
- #4 A check or doc task still gets every list at either stage
- #5 The launch brief names the code review plus the descriptor and milestone-objective duties of the grounder, and names no compliance run at output
- #6 The Spec 08 dated note and the README lines are present and the dated-note cap tests stay green

## Implementation Plan
Planner: Cairn-Plan-460
Plan id: PLAN-460-v1

Basis: board head 5af0f7be2. Every file on the Files line is byte-identical to 283cb3857 except docs/reports/generated/rule-lists-by-kind.md, which the task-451 fold regenerated. Nothing was written. No tests were run. Two read-only in-memory node calls were made (resolve and lensSet on this card's Files line, and the list sizes).

#### 1. Rules quoted first (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md)
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

#### 2. What the plan reuses
- outputLists, rule-lists.mjs:306. It already drops any id, not only every_task ids. It is read by check-lane-close.mjs:525 and backlog-lane.mjs:184.
- The close check skips the compliance set when no list is left: check-lane-close.mjs:526 `if (ls.length)`. GROUNDER.md is still required for build or fix (:569-571). Ruled lines are needed only for the lens files present (:353-358).
- The lens set loop is check-lane-close.mjs:529-563 over lensSet(...).out. No edit to check-lane-close.mjs is needed, so the close check's grounder rules are untouched.
- The F10 pin (:852-855) and the task-453 planted-defect tests (check-lane-close.logic.test.ts:1268-1281) are the "emptying output_off puts every list back" proof.
- The seat report form at close (check-lane-close.mjs:147-153, `Seat: <name> <repo path> sha256:<12>`, finding lines `name#N SEV`) can carry the grounder's own findings (open choice Q4).
- The page generator: `node scripts/analysis/rule-lists.mjs page --write`. Its check runs at .husky/pre-commit:44.

#### 3. Settling the grounder's UNVERIFIED items and corrections
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

#### 4. The change, in build order (after the red tests of section 5)
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

#### 5. Tests first (red unless marked "lock")
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

#### 6. Limits, risks and surprises
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

#### 7. Notes owed (backlog CLI only, never a hand edit)
- Implementation Notes on task-460: the RR-0459 words verbatim (DoD #5); the red-run evidence; the 58 ids; Q1 and Q2 as ruled.
- A PROTECTED FILES line naming rule-lists.json and rule-lists.mjs, as task-453 had (RR-0419, MD:2150). Added with `backlog task edit task-460`.
- The one Spec 08 dated note above. No Spec 137 note is owed.

#### 8. Open choices (not decided)
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

#### 9. UNVERIFIED
- No test was run. Red and green are predicted from reading.
- That the scenario harness closes a `type: 'check'` task (T9). That T6 passes with zero findings and no TRIAGE.md.
- That outcomeErrors in close mode accepts a seat name other than the plan seats (Q4).
- That the type-check brief keeps every :411-451 string.
- That the page diff is only the sentence and the agents-s7-s11 and agents-s5-1to3 counts.
- The cap result (arithmetic only).
- The exact MD line of each RR quote beyond the lines opened.
- How surface-validate is invoked inside its infra test.

## Implementation Notes
(none)

## References
- (none)

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled — "That's ridiculous to fold before the grounder review - the focus is on getting it right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1687)
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2) — "Apprvoe step 1 and step 2 - when it arrives" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1823)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
- RR-0406 McFixReborn label on the tasks that process covers
- RR-0407 next push as soon as possible; does not wait for task-442
- RR-0408 McFixReborn in merged groups by shared files; map validated before anything proceeds
- RR-0409 McFixReborn map: the three hand-written schema files are reviewed; a plan is needed for the oversized files
- RR-0410 McFixReborn map: the script with no rule-list row is not reviewed
- RR-0411 McFixReborn label stays on task 349; merged groups move forward
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows
- RR-0414 task 442 re-makes only its three changed lists; five McFixReborn map decisions
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0415 McFixReborn group reviews outside a lane: liked, to be grounded; tasks 442 and 367 to be running
- RR-0416 Operator pre-approves removing lane work folders to free disk space
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions
- RR-0418 Rule lists per task are cut down by turning lists off in the table
- RR-0419 The rule-list table edit is approved as one task — "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2149)
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward
- RR-0424 Task 448 also corrects the close check's refusal-message sentence
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0425 Push order: 442 and 367 first, task 448 later
- RR-0426 Task 448: stale launch-script comment fixed; by-law pre-registrations unchanged
- RR-0427 DONE record moves for the pushed tasks, as one batch
- RR-0428 The seven pushed tasks stay BUILT; no review for the DONE word
- RR-0429 Dated notes are kept short — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0430 The six unlabelled running tasks join McFixReborn
- RR-0431 McFixReborn: each set of files reviewed once, output only
- RR-0432 McFixReborn: fold the six first; progress in the orchestrator's table
- RR-0433 The six fold as they are; the group review is their one output review
- RR-0434 McFixReborn proceeds as per the status table
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0435 The orchestrator may do the merge edits and the test fix for the six
- RR-0436 Option 1 confirmed for the remaining folds
- RR-0437 Task 388 left out of the folds; nine paperwork notes approved
- RR-0438 Task 349 D3: the public web report page is wired at launch
- RR-0439 McFixReborn review calls: 120,000 characters; each list reads only its own files
- RR-0440 plan to drop the planning and process lists from reviews
- RR-0441 McFixReborn reading seats: reality check and integration run, code review dropped
- RR-0442 the search opens a lot on an exact match
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses
- RR-0444 fold the McFixReborn findings
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks
- RR-0448 the search-fix cards are created as 8 merged tasks
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles — "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325)
- RR-0452 tooling plan approved; the three questions are not added — "Plan approved with one change - do not add the addiitonal 3 questions" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2336)
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once
- RR-0149 Increment 1·A tooling location
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow — "I agree let's see the plan below" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2367)
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task — "Hold on.  I want see the plan against the agreed actions - this should be simple - the output approach can stay for all front-end back end etc.  but the obviously, the context reviews for the step handbook are front-end specific.  List the change and how much work because the small task below for the plan - still planning" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2372)
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement — "Let's not do it. Create the task and go! Add label to it - ProcessImprovement." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2377)
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0359 Nothing is folded before the grounder has ruled (names RR-0359) — "That's ridiculous to fold before the grounder review - the focus is on getting it right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1687)
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2) (names RR-0374) — "Apprvoe step 1 and step 2 - when it arrives" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1823)
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0419 The rule-list table edit is approved as one task (names RR-0419) — "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2149)
- RR-0429 Dated notes are kept short (names RR-0429) — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles (names RR-0450) — "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325)
- RR-0452 tooling plan approved; the three questions are not added (names RR-0452) — "Plan approved with one change - do not add the addiitonal 3 questions" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2336)
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow (names RR-0457) — "I agree let's see the plan below" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2367)
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task (names RR-0458) — "Hold on.  I want see the plan against the agreed actions - this should be simple - the output approach can stay for all front-end back end etc.  but the obviously, the context reviews for the step handbook are front-end specific.  List the change and how much work because the small task below for the plan - still planning" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2372)
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement (names RR-0459) — "Let's not do it. Create the task and go! Add label to it - ProcessImprovement." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2377)

## Prior reviews and lane reports
### task-460 (this task)
- (none)

## Dependencies
- (none)
