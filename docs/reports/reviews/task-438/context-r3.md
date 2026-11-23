# Review context for task-438 (no plan id) written 2026-11-22 by backlog-brief.mjs (round 3)

## Task
task-438 FINAL.3 Engineering seat: a review seat named engineering, separate from compliance, at plan and at output
status: RUNNING · milestone: m-1 · assignee: @lane-BL-ENG438 · labels: McFix, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "We want to seperate the compliance from the engineering standards seat. For both the plan and output."; "We need a new name for an agent called engineering." THIS TASK: a new review template named engineering; the engineering-standards rule lists are reviewed by that seat and the handbook lists by the compliance seat, at both stages; the launch gate and the close check expect both seats' outputs. Task-431 then gives the seat the right sections (front end, back end). Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: .claude/review-templates/lens-engineering.md, .claude/review-templates/README.md, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/review-templates.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/reviews/task-375/plant-evidence.mjs, docs/specs/00-architecture/08_agents.md, docs/reports/generated/rule-lists-by-kind.md

## Acceptance criteria

## Implementation Plan
#### PLAN-438-v1: a review seat named engineering, separate from compliance, at plan and at output

Planner: Opus, read-only, board worktree head 0c4a0d2fb; folded at head 34fe2ad6c (tasks 436, 437 and 444 landed; line numbers re-read). All measurements were taken in memory with the table's own functions (resolveTask, listBlocks, buildLensInputs, validateTable). Nothing was written and no tests were run.

#### BASIS
- RR-0385 / decision-170 (MORNING-DECISIONS.md, last entry), verbatim: "We want to seperate the compliance from the engineering standards seat. For both the plan and output."; "We need a new name for an agent called engineering." Ruled item 2: "a review seat named `engineering`, separate from compliance, at plan and at output". Orchestrator's reading in the same entry: "the engineering seat from the landing of its task".
- RR-0385 item 5: built gates stay. This task adds no gate. It renames what the existing gate requires for one document.
- RR-0380, verbatim: "drop the full engineering when arts can be sent". The de-dup line is task-431's (RR-0385 item 7); 438 changes no list resolution.

#### FACTS (file:line)
3. `listProof` (check-lane-close.mjs:386, :399, :420) hard-codes the base name `${ph}-compliance-${l.id}` and lens-compliance.md; `complianceSetErrors` (:428-453) adds the joined/per-list form and is called at :514 (close) and :639 (plan gate).
5. F10: the close reads templates at the range base (:764 `readBase`). The plan gate reads them from the repo (:631 `readBase: i.readRepo`).
8. Only `eng-all` (rule-lists.json:31, docs/specs/00_engineering_standards.md) is an engineering list; no file has both a whole and a sections list (measured).

#### WHAT
1. Add one template.
2. Add one routing predicate: the list's `file` is the engineering standards file (no table field: the ruling names the document, and task-431's three lists route with no edit).
3. No de-dup line here: it belongs to task-431 and acts on nothing today (no file has both lists, measured).
4. Give the four readers (plan-prep, brief, close, plan gate) and the fixture writer a seat name. lens-compliance.md is NOT edited: an edit would invalidate every prepped plan-compliance output (hashes are recomputed from the repo template, :631).

#### TEMPLATE `.claude/review-templates/lens-engineering.md`
A copy of lens-compliance.md with exactly these line changes; all other lines are verbatim. It is a seat of its own, not a renamed copy: the standards hold the error, security, logging and type rules, so the NOT-responsible list must leave those to it. It has no `Rules met:` line: the file has no `name.N` rule ids.
- L1, L3, L4, L5: engineering titles (L4 cites RR-0385, decision-170); L5 also lists lens-engineering.md.
- L12 `You are an engineering standards reviewer. You have exactly one question: is the plan or diff built to every engineering rule pasted in the context, rule by rule? You judge against the pasted engineering rules only; a rule that is not pasted is not yours to invent, and a pasted rule is yours even where another lens also covers its topic.`
- L14 and L30: the question becomes `Is the plan or diff built to every pasted engineering rule?` The clause ref is the numbered section (for example `4. Security and API Contracts`).
- L17 to L21 become three bullets: spec clauses, handbook rules, operator rulings, design text, "nothing added" (lens-compliance); quality or behaviour no pasted rule states (the code-review, ux, error-paths and security lenses), where a pasted rule on their topic is yours; failure modes, rollback, data reality (plan-review-deepseek).
- L48 to L50: "clause or ruling" becomes "engineering rule" in the same three steps; L51 is deleted (the "nothing added" check stays with compliance).
- L71 `VERDICT: PASS or FAIL on the pasted engineering rules`; L73, L75, L76 (Rules met and its paragraph) are deleted.
- L82 `- Judging against a rule that is not in the pasted list. If you recall a rule from elsewhere, say "not pasted" and do not raise it.` L83 becomes `- Reporting style, naming or performance that no pasted rule states.`

