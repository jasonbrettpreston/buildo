# Review context for task-433 (no plan id) written 2026-11-22 by backlog-brief.mjs (round 1)

## Task
task-433 INPUTS.5 A rules-checked line: the reviewer lists the rule ids it judged met and a script flags a rule never mentioned
status: LATER · milestone: m-1 · assignee: none · labels: McFix, McFix V2

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. THIS TASK (step 6, B): the compliance template asks for one closing line of the rule ids judged met; a small script lists rule ids of the sent handbook that appear neither in a finding nor in that line. No verdict per rule.

Files: .claude/review-templates/lens-compliance.md, scripts/analysis/rule-lists.mjs, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts

## Acceptance criteria

## Implementation Plan
#### PLAN-433-v1: task-433 INPUTS.5, a rules-checked line and a report of the rule ids never mentioned

Principles served (DoD #9): observable (a rule nobody mentioned becomes visible), accurate (the grounder sees what the reviewer did not touch), simple (one line, one subcommand, a report not a gate), scalable (one id list per rule document, no per-rule verdicts).

#### BASIS
- "Let's add a dn b to the plan - we already do run the review twice - once on the plan and the output." (RR-0378, decision-163, MORNING-DECISIONS.md:1850-1852). Step 6 as put to him: "(B) A 'rules checked' line: the reviewer lists the rule ids it judged met, and a script flags any rule never mentioned."
- On per-rule verdicts: "we cant get a response on every rule - that would seem like too much". So the line names ids met, no verdict per rule, and the script is a report.
- "Nothing was added that the card or ruling did not name" (124a_step_standard_policy_appendix.md:988): the card names the template line and a script that lists unmentioned ids, nothing else.
- Tests first (08_agents.md:462, :490); status line with the work (137_mcqueue.md:84).

#### FACTS (code)
1. Template: .claude/review-templates/lens-compliance.md:68-73 ends with `VERDICT: PASS or FAIL on compliance with the pasted clauses` and `Clauses checked: <n>   Unmet: <n>`. This is the existing "count of clauses checked"; real outputs end the same way (docs/reports/lanes/2026-11-21/BL-SIMPLE423/out-compliance-eng-all-p2.txt: "Clauses checked: 14   Unmet: 1"; out-compliance-queue-137-p1.txt: "Clauses checked: 10   Unmet: 3"), followed by the tool's `---` and timing trailer. Nothing in scripts/, src/ or .claude parses "Clauses checked" (grep: only the template). The format forms (:57-64) already allow up to 8 MET lines (clause ref free-form).
2. The review tool reads the template and fills the placeholders (scripts/deepseek-review.js:155-175; `splitTemplate`/`substitutePlaceholders`, review-template.js:34-70). It prints the REVIEW header with prompt_sha256 over [system, user] and the model text; it never parses the model output. No change there.
3. What parses outputs: `FINDING_LINE` = start of line `BUG|DEFER severity=` (rule-lists.mjs:301), the loose count (:299), `findingsIn` (:304-312); the close's `REVIEW` header regex (check-lane-close.mjs:56, read from the first 15 lines :60), `/^VERDICT:/m` (:73), the grounder's `Ruled: <name> sha256 findings:<n>` (rule-lists.mjs:191). A line starting `Rules met:` matches none of them.
4. Tests that pin the template: src/tests/backlog/review-templates.logic.test.ts:10-15 (exactly one {{PLAN}}), src/tests/review-lens-template.infra.test.ts:67,102-123 (system/user split, material once, header names the template); check-lane-close.logic.test.ts:32-34 and backlog-lane.logic.test.ts read the live template text, so hashes follow the edit. None pins the ending text.
5. Rule ids exist as the bold id that starts a list line: Spec 136 `- **fe.01**` (136_mcfrontend_handbook.md:34, fe.01..fe.44; citation form :7); Spec 132 `- **core.1**` (132_step_standard_handbook.md:126; also ingestor.N, link.N, x-captures.N, history.N ...); Spec 133 `- **m.431**`, `- **lc.N**` (133_bylaw_handbook.md:34). No ids: the glossary (`- **slug**:`, 132:627, list five-words), and every hand-written document (queue-137, agents-s7-s11, orchestrator-doc17, plan-protocol, eng-all, increments, milestones; rule-lists.json). Their lines are not ids and must not be invented.
6. The sent list part is recoverable from the committed input: `parseLensInput(text).listPart` (rule-lists.mjs:452-465); the input sits beside the output as `in-<output name>` (backlog-lane.mjs:185, check-lane-close.mjs:399).
7. A subcommand fits: rule-lists.mjs already holds `findings --dir` (:840-843, `findingsReport` :547-550) and has a usage line (:845) and a regex-escape helper `reEsc`.

#### WHAT
(1) The reviewer's output ends with one more line `Rules met: <ids>`. (2) `node scripts/analysis/rule-lists.mjs unmentioned --out <output file> [--in <input file>]` prints the rule ids of the sent list part that appear in neither a finding nor that line. A REPORT FOR THE GROUNDER, NOT A GATE: it always exits 0 when it ran, refuses nothing, and nothing in the close, the launch gate or a hook reads it. Making it a gate is a later decision (see questions).

Rule: "mentioned" = the id appears anywhere in the output text (a finding, a MET or REJECT line, or the Rules met line). The card says "appear neither in a finding nor in that line"; a MET or REJECT line is an explicit judgement of that rule, so it counts (Q2).

#### EXACT EDITS
1. .claude/review-templates/lens-compliance.md, the closing block (:68-73) becomes:
```
VERDICT: PASS or FAIL on compliance with the pasted clauses
Clauses checked: <n>   Unmet: <n>
Rules met: <rule ids, comma separated>
```
 plus one sentence under it: "The last line names by id the rules of the pasted list you judged met and raised no finding on. A rule id is the bold id that starts a line of the pasted rule list (for example fe.12, core.3, m.431). Write only ids that appear in the pasted list, ids only, on one line. If the pasted list has no such ids, or none was met, write `Rules met: none`. Never invent an id." Companion sentence in the anti-patterns: none added.
2. scripts/analysis/rule-lists.mjs (protected path):
 - `export function unmentionedRules(inputText, outputText)` returns `{ids, missing, hasLine}`. ids = the matches of `/^\s*[-*]\s+\*\*([a-z][a-z0-9-]*\.\d+)\*\*/gm` in `parseLensInput(inputText).listPart`, in order, unique. A throw "not a lens input" when parseLensInput gives null. Mention test per id: `(?<![\w.-])<id>(?![\w-]|\.\d)` over the output text (so fe.1 is not covered by fe.12). hasLine = `/^Rules met:/m`.
 - CLI branch `unmentioned` (next to `findings`, :840): `--out` required (exit 2 usage), `--in` default `<dir of --out>/in-<basename of --out>`; unreadable file or not a lens input: exit 1 with the reason. Prints one line:
   `<out name>: list <id> part <i> of <n>: <k> of <m> rule ids are in no finding and not in the Rules met line: <ids>` (`none` when k=0); when the part has no ids: `<out name>: the sent list part holds no rule ids, nothing to report`; when the output has no Rules met line, append ` [no "Rules met:" line in the output]`. Exit 0.
 - the usage string (:845) adds `unmentioned`.
3. .claude/review-templates/README.md (lens section): two sentences: the Rules met line; the `unmentioned` report, "a report, not a gate".
4. NOT edited: deepseek-review.js (no parsing of the output), check-lane-close.mjs, review-template.js, the rule-lists table.

#### TESTS (red first; each plant has a control)
In src/tests/backlog/rule-lists.logic.test.ts (CLI pattern at :318; inputs rendered with the exported `renderLensInput`):
- T1 plant: list part with `- **fe.01**`, `- **fe.02**`, `- **fe.03**`, `- **fe.12**`; output with a BUG line naming fe.02 and `Rules met: fe.01, fe.12`; the command prints exactly fe.03. RED now (no such subcommand).
Controls: (a) all ids mentioned: prints `none` and exits 0; (b) list holds fe.1 and fe.12, the line names only fe.12: fe.1 is reported (boundary); (c) a REJECT line naming the id counts as a mention; (d) the output without a Rules met line: the note appears and ids absent from findings are listed; (e) a list part with no ids (the glossary form `- **slug**:`) prints "holds no rule ids", no invented ids.
- T2 plant: flagged ids still exit 0 (a report, not a gate). Controls: missing --out exits 2; a file that is not a lens input exits 1; `--in` default resolves `in-<name>` beside the output.
In src/tests/backlog/review-templates.logic.test.ts:
- T3 plant: lens-compliance.md holds a `Rules met:` line after `Clauses checked:` in the closing block. RED now. Controls: the other four lens templates do not hold it; the single {{PLAN}} test (:10-15) stays green.
In src/tests/backlog/rule-lists.logic.test.ts or check-lane-close.logic.test.ts:
- T4 (parsers unchanged): an output ending with the Rules met line gives the same `findingsIn` and `looseFindingCount` as one without; a scenario close with the extra line stays green. Control: the same output with the VERDICT line removed is still refused (:190 pattern).
Live check (not a test; a DeepSeek call, so the orchestrator's, not run here): one lens run on a Spec 136 input shows the line and ids that exist in the list; recorded in the task notes.

#### ORDER
T1-T4 red; template edit (T3, T4 green); rule-lists.mjs function and CLI (T1, T2 green); README; live check; base-copy compliance outputs after the last in-range commit (the other four lens templates are unchanged and are used as briefed); commit.

#### LANDING
- Protected path touched: scripts/analysis/rule-lists.mjs (scripts/analysis/rule-lists.json protected_paths). The close check refuses a commit that changes a protected path AND moves a task to finished (check-lane-close.mjs:32, :739-740). So: commit 1 is the work (template, rule-lists.mjs, README, tests, task notes); commit 2 is the closing commit with records and the status only. The template, README and tests are not protected.
- Template change and hashes: it changes the prompt hash of outputs made after it. Two caveats beyond "future outputs only": (a) the plan gate recomputes plan-compliance hashes with the template at the BOARD HEAD (check-lane-close.mjs:631 `readBase: i.readRepo`, doc :597), so plan evidence already committed for a not-yet-launched task is refused until its compliance plan outputs are re-made; land this after the pending launches, or accept re-making. (b) The close recomputes with the template at the range base, the launch commit (:764); a lane launched before this lands must not merge the board's template before making its outputs (this contradicts the retro's "merge once before outputs", GROUNDED-CAPS.md:163). Lanes launched after it are unaffected. This lane edits the template itself, so its own out-compliance outputs are made with the BASE copy of the template: `git show $(git merge-base HEAD wf2/board):.claude/review-templates/lens-compliance.md > <lane dir>/lens-compliance.md` (outside the repo, same file name, because the close compares only the header's template name, check-lane-close.mjs:59-61, and deepseek-review.js:161 prints the basename). The copy is passed as `--template <lane dir>/lens-compliance.md` to both `lens-input` and the review command in place of the repo path. The lane's compliance outputs therefore carry no `Rules met:` line. The live check (acceptance 4) is a separate run on the edited template by the orchestrator. If the board is merged into the lane, take the copy again from the new merge-base and re-make the outputs. (Ruled by the separate grounder Cairn-Ground-Q433; operator RR-0381 "approved. fix it".)
- Concurrency: task-431 edits rule-lists.json (the table); same-file merge risk only in rule-lists.mjs if it also edits it (UNVERIFIED).

#### ACCEPTANCE
1. T1-T4 red then green with controls.
2. The template ends with the Rules met line and its sentence; hashes in the check-lane-close and lane tests follow (they read the live template).
3. `unmentioned` prints the right ids on a hand-made pair and is documented as a report.
4. One live review shows the line (orchestrator).
5. DoD 1-10, STATUS line.

#### NOT IN SCOPE
A gate on the report; a verdict per rule; ids for hand-written documents; validating that the ids named in the line exist in the list (an invented id is not flagged); a union across chunks of one list part; a `--dir` mode; a change to deepseek-review.js; the Spec 08 or Spec 137 text.

#### OPEN QUESTIONS for the operator
Q1 Documents with no rule ids (queue-137, agents, doc-17, plan-protocol, eng-all, increments, milestones, glossary). (A, recommended) the line holds `none` and the report says "no rule ids"; nothing invented. (B) use section headings as ids: coverage for every document, but a heading is not a rule, and the sections sent to the reviewer are already cut by the table (rule-lists.json), so the unit is arbitrary. (C) later: give those documents rule lines (the engineering standards list is already planned in task-429..431).
Q2 Does a MET or REJECT line naming the id count as mentioned? (A, recommended) yes: any mention. (B) only BUG or DEFER lines and the Rules met line, as the card words it: more ids flagged, and the reviewer's own MET lines (at most 8 per output) are ignored.
Q3 Report only, or later a gate? Default report only (as ruled: no per-rule verdict). A gate would need a rate measured first: model compliance with the line is unmeasured (UNVERIFIED), and a long list (the 133 handbook has about 500 m.* ids) makes a long line.
Q4 Land before or after the pending plan launches (template change re-makes their compliance plan outputs)?

#### UNVERIFIED
- That DeepSeek writes the line reliably and with real ids (no model calls here).
- The line's length on a large list part; the room for it is computed by lens-input from the template text (rule-lists.mjs:425) so it grows only by about 500 characters.
- Which board tasks hold plan evidence not yet launched (the re-make cost).
- The id pattern fits every generated handbook line (checked on 132, 133, 136 by listing the bold ids; no other bold-id form was seen in the listed sections; 132 section 6 and 133 section 3 not checked line by line).

Files: .claude/review-templates/lens-compliance.md, scripts/analysis/rule-lists.mjs, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts

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
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed — "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1852)
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved) — "approved. fix it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1879)
- RR-0140 Operator: faster pushes and GOs asked
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
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed (names RR-0378) — "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1852)
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved) (names task-433, RR-0381) — "approved. fix it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1879)

## Prior reviews and lane reports
### task-433 (this task)
- (none)

## Dependencies
- (none)
