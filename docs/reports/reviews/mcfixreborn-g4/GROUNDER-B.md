Grounder: Cairn-Ground-G4B
Ruled: out-compliance-orchestrator-doc17-p1.txt sha256:d3cdd7f8e1db findings:4
Ruled: out-compliance-orchestrator-doc17-p2.txt sha256:fb0a68567f5c findings:2
Ruled: out-compliance-orchestrator-doc17-p3.txt sha256:9ef05ad62f43 findings:2
Ruled: out-compliance-orchestrator-doc17-p4.txt sha256:edfc0247773e findings:3
Ruled: out-compliance-orchestrator-doc17-p5.txt sha256:09d153141c86 findings:5
Ruled: out-compliance-queue-137-p1.txt sha256:d5d4927bafd5 findings:3
Ruled: out-compliance-queue-137-p2.txt sha256:9ac514705490 findings:3
Ruled: out-compliance-queue-137-p3.txt sha256:f708b583d2f9 findings:5
Ruled: out-compliance-queue-137-p4.txt sha256:bc91efa39c69 findings:3
Ruled: out-compliance-queue-137-p5.txt sha256:9a284313549b findings:5
Ruled: out-compliance-queue-137-p6.txt sha256:14286b625740 findings:2
Ruled: out-compliance-queue-137-p7.txt sha256:af85e442e894 findings:6
Ruled: out-compliance-queue-137-p8.txt sha256:ba54dae154ee findings:0
Ruled: out-compliance-queue-137-p9.txt sha256:7bc89dcdbb34 findings:4
Ruled: out-compliance-queue-137-p10.txt sha256:88cda329a00f findings:3
Ruled: out-compliance-step-132.txt sha256:4428cc10de1e findings:4

Basis: board worktree HEAD faa608ce6; `git diff --stat 8dba70e8e HEAD` over scripts/analysis, scripts/hooks, scripts/deepseek-review.js, scripts/lib/review-template.js, .claude/review-templates, .husky and migrations/334 printed nothing, so every file below is unchanged since the review. 54 findings in my share: 40 CRITICAL/HIGH/MED (9 HIGH, 31 MED), 12 LOW, 2 NIT. Ids are `<file stem without out-compliance->#<n>`. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