README.md: one row in the lens table after :100 (`lens-engineering.md`, Engineering (RR-0385), plan and output), a sentence in "The lens line" (:158) and in item 5 (:160) naming the seat's files.

#### CODE (per function, lines changed)
**rule-lists.mjs** (protected, about 7 lines):
- Add `export const ENG_FILE = 'docs/specs/00_engineering_standards.md'` and `export const seatOf = (l) => (l.file === ENG_FILE ? 'engineering' : 'compliance')`: +2 lines.
- reviewPhase: inputArgv writes `in-plan-${seatOf(l)}-${id}` with `--template <REPO>/.claude/review-templates/lens-${seat}.md` (1 line); dry-run lines :654/:656 (2); jobs :666 (1); summary :679 counts engineering separately (1).

**check-lane-close.mjs** (protected, about 21 lines):
- Import `seatOf` (1).
- listProof gains `seat`: base `${ph}-${seat}-${l.id}`, template `lens-${seat}.md` twice, message (4).
- complianceSetErrors gains `seat`: its three regexes and two messages use `${ph}-${seat}-` (6). The joined form is per seat (`out-engineering-rules`), with joinLists over that seat's lists only. The form is chosen per seat and per stage: a joined compliance set with per-list engineering files is accepted; an old joined `out-compliance-rules` that holds eng-all is refused once the base has the template.
- closeErrors :514: `const split = readBase('.claude/review-templates/lens-engineering.md') !== null;` then one call per seat with its non-empty list subset. When `split` is false every list is compliance, which is the old contract (3).
- Plan gate (the launch gate) :639: one call per seat with its non-empty list subset, always split (3). Text naming compliance moves to the seat: layout :632, messages :420, :437, :443, comment :12-21 (+4).
- The fix branch (:644) is unchanged, because fix tasks run no list lenses (rule-lists.mjs:649).

**backlog-lane.mjs** lensLine (:177-184; about 4 lines):
- `ids` splits into compliance and engineering ids.
- The `per` sentence (:184) names `out-compliance-<id>` for compliance lists, and its joined-run clause says `--lists <the compliance list ids>` (the pinned substrings `--list rules --lists` and `accepted form that is not the default` stay).
- A new sentence: "Engineering lens, once per engineering list: the same commands with `--out <lane dir>/in-out-engineering-L --template .claude/review-templates/lens-engineering.md` on lens-input and the review tool; files `out-engineering-<id>.txt`."

