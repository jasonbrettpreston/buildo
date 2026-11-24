---
id: TASK-433
title: >-
  INPUTS.5 A rules-checked line: the reviewer lists the rule ids it judged met
  and a script flags a rule never mentioned
status: BUILT
assignee:
  - '@lane-BL-MET433'
created_date: '2026-11-22T16:25:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix V2
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-433/GROUNDER-PLAN.md
  - docs/reports/reviews/task-433/TRIAGE-PLAN.md
  - docs/reports/reviews/task-433/seat-integration-1.md
  - docs/reports/reviews/task-433/seat-reality-check-1.md
  - docs/reports/reviews/task-433/seat-regression-1.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-22/BL-MET433/REPORT.md
  - docs/reports/lanes/2026-11-22/BL-MET433/GROUNDER.md
  - docs/reports/lanes/2026-11-22/BL-MET433/TRIAGE.md
type: build
ordinal: 133012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. THIS TASK (step 6, B): the compliance template asks for one closing line of the rule ids judged met; a small script lists rule ids of the sent handbook that appear neither in a finding nor in that line. No verdict per rule.

Files: .claude/review-templates/lens-compliance.md, scripts/analysis/rule-lists.mjs, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts
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
# PLAN-433-v1: task-433 INPUTS.5, a rules-checked line and a report of the rule ids never mentioned

