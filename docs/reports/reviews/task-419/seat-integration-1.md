# Seat: integration — task-419 plan (PLAN-419-v1)
Board head checked: 0dd70437a (docs(137_mcqueue): board edits 2026-11-21 09:41), branch wf2/board.

### int#1 MED: "Checked-by ... clash() with lane or any assignee" refuses the only committed FOLD-CHECK form
Plan sentence: "Checked-by missing or clash() with lane or any assignee -> refusal (reuse clash, same rule as the grounder)".
Evidence:
- scripts/hooks/check-lane-close.mjs:51 nameKey strips every non-alphanumeric and a leading "bl". :52 clash is true when the shorter key is a substring of the longer one, with a minimum length of 3.
- :337-343 shows the grounder rule works because it compares a bare name taken from a "Grounder: <name>" line.
- docs/reports/reviews/task-412/FOLD-CHECK.md line 3 reads "Checked by: Cairn-Ground-P412, the separate plan grounder (not the lane BL-F412, not the orchestrator), on the board as ...".
What would go wrong: the plan does not say how the name is parsed. If the whole line after "Checked by:" goes through clash, this prose contains the lane key "f412", so a correct file is refused. Free body prose is also allowed ("Body free"). A grounder who writes the form the task-412 precedent shows would be blocked, or the gate would need a second parse rule that the plan does not specify.
Smallest correction: state that the name is the text after "Checked by:" up to the first comma, " (" or end of line. Then clash that token only, and add a planted test where the prose names the lane while the token does not.

### int#2 MED: 137_mcqueue.md:140 describes the launch check and becomes incomplete; the plan names no spec line
Plan sentence: "d. No edit to backlog-lane.mjs, the specs, or any committed evidence."
Evidence:
- docs/specs/00-architecture/137_mcqueue.md:140 (Dated note 2026-11-21, task-375) lists what the launch check proves: evidence folder, per-list plan outputs, GROUNDER-PLAN.md, the seat reports, an outcome per CONFIRMED or CONFLICT finding, the round block and "the Plan hash line".
- The same note has "WHAT THE GATE CANNOT PROVE: that the grounder or any seat ran or is a different agent ... forgery routes are owned by tasks 401 and 402".
- 08_agents.md:524 says only that the gate requires the seat lines in GROUNDER-PLAN.md, so it is not made false.
- plan-protocol.md has no GROUNDER-PLAN text (grep).
What would go wrong: after the change the check also requires a committed FOLD-CHECK.md with a named checker and PASS. The 137:140 enumeration then understates the gate. A behaviour change needs its spec line, and no spec line is named. The "cannot prove" paragraph also needs the fold-check limits that plan section 8 states.
Smallest correction: add a dated note after 137_mcqueue.md:140 in commit B, quoting RR-0352 "Let's resolve 1 and 2 now.". It should name FOLD-CHECK.md (Checked by, Verdict: PASS, last Plan line) and carry over the section 8 limits. Name the spec in the plan, and either add docs/specs/00-architecture/137_mcqueue.md to the Files line or say the note rides commit B.

### int#3 MED: nothing teaches the grounder the FOLD-CHECK form except the refusal text, and the plan does not say what that text must carry
Plan sentence: "Writer: the grounder; the script never writes it." and "update the 'missing evidence' message at :580 to name FOLD-CHECK.md".
Evidence:
- grep for "Plan: <task id> sha256" and "last "Plan:" finds only scripts/hooks/check-lane-close.mjs. Nothing under .claude, docs/specs, CLAUDE.md or plan-protocol.md instructs the grounder.
- rule-lists.mjs:690-745 plan-prep post and commit never mention a fold-check record. The commit phase passes the gate's exit 3 and stderr through (:742-745).
- backlog-lane.mjs:177 only says the gate "refuses otherwise".
- The plan's edit a. changes only the folder-missing message at :580. The new refusals for Checked-by, Verdict and the stale Plan line have no stated wording.
What would go wrong: the first refusal is the only place the grounder can learn the three required lines. If the messages say only "FOLD-CHECK.md missing", the grounder will guess the form. The task-412 record has no Verdict line and no Plan line, so the guess fails and costs another round.
Smallest correction: in edit a., require each refusal to print the form. Example text: `FOLD-CHECK.md: write "Checked by: <name>", "Verdict: PASS" and last "Plan: <id> sha256:<12>"; expected: ${line}`. Test the message text in the planScenario defects.

