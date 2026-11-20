---
id: TASK-375
title: >-
  FIX.TOOLS Review and proof tooling: the lens line passes the rule context, the
  security lens fires for admin and PII, the review template substitutes safely,
  proof-slice reads its limits from settings (D11, D10, two review-tool defects)
status: RUNNING
assignee:
  - '@lane-BL-FIXTOOLS'
created_date: '2026-11-20T13:33:00Z'
updated_date: '2026-11-20T21:55:00Z'
labels:
  - McFix
  - McFix A
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-FIXTOOLS/REPORT.md
type: build
ordinal: 75012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and GROUNDER.md (task-368), on the handbook pass of the pushed 1·B change. Operator 2026-11-20 (verbatim): "essential we have a non compliance build again - the entire reason for this approach". Scope now: D11 scripts/analysis/backlog-lane.mjs:145 the plan lens commands carry no --context and :140 the security lens never fires for admin or PII (Spec 08 section 7 rule 4): fix both. scripts/lib/review-template.js:74-78 uses String.replace with the text as replacement (dollar sequences expand; tokens re-substituted); .claude/review-templates/lens-compliance.md:32 and :34 carry the plan placeholder twice so the material is sent twice: fix both. D10 scripts/analysis/proof-slice.mjs:21 and :132 a typed 120 s timeout and 16 MB buffer (Spec 132 core.8): read from tooling_ variables (scripts/seeds/logic_variables.json:9739 has tooling_spawn_max_buffer_mb). Waits on: task-366 (it edits backlog-lane.mjs and may already fix the review-template defects: take only what it left). Files: scripts/analysis/backlog-lane.mjs, scripts/lib/review-template.js, .claude/review-templates/lens-compliance.md, scripts/analysis/proof-slice.mjs
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each defect is confirmed on the head before fixing, with file:line
- [ ] #2 Tests red first, then green through the real hooks
- [ ] #3 Compliance lens run once per governing rule list with the list whole; a separate grounder verdict on file
- [ ] #4 A lens run on a file containing dollar sequences and placeholder tokens sends the text unchanged, once (test, red first)
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
# PLAN task-375 FIX.TOOLS (lane BL-FIXTOOLS)

## Confirmed on the head (8383e9e4c), by defect
- D10a buffer: scripts/analysis/proof-slice.mjs:132 `maxBuffer: 16 * 1024 * 1024` (literal). Variable exists: scripts/seeds/logic_variables.json:9759 tooling_spawn_max_buffer_mb (256, pinned), reader scripts/analysis/gates/variables.mjs gateVariable() used the same way at scripts/analysis/gates/net-new.mjs:155.
- D10b timeout: proof-slice.mjs:21 `DEFAULT_TIMEOUT_MS = 120000`. No registered tooling_ variable for it exists (grep of the seed: only tooling_spawn_max_buffer_mb, tooling_precommit_budget_*). Registering one needs a migration number claim in ~/Buildo-scratch/ids (outside this lane's write scope) plus a migration, seed row, registry doc and the control-panel key list. NOT done in this lane; listed as an owed item.
- D11a plan lens commands: scripts/analysis/backlog-lane.mjs lensLine, "Plan review lenses: ... each `${cmd} ${ctx} --template ...`" has no --context (the output lens commands in the same line do). Plan lenses see "(no pasted context provided)" (scripts/deepseek-review.js:189).
- D11b security lens never fires for admin or PII: the regex is scripts/analysis/rule-lists.mjs:128 `/entitlement|auth|stripe|metered/i` inside lensSet (shared with the close check). The brief forbids changing rule-lists.mjs. NOT fixed; listed.
- D11c review-template dollar expansion: ALREADY FIXED by task-366: scripts/lib/review-template.js:74-78 one pass with a function replacer; test src/tests/review-template.logic.test.ts:193-198.
- D11d lens-compliance.md placeholder twice: ALREADY FIXED by task-366: one {{PLAN}} (line 34) and one {{SPECS}} (line 39); test src/tests/review-lens-template.infra.test.ts:101-103.

## Changes (smallest; existing components)
1. proof-slice.mjs: import gateVariable from ./gates/variables.mjs; realIo().run uses `maxBuffer: gateVariable('tooling_spawn_max_buffer_mb') * 1024 * 1024`; export realIo (so a test can spawn a real child). One move: the child-output ceiling 16 MiB -> 256 MiB (the registered value, "the largest former literal, so no limit shrinks", seed description). No stored value or golden moves; a row that wrote more than 16 MiB used to fail with ENOBUFS and now passes.
2. backlog-lane.mjs lensLine: the plan lens clause gets ` --context <pasted-context file>` (same token the output lenses carry), with one sentence naming it. No other text moves.
## Tests (red first through the real hooks)
- src/tests/proof-slice.logic.test.ts: realIo().run of a child writing 20 MiB to stdout returns status 0 and a 20 MiB stdout; red now (ENOBUFS at 16 MiB). And no `16 * 1024 * 1024` literal in the runner source.
- src/tests/backlog/backlog-lane.logic.test.ts: the plan-lens segment of the lens line contains --context for every plan lens command; red now.
## Not touched
check-lane-close.mjs, rule-lists.mjs, rule-lists.json; operator items C1-C5, 48/44 px, the 60 s wait value.
## Operator/orchestrator items owed
(1) D10b timeout variable needs a migration number claim (outside write scope). (2) D11b security regex lives in rule-lists.mjs (forbidden to change here).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-FIXTOOLS, worktree /Users/brettpreston_macmini/Buildo-wt-fixtools, branch wf1/inc1b-fixtools), RR-0240

