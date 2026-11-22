# REPORT BL-NOTE435 (task-435, Increment 1·B, McFix, INPUTS.7, RR-0382)

1. What changed: one dated note now sits under the Status line of section 12 of docs/specs/00_engineering_standards.md (the exact plan text, 2 added lines, 0 deleted), and docs/reports/generated/rule-lists-by-kind.md was regenerated (only the eng-all count 46,076 to 46,613 and six totals).
2. Acceptance printed: grep -c "Dated note 2026-11-22 (M-246" gave 0 before and 1 after; page --check exit 0 before, exit 1 "out of date" after the insert (red), exit 0 after page --write (green); work commit 54fb119e8 passed the real hooks (commit.out, ends "GATE OK ... POLICY CHECKS OK").
3. Could not be built as the plan says: nothing; no deviation.
4. Unverified: the 31 output-review findings are untriaged (grounder owed, RR-0359); the real close (status BUILT) was not made, task left RUNNING.
5. gate.mjs: all outputs exist, scope 42 in scope 0 unexplained; only "FAIL" line is "ref moved since the snapshot: Buildo-wt-note435 HEAD 94aaed975 -> c0dce5e66", my own two commits (expected for a build lane). No push, no suite.

## Evidence
- Plan said no new test (Q3 RULED); red = real commit attempt with only the note and task file staged, refused by pre-commit "rule-lists: docs/reports/generated/rule-lists-by-kind.md is out of date" (red.out last line; failing assertion at the designed place, not typecheck).
- Green: commit 54fb119e8 (commit.out). Records commit c0dce5e66 (commit2.out).
- Output review: context-r3.md (fresh context from backlog-brief.mjs); compliance once per list (10 lists, one file each, no -pN) plus code-review-p1 and error-paths-p1 (the tool split these two inputs; named -p1 to match the committed input). Files in docs/reports/lanes/2026-11-22/BL-NOTE435/. 31 findings: code-review 1, compliance 28, error-paths 3 (see FINDINGS.md by id, untriaged, no verdicts). Recurring themes for the grounder, not verdicts: note placement vs "beside the library lines"; the section 11 clause; the 126 section 5.4 anchor.
- Close check on a throwaway shared clone with the task staged BUILT (check-lane-close.mjs): refusals were only the two missing --add-ref lines (REPORT.md, GROUNDER.md) and "GROUNDER.md is missing"; no refusal about the review material, chunks, inputs or headers remained. (Clone removed.)

STATUS: BUILT in commits, task RUNNING, grounder owed (RR-0359). Question: none.
