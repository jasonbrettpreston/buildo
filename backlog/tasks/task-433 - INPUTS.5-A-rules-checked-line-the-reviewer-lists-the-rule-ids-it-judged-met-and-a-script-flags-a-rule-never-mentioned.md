---
id: TASK-433
title: >-
  INPUTS.5 A rules-checked line: the reviewer lists the rule ids it judged met
  and a script flags a rule never mentioned
status: LATER
assignee: []
created_date: '2026-11-22T16:25:00Z'
updated_date: '2026-11-22T16:46:00Z'
labels:
  - McFix
  - McFix V2
milestone: m-1
dependencies: []
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
- On per-rule verdicts: "we cant get a response on every rule - that would seem like too much". So the line names ids met, no verdict per rule, and the script is a report.
- "Nothing was added that the card or ruling did not name" (124a_step_standard_policy_appendix.md:988): the card names the template line and a script that lists unmentioned ids, nothing else.
- Tests first (08_agents.md:462, :490); status line with the work (137_mcqueue.md:84).

## FACTS (code)
1. Template: .claude/review-templates/lens-compliance.md:68-73 ends with `VERDICT: PASS or FAIL on compliance with the pasted clauses` and `Clauses checked: <n>   Unmet: <n>`. This is the existing "count of clauses checked"; real outputs end the same way (docs/reports/lanes/2026-11-21/BL-SIMPLE423/out-compliance-eng-all-p2.txt: "Clauses checked: 14   Unmet: 1"; out-compliance-queue-137-p1.txt: "Clauses checked: 10   Unmet: 3"), followed by the tool's `---` and timing trailer. Nothing in scripts/, src/ or .claude parses "Clauses checked" (grep: only the template). The format forms (:57-64) already allow up to 8 MET lines (clause ref free-form).
2. The review tool reads the template and fills the placeholders (scripts/deepseek-review.js:155-175; `splitTemplate`/`substitutePlaceholders`, review-template.js:34-70). It prints the REVIEW header with prompt_sha256 over [system, user] and the model text; it never parses the model output. No change there.
3. What parses outputs: `FINDING_LINE` = start of line `BUG|DEFER severity=` (rule-lists.mjs:301), the loose count (:299), `findingsIn` (:304-312); the close's `REVIEW` header regex (check-lane-close.mjs:56, read from the first 15 lines :60), `/^VERDICT:/m` (:73), the grounder's `Ruled: <name> sha256 findings:<n>` (rule-lists.mjs:191). A line starting `Rules met:` matches none of them.
4. Tests that pin the template: src/tests/backlog/review-templates.logic.test.ts:10-15 (exactly one {{PLAN}}), src/tests/review-lens-template.infra.test.ts:67,102-123 (system/user split, material once, header names the template); check-lane-close.logic.test.ts:32-34 and backlog-lane.logic.test.ts read the live template text, so hashes follow the edit. None pins the ending text.
5. Rule ids exist as the bold id that starts a list line: Spec 136 `- **fe.01**` (136_mcfrontend_handbook.md:34, fe.01..fe.44; citation form :7); Spec 132 `- **core.1**` (132_step_standard_handbook.md:126; also ingestor.N, link.N, x-captures.N, history.N ...); Spec 133 `- **m.431**`, `- **lc.N**` (133_bylaw_handbook.md:34). No ids: the glossary (`- **slug**:`, 132:627, list five-words), and every hand-written document (queue-137, agents-s7-s11, orchestrator-doc17, plan-protocol, eng-all, increments, milestones; rule-lists.json). Their lines are not ids and must not be invented.
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
 - `export function unmentionedRules(inputText, outputText)` returns `{ids, missing, hasLine}`. ids = the matches of `/^\s*[-*]\s+\*\*([a-z][a-z0-9-]*\.\d+)\*\*/gm` in `parseLensInput(inputText).listPart`, in order, unique. A throw "not a lens input" when parseLensInput gives null. Mention test per id: `(?<![\w.-])<id>(?![\w-]|\.\d)` over the output text (so fe.1 is not covered by fe.12). hasLine = `/^Rules met:/m`.
 - CLI branch `unmentioned` (next to `findings`, :840): `--out` required (exit 2 usage), `--in` default `<dir of --out>/in-<basename of --out>`; unreadable file or not a lens input: exit 1 with the reason. Prints one line:
   `<out name>: list <id> part <i> of <n>: <k> of <m> rule ids are in no finding and not in the Rules met line: <ids>` (`none` when k=0); when the part has no ids: `<out name>: the sent list part holds no rule ids, nothing to report`; when the output has no Rules met line, append ` [no "Rules met:" line in the output]`. Exit 0.
 - the usage string (:845) adds `unmentioned`.
3. .claude/review-templates/README.md (lens section): two sentences: the Rules met line; the `unmentioned` report, "a report, not a gate".
4. NOT edited: deepseek-review.js (no parsing of the output), check-lane-close.mjs, review-template.js, the rule-lists table.