Grounder verdict 2026-11-20 (separate read-only agent, launched by the orchestrator): SAFE TO FOLD as a PARTIAL fix; folded onto wf2/board. Fixed: D10 buffer (proof-slice.mjs reads tooling_spawn_max_buffer_mb). STILL OPEN, task not done: D10 timeout DEFAULT_TIMEOUT_MS = 120000 typed (needs a migration number from the ID ledger, seed row, registry doc; operator typed GO for the DB); D11b security lens terms for admin and PII at scripts/analysis/rule-lists.mjs:128; the plan-lens --context token is a placeholder, not a path. The commit subject "proof runner tunables registered" overstates: one existing variable is read, none registered.

Retro review by a separate grounder 2026-11-20 (task-405), work as on the board: GROUNDER.md at ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-FIXTOOLS/GROUNDER.md (sha256 085db47ef2f6…, 67 findings: 26 CONFIRMED, 41 REJECTED). DEFECTS: (1) red.out and commit.out cited by the report are not in the repo; the recorded red is for the wrong reason. (2) D11a half fixed: the plan-lens --context value is the literal placeholder at scripts/analysis/backlog-lane.mjs:156 and its test pins the placeholder text; :177 passes a template as --context with no --template. (3) commit subject 'tunables registered' overstates: one existing variable read, none registered. (4) the seed tooling_spawn_max_buffer_mb description omits proof-slice.mjs; generated registry stale; no SPEC LINK. (5) a child cut at the ceiling reads 'killed by SIGTERM'; the ENOBUFS branch has no test. STILL OPEN, task stays RUNNING: D10b DEFAULT_TIMEOUT_MS = 120000 literal; D11b the security lens pattern in rule-lists.mjs misses admin and PII. Review tool (not this task): a timeout prints the partial answer twice; a trailing --template with no value silently degrades. Ten resolved lists have no output.

Grounder resolution 2026-11-20 (operator: "yes, ground it and resolve it. don't makr the task complete until it actually works.", MORNING-DECISIONS.md:1517) for D11a, to build AFTER task-410 folds (it edits the same functions: buildLensInputs, parseLensInput, the lens-input CLI, reviewErrors, the compliance block of closeErrors, lensLine): PROVEN: the reviewer's context slot held the placeholder in real runs (prompt_sha256 of three BL-V2WHOLE outputs recomputed with specs='(no pasted context provided)' matches their headers); at the output phase the reviewer sees no task text and no ruling. Rule: .claude/review-templates/lens-compliance.md:12 and :37 ('every operator ruling pasted in the context'); 08_agents.md:338; review-templates/README.md:115. Smallest change: (a) scripts/analysis/backlog-brief.mjs also writes docs/reports/reviews/<task>/pasted-<date>.md (task line, Description, acceptance criteria, decisions naming the task, Implementation Notes); (b) backlog-lane.mjs :156 names that real path and :177 passes --template and --context correctly; (c) rule-lists.mjs lens-input takes --context, refuses without it, stamps its sha256, and counts its size in the budget; (d) the close check refuses an input whose stamp lacks the context hash, whose pasted file is empty, the placeholder, or lacks the task's own Description, and recomputes prompt_sha256 against the REVIEW header. Acceptance on real inputs: the assembled prompt for a real task has 0 hits for the placeholder and at least one hit for a verbatim operator quote from the task. Files line must be extended for rule-lists.mjs, check-lane-close.mjs, backlog-brief.mjs and their tests. Still open in this task: D10b, D11b.