Principles served (DoD #9): observable (a rule nobody mentioned becomes visible), accurate (the grounder sees what the reviewer did not touch), simple (one line, one subcommand, a report not a gate), scalable (one id list per rule document, no per-rule verdicts).

## BASIS
- "Let's add a dn b to the plan - we already do run the review twice - once on the plan and the output." (RR-0378, decision-163, MORNING-DECISIONS.md:1850-1852). Step 6 as put to him: "(B) A 'rules checked' line: the reviewer lists the rule ids it judged met, and a script flags any rule never mentioned."
- On per-rule verdicts: "we cant get a response on every rule - that would seem like too much" (the operator's words in the session of 2026-11-22, relayed by the orchestrator: no ruling file holds them, so there is no file:line; the recorded ruling is RR-0378 step 6). So the line names ids met, no verdict per rule, and the script is a report.
- "Nothing was added that the card or ruling did not name" (124a_step_standard_policy_appendix.md:988): the card names the template line and a script that lists unmentioned ids, nothing else.
- Tests first (08_agents.md:462, :490); status line with the work (137_mcqueue.md:84).

## FACTS (code)
1. Template: .claude/review-templates/lens-compliance.md:68-73 ends with `VERDICT: PASS or FAIL on compliance with the pasted clauses` and `Clauses checked: <n>   Unmet: <n>`. This is the existing "count of clauses checked"; real outputs end the same way (docs/reports/lanes/2026-11-21/BL-SIMPLE423/out-compliance-eng-all-p2.txt: "Clauses checked: 14   Unmet: 1"; out-compliance-queue-137-p1.txt: "Clauses checked: 10   Unmet: 3"), followed by the tool's `---` and timing trailer. Nothing in scripts/, src/ or .claude parses "Clauses checked" (grep: only the template). The format forms (:57-64) already allow up to 8 MET lines (clause ref free-form).
2. The review tool reads the template and fills the placeholders (scripts/deepseek-review.js:155-175; `splitTemplate`/`substitutePlaceholders`, review-template.js:34-70). It prints the REVIEW header with prompt_sha256 over [system, user] and the model text; it never parses the model output. No change there.
3. What parses outputs: `FINDING_LINE` = start of line `BUG|DEFER severity=` (rule-lists.mjs:301), the loose count (:299), `findingsIn` (:304-312); the close's `REVIEW` header regex (check-lane-close.mjs:56, read from the first 15 lines :60), `/^VERDICT:/m` (:73), the grounder's `Ruled: <name> sha256 findings:<n>` (rule-lists.mjs:191). A line starting `Rules met:` matches none of them.
4. Tests that pin the template: src/tests/backlog/review-templates.logic.test.ts:10-15 (exactly one {{PLAN}}), src/tests/review-lens-template.infra.test.ts:67,102-123 (system/user split, material once, header names the template); check-lane-close.logic.test.ts:32-34 and backlog-lane.logic.test.ts read the live template text, so hashes follow the edit. None pins the ending text.
5. Rule ids exist as the bold id that starts a list line: Spec 136 `- **fe.01**` (136_mcfrontend_handbook.md:34, fe.01..fe.44; citation form :7); Spec 132 `- **core.1**` (132_step_standard_handbook.md:126; also ingestor.N, link.N, x-captures.N, history.N ...); Spec 133 `- **m.431**`, `- **lc.N**` (133_bylaw_handbook.md:34). No ids: the glossary (`- **slug**:`, 132:627, list five-words), and every hand-written document (queue-137, agents-s7-s11, orchestrator-doc17, plan-protocol, eng-all, increments, milestones; rule-lists.json). Their lines are not ids and must not be invented. Census (DRIVEN at the board head over the 52 files of the lists in rule-lists.json, list lines whose first bold token is letters, a dot and digits): 69 lines in Spec 132 (28 more bold glossary lines carry no id), 546 in Spec 133 (all of its 546 bold list lines), 44 in Spec 136, none in any other file; the bold list lines of the hand-written documents are labels such as Rule: or Execution: (149 in eng-all), not ids; Spec 132 section 6 is a table with no bold list lines. The existing rule maps (scripts/steps/_schema/rule-map.json, scripts/analysis/bylaw/_schema/bylaw-rule-map.json, scripts/surfaces/_schema/surface-rule-map.json) hold ids of those three handbooks only, in three shapes and not by the sections sent; the sent text is the one source that is also what the reviewer saw, so the pattern reads it.
6. The sent list part is recoverable from the committed input: `parseLensInput(text).listPart` (rule-lists.mjs:452-465); the input sits beside the output as `in-<output name>` (backlog-lane.mjs:185, check-lane-close.mjs:399).
7. A subcommand fits: rule-lists.mjs already holds `findings --dir` (:840-843, `findingsReport` :547-550) and has a usage line (:845) and a regex-escape helper `reEsc`.

## WHAT
(1) The reviewer's output ends with one more line `Rules met: <ids>`. (2) `node scripts/analysis/rule-lists.mjs unmentioned --out <output file> [--in <input file>]` prints the rule ids of the sent list part that appear in neither a finding nor that line. A REPORT FOR THE GROUNDER, NOT A GATE: it always exits 0 when it ran, refuses nothing, and nothing in the close, the launch gate or a hook reads it. Making it a gate is a later decision (see questions).

Rule: "mentioned" = the id appears anywhere in the output text (a finding, a MET or REJECT line, or the Rules met line). The card says "appear neither in a finding nor in that line"; a MET or REJECT line is an explicit judgement of that rule, so it counts (Q2).

## EXACT EDITS
1. .claude/review-templates/lens-compliance.md, the closing block (:68-73) becomes:
```
VERDICT: PASS or FAIL on compliance with the pasted clauses
Clauses checked: <n>   Unmet: <n>
Rules met: <rule ids, comma separated>
```
 plus one sentence under it: "The last line names by id the rules of the pasted list you judged met and raised no finding on. A rule id is the bold id that starts a line of the pasted rule list (for example fe.12, core.3, m.431). Write only ids that appear in the pasted list, ids only, on one line. If the pasted list has no such ids, or none was met, write `Rules met: none`. Never invent an id." Companion sentence in the anti-patterns: none added.
2. scripts/analysis/rule-lists.mjs (protected path):
 - `export function unmentionedRules(inputText, outputText)` returns `{ids, missing, hasLine}`. ids = the matches of `/^\s*[-*]\s+\*\*([a-z][a-z0-9-]*\.\d+)\*\*/gm` in `parseLensInput(inputText).listPart`, in order, unique. A throw "not a lens input" when parseLensInput gives null. Mention test per id: `(?<![\w.-])<id>(?![\w-]|\.\d)` over the output text, the id escaped with reEsc (rule-lists.mjs:565) so its dot is literal (so fe.1 is not covered by fe.12, and feX01 does not cover fe.01; one more control). hasLine = `/^Rules met:/m`.
 - CLI branch `unmentioned` (next to `findings`, :840): `--out` required (exit 2 usage), `--in` default `<dir of --out>/in-<basename of --out>`; unreadable file or not a lens input: exit 1 with the reason. Prints one line:
   `<out name>: list <id> part <i> of <n>: <k> of <m> rule ids are in no finding and not in the Rules met line: <ids>` (`none` when k=0); when the part has no ids: `<out name>: the sent list part holds no rule ids, nothing to report`; when the output has no Rules met line, append ` [no "Rules met:" line in the output]`. Exit 0.
 - the usage string (:845) adds `unmentioned`.
3. .claude/review-templates/README.md (lens section): two sentences: the Rules met line; the `unmentioned` report, "a report, not a gate", read per output file: the -pN chunks of one list part each carry that whole part, so an id is unmentioned only if every chunk's report lists it (a union is by hand; code for it stays out of scope).
4. NOT edited: deepseek-review.js (no parsing of the output), check-lane-close.mjs, review-template.js, the rule-lists table.

## TESTS (red first; each plant has a control)
In src/tests/backlog/rule-lists.logic.test.ts (CLI pattern at :318; inputs rendered with the exported `renderLensInput`):
- T1 plant: list part with `- **fe.01**`, `- **fe.02**`, `- **fe.03**`, `- **fe.12**`; output with a BUG line naming fe.02 and `Rules met: fe.01, fe.12`; the command prints exactly fe.03. RED now (no such subcommand).
Controls: (a) all ids mentioned: prints `none` and exits 0; (b) list holds fe.1 and fe.12, the line names only fe.12: fe.1 is reported (boundary); (c) a REJECT line naming the id counts as a mention; (d) the output without a Rules met line: the note appears and ids absent from findings are listed; (e) a list part with no ids (the glossary form `- **slug**:`) prints "holds no rule ids", no invented ids.
- T2 plant: flagged ids still exit 0 (a report, not a gate). Controls: missing --out exits 2; a file that is not a lens input exits 1; `--in` default resolves `in-<name>` beside the output.
In src/tests/backlog/review-templates.logic.test.ts:
- T3 plant: lens-compliance.md holds a `Rules met:` line after `Clauses checked:` in the closing block. RED now. Controls: the other four lens templates do not hold it; the single {{PLAN}} test (:10-15) stays green.
In src/tests/backlog/rule-lists.logic.test.ts (check-lane-close.logic.test.ts is not edited: the card names five files):
- T4 (parsers unchanged, so T4 is a green-both lock, not red: 08_agents.md:485): an output ending with the Rules met line and then the tool's trailer (--- and the timing lines) gives the same `findingsIn` and `looseFindingCount` as one without. Control: the strict and the loose counts agree on both.
Live check (not a test; a DeepSeek call, so the orchestrator's, not run here): one lens run on a Spec 136 input shows the line and ids that exist in the list; recorded in the task notes.

## ORDER
T1-T3 red (T4 is run beside them as a green-both lock); template edit (T3 green); rule-lists.mjs function and CLI (T1, T2 green); README; live check; base-copy compliance outputs after the last in-range commit (the other four lens templates are unchanged and are used as briefed); commit. Estimate (GUESS, no measure for this card): one lane sitting, the five files of the Files line, no model call in the build; the lane's own compliance outputs are the main cost.

## LANDING
- Protected path touched: scripts/analysis/rule-lists.mjs (scripts/analysis/rule-lists.json protected_paths). The close check refuses a commit that changes a protected path AND moves a task to finished (check-lane-close.mjs:32, :739-740). So: commit 1 is the work (template, rule-lists.mjs, README, tests, task notes); commit 2 is the closing commit with records and the status only. The template, README and tests are not protected.
- Template change and hashes: it changes the prompt hash of outputs made after it. Two caveats beyond "future outputs only": (a) the plan gate recomputes plan-compliance hashes with the template at the BOARD HEAD (check-lane-close.mjs:631 `readBase: i.readRepo`, doc :597), so plan evidence already committed for a not-yet-launched task is refused until its compliance plan outputs are re-made; land this after the pending launches, or accept re-making. (b) The close recomputes with the template at the range base, the merge-base with the board (check-lane-close.mjs:748-751, :764; the launch commit until the board is merged into the lane); a lane launched before this lands must not merge the board's template before making its outputs (this contradicts the retro's "merge once before outputs", GROUNDED-CAPS.md:163). Lanes launched after it are unaffected. This lane edits the template itself, so its own out-compliance outputs are made with the BASE copy of the template: `git show $(git merge-base HEAD wf2/board):.claude/review-templates/lens-compliance.md > <lane dir>/lens-compliance.md` (outside the repo: <lane dir> in these two commands is a scratch folder such as ~/Buildo-scratch/<lane>/, not the report folder docs/reports/lanes/<date>/<lane>/ of the brief's commands; same file name, because the close compares only the header's template name, check-lane-close.mjs:59-61, and deepseek-review.js:161 prints the basename). The copy is passed as `--template <lane dir>/lens-compliance.md` to both `lens-input` and the review command in place of the repo path. The lane's compliance outputs therefore carry no `Rules met:` line. The live check (acceptance 4) is a separate run on the edited template by the orchestrator. If the board is merged into the lane, take the copy again from the new merge-base and re-make the outputs. (Ruled by the separate grounder Cairn-Ground-Q433; operator RR-0381 "approved. fix it".)
- Concurrency: task-431 edits rule-lists.json (the table); task-431's Files line holds rule-lists.json, rule-lists.logic.test.ts and the generated page, not rule-lists.mjs (DRIVEN at the board head), so there is no merge risk in rule-lists.mjs; rule-lists.logic.test.ts is edited by both cards in different regions, and README.md by this card and task-432, see Q4.

## ACCEPTANCE
1. T1-T3 red then green with controls; T4 green before and after.
2. The template ends with the Rules met line and its sentence; hashes in the check-lane-close and lane tests follow (they read the live template).
3. `unmentioned` prints the right ids on a hand-made pair and is documented as a report.
4. One live review shows the line (orchestrator).
5. DoD 1-10, STATUS line.

## NOT IN SCOPE
A gate on the report; a verdict per rule; ids for hand-written documents; validating that the ids named in the line exist in the list (an invented id is not flagged); a union across chunks of one list part; a `--dir` mode; a change to deepseek-review.js; the Spec 08 or Spec 137 text.

## QUESTIONS RULED by the plan grounder (docs/reports/reviews/task-433/QUESTIONS-RULED.md; none left for the operator)
Q1 RULED A, by the rules (decision-163 line 11, RR-0378 step 6: a script that flags a rule never mentioned; 124a_step_standard_policy_appendix.md:992: no scope the card or ruling did not name): a document with no rule ids gets Rules met: none and the report says the part holds no rule ids; nothing is invented. B (headings as ids) names a unit no rule has; C is a later card, not this one. DRIVEN census in FACTS 5: id-headed list lines exist only in Specs 132, 133 and 136.
Q2 RULED A: any mention counts. RR-0378 step 6 says the script flags a rule never mentioned (decision-163 line 11); the template's own Forms (lens-compliance.md:57-63) make MET and REJECT lines of the output, so a rule the reviewer judged on either is not never mentioned; the card's two-place wording is the orchestrator's paraphrase. B would flag ids the reviewer named.
Q3 RULED report only: a gate is a change to check-lane-close.mjs, a protected path (rule-lists.json:22) the card does not name (124a_step_standard_policy_appendix.md:992), and the operator's words in BASIS refuse a response on every rule; model compliance with the line is unmeasured. A gate is a card of its own after the live check.
Q4 RULED: no wait, nothing is stranded today (DRIVEN: plan evidence in docs/reports/reviews is held only by task-432, already launched, and this card; task-431 has none yet). Order with the cards that edit the same files: task-432 (launched first, RUNNING; edits backlog-brief.mjs, backlog-lane.mjs, README.md and two tests) lands first and this card lands after it; a lane launched before this card lands (task-432) must not merge the board's template before making its outputs (caveat (b)). Task-431's plan outputs, if made before this card lands and not yet launched, are re-made by the orchestrator (caveat (a)); this card launches before task-431 lands (task-431 changes the table the plan gate reads). README.md and rule-lists.logic.test.ts are edited by the three cards in different regions.

## UNVERIFIED
- That DeepSeek writes the line reliably and with real ids (no model calls here).
- The line's length on a large list part; the room for it is computed by lens-input from the template text (rule-lists.mjs:425) so it grows only by about 500 characters.
- Which board tasks hold plan evidence not yet launched (the re-make cost): none today, see Q4 (DRIVEN).
- The id pattern fits every generated handbook line (checked on 132, 133, 136 by listing the bold ids; no other bold-id form was seen in the listed sections; 132 section 6 and 133 section 3 were not read line by line then; the census in FACTS 5 covers them whole).

Files: .claude/review-templates/lens-compliance.md, scripts/analysis/rule-lists.mjs, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts

Plan review round 1: 24 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder docs/reports/reviews/task-433/GROUNDER-PLAN.md; triage docs/reports/reviews/task-433/TRIAGE-PLAN.md
plan-compliance-agents-s7-s11#3 MED folded Q1 RULED A, by the r
plan-compliance-agents-s7-s11#4 MED folded Census (DRIVEN at th
plan-compliance-plan-protocol#2 MED folded Q1 RULED A, by the r
ig#1 HIGH folded its own out-complian
rg#1 HIGH folded its own out-complian
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-22 taken on the board at lane launch (lane BL-MET433, worktree /Users/brettpreston_macmini/Buildo-wt-met433, branch wf1/inc1b-met433), RR-0240

2026-11-22 lane BL-MET433: tests T1-T4 written first (rule-lists.logic.test.ts, review-templates.logic.test.ts); red attempt next

2026-11-22 lane BL-MET433: red proven (8 failing assertions, red.out); template, unmentioned subcommand, README built

ACCEPTANCE (lane BL-MET433, 2026-11-22, commit 5559f1d21). 1: red.out = 8 failing assertions before the build (rule-lists.logic.test.ts, review-templates.logic.test.ts), then the real hooks green, 259 tests passed, commit.out. 2: lens-compliance.md closing block now ends: VERDICT line, 'Clauses checked: <n>   Unmet: <n>', 'Rules met: <rule ids, comma separated>' plus the sentence on ids/none/never invent. 3 on the real Spec 136 list (44 ids) with a hand-made output (finding fe.02, Rules met: fe.01, fe.03, fe.04): out-compliance-surface-136.txt: list surface-136 part 1 of 1: 40 of 44 rule ids are in no finding and not in the Rules met line: fe.05, fe.06, fe.07, fe.08, fe.09, fe.10, fe.11, fe.12, fe.13, fe.14, f ... [list cut]; on the five-words list (no ids): out-compliance-five-words.txt: the sent list part holds no rule ids, nothing to report; no --out: usage, exit 2; all other runs exit 0. 4: orchestrator's (live review), not run.

2026-11-22 lane BL-MET433: output round 1 done (11 outputs, 41 findings, FINDINGS.md untriaged); close check on a throwaway clone shows only the REPORT/GROUNDER refusals; grounder owed, task left RUNNING

2026-11-22 fix round 1 (grounder Cairn-Ground-O433, RR-0369): control (e) pinned string changed first, red attempt next

2026-11-22 fix 1 built: README:159/160, lens-compliance.md:76, rule-lists.mjs:864 printed line, test control (e) string and :1853 cite (F1, F2 and the grounder's optional wording items). Acceptance 4 (orchestrator, live, on the edited template at 5559f1d21): one live compliance review of the surface-136 list (44 ids) printed 'Rules met:' with 36 real ids and unmentioned printed '8 of 44 rule ids are in no finding and not in the Rules met line: fe.04, fe.12, fe.17, fe.21, fe.25, fe.26, fe.39, fe.44' (the 8 OWED rows of Spec 136); files in ~/Buildo-scratch/lanes-20261119/inc1b/met433-lane/live/; one run, n=1.

2026-11-22 output round 2 filed after fix 1 (06cfb3f23): 42 findings in 11 outputs (findings --dir), untriaged; grounder owed, task RUNNING

2026-11-22 close: round 1: 41 findings, 25 confirmed, the 8 MED fixed in 06cfb3f23, 17 piled; round 2: 42 findings, 14 piled (grounder Cairn-Ground-O433, GROUNDER.md and TRIAGE.md in docs/reports/lanes/2026-11-22/BL-MET433/, round 1 records in grounder-r1/). The acceptance note's old message text 'holds no rule ids' is now 'holds no name.N bullet rule ids (ids of another shape are not read)' (round 2 finding ms-S#4). RR-0381 proven through a whole close on a clone by the grounder (limit: base = board head); the --board read works from the lane sandbox, fresh content not yet proven (no board-only decision existed).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The compliance template now closes with a Rules met line, and rule-lists.mjs has an unmentioned subcommand that reports, for one review output and its input, the rule ids of the sent list part named nowhere in the output (a report, never a gate, exit 0). The README documents both; the tests were written first and proven red, and fix 06cfb3f23 closed the eight round 1 MED findings.

Output round 1 (grounder-r1 folder): 8 MED fixed in 06cfb3f23, 17 pile.

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 14 pile; grounder docs/reports/lanes/2026-11-22/BL-MET433/GROUNDER.md; triage docs/reports/lanes/2026-11-22/BL-MET433/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