## 2. CRITICAL/HIGH/MED table
orchestrator-doc17-p1#1 | MED | CONFIRMED (real severity LOW) | .claude/review-templates/README.md:109,122,132 name the outputs `r1-<lens>.txt`. The close check reads out-/plan- names only. The lane BRIEF carries the right names (backlog-lane.mjs:188), so only a lane working from the README alone is hit.
orchestrator-doc17-p1#2 | MED | REFUTED | check-lane-close.mjs:197-206: `allowed` is `[fixed, ruling]` for a non-LOW BUG. `wontfix` and `pile` are refused with "wontfix and pile are for LOW and NIT only".
orchestrator-doc17-p1#3 | MED | REFUTED | The lens line and the rule-list block are written into BRIEF.md by backlog-lane.mjs:186,195,211 (the ruleBlock, and lensLine in `extra`). The G1 ticket from backlog-brief.mjs is a separate file. See also queue-137-p1#2.
orchestrator-doc17-p2#1 | MED | REFUTED | generated-docs.mjs:7-22 is Spec 124 Rule 13 gate J, written 2026-09-26 (commit ad9eb955c). Its rule is "retired with a written why". doc-17's clause is about reviews, not gate registries.
orchestrator-doc17-p2#2 | MED | REFUTED | RR-0240 is the operator's 2026-11-19 verbatim (MD:951-958, taken under RR-0240 at MD:961). RR-0242 is decision-74, RR-0374 is decision-159, RR-0378 is decision-163, RR-0385 is "Ruled" at MD:1916. The proposed launch-time register lookup is a new mechanism (RR-0392).
orchestrator-doc17-p3#1 | HIGH | REFUTED-BY-RULING | RR-0421 item 4a (MD:2162): "The tooling row keeps its process lists". Spec 137 and Spec 08 are the other process lists. rule-lists.json:162-168 lane-tools lists orchestrator-doc17 and its `why` names doc-17. Attaching doc-17 is how a reviewer checks that code does not treat readings as rulings. It is not a feed of readings as rulings.
orchestrator-doc17-p3#2 | MED | REFUTED | rule-lists.json:3 quotes the operator's own words (2026-11-20) with the MD file. That is a ruling by doc-17's own test. A missing line number is style.
orchestrator-doc17-p4#1 | HIGH | REFUTED-BY-RULING | Same ruling as p3#1. The proposed `kind` field plus validateTable refusal is a new mechanism, and RR-0392 (MD:1975) says no new infrastructure without his word.
orchestrator-doc17-p4#2 | MED | REFUTED-BY-RULING | Same as p3#1. `joinLists` (rule-lists.mjs:118-125) only joins ids the table already has.
orchestrator-doc17-p4#3 | MED | NOT-APPLICABLE | RR-0414 item 4 (MD:2116) is a one-time ruling for task 442's re-review. The tool's design is stated at rule-lists.mjs:384: one file over the room is refused, naming the file (fail closed).
orchestrator-doc17-p5#1 | MED | REFUTED | Header printed before the call (deepseek-review.js:174). check-lane-close.mjs:74 still refuses an output with no `^VERDICT:` line ("a failed run is not a lens output"). A dry run prints one line starting `DRY-RUN {...}` with escaped newlines, so it has no `VERDICT:` line. A prompt-bound refusal throws after the header with no body. Duplicate of queue-137-p10#1 and p9#1.
queue-137-p1#1 | HIGH | CONFIRMED (real severity MED) | See defect 1.
queue-137-p1#2 | MED | REFUTED | The per-list lens line and the "Rule lists that govern this task" block are in BRIEF.md (backlog-lane.mjs:186,195,211). Only the G1 sentence "lens line of this brief" is loose. LOW wording, folded into defect 1's fix.
queue-137-p10#1 | HIGH | REFUTED | check-lane-close.mjs:74 requires a VERDICT line. The header alone is not accepted as proof. Same as orchestrator-doc17-p5#1.
queue-137-p10#2 | MED | NOT-APPLICABLE | RR-0439 (MD:2255-2259) sets 120,000 per call for the McFixReborn review calls. The tool default is 120000 (deepseek-review.js:35, rule-lists.mjs:29). The env knob is a deliberate operator override, not a ruling breach.
queue-137-p10#3 | MED | NOT-APPLICABLE | A finding about what was pasted into the review is not a code defect. Spec 137:140 (task-410 note) names check-task-files.mjs and the closing-commit path rule, so the file is homed.
queue-137-p2#1 | HIGH | REFUTED | Spec 137:29 says Backlog is the source of truth for the increment plan (RR-0205). §6 "Not adopted" concerns queue rows. The brief and launcher edit cards, not queue rows.
queue-137-p2#2 | MED | REFUTED | The reviewer is passed only the 5 `--section`s (review-template.js:115 CONTEXT_SECTIONS), not the 120 KB pack. buildLensInputs counts the context in `fixed` (rule-lists.mjs:395) and refuses when it does not fit.
queue-137-p2#3 | MED | NOT-APPLICABLE | Rule 14 (137:185) is "The orchestrator reads the board's status at the start of every session". Step 7a of the weekly check (137:163) covers BOARD-STATUS. It is not a rule on the brief tool.
queue-137-p3#1 | HIGH | DUPLICATE-OF-EARLIER | proof-slice.mjs:22 typed 120000 ms is the known open D10b. Records: docs/reports/lanes/2026-11-21/BL-GATE375/REPORT.md:3,5, and task-375 AC #13 and the D10b text, task still RUNNING. It needs the operator's DB GO (variable registration). Not a new defect.
queue-137-p3#2 | HIGH | REFUTED | backlog-lane.mjs:97 reads the working tree, and backlog/ may be dirty (:84). The take edit and board commit job commit that same working tree (:130-139). planHash is checked against the GROUNDER-PLAN "Plan:" line, so an edited plan that was not grounded fails the hash. The lane builds what was hashed.
queue-137-p3#3 | MED | REFUTED | check-lane-close.mjs:507-512 refuses with the exact `backlog task edit <id> --add-ref <path>` command for REPORT.md, GROUNDER.md and TRIAGE.md. The message names the fix.
queue-137-p3#4 | MED | NOT-APPLICABLE | No card in backlog/tasks has an `expires` field (0 of 448). Spec 137:29 keeps the expiry condition deferred, and §6 holds the deferred checks. Setting `expires` at the take is a new mechanism (RR-0392).
queue-137-p4#1 | MED | REFUTED | Rule 13's "board" is the read-only view built from origin (BOARD-STATUS, §5a). The launcher's `--board` is the card checkout. Spec 137:21 makes a card's front-matter `status` the status line. Preflight requires a git checkout with backlog/tasks, node_modules, and a LATER or WAITS card (backlog-lane.mjs:62-69). Renaming the flag is not a defect fix.
queue-137-p4#2 | MED | DUPLICATE-OF-EARLIER | Same as queue-137-p3#1 (D10b).
queue-137-p5#1 | HIGH | CONFIRMED (real severity MED) | See defect 2.
queue-137-p5#2 | MED | REFUTED-BY-RULING | Spec 137:140 says the check refuses "the commit that sets BUILT or DONE". RR-0428 (MD:2194-2197) keeps BUILT as the finished state and leaves the check unchanged.
queue-137-p5#3 | MED | REFUTED | `no_files_default` is the record-only default of task-448 (RR-0418, decision-203), documented at Spec 137:138, README:158, and the row `why`. EXECUTED: build and fix with no Files line are refused, and a record task gets five-words, plan-protocol, inc-S, ms-S.
queue-137-p5#4 | MED | REFUTED-BY-RULING | RR-0418 completed (MD:2145): the "four every-task lists" plus milestone objectives. The task-406 V2.LIST operator ruling is cited in the table `$comment`.
queue-137-p5#5 | MED | REFUTED | resolveTask (rule-lists.mjs:263-266) tries rows first and consults `table.exempt` only when no row hits. Launch and close both call it. The result is deterministic, so a golden path still gets its rows' lists.
queue-137-p7#1 | MED | REFUTED-BY-RULING | RR-0385 item 2 (MD:1916-1917) rules "a review seat named `engineering`, separate from compliance". seatOf (rule-lists.mjs:113) implements it.
queue-137-p7#2 | MED | REFUTED | Spec 08:342 gives a WF3 fix task a lean plan roster of premise-grounder lenses. The launch gate for a fix task asks for plan-lens outputs (check-lane-close.mjs:654-656). The output-stage compliance per list runs at close for build and fix.
queue-137-p7#3 | MED | NOT-APPLICABLE | Same scope as queue-137-p10#2. RR-0439 is about the McFixReborn calls. The default is held at rule-lists.mjs:29. An env value is deliberate.
queue-137-p7#4 | MED | NOT-APPLICABLE | RR-0439 item 2 B (MD:2257) governs this review run. No task or ruling asks the lane tool to cut the material per list. A lane review reads the whole change (task-410 V2.WHOLE).
queue-137-p9#1 | HIGH | REFUTED | Same as queue-137-p10#1: check-lane-close.mjs:74 requires VERDICT. A timeout partial without a VERDICT is refused too.
queue-137-p9#2 | MED | REFUTED | check-task-files.mjs:63 exits 0 when no src/scripts/mobile/migrations file is staged. A closing commit (task file, lane report, review context, decision record) has no code path, so the hook never sees backlog/decisions/. The closing-commit path allowlist is enforced by check-lane-close.mjs:833-836, not here.
queue-137-p9#3 | MED | NOT-APPLICABLE | RR-0414 item 4 is task-442's one-time re-review. Oversized material is cut by rule-lists.mjs lens-input (:419-440).
queue-137-p9#4 | MED | NOT-APPLICABLE | Review-scope complaint (task-3 not pasted), not a code defect. See queue-137-p10#3.
step-132#1 | MED | REFUTED | The pin is in the seed: scripts/seeds/logic_variables.json:9779-9784 has min 33.2 and max 33.2. logic_variables has no min/max columns (migration 316 INSERTs only key, value, json, description). The migration header says the seed is what the gates read.
step-132#2 | MED | REFUTED | decision-119 (RR-0334) names the 33.2 s ruling. MD:1526-1530 holds the verbatim entry. 124a_step_standard_policy_appendix.md:515,517 are the dated-note register rows. The docs/reports/decisions/ JSON log stopped at 2026-11-12 (`ls`), so x-rulings.4's JSON route is not live practice. Optional LOW polish: add "decision-119" to the migration header.

