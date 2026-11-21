# Seat: regression — task-419 plan (PLAN-419-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.
Basis: board head 0dd70437a (wf2/board), read-only. I read git log, blame, `git show`, and the task, lane, review, decision and MORNING-DECISIONS files. I ran no tests.

### rg#1 MED: the FOLD-CHECK.md "Checked by" line is not specified, and the existing worked example would be refused by the plan's own clash rule
Plan sentence: "Checked-by missing or clash() with lane or any assignee -> refusal (reuse clash, same rule as the grounder)" and "Worked example: task-412/FOLD-CHECK.md has 'Checked by:' but no Verdict or Plan line".
Evidence:
- scripts/hooks/check-lane-close.mjs:51-52. `nameKey` strips every non-alphanumeric character, and `clash` is true when the shorter key (3 or more characters) is a substring of the longer.
- scripts/hooks/check-lane-close.mjs:337. The Grounder header is read as `(.+?)` to the end of the line. That is safe only because GROUNDER files carry a bare name (`Grounder: Cairn-Ground-P418`).
- docs/reports/reviews/task-412/FOLD-CHECK.md:3 reads "Checked by: Cairn-Ground-P412, the separate plan grounder (not the lane BL-F412, not the orchestrator), on the board as it was...". The lane key "f412" is a substring of that whole line's key, so clash is true.
What would go wrong:
- A grounder who writes the sentence form the repo already holds is refused as "clashing with the lane". The lane name appears inside the "not the lane BL-F412" disclaimer.
- The plan does not say how the name is cut from the line. Test fixtures with a bare name pass, so the defect shows only on real files.
Smallest correction: state in section 3 that `Checked by: <one name>` is the whole line, a bare name with no prose, as in GROUNDER-PLAN.md `Grounder:`. Add a planted test of a prose value that names the lane in a disclaimer, with its control. Say that task-412's file is not a conforming example. It is not re-gated, so nothing breaks.

### rg#2 LOW: plant-evidence.mjs is edited although the plan says no committed file is edited, and task-418 ruled that file out of its own change set
Plan sentences: "no committed file is edited" (section 3, "Existing tasks") against "plant-evidence.mjs: write FOLD-CHECK.md after GROUNDER-PLAN.md (:36-37)" (section 5) and the Files line.
Evidence:
- `git log` shows one commit on the file, 55b8018da (task-375 D5). Nothing after it has edited it.
- backlog/tasks/task-418...md:177 puts "changing the gate, the context or plant-evidence.mjs" under NOT in scope. :92 and :154 treat it as a reused fixture program, and test 7 uses it as the byte-for-byte reference.
- docs/reports/reviews/task-418/QUESTIONS-RULED.md Q1-Q6 never rule on it. I found no ruling that it is a reusable helper, and none that bars editing it.
- The same folder holds fixture-context.md. Its only edit, 204da6718, is a task-375 commit.
- The 375 outputs and context files are untouched by this edit.
What would go wrong:
- The plan contradicts itself, and a reviewer could read the contradiction as "committed evidence is edited".
- Task-418 tests 7, 9, 12, 13 and 14 all run on this planted state. Each needs a check that the added file does not change them.
- Test 13 asserts the commit holds exactly TRIAGE-PLAN.md.
- Acceptance (f), "three test files green", covers 418's tests only because they live in backlog-lane.logic.test.ts.
Smallest correction: either reword section 3 to "no committed review evidence is edited; plant-evidence.mjs is a test fixture program (418 task :92)", or leave plant-evidence.mjs alone. In the second case the plantEvidence wrapper at backlog-lane.logic.test.ts:17-19 writes and commits FOLD-CHECK.md after calling the script, and the Files line loses one path. Whichever is chosen, name tests 7, 9, 12, 13 and 14 as controls that must stay green.

### rg#3 LOW: the "Plan:" line in GROUNDER-PLAN.md was designed as the fold-check witness, and the plan does not say so
Plan sentence: "Fix: the grounder writes FOLD-CHECK.md beside GROUNDER-PLAN.md; the existing launch check requires it." Section 3 "Rejected" lists a hash of GROUNDER-PLAN.md as circular, but omits the Plan line's own origin.
Evidence:
- docs/reports/reviews/task-375/CROSS-READ.md:209: "Fold-validation grounder (11.2) re-runs the claims; as its last act runs backlog-lane.mjs --dry-run and copies the Plan line."
- PLAN-375-v4.md D3 (:68) and D5: the Plan line is checked only at launch against the task as it is.
- PLAN-375-v4.md "WHAT THE GATE CANNOT PROVE" already lists "that the fold is complete" as not provable.
- I found no earlier ruling that a fold-check record was considered and rejected. 375 D5 says "No flag or environment variable turns it off", which is why the new file is a hard refusal. Task-418 :177 only bars the script from writing a fold check, which is consistent with the plan.
What would go wrong: FOLD-CHECK.md repeats the same hash as GROUNDER-PLAN.md, so there are two witnesses for one fact. The `Verdict: FAIL` refusal is reachable only if a grounder writes a FAIL record and still adds the Plan line. The plan does not say that the Plan line in GROUNDER-PLAN.md must not be added until the verdict is PASS.
Smallest correction: add one sentence to section 3. "The Plan line in GROUNDER-PLAN.md is added only after a PASS fold check (375 D3, CROSS-READ.md:209); FOLD-CHECK.md is the record of that pass, not a second hash design."

