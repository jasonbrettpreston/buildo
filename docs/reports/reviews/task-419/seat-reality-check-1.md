# Seat: reality-check — task-419 plan (PLAN-419-v1)

Run against board HEAD 0dd70437a (the plan says it was written at 7db3a81cc; the files cited were not changed in between for the lines below). Gap 2 was reproduced in a throwaway `git clone --shared` in the scratchpad (deleted afterwards). Nothing on the board was written.

Gap 2 reproduction (real run, one-file diff of docs/x.md, context with the six headings the tool needs):
- No list: `lens-input --template .claude/review-templates/lens-code-review.md --context ctx.md --material one.diff --out out/in-out-code-review` exit 0, prints and writes only `out/in-out-code-review.txt`. First line: `LIST none sha256:e3b0c442... material sha256:... part 1 of 1 chunk 1 of 1`.
- Compliance list: `lens-input --list five-words ... --out out2/in-out-compliance-five-words` exit 0, writes only `out2/in-out-compliance-five-words.txt` (unsuffixed).
- Close check, compliance: listProof (check-lane-close.mjs:380-413) takes `${base}.txt` when no `-pN` exists, reads `in-<name>`, parses the stamp. Accepted.
- Close check, code-review: unsuffixed `out-code-review.txt` goes the F3 route (:506-516): reviewErrors(..., whole recomputed diff) and :64 demands header file_sha256 = sha256 of the raw diff, never of the stamped input. A review run on the tool's input fails with "the REVIEW header file_sha256 is not the sha256 of the recomputed diff of the whole task range". `in-out-code-review.txt` is not read on that route. Only `out-code-review-p1.txt` goes the stamp route (:487-503).

### rc#1 MED: the planned Checked-by clash test would refuse the plan's own worked example, and the name field is undefined
Plan sentence: "Checked-by missing or clash() with lane or any assignee -> refusal (reuse clash, same rule as the grounder)"; "Worked example: task-412/FOLD-CHECK.md has "Checked by:" but no Verdict or Plan line".
Evidence: docs/reports/reviews/task-412/FOLD-CHECK.md:3 is `Checked by: Cairn-Ground-P412, the separate plan grounder (not the lane BL-F412, not the orchestrator), on the board as it was ...`. With check-lane-close.mjs:51-52 (nameKey, clash) recomputed by node: clash(whole captured line, 'BL-F412') = true; clash('Cairn-Ground-P412', 'BL-F412') = false. The grounder header rule reads `(.+?)\s*$` of the whole line (:337).
What would go wrong: if the regex captures the rest of the line (as :337 does), any grounder who writes the natural explanatory sentence naming the lane (as 412 did) is refused as "the lane"; the expected form is not stated, so the planned tests and a real FOLD-CHECK.md can disagree.
Smallest correction: state in the plan that the `Checked by:` line holds the name only (nothing after it), as `Grounder:` does in the test fixtures, and write the planted-clash and the control tests with that exact form; put any prose in the body.

### rc#2 NIT: "Checked by" and "Checked-by" are both used for the same field
Plan sentence: "a line `Checked by: <name>`" (section 3) vs "no Checked-by" (section 5); acceptance (a) "Checked by: Fold-G1".
Evidence: 412's file uses "Checked by:" (FOLD-CHECK.md:3). No code or test in src/tests or scripts contains the string yet.
What would go wrong: a test planting "Checked-by:" is red for the wrong reason.
Smallest correction: use "Checked by:" everywhere in the plan and the regex (`/^\s*Checked by:\s*(.+?)\s*$/m`).

### rc#3 LOW: "The brief already says -pN" holds only for over-bound lenses
Plan sentence: "Brief, backlog-lane.mjs:185 ...: code-review/error-paths/ux/security "are filed out-<lens>-pN.txt with their in-<same name>" ... The brief already says -pN. The tool is the odd one out."
Evidence: backlog-lane.mjs:185 says that only for "the code-review, error-paths, ux and security lenses whose prompt would pass the bound use the same tool with their own template and no --list". For lenses under the bound, :181 (the first sentence of the brief) says to run the review tool directly on the diff file, giving the unsuffixed raw-diff route.
What would go wrong: nothing breaks, but the stated reason is wider than the text. After the change a one-file lane still has two valid forms (raw-diff unsuffixed, or tool-made -p1); the trap only existed for a lane that chose lens-input on a small diff (as the 418 lane did).
Smallest correction: say "the brief names -pN for every lens that goes through lens-input" and keep the raw-diff route stated as untouched.