## 3. CONFIRMED DEFECTS
1. queue-137-p1#1. The G1 ticket contradicts Spec 137 Rule 3 for build and fix lanes.
- Rule: Spec 137:100 says Rule 3 is amended for lane build and fix tasks to a two-commit close. Rule 3 itself says "This goes into every lane brief."
- Where: scripts/analysis/backlog-brief.mjs:176 prints `"The status line changes in the same commit as the work."` with a bare line cite. The Close block (:187) is one command with `-s BUILT` and says nothing about two commits or the closing-commit path limits.
- What happens: the lane reads this G1 file (listed as an input at backlog-lane.mjs:244). BRIEF.md does state the two-commit close (backlog-lane.mjs:188), so the lane gets two opposite instructions. A lane that follows the G1 text is refused at close by check-lane-close.mjs:833-836, so the failure is fail-closed.
- Smallest fix: at :176, when `t.fm.type` is build or fix, print the amended text. Suggested wording: "Rule 3 as amended (Spec 137 §4 Rule 3, dated note 2026-11-20): the work lands first; the closing commit carries only the lane report dir, the review context dir, the task file and the decision record". Keep the old sentence for other types. Optionally reword :183 "lens line of this brief" to "BRIEF.md".
- Owner: task-410 (Rule 3 note, RR-0335/decision-120). The only open card is task-375, which can take it.
- Size: line-size (about 3 lines, plus a test line).
- Impact: a lane is told to close in one commit and then refused. No wrong close gets through. Cost is a wasted round and a risk of the orchestrator hand-editing a brief.

