# TRIAGE (plan round, lane BL-COMPLY2, task-366)
Round 1 outputs: plan/plan-compliance.txt, plan/plan-code-review.txt, plan/plan-error-paths.txt (DeepSeek lenses via `scripts/deepseek-review.js review PLAN.md --template ... [--context rules-context.md]`). This is the LANE'S FOLDING DECISION per finding (what the plan changes), NOT a verdict: the verdicts belong to the separate grounder (GROUNDER.md, owed). Ids = `<file stem>#<ordinal among BUG/DEFER lines>` (the same form the new close check reads).

plan-compliance#1 (BUG, freeze lift) FOLD as a record: the operator's by-name lift is in the brief goal and is copied verbatim into the 08_agents.md / 137_mcqueue.md dated notes (step 4); no hook waits on it.
plan-compliance#2 (BUG, lens set) FOLD: only the compliance entry of the lens line is replaced by one run per list; the per-type lines (code-review, ux, error-paths, security) stay as built by task-358.
plan-compliance#3 (BUG, ground-truth first) NOT FOLDED, scope: Spec 08 5.2 is a separate role; the card names a lens per list and a separate grounder, not a ground-truth hook. Stated in the brief block as the grounder's job (opens the file:line); listed UNVERIFIED in REPORT.
plan-compliance#4 (DEFER, reason on REJECTED) FOLD: a REJECTED verdict line must carry a reason after the file:line (08_agents.md 5.3 "with reasons").
plan-compliance#5 (DEFER, tests in plan) FOLD: case list below.
plan-compliance#6 (DEFER, milestone) REJECT: task-366 already reads `Milestone: m-1` (backlog task view task-366 --plain, line 10).
plan-compliance#7 (DEFER, template library fix) KEEP, named: the defect fired on this lane's own plan review (prompt 317388 chars against 120000 because a dollar-quote pattern in the plan text re-inserted the template tail); without it "list pasted whole" is false. Grounder may reject.
plan-compliance#8 (DEFER, cite tree facts) FOLD: REPORT carries file:line (124a_step_standard_policy_appendix.md:240 R-BA row under the B10 heading :232; protected-paths.json keys layer23, frontend; review-template.js:68-72).

plan-code-review#1 (BUG, replace cause) FOLD, reworded: two measured defects, (a) dollar patterns in a replacement string expand (the dollar-quote pattern inserts the text after the match), (b) sequential passes re-scan inserted text for later tokens. Fix: one regex pass, function replacer. Tests: a value holding the dollar-quote and dollar-ampersand patterns stays literal; a value holding a token stays literal; both template occurrences replaced.
plan-code-review#2 (BUG, date) FOLD: no date is computed; the hook reads every docs/reports/lanes/*/<lane>/ in the index.
plan-code-review#3 (DEFER, contiguity) FOLD: either one unsuffixed file, or -p1..-pK with no gap, never both.
plan-code-review#4 (DEFER, n basis) FOLD: 1-based ordinal among BUG and DEFER lines of that file; `rule-lists.mjs findings <dir>` prints the ids.
plan-code-review#5 (DEFER, fence) FOLD: the test calls the module's own section function.
plan-code-review#6 (DEFER, globs_from keys) FOLD: validator checks key exists and is a non-empty glob array.
plan-code-review#7 (DEFER, exempt) FOLD: exempt entry resolves to an empty list set with exempt flag; brief says so; test.
plan-code-review#8 (DEFER, imports_from) FOLD: consumed by resolve for the import row; test with a temp tree.

plan-error-paths#1 (BUG, vacuous list) FOLD: loader refuses a missing file, a selector with 0 or more than 1 heading, and lens-input exits non-zero naming list id and selector.
plan-error-paths#2 (DEFER, exempt-only) FOLD (same as code-review#7).
plan-error-paths#3 (DEFER, replace twice) FOLD (same as code-review#1).
plan-error-paths#4 (DEFER, positional ids) NOT FOLDED: stated limit; a re-run of a lens needs fresh verdicts, a missing id is refused by the check. Listed UNVERIFIED in REPORT.
plan-error-paths#5 (DEFER, stale parts) FOLD for lens INPUT files (the helper removes its earlier <out>*.txt before writing); output files are the lane's redirect.
plan-error-paths#6 (DEFER, section over the bound) FOLD: exit non-zero naming list, section and sizes.
plan-error-paths#7 (LOW, increment_docs miss) FOLD: launch refuses naming the milestone letter.

## Test case list (written into the plan, 08_agents.md 11.4)
rule-lists.logic: table valid; every file exists; every selector exactly one heading (module function); every row glob (and globs_from key) matches a tracked path; resolve mobile+api names all lists of both rows; unmatched entry listed; exempt flagged; import row fires on a temp tree; record-only default; missing increment doc entry refused; lens-input one file when small, split by headings when big, refuses a section over the bound, never drops text (concatenated parts contain the whole list), removes stale inputs.
backlog-lane.logic (fixture gets a Files line): brief carries the block and per-list lens lines; unmatched path and missing Files line refused (exit 3, path named); record-only gets queue lists.
check-lane-close.logic: refuses missing lens output; missing GROUNDER.md; Grounder equals Lane (header and task lane); finding without verdict; REJECTED without reason; gap in parts; passes when complete; exempt: no trailer, no lane assignee, no status move; record-only without findings needs no grounder.
review-template.logic: dollar patterns and tokens in values stay literal.
Red = commit attempt with only the new test files and the task file staged; green = the real commit.
