# REPORT: BL-CTX432 (task-432, INPUTS.4, RR-0378)

1. What changed: the brief tool backlog-brief.mjs has a new --board <dir> flag that reads the decisions from the board checkout (a bare flag or a board with no backlog/decisions stops with exit 1, no fallback); the lane brief's lens line has one new sentence giving the lane the re-run command and telling it to use the highest-numbered context file; README.md:124 has one sentence. backlog-lane.mjs:161 and check-lane-close.mjs are not touched (git diff stat: 6 files in commit 3dc4e0c0a).
2. Acceptance: (1) red.out shows five failing assertions at the designed place, green is commit 3dc4e0c0a through the real hooks ("GATE OK ... POLICY CHECKS OK (commit-msg)", commit.out). (2) Replay on a scratch clone of wf1/inc1b-simple423 printed RR-0374 and RR-0375 in "Decisions naming this task" and the widened Files line (11 entries counted, the plan said 12; acceptance2.out). (3) Close check on contexts r1..r3: not touched, existing pin check-lane-close.logic.test.ts:813 stands; no run here. (4) The T4 test is green and the README sentence is in; (5) the throwaway-clone close check is below.
3. What could not be built as the plan says: nothing; the one deviation is a test regex fix (the "Decisions in force" heading carries a parenthesis) in the same landing commit, and the Files-line count of 11 against the plan's 12.
4. Unverified: that a lane can read ~/Buildo-wt-board from inside its sandbox (plan UNVERIFIED, not tested here); acceptance 3 by a run; the grounder has not ruled any of the 39 findings.
5. Task is left RUNNING, grounder owed (RR-0359).

## Evidence
- Commits: red attempt refused (red.out, red.full); landing 3dc4e0c0a (commit.out); records ddad858dc (commit-records.out); report copied in a third commit.
- Own rule used: context-r3.md was made with `node scripts/analysis/backlog-brief.mjs --task task-432 --lane BL-CTX432 --stage 1 --root ~/Buildo-wt-ctx432 --board ~/Buildo-wt-board > /dev/null` and is the --context of every output.
- Output review: 11 outputs (nine per-list compliance, out-code-review-p1, out-error-paths-p1) in docs/reports/lanes/2026-11-22/BL-CTX432/, inputs beside them, TASK = task-432; the compliance input of each list is whole (one chunk, no -pN). 39 findings in FINDINGS.md (3 DeepSeek lines were labelled BUG HIGH: out-compliance-inc-S#1 whose text reads "task-432 not pasted-witnessed? no." and out-compliance-ms-S#1), untriaged, no verdicts by me.
- Close check on a throwaway clone (task staged BUILT, deleted after), close-check.out: exit 1 with exactly three refusals: missing reference to REPORT.md, missing reference to GROUNDER.md, GROUNDER.md missing. No refusal about the review material (outputs, inputs, chunk stamps, hashes, finding lines, context).
- Not done on purpose: no closing commit, task stays RUNNING; no push.

STATUS: BUILT in code and tests, output review run, findings untriaged; task RUNNING, grounder owed.