**plant-evidence.mjs** (docs/reports/reviews/task-375/, the launch-test fixture writer, on the Files line, about 5 lines): it names each list's files and template with `seatOf` and copies lens-engineering.md; without it the plan gate refuses every build launch test (the fixture's thing.mjs hits the lane-tools row, rule-lists.json:159, which carries eng-all). The path adds no rule list (resolveTask: the same 9; exempt as docs/reports/reviews/**), so no second plan round. Being exempt, the output lenses and chunk coverage never see it: the backlog-lane tests that run it are its proof.

**08_agents.md** (on the Files line): one dated note (M-246, prior text kept) after :351 (section 7 rule 4) records the seat split and that the per-list rule of :241 and :351 reads `out-compliance-<id>` or `out-engineering-<id>`. Spec 137 rule 10 and engineering standards section 14 ("A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit") require it, as in tasks 436 and 437 (Spec-diff trailer). The lane regenerates docs/reports/generated/rule-lists-by-kind.md (`page --write`) and adds it to the Files line in its own commit, as task-437 did; that adds list policy-124-s2-s5 to the output review.

#### CUT-OVER (verified at head 34fe2ad6c)
- **Close:** the split applies when the range base holds lens-engineering.md (:764; precedent :425). A lane launched before the landing has no such base and closes as today with `out-compliance-eng-all`: task-430 (BL-HB430, RUNNING; 436, 437 and 444 are BUILT and folded), 438 itself and 20 other RUNNING lanes that resolve eng-all. This is a deliberate exception for lanes already launched (as the 2026-11-21 note in Spec 137); their engineering list is still reviewed, under the compliance name.
- **No re-run:** the lane's hook is its own copy (.husky/commit-msg:7), a fold is a merge commit the close skips (:707-708), and only a commit that sets a finished status runs the close (:735), so no closed lane is checked again. A lane that merges the board before it closes gets the new code and the template together and owes `out-engineering-<id>` plus verdicts; the orchestrator tells it not to merge first.
- **Plan gate (the launch gate):** no range base, so the split applies from the landing; the compliance name is refused for an engineering list, with no alias. Only task-431 is prepped and unlaunched with plan-compliance-eng-all (measured), and its agents-s7-s11 evidence is stale already: it is re-prepped after 438 lands.
- These lines are the ruled change itself (RR-0385 item 2 on the gates item 5 keeps), not new gate work.

#### TESTS (red first; each with a planted defect or control)
- **T1** review-templates.logic.test.ts: `engineering` joins the one-placeholder loop; one new test asserts lens-engineering.md holds the structural strings of review-lens-template.infra.test.ts:80-92 and `Clauses checked: <n>   Unmet: <n>` and no `Rules met:` (control: lens-compliance.md holds it). That infra test is left alone (its LENSES would force lens-compliance.md to name lens-engineering, and it is not edited). Red now (the file is absent).
- **T2** rule-lists.logic.test.ts:
- seatOf: eng-all and a sections list on ENG_FILE give engineering. bylaw-133 and the joined list (joinLists) give compliance.
- Red now (seatOf is not exported); planted defect: seatOf returning compliance for every list fails the eng-all case.
- **T3** check-lane-close.logic.test.ts, fixture option `eng` (an `eng` list on docs/specs/00_engineering_standards.md, on the src row; LENS_TEMPLATES :33 gains `engineering`):
- (a) out-engineering-eng with lens-engineering.md is accepted.
- (b) The same review filed as out-compliance-eng is refused, naming `out-engineering-eng.txt`.
- (c) An engineering output whose header names lens-compliance.md is refused ("expected lens-engineering.md").
- (d) F10 control: with a base without the template, out-compliance-eng is accepted.
- (e) The joined `out-compliance-rules` (compliance lists only) plus out-engineering-eng is accepted.
- (f) No engineering list needs no out-engineering file. (g) A joined out-compliance-rules over all lists, eng-all included, is refused with the template at the base, accepted without. (h) A joined out-engineering-rules is accepted; with a lens-compliance.md header, refused.
- **T4** plan gate (fixture near :874): plan-engineering-eng is accepted and plan-compliance-eng is refused, naming plan-engineering-eng; no engineering list needs no plan-engineering file.
- **T5** backlog-lane.logic.test.ts:
- Changed: :398-403 (eng-all expects `out-engineering-eng-all` and `lens-engineering.md`); :691-695 (stub run: `in-plan-engineering-eng-all`, header lens-engineering.md); :730 (lens-compliance review lines = lens-input lines minus engineering lists). Unchanged: :270, :301, :336-343, :370, :408, :551, :644-665, :681, PARITY. Every plantEvidence fixture needs the writer change.
- plan-prep `--dry-run` with an engineering list prints `in-plan-engineering-<id>` and `--template …lens-engineering.md`.

#### ORDER
1. 438 lands (task-430 launched before it and owes nothing).
2. 431 is re-prepped after 438 lands, then lands; it carries the de-dup.

#### LANDING
Protected paths (rule-lists.json:22), so a two-commit close (check-lane-close.mjs:740, 137_mcqueue.md:138):
1. Commit 1: the template, README, code, fixture writer, tests, the Spec 08 note (Spec-diff trailer), the regenerated page with its Files entry, task notes.
2. Commit 2: the close records.

#### ACCEPTANCE
- `plan-prep review --dry-run` for a task resolving eng-all prints one engineering job and the compliance jobs for the other lists.
- The close and the gate require `out-`/`plan-engineering-<id>` and refuse the compliance name.
- T1 to T5 are green.
- `rule-lists.mjs validate` is ok and `page --check` is current after the page is regenerated.

#### NOT IN SCOPE
- The 431 sections.
- Dropping the four surface specs (task-439).
- Tests that mirror the rules (tasks 367, 441, 442).
- The `compliance:` reference labels (rule-lists.mjs:487).
- Renaming the generated page.
- Spec 08 section 5.1's seat table.

#### UNVERIFIED
- The red and green state of every test above (nothing was run at plan time).

#### ESTIMATE (GUESS)
About 40 code lines plus an 83-line template, one dated note and a regenerated page; half a day of Opus build.

Files: .claude/review-templates/lens-engineering.md, .claude/review-templates/README.md, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/review-templates.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/reviews/task-375/plant-evidence.mjs, docs/specs/00-architecture/08_agents.md

Plan review round 1: 52 folded, 0 task, 0 ruling, 0 wontfix, 17 pile; grounder docs/reports/reviews/task-438/GROUNDER-PLAN.md; triage docs/reports/reviews/task-438/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 MED folded Spec 137 rule 10 and
plan-compliance-agents-s5-1to3#3 MED folded No de-dup line here:
plan-compliance-agents-s5-1to3#4 MED folded The form is chosen p
plan-compliance-agents-s7-s11#1 MED folded No de-dup line here:
plan-compliance-agents-s7-s11#2 MED folded No de-dup line here:
plan-compliance-agents-s7-s11#3 MED folded it is re-prepped aft
plan-compliance-agents-s7-s11#4 MED folded so no closed lane is
plan-compliance-eng-all#1 MED folded No de-dup line here:
plan-compliance-eng-all#2 MED folded No de-dup line here:
plan-compliance-eng-all#3 MED folded Spec 137 rule 10 and
plan-compliance-five-words#1 MED folded No de-dup line here:
plan-compliance-inc-S#1 MED folded No de-dup line here:
plan-compliance-inc-S#2 MED folded This is a deliberate
plan-compliance-ms-S#1 MED folded No de-dup line here:
plan-compliance-ms-S#2 MED folded This is a deliberate
plan-compliance-ms-S#4 MED folded No de-dup line here:
plan-compliance-orchestrator-doc17#1 MED folded No de-dup line here:
plan-compliance-orchestrator-doc17#3 MED folded Spec 137 rule 10 and
plan-compliance-orchestrator-doc17#4 MED folded This is a deliberate
plan-compliance-plan-protocol#1 MED folded No de-dup line here:
plan-compliance-plan-protocol#2 MED folded No de-dup line here:
plan-compliance-plan-protocol#4 MED folded Spec 137 rule 10 and
plan-compliance-plan-protocol#5 MED folded This is a deliberate
plan-compliance-plan-protocol#6 MED folded one call per seat wi
plan-compliance-queue-137#1 MED folded No de-dup line here:
plan-compliance-queue-137#2 MED folded Spec 137 rule 10 and
plan-compliance-queue-137#3 MED folded so no closed lane is
plan-error-paths#4 MED folded it is re-prepped aft
plan-plan-review-deepseek#1 MED folded one call per seat wi
plan-plan-review-deepseek#2 MED folded No de-dup line here:
plan-plan-review-deepseek#4 MED folded No de-dup line here:
plan-plan-review-deepseek#8 MED folded 438 itself and 20 ot
plan-plan-review-deepseek#9 MED folded task-430 (BL-HB430, 
ig#1 HIGH folded The path adds no rul
ig#2 MED folded That infra test is l
ig#3 HIGH folded This is a deliberate
ig#4 MED folded it is re-prepped aft
ig#5 MED folded Spec 137 rule 10 and
ig#6 MED folded its joined-run claus
rc#1 HIGH folded It is a seat of its 
rc#2 MED folded (Rules met and its p
rc#3 MED folded No de-dup line here:
rc#4 MED folded folded at head 34fe2
rg#1 HIGH folded Changed: :398-403 (e
rg#2 MED folded (f) No engineering l
rg#3 MED folded The form is chosen p
rg#4 MED folded (RR-0385 item 2 on t

## Implementation Notes
2026-11-22 taken on the board at lane launch (lane BL-ENG438, worktree /Users/brettpreston_macmini/Buildo-wt-eng438, branch wf1/inc1b-eng438), RR-0240

2026-11-22 BL-ENG438 build: tests T1 to T5 written first (review-templates, rule-lists, check-lane-close, backlog-lane logic tests); red proven by a commit attempt with only the tests and this task file staged (red.out in the lane dir).

2026-11-22 BL-ENG438 build: lens-engineering.md (the plan's TEMPLATE line changes on a copy of lens-compliance.md, which is not edited), README row and two sentences, seatOf and ENG_FILE in rule-lists.mjs with plan-prep routing by seat, per-seat proof in check-lane-close.mjs (close split when the range base holds lens-engineering.md; launch gate always split, no alias), per-seat lens line in backlog-lane.mjs, plant-evidence.mjs by seat, one dated note in 08_agents.md after section 7 rule 4, rule-lists-by-kind.md regenerated (page --write) and added to the description Files line.

2026-11-22 BL-ENG438 acceptance on real inputs (work commit 8745ee6dc):
(1) plan-prep review --dry-run --task task-267 (WAITS build, resolves eng-all) --board ~/Buildo-wt-board: exit 0, board status unchanged; 18 lens-input lines, 1 engineering ('--list eng-all ... --out docs/reports/reviews/task-267/in-plan-engineering-eng-all --template .../lens-engineering.md'), 17 compliance; 1 review line on lens-engineering.md ('review docs/reports/reviews/task-267/in-plan-engineering-eng-all[-pN].txt --template .claude/review-templates/lens-engineering.md'), 17 on lens-compliance.md.
(2) launch gate on task-431's real plan evidence (plan-compliance-eng-all.txt at the board head), template present: 'task-431: list eng-all (docs/specs/00_engineering_standards.md) has no valid engineering lens output in docs/reports/reviews/task-431/: write plan-engineering-eng-all.txt'. Close on task-437's real lane records (out-compliance-eng-all.txt) with a base holding lens-engineering.md: 'task-437: list eng-all (docs/specs/00_engineering_standards.md) has no valid engineering lens output in docs/reports/lanes/<date>/BL-ROUNDS437/: write out-engineering-eng-all.txt'; with a base without it: 0 refusals about eng-all (the cut-over).
(3) T1 to T5: red attempt refused at 15 assertions ('Tests 15 failed | 330 passed (345)'); work commit hook 'Test Files 4 passed (4)', 'Tests 345 passed (345)'.
(4) 'rule-lists: ok 55 lists, 23 rows'; 'rule-lists: docs/reports/generated/rule-lists-by-kind.md is current'.
Full suite: UNVERIFIED (push station only).

## References
- docs/reports/reviews/task-438/GROUNDER-PLAN.md
- docs/reports/reviews/task-438/TRIAGE-PLAN.md
- docs/reports/reviews/task-438/seat-integration-1.md
- docs/reports/reviews/task-438/seat-reality-check-1.md
- docs/reports/reviews/task-438/seat-regression-1.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:orchestrator-doc17 backlog/docs/doc-17 - Orchestrator-readings-not-rulings.md
- compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

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
- RR-0359 Nothing is folded before the grounder has ruled
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
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules — "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1865)
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
- RR-0141 Operator: Q-LT-1
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0147 Operator answer NAME-1
- RR-0149 Increment 1·A tooling location
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
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules (names RR-0380) — "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1865)
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped (names task-438) — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)

## Prior reviews and lane reports
### task-438 (this task)
- docs/reports/reviews/task-438/FINDINGS-PLAN.md
- docs/reports/reviews/task-438/FOLD-CHECK.md
- docs/reports/reviews/task-438/GROUNDER-PLAN.md
- docs/reports/reviews/task-438/QUESTIONS-RULED.md
- docs/reports/reviews/task-438/TRIAGE-PLAN.md
- docs/reports/reviews/task-438/seat-integration-1.md
- docs/reports/reviews/task-438/seat-reality-check-1.md
- docs/reports/reviews/task-438/seat-regression-1.md

## Dependencies
- (none)