## TESTS (red first; each plant has a control)
In src/tests/backlog/rule-lists.logic.test.ts (CLI pattern at :318; inputs rendered with the exported `renderLensInput`):
- T1 plant: list part with `- **fe.01**`, `- **fe.02**`, `- **fe.03**`, `- **fe.12**`; output with a BUG line naming fe.02 and `Rules met: fe.01, fe.12`; the command prints exactly fe.03. RED now (no such subcommand).
Controls: (a) all ids mentioned: prints `none` and exits 0; (b) list holds fe.1 and fe.12, the line names only fe.12: fe.1 is reported (boundary); (c) a REJECT line naming the id counts as a mention; (d) the output without a Rules met line: the note appears and ids absent from findings are listed; (e) a list part with no ids (the glossary form `- **slug**:`) prints "holds no rule ids", no invented ids.
- T2 plant: flagged ids still exit 0 (a report, not a gate). Controls: missing --out exits 2; a file that is not a lens input exits 1; `--in` default resolves `in-<name>` beside the output.
In src/tests/backlog/review-templates.logic.test.ts:
- T3 plant: lens-compliance.md holds a `Rules met:` line after `Clauses checked:` in the closing block. RED now. Controls: the other four lens templates do not hold it; the single {{PLAN}} test (:10-15) stays green.
In src/tests/backlog/rule-lists.logic.test.ts or check-lane-close.logic.test.ts:
- T4 (parsers unchanged): an output ending with the Rules met line gives the same `findingsIn` and `looseFindingCount` as one without; a scenario close with the extra line stays green. Control: the same output with the VERDICT line removed is still refused (:190 pattern).
Live check (not a test; a DeepSeek call, so the orchestrator's, not run here): one lens run on a Spec 136 input shows the line and ids that exist in the list; recorded in the task notes.

## ORDER
T1-T4 red; template edit (T3, T4 green); rule-lists.mjs function and CLI (T1, T2 green); README; live check; base-copy compliance outputs after the last in-range commit (the other four lens templates are unchanged and are used as briefed); commit.

## LANDING
- Protected path touched: scripts/analysis/rule-lists.mjs (scripts/analysis/rule-lists.json protected_paths). The close check refuses a commit that changes a protected path AND moves a task to finished (check-lane-close.mjs:32, :739-740). So: commit 1 is the work (template, rule-lists.mjs, README, tests, task notes); commit 2 is the closing commit with records and the status only. The template, README and tests are not protected.
- Template change and hashes: it changes the prompt hash of outputs made after it. Two caveats beyond "future outputs only": (a) the plan gate recomputes plan-compliance hashes with the template at the BOARD HEAD (check-lane-close.mjs:631 `readBase: i.readRepo`, doc :597), so plan evidence already committed for a not-yet-launched task is refused until its compliance plan outputs are re-made; land this after the pending launches, or accept re-making. (b) The close recomputes with the template at the range base, the launch commit (:764); a lane launched before this lands must not merge the board's template before making its outputs (this contradicts the retro's "merge once before outputs", GROUNDED-CAPS.md:163). Lanes launched after it are unaffected. This lane edits the template itself, so its own out-compliance outputs are made with the BASE copy of the template: `git show $(git merge-base HEAD wf2/board):.claude/review-templates/lens-compliance.md > <lane dir>/lens-compliance.md` (outside the repo, same file name, because the close compares only the header's template name, check-lane-close.mjs:59-61, and deepseek-review.js:161 prints the basename). The copy is passed as `--template <lane dir>/lens-compliance.md` to both `lens-input` and the review command in place of the repo path. The lane's compliance outputs therefore carry no `Rules met:` line. The live check (acceptance 4) is a separate run on the edited template by the orchestrator. If the board is merged into the lane, take the copy again from the new merge-base and re-make the outputs. (Ruled by the separate grounder Cairn-Ground-Q433; operator RR-0381 "approved. fix it".)
- Concurrency: task-431 edits rule-lists.json (the table); same-file merge risk only in rule-lists.mjs if it also edits it (UNVERIFIED).

## ACCEPTANCE
1. T1-T4 red then green with controls.
2. The template ends with the Rules met line and its sentence; hashes in the check-lane-close and lane tests follow (they read the live template).
3. `unmentioned` prints the right ids on a hand-made pair and is documented as a report.
4. One live review shows the line (orchestrator).
5. DoD 1-10, STATUS line.

## NOT IN SCOPE
A gate on the report; a verdict per rule; ids for hand-written documents; validating that the ids named in the line exist in the list (an invented id is not flagged); a union across chunks of one list part; a `--dir` mode; a change to deepseek-review.js; the Spec 08 or Spec 137 text.

## OPEN QUESTIONS for the operator
Q1 Documents with no rule ids (queue-137, agents, doc-17, plan-protocol, eng-all, increments, milestones, glossary). (A, recommended) the line holds `none` and the report says "no rule ids"; nothing invented. (B) use section headings as ids: coverage for every document, but a heading is not a rule, and the sections sent to the reviewer are already cut by the table (rule-lists.json), so the unit is arbitrary. (C) later: give those documents rule lines (the engineering standards list is already planned in task-429..431).
Q2 Does a MET or REJECT line naming the id count as mentioned? (A, recommended) yes: any mention. (B) only BUG or DEFER lines and the Rules met line, as the card words it: more ids flagged, and the reviewer's own MET lines (at most 8 per output) are ignored.
Q3 Report only, or later a gate? Default report only (as ruled: no per-rule verdict). A gate would need a rate measured first: model compliance with the line is unmeasured (UNVERIFIED), and a long list (the 133 handbook has about 500 m.* ids) makes a long line.
Q4 Land before or after the pending plan launches (template change re-makes their compliance plan outputs)?

## UNVERIFIED
- That DeepSeek writes the line reliably and with real ids (no model calls here).
- The line's length on a large list part; the room for it is computed by lens-input from the template text (rule-lists.mjs:425) so it grows only by about 500 characters.
- Which board tasks hold plan evidence not yet launched (the re-make cost).
- The id pattern fits every generated handbook line (checked on 132, 133, 136 by listing the bold ids; no other bold-id form was seen in the listed sections; 132 section 6 and 133 section 3 not checked line by line).

Files: .claude/review-templates/lens-compliance.md, scripts/analysis/rule-lists.mjs, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts
<!-- SECTION:PLAN:END -->
