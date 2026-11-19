# REPORT BL-HYG task-364 (SRCH.HYGIENE-1)
Plain lines for the operator:
1. Before: the entitlement route comment said the search page reads "N of 20 reports left" (allowances are 10, 10, 25); lotForm.ts said the report applies the semi answer (nothing reads it); the semi page header said it "makes no extra request" although Continue issues one answered lookup. After: each comment says what the code does now (no allowance number; the report does not apply the answer yet, 7.25 task-209; opening adds no lookup and Continue issues the one answered lookup).
2. Not built: nothing owed. Stale cites on records were corrected by dated note on task-343 and task-348 (text kept); the BL-METER lane report is a dated record and was left unchanged. Another lane had corrected none of these items.
3. Operator item: none. Account page named as a reader in route.ts:6 is not in the git grep of readers (UNVERIFIED, left as written, outside the task).
4. Lenses: compliance only (comment-only change), at plan (r1-compliance.txt) and output (r2-compliance.txt); plan lens changed the semi wording (avoids the phrase "no extra request"); output lens changed nothing (3 findings rejected, TRIAGE.md).
5. Unproven: mobile jest files untouched, none run; no device or live check needed.

## AC table
| AC | Evidence |
|---|---|
| 1 | `git grep -n "of 20 reports" -- src/app/api/parcels/entitlement/route.ts` exit 1 (nothing). Lines 5-7 digits are only dates, "4.", 403 and the spec id FE-05; no allowance number. |
| 2 | mobile/src/lib/lotForm.ts:8-9 "which does not apply it yet ... the effect is the semi calculation of 7.25 (task-209)". |
| 3 | `npm run typecheck` tsc --noEmit printed nothing (clean), before the rebase and after it. Diff filter: git diff -U0 over src and mobile, lines not starting with // after +/-: 0 (only 3 comment hunks, 8 lines). Checks AFTER all exit=0 in checks.out. |
| 4 | `git grep -n "no extra request" -- semi-question.tsx` exit 1; header line 9 names the answered lookup on Continue. |

Red-first: not applicable (comment-only). Hooks: commit.out (refused1 kept in commit-refused1.out: check-task-files refused task-343/348 outside the Files line; answered by committing those notes under their own Task trailers). Commits (post-rebase): 33a23f319 (work), 94b866b82 (task-343 note), ecdc061e6 (task-348 note), reports commit follows.
UNVERIFIED: Account page reader; gate.mjs run result is pasted below.
STATUS: ready