### rc#4 LOW: plant-evidence.mjs cite is wrong, and the Plan-line hash is computed at a different place
Plan sentence: "plant-evidence.mjs: write FOLD-CHECK.md after GROUNDER-PLAN.md (:36-37) and commit it with the rest."
Evidence: docs/reports/reviews/task-375/plant-evidence.mjs:36-37 is `const w` and `outBody`. GROUNDER-PLAN.md is written at :66 (`w('GROUNDER-PLAN.md', ...)`) and the commit with `git add -A` is :67; the Plan hash is computed at :65 after the `ed(...)` task edits (:62-64).
What would go wrong: an edit placed at :36-37 would run before the task edits and carry a stale hash, so every launch fixture (13 uses of the evidence fixture in backlog-lane.logic.test.ts) would refuse.
Smallest correction: say "between :66 and :67, reusing the `clc.planHash(...)` value of :65".

### rc#5 LOW: "no committed file is edited" contradicts the Files line
Plan sentence: "Existing tasks: ... 375, 412, 418 are taken and not re-gated; no committed file is edited."
Evidence: the Files line and section 5 edit docs/reports/reviews/task-375/plant-evidence.mjs, a committed file in task-375's own evidence folder; task-375 is RUNNING (task file front matter). I found no hash or reference to that file in the 375 task file beyond a build note naming it (line 392 of the task file), so nothing re-checks its bytes.
What would go wrong: a reader of the "untouched" claim would think 375's folder is not changed.
Smallest correction: "no committed evidence of a closed lane or of 412/418 is edited; plant-evidence.mjs (a test helper in the 375 folder) is."

### rc#6 LOW: committed Plan lines of 412 and 418 no longer equal the task hash; a Plan line is only valid at fold time
Plan sentence: "375, 412, 418 are taken and not re-gated"; "the last Plan line ... not equal to `line` -> refusal (a fold check of an older plan)".
Evidence: `planHash` (check-lane-close.mjs:552-555) recomputed with the exported function on the board's current task files: task-412 = 5b722e11afb4 (GROUNDER-PLAN.md last line: `Plan: task-412 sha256:73d02e7e8f80`), task-418 = 49afe9cc460d (committed `f6e8fbfaf205`). Both tasks were edited after launch (status BUILT, notes). Task-419 as it stands today = 3f0e46afd0c8 (will change when the folded round block is posted). Only importers of planGateErrors: backlog-lane.mjs:24,96 and check-lane-close.logic.test.ts (grep of scripts, src, .husky).
What would go wrong: the "not re-gated" claim is true and is necessary (a re-gate of 412 or 418 would already fail on the existing Plan line). But a FOLD-CHECK.md for 412 or 418 cannot ever pass the planned check, and the new Plan line must be taken from the gate's printed `expected:` after `plan-prep post`, not before: a fold check written before the round block is posted is stale at once.
Smallest correction: add to section 3 that the FOLD-CHECK Plan line is copied from the gate's `expected:` output after post, as the GROUNDER-PLAN line is (the flow at backlog-lane.logic.test.ts:779-800 already gives it that order).

### rc#7 LOW: acceptance (c) and (d) are not runnable with an arbitrary `<ctx>`
Plan sentence: "(c) ... --context <ctx> --material <one-file diff> --out <dir>/in-out-code-review prints `<dir>/in-out-code-review-p1.txt` and writes only that."
Evidence: my first four runs exited 1 with `--section "Task": no heading contains that text`, then "Acceptance criteria", "Decisions naming this task", "Implementation Notes" in turn; the context must hold those six headings (a committed context-rN.md does). After they were added the run exited 0 (output above). The name `-p1.txt` itself is the planned change; today it prints `in-out-code-review.txt` (reproduced). The cleanup loop (rule-lists.mjs:793) removes `${base}.txt` and `${base}-pN.txt` first, so "writes only that" is consistent with a rerun.
What would go wrong: the acceptance command fails on exit 1 for a reason unrelated to the change.
Smallest correction: name the context in (c), e.g. `docs/reports/reviews/task-419/context-r1.md` (present, untracked) or the 375 fixture-context.md the tests use (check-lane-close.logic.test.ts:120,133).