### int#4 LOW: plan-prep commit for an already-gated board yields no new instruction, and the prep commit order is only half proved
Plan sentence: "FOLD-CHECK.md is written after the Plan line, so it rides the second commit."
Evidence:
- rule-lists.mjs:720-745: commit adds and commits the folder, then runs the gate dry run. The first commit has no FOLD-CHECK.md and still lands, so the folder is committed in two commits, and the gate exit 3 is the only prompt.
- backlog-lane.logic.test.ts:742-757 expects the commit after the hook-retry to contain only TRIAGE-PLAN.md.
- :773 expects exit 0 from plantEvidence state.
What would go wrong: the plan proves 779-800, but 742-757 and 773 pass only if plant-evidence.mjs commits a good FOLD-CHECK.md in its own commit and writes it with the final hash after the --append-plan and --add-ref edits (the hash line goes last in the script, :84). Written earlier it would be stale at :773.
Smallest correction: say in section 5 that plant-evidence.mjs writes FOLD-CHECK.md in the same place as the last "lines.push(... Plan:" and before "git add -A".

### int#5 LOW: other open tasks touch the same two scripts
Plan sentence: "Other table editors land one at a time."
Evidence, from grep of backlog/tasks Files lines (the files themselves, not their diffs):
- RUNNING and naming check-lane-close.mjs and rule-lists.mjs: task-366 (COMPLY.2) and task-406 (V2.LIST).
- RUNNING and naming check-lane-close.mjs only: task-407 (V2.LAYOUT, review-file names and -pN text) and task-398 (FOLD.CHECK).
- LATER and naming both: task-400, task-404, task-414 (RERUN.CHANGED, re-runs per chunk, depends on 375).
- LATER and naming check-lane-close.mjs only: tasks 401, 402, 403, 405, 415, 416, 417.
- Also named: task-375 RUNNING (owns plant-evidence.mjs, and 419 depends on it through 418), tasks 399 and 410 BUILT, task-418 BUILT, task-384 RUNNING (name not in its Files line, only in its text), task-343 WAITS.
What would go wrong: planGateInner (:568-642), buildLensInputs (:425) and the plant-evidence fixture are shared. A parallel merge into the same hunks is likely. Order does not change behaviour for gap 1. For gap 2, 407 and 414 write sentences about -pN names, so they should be built after 419 or re-read after it lands.
Smallest correction: add a line to the plan: "land 419 after 366, 406, 407 and 398 close, or rebase on them, and re-read the RUNNING tasks' Files diffs at launch".

Verified, no finding:
- Callers and readers: planGateErrors is called only from backlog-lane.mjs:96. The rest of the folder read is name-based and unaffected: findingsReport, isLensOutput and the gate's own flat read ignore a new FOLD-CHECK.md.
- Gap 2 callers: buildLensInputs is called from the CLI (:791), the page renderer (:519, counts only), plant-evidence.mjs (always a list) and tests. plan-prep review does not use lens-input without a list: plan lens inputs are named in-plan-compliance-<id> with --list (:620), and non-compliance plan lenses read the context file directly (:615-616). The close check reads only out-<lens>-pN.txt as a tool-made input (:487-503), so the gap 2 change breaks nothing in plan-prep.
- Stale unsuffixed files: the CLI removes a stale ${base}.txt before writing (:798-799).
- Existing no-list tests: rule-lists.logic.test.ts:~570-628 and check-lane-close.logic.test.ts:130-134 are multi-chunk, so they stay -pN.
- Spec files: 08_agents.md and plan-protocol.md hold no -pN naming sentence, so gap 2 leaves no spec sentence false.
- Prepped but not launched: only task-412 and task-418 have a committed GROUNDER-PLAN.md, and both are BUILT. No task would be newly refused, so open question 2 has no live case.