Operator 2026-11-20, verbatim (MORNING-DECISIONS.md entry 'Operator ORDERS the audit of the three tasks, the compliance documents on each task, and the update of task-375'): "Run the audit and add the compliance documents to each task. I want them labelled if possible to see if it actually get s done. UIpdate 375". ADDED TO THIS TASK on his word: the governing compliance documents (the rule lists the launch resolves from the Files line) are written onto each backlog task in backlog's own fields, with a visible label showing whether it was done. Orchestrator reading, not his words: the exact fields and label are to come from the audit grounder's recommendation against what backlog already has (documentation, references, labels); nothing is built until that is recorded here. Build order unchanged: after task-410 and task-399.

CORRECTION 2026-11-20 to the note above. Operator, verbatim (MORNING-DECISIONS.md entry 'Operator CORRECTS the reading of "labelled"'): "labelled means i need to know its a compliance document". So: each governing compliance document written onto a task is marked as a compliance document, distinct from the task's other references. The orchestrator's earlier reading (a label showing whether it was done) is withdrawn.

Operator 2026-11-20, verbatim: "approved" (MORNING-DECISIONS.md entry "Operator APPROVES items 0 to 8"; item 0: "Append the two final notes to tasks 399 and 375"). FINAL BUILD NOTE from the four-step audit (FOUR-STEP-AUDIT.md, round 2 folded; file NOTE-375.md), appended verbatim; where it differs from earlier text of this task, this note governs:
BUILD-READY 2026-11-20 (audit ~/Buildo-scratch/lanes-20261119/inc1b/retro/FOUR-STEP-AUDIT.md, round 2 folded). This task makes the scripts do what Spec 08 and the README already rule: 08_agents.md:341 (the lens runs with --context <pasted context>), .claude/review-templates/README.md:115 ("the pasted spec clauses, rulings and design text go in a separate --context file"), lens-compliance.md:12 and :37 ("every operator ruling pasted in the context"), and 08_agents.md:347 (the task's references point at the repo copy of the lane files). Operator, verbatim: "labelled means i need to know its a compliance document" (MORNING-DECISIONS.md, entry 'CORRECTS the reading of "labelled"'); MORNING-DECISIONS.md:1517 "don't makr the task complete until it actually works"; :1520 "you are probaley rebuilding stuff that already exists". Order: launch AFTER task-410 and task-399 are folded. Launch under a NEW lane name (the old worktree and branch of BL-FIXTOOLS exist and the launch refuses them, backlog-lane.mjs :70-72); release and relaunch are covered by his yes (MD:1517 entry). Other open lanes run their reviews AFTER this folds: outputs hashed over the placeholder are refused afterwards and there is no shim (RR-0328). A revert of this task has the same effect on lanes reviewed since; the final summary records the fold sha (DoD #7).
FILES line to set first, through the backlog CLI: scripts/analysis/backlog-lane.mjs, scripts/analysis/backlog-brief.mjs, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/deepseek-review.js, scripts/lib/review-template.js, .claude/review-templates/lens-compliance.md, scripts/analysis/proof-slice.mjs, and their tests under src/tests/ (backlog/*.logic.test.ts, proof-slice.logic.test.ts, review-template.logic.test.ts). Add the acceptance below with `backlog task edit task-375 --ac`.
SCOPE
A. The reviewer knows the task, from what exists (no new file, no second stamp):
 1. backlog-brief.mjs writes ONE more section in the existing context-<date>.md: "## Implementation Notes" (the task's notes, where rulings are recorded).
 2. The reviewer's context is these headings of that file only, with the exact heading texts: "Task", "Description", "Acceptance criteria", "Decisions naming this task", "Implementation Notes". One constant CONTEXT_SECTIONS in scripts/lib/review-template.js; extractSections moves there from deepseek-review.js:106-121 so the review tool, lens-input and the close check cut the same text. Not Milestone, Document sections or Prior reviews: the rule lists carry them. Measured on task-381's 15 resolved lists (v2whole rule-lists.mjs buildLensInputs, material = its 19,138-character diff): the whole context file (32,698 characters) raises the compliance calls from 17 to 38 (surface-135 alone 18 parts); a 78 KB context (task-267 size) gives 88 calls and one list refused; the five sections (2,126 characters) give 17 calls, none refused.
 3. backlog-lane.mjs lens line (:156, :177): every lens command, plan and output, passes --context <the committed context file> and one --section per constant entry. deepseek-review.js throws on a heading it cannot find (:111) and matches by substring, so a section cannot be dropped silently.
 4. rule-lists.mjs lens-input takes --context, refuses without it, and counts the selected sections in the room on both paths (with a list, and with no --list for code-review, error-paths, ux, security). check-lane-close.mjs lensContexts() (:133 at the 410 head) returns the selected text read from the committed context file, so the existing prompt_sha256 recompute (:65) binds it. Refuse a context that is the placeholder, lacks the Description, or lacks the Implementation Notes section when the task has notes.
 5. A build or fix task needs the compliance PLAN phase as well (:178 phases = both), Spec 08 section 7 rule 1 (:336 "both mandatory per WF").
 6. The context file is regenerated before each review round and committed with the round; every lens of a round reads that one file.
 7. Split smaller (operator, MORNING-DECISIONS.md entry 'AGREES the Rule 3 amendment and RULES on material too large to review': "or split smaller"): in splitUnits (rule-lists.mjs, the `subs.length === 0` throw, :297 at the 410 head) a block with no deeper heading is cut between table rows or blank-line paragraphs instead of being refused. Measured with the five-section context: with a 60,000-character material 3 of the 55 lists are refused today: surface-135 "## Register" 77,056 characters (46 table rows, longest 8,077), policy-124-s2-s5 section 5 (55,839), bylaw-133 "General / cross-cutting" (74 KB). The close recompute needs no change: it joins the stamped parts and compares them with the whole list, whitespace aside. A row or paragraph that alone passes the room is still refused naming it. Stated limit: a row is judged without its neighbours. Not built: a priority ranking of rules (nothing in the repo ranks rules: no priority field in rule-lists.json, the README lens table or lens-compliance.md) and a summary in place of a list (the generated handbooks five-words, step-132, bylaw-133 and surface-136 already ARE attached as summaries; replacing the whole Specs 126 and 135 by 136 was ruled the other way on 2026-11-20).
B. Compliance documents on the task, marked:
 1. Entry (field `references`, not `documentation`: backlog-brief.mjs:65-98 pastes every documentation entry into the context; no label): `compliance:<list id> <file>`, one per resolved list. The take step (backlog-lane.mjs take command, ~:108) adds them in the same `backlog task edit` with repeated --add-ref (backlog help: repeatable), only those not already on the task, so a re-take after the undo adds none twice.
 2. check-tasks (existing command) prints, for each open task whose compliance: entries differ from the resolved lists (verifyResolved first), the exact `backlog task edit task-N --add-ref ...` command; the orchestrator runs them once after this folds (check-tasks is in no hook today: grep). The close check refuses the closing task on the same difference.
 3. At close the task's references hold the repo copies of REPORT.md, GROUNDER.md and TRIAGE.md of the lane dir (08_agents.md:347); the close check refuses when one is missing.
C. Still open in this task, as already specified in its notes: D10b timeout variable (needs the operator's DB GO and an id claim); D11b the security regex at rule-lists.mjs:128 misses admin and PII (README.md :104 and lens-security.md:48 say they fire it).
NOT IN SCOPE: hunk-level split of one file's diff (the close recompute compares each chunk with the git diff of its paths: a new mechanism, needs the operator) and exempting generated golden before-images (a table row, own card, needs the operator); re-using unchanged chunks; dropping lists; a second pasted file or context stamp; a label; milestone_docs handling (verifyResolved already refuses an absent key); the V2L15 early-return change; any new script.
ACCEPTANCE on real inputs (run the commands, paste the output on this task; no figure is taken from a lane report): 0. In a lane worktree run the new backlog-brief.mjs for task-381 (the committed context file on wf1/inc1b-hooks3 has no Implementation Notes heading). 1. deepseek-review.js review <task-381 diff> --template .claude/review-templates/lens-compliance.md --context <that file> with the five --section flags and --dry-run: 0 hits of "(no pasted context provided)", at least 1 hit of "yes to all", the five heading lines present, prompt under 120000 characters. 2. rule-lists.mjs lens-input for each of the 15 resolved lists of task-381 with that context: paste the call counts (expected about 17, none refused), and the same for the contexts of task-410 and task-267. 3. Planted refusals: placeholder context; context without the Description; committed context edited after the review; compliance entries differing from the resolved lists; a missing report reference. 4. backlog task view task-381 --plain shows one compliance: entry per resolved list on the References line. 5. check-tasks prints the edit command for one stale open task. 6. The dollar-sequence and placeholder-once tests (AC #4) stay green. Each source file change in its own commit (protected paths); no task status move in them. Do not mark the task complete until 1 to 5 are on the task.
<!-- SECTION:NOTES:END -->
