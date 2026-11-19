# REPORT BL-CHK7 · task-4 (CHK.7, Increment 1·A)

## What landed
- Commit 901ea6a02 `feat(124_step_standard_policy): CHK.7 ID ledger check in mcbylaws-queue-check ...` (Task: task-4, task file in the diff): new exported `idLedgerErrors({cwd, entries})` in scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs (header lines 13-14, block comment above the function) and one call in gate.mjs `staged()` (the pre-commit `--staged` flag; result also returned on the fast path). Test: src/tests/mcbylaws-id-ledger.logic.test.ts.
- Commit 0ca2d9ccb fix for two KEPT output-review items (rename onto a fresh migration number; slow path keeps id lines).
- Hook evidence: commit.out "Test Files  8 passed (8) / Tests  140 passed (140) / GATE OK" and "[wf1/inc1a-chk7 901ea6a02]"; fix.out "Tests  141 passed (141) / GATE OK" and "[wf1/inc1a-chk7 0ca2d9ccb]". Typecheck ran inside the pre-commit hook (both commits landed).
- Red: red.out ends with `src/tests/mcbylaws-id-ledger.logic.test.ts(38,12): error TS2339: Property 'idLedgerErrors' does not exist ...` and the commit was refused (rc=1).

## What it checks (one FAIL line per id: `FAIL:Q:id-<duplicate|unclaimed|no-row>:<id>:<file>`)
- A queue heading `**MB-nn` / `**MF-nn` added by the staged diff (count above HEAD): repeated number = id-duplicate; number at or above the queue's "Next free id" = id-unclaimed. Prose, dated notes, list lines and fenced blocks are never read (cases in the test).
- A new migrations/NNN_*.sql (or a rename onto a new number): another tracked file with the number = id-duplicate; no queue line naming it = id-no-row. The standing duplicate 315 is not judged (not introduced; test case).
- Undecidable (no Next free id line, unreadable index) = one FAIL:Q:cannot-decide.
- Ledger: the only ID ledger is LOCAL ~/Buildo-scratch/ids (docs/specs/00-architecture/137_mcqueue.md:46); the repo's claim record is the "Next free id" line (137_mcqueue.md:51). The check reads queue rows and that line only; it never reads ~/Buildo-scratch. docs/reports/policy/policy-ledger.json is the unrelated policy-check escape file.
- Not covered (no repo claim record): card ids (CARD-*), FE, M and prereg-round ids (the scratch ids/check.mjs still covers them at push time). No status-word check (R9 note).

## Reviews
- r1 plan round: r1-plan.txt, TRIAGE.md (5 KEPT folded: failure handling, wiring test, migration case wording, prose/note/fence exclusions as tests, output grammar; rest REJECTED with opened lines).
- r2 output round, one lens: r2-output.txt, TRIAGE.md (2 KEPT fixed in 0ca2d9ccb; rest REJECTED with opened lines).
- Panel tool run-panel.mjs and the verify step were not run (retired per the lane's binding instruction); START.snapshot taken, claim made.

## Acceptance criteria
Checked with evidence: 2 (plan reviewed, r1), 3 (write scope claimed: lanes.mjs claim output), 4 (plan review run through the repo tool with the plan template), 5 (every finding grounded against opened lines in TRIAGE.md), 6 (red.out then commit.out), 7 (TRIAGE and review outputs committed in docs/reports/lanes/2026-11-19/BL-CHK7/). Not checked: 1 (the brief fixes the pre-registration into the work commit, not alone; literal AC1 "committed alone" is not met). 8 not applicable (no McFrontend build).

## Gaps and notes
- Pre-commit only (the brief's design limit); no push/CI call site (r1 finding R2, rejected). A CI range call would be a follow-up task.
- UNVERIFIED: the check against the real queues' full history (only fixtures and the two real queues' format were checked: 0 fences, 0 CRLF, Next free id on MCBYLAWS-QUEUE.md:26 and MCFRONTEND-QUEUE.md:5).
- No push, no DB, nothing outside ~/Buildo-wt-chk7 and the lane dir.

Question: should card ids get a repo-readable claim record (a committed list) so this check can cover them, or stay with scratch ids/check.mjs?

STATUS: ready