### rc#8 NIT: line cites off by one or two
Plan sentence: "planGateInner, check-lane-close.mjs:569-642"; "`list` is null ... (:777-778)"; "(:620)" for plan-prep compliance.
Evidence: `function planGateInner` is at :568; the list-null line is :775 (`const list = id ? table.lists[id] : null`) with the usage refusal at :777; the diff stamp docstring is :361-364 (correct). Other cites checked and correct: :425, :373-409 (actual :380-413 for listProof, :373 is its docstring), :487-513, :609, :634-636, :720-745, :726-730, backlog-lane.mjs:87-116, :183, :185.
What would go wrong: nothing; the grounder opens the wrong line.
Smallest correction: use :568-642, :775-777, listProof :380-413.

### Other checks you asked for
- (3) plan-prep carries any file in the evidence folder: TRUE. rule-lists.mjs:727 refuses only on missing GROUNDER-PLAN.md; :729-730 are `git add -- <ev>` and `git commit -q -m ... -- <ev>`; :740 the gate dry run runs after; a `changed` check via `git status --porcelain --untracked-files=all -- ev` (:728).
- (4) A `Plan: <id> sha256:<12>` line is `Plan: ${id} sha256:${planHash(taskText)}` where planHash = first 12 hex of sha256 of squash(title + " " + body after front matter) (:552-555). A FOLD-CHECK.md of the planned form (Checked by, Verdict, last Plan line) could be checked by the planned code if the Plan regex reuses :634 (`^\s*Plan:\s*(\S+)\s+sha256:([0-9a-f]{12})\s*$`); 412's real file has its Plan line inside backticks in the body, so it would not match that regex (and has no Verdict line), see rc#1 and rc#6.
- (5) (a) exit 3 and stderr containing the file name: the gate prints each error as `backlog-lane: refused: plan gate: ...` and exits 3 (backlog-lane.mjs:112); "plan gate ok" text is the :113 line. (b) exit 3 with `expected:`: the existing Plan-line error already prints `expected: ${line}` (:635-636); both GROUNDER-PLAN.md and FOLD-CHECK.md would be stale in the same run (two lines). (e) no existing test asserts an unsuffixed no-list lens-input name (grep of buildLensInputs/suffix users: backlog-lane.logic.test.ts:581-582, check-lane-close.logic.test.ts:835-862 and :133 name files from the tool's stdout, plant-evidence.mjs:39-40 is compliance with a list), so (e) holds as stated. (f) cannot be run (no suite).
- (6) Unsuffixed no-list outputs under docs/reports/lanes: none are tool-made. `grep -rl "^LIST none sha256" docs/reports/lanes` finds only -pN files (BL-V2WHOLE 4, BL-F412 2, BL-GATE375 6, BL-PREP418 2 files); the only unsuffixed `in-out-code-review.txt` / `in-out-error-paths.txt` are BL-MASSING (raw-diff, no LIST stamp). 43 unsuffixed non-compliance outputs exist beyond that; they are raw-diff route (:509) and the change does not touch it. The close check runs per commit from .husky/commit-msg:7 on the task being closed; I found no scan of closed lane folders in scripts (I did not open every test that mentions docs/reports/lanes).

Facts checked and found TRUE: gap 2 mechanism (rule-lists.mjs:425 and the unsuffixed names, reproduced), list null for no-template-list (:775), stamp "chunk 1 of 1" for a diff, listProof accepts unsuffixed compliance, F3 route refuses a stamped unsuffixed input, -pN stamp route at :487-503, planGateErrors called only from backlog-lane.mjs, GROUNDER-PLAN :609 / seats :620-622 / Plan line :634-636, nothing reads a fold-check file, plan-prep add and commit of the whole evidence folder (:726-730), refusal only when GROUNDER-PLAN.md is absent, backlog-lane.mjs:183/185 text, no-list pairs are -p1 in BL-V2WHOLE, BL-F412, BL-GATE375, BL-PREP418, BL-MASSING holds unsuffixed raw-diff inputs, 412 has FOLD-CHECK.md with "Checked by:" and no Verdict, 418 has none, 375 has FOLD-VALIDATION.md, statuses 375 RUNNING / 412 and 418 BUILT, planHash formula, the flow test at backlog-lane.logic.test.ts:779-800.
