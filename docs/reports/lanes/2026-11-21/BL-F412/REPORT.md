Task-412 built: one row (review-followups) in scripts/analysis/rule-lists.json and one describe (two cases) in src/tests/backlog/rule-lists-table.logic.test.ts.
Test written first; red.out shows failing assertions (resolve refused, exit 3 not 0), then green through the real hooks (commit.out, 21 passed).
Commit A 52a49566e on wf1/inc1b-f412 holds exactly three paths (row, test, task file); no push.
Acceptance (a)-(e) pasted on the task with --append-notes; validate prints ok 55 lists, 23 rows (22 at branch start).
Output review done on DeepSeek (code-review, error-paths, 9 compliance lists); 30 findings listed untriaged in FINDINGS.md; task left RUNNING, grounder owed.
Notes: gitFreeEnv() is not a name in the repo; the test spawns through helpers run()/script() which strip every GIT_* variable. First red run had a fixture defect (missing protected-paths copy); fixed before the recorded red.out. Plan-stage plan-*.txt outputs are not copied here (they live in docs/reports/reviews/task-412/); UNVERIFIED whether the close check accepts them from there.
STATUS: BUILT in commit A, review findings untriaged, grounder owed.

2026-11-21 CORRECTION (fix round 1): the note above that gitFreeEnv() does not exist in the repo is false; scripts/analysis/rule-lists.mjs:53 exports it. The test helper cleanEnv (src/tests/backlog/helpers.ts:30) strips the same GIT_* keys and is equivalent for the test (grounder ruling).