### rg#4 LOW: the new check runs only when GROUNDER-PLAN.md exists, so one launch attempt can surface the refusals in two rounds
Plan sentence: "after `const pl = ...` block (:634-636), read textOf('FOLD-CHECK.md') and push the four refusals".
Evidence:
- check-lane-close.mjs:609-636. The Plan-line code sits inside the `else` of `if (g === undefined)`.
- backlog-lane.logic.test.ts:357-367 locks "one line per missing item": the first line names the missing folder and `lines.length > 1`.
- check-lane-close.logic.test.ts:924 locks the first error text, "no plan evidence folder docs/reports/reviews/task-7/".
What would go wrong:
- A folder with no GROUNDER-PLAN.md does not report the missing FOLD-CHECK.md, so the operator learns of it only after fixing the first refusal.
- Test 357 and test 924 stay green, because the first error text (:580) is unchanged. The plan's "update the message at :580" is optional wording, not a lock.
Smallest correction: either move the FOLD-CHECK.md existence check outside the `else` (a missing file is reported even without GROUNDER-PLAN.md), or state in the plan that it is deliberately second-round.

### rg#5 NIT: gap 2 is consistent with the decisions that created the suffix rule, and the plan should cite them
Plan sentence: "Rejected: teach the close check an unsuffixed stamped name ... edit the brief (already says -pN)".
Evidence:
- git blame of rule-lists.mjs:425 gives 13b64fc0a (2026-11-20, task-410, "V2.WHOLE part b").
- Its predecessor, cb026342c (COMPLY.2), had `parts.length === 1 ? '' : -pN` for rule lists only. The "no list" path first appeared in 13b64fc0a, which generalised the list rule, so the unsuffixed no-list name is a by-product, not a named ruling.
- The task-410 plan, (b) at line 49 of backlog/tasks/task-410...md, says "the close check accepts out-<lens>-pN.txt for them, each with its committed in- input".
- BL-V2WHOLE/TRIAGE.md:12 and :42 rule "wontfix: lens-input on a diff that fits is not the route for the unsplit lens runs: the brief runs the lens on the diff file itself". That ruling is why the unsuffixed out-<lens>.txt bound to the raw diff (:509-513) still exists.
- No test locks an unsuffixed no-list name. Grep of src/tests/backlog for `in-out-` and `-p1` finds only compliance names, the `split.lens` -pN path (check-lane-close.logic.test.ts:132-135), and rule-lists.logic.test.ts:577, which uses a split diff with `files.length` equal to the chunk count.
- Committed no-list pairs are all -p1 or higher (BL-V2WHOLE, BL-F412, BL-GATE375, BL-PREP418). The only unsuffixed in-out-code-review/error-paths files are BL-MASSING, which are raw-diff inputs.
What would go wrong: nothing is undone. The reader just cannot see why.
Smallest correction: add one line to section 3 citing 13b64fc0a, task-410 plan line 49 and the V2WHOLE wontfix. State that the unsplit route (the lens run on the diff file, `out-<lens>.txt`) is unchanged.

### rg#6 LOW: a round-N lens input made by the tool changes name from `...-rN.txt` to `...-rN-p1.txt`
Plan sentence: "with no list it is always -pN".
Evidence:
- backlog-lane.mjs:185 brief: "a later (fix) round is filed beside them as out-<lens>[-<list id>]-rN.txt with its in-<same name>".
- check-lane-close.mjs:461 layout text says the same.
- isLensOutput (rule-lists.mjs:286) reads any `plan-` or `out-` name, so a `-r2-p1` file is read for findings.
- The close check's lens-part regex (:487) is `^out-<lens>-p(\d+)\.txt$`, so `out-code-review-r2-p1.txt` is not treated as a part.
- Test check-lane-close.logic.test.ts:320 plants unsuffixed r2 pairs with free-text inputs.
What would go wrong: a lane that runs lens-input with `--out in-out-code-review-r2` on a one-file fix diff now gets `-r2-p1`, which contradicts the brief's `-rN` form. It is read, but it is not the stated name.
Smallest correction: add a test or a sentence on this case. Either the brief wording gains "(tool-made: -rN-p1)", or the plan states the r2 name is unchanged.

### rg#7 NIT: the open question on prepped-but-not-launched tasks is answerable now, and RR-0354 widens the Files line
Plan sentences: section 9 Q2, "Which tasks are prepped (evidence committed) but not launched?", and section 7 acceptance (f), "git diff --stat shows only the Files line".
Evidence:
- At HEAD only task-412 and task-418 have a committed GROUNDER-PLAN.md (`git ls-files`). Both are BUILT, and the gate runs only at launch (backlog-lane.mjs:87-116), so neither is re-gated.
- task-419's own folder is untracked and holds only context-r1.md and the nine in- inputs.
- decision-139 (RR-0354, untracked) and MORNING-DECISIONS.md "ORDERS the spec's wording changed" say the Spec 08 section 11.2 rewording is "added to task-419 at its plan fold, as an operator-ordered item". The plan is silent on it. 08_agents.md:476 still reads "one cross-read adversary checks the folded decisions PAIRWISE".
- I found no operator ruling listing what the launch check requires as a closed list. D7 (375) states the gate's scope, and RR-0342 to RR-0353 (decisions 127, 131, 134, 136, 137) do not mention it. A date cutoff is not needed.
What would go wrong:
- The answer to Q2 is "none", so a date cutoff would add a rule for no task.
- A fold that adds 08_agents.md to the Files line changes acceptance (f). That document also states the fold-check rule, so its new wording must say the grounder's fold check leaves FOLD-CHECK.md.
Smallest correction: answer Q2 in the plan as "none at HEAD: 412 and 418 are BUILT, and 419 is not yet prepped; no cutoff". Add 08_agents.md and the RR-0354 wording item to the fold list.