2. queue-137-p5#1. A task whose Files line is scripts/gemini-review.js can never launch.
- Rule: Spec 137 Rule 12 note (task-366): the launch refuses a task whose Files line matches no row. The row `why` (rule-lists.json:86 `step-pipeline`) calls gemini-review.js a lane tool "see lane-tools".
- Where: rule-lists.json:87 step-pipeline `not` lists scripts/gemini-review.js, but the lane-tools globs (:163) list only deepseek-review.js and review-template.js. Commit 8c8e5fe99 (task-366) added the `not` but not the glob.
- EXECUTED: resolveTask on `Files: scripts/gemini-review.js` returns "refused: Files path(s) matched by no row". deepseek-review.js and review-template.js resolve to the lane lists.
- Smallest fix: add `"scripts/gemini-review.js"` to the lane-tools `globs` at rule-lists.json:163. The file is a protected path, so the edit goes through the normal reviewed lane.
- Owner: task-366 (COMPLY.2, commit 8c8e5fe99). Operator-listed table edits belong to task-448's family.
- Size: line-size.
- Impact: a legitimate task on that CLI is blocked (fail closed). Nothing wrong gets through. The step-pipeline `why` says the file is a lane tool, so the table does not do what its own text says.

3. orchestrator-doc17-p1#1. The README recipe names the lens outputs `r1-<lens>.txt`.
- Where: .claude/review-templates/README.md:109, 122, 132. The close check accepts only out-/plan- names, and the findings tool reads only those. README:159,161 give the right names for compliance.
- Smallest fix: replace `r1-<lens>.txt` with `out-<lens>.txt` (plan stage `plan-<lens>.txt`) at those 3 lines.
- Owner: task-366 (README author). Size: doc, 3 lines.
- Impact: LOW. A lane that reads only the README names its files wrong and the close check refuses it. The lane BRIEF carries the right layout (backlog-lane.mjs:188). I rate it LOW; DeepSeek rated it MED.

## 4. LOW/NIT (recorded only)
orchestrator-doc17-p1#4 (CRIT vs CRITICAL: refuted in effect, normSev maps CRIT at check-lane-close.mjs:142), orchestrator-doc17-p5#2, p5#3, p5#4, p5#5, queue-137-p1#3, p3#5, p4#3, p6#1, p6#2, p7#5, p7#6 (EXECUTED: build and fix with no Files line are refused), step-132#3, step-132#4. None is a HIGH-class defect rated too low. p3#5 (the backlog-lane.mjs:12 header wording) and p6#1 are doc-only and fine to leave.

## 5. Totals (40 rated CRITICAL/HIGH/MED)
- CONFIRMED: 3 (queue-137-p1#1, queue-137-p5#1, orchestrator-doc17-p1#1; all three are line-size, and p1#1 and p5#1 were overrated HIGH).
- REFUTED: 20 (orch p1#2, p1#3, p2#1, p2#2, p3#2, p5#1; queue p1#2, p10#1, p2#1, p2#2, p3#2, p3#3, p4#1, p5#3, p5#5, p7#2, p9#1, p9#2; step #1, #2).
- REFUTED-BY-RULING: 6 (orch p3#1, p4#1, p4#2; queue p5#2, p5#4, p7#1).
- NOT-APPLICABLE: 9 (orch p4#3; queue p10#2, p10#3, p2#3, p3#4, p7#3, p7#4, p9#3, p9#4).
- DUPLICATE-OF-EARLIER: 2 (queue p3#1 and p4#2, the known open D10b of task-375).
- UNDETERMINED: 0.
- The 54 findings split into those 40 plus 12 LOW and 2 NIT, as in section 4.

## 6. UNVERIFIED
- The claim that a timeout partial could carry a model-written `VERDICT:` line and pass the close check was reasoned from check-lane-close.mjs:74 only. I did not run the tool (no model call). Such a partial would also need a matching header, so it is not a forged proof.
- I did not run backlog-lane.mjs against `--board ~/Buildo-scratch/backlog-pilot`. The refusal list (:62-69) says a git checkout with backlog/tasks, node_modules and a LATER or WAITS card is required, so the pilot view is unlikely to pass. I did not execute it.
- I did not read the full decision-119 text; only a grep hit for "33.2".
- Whether the board commit job (launchd) always commits the dirty backlog/ edit before the lane starts (queue-137-p3#2) was taken from backlog-lane.mjs:139-153, not run.
