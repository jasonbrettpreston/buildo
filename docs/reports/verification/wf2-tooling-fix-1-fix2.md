# verify-12h: wf2/tooling-fix-1 fix 2 @ 3d2e1e08

Lane: verify-12h (R-EZ independent verification). Read-only; I did not write this work.
Branch: `wf2/tooling-fix-1` @ `3d2e1e08` (worktree `~/Buildo-wt-tf1`). Parent: `ca807582` (verify-12g PASS-WITH-NOTES, follow-on).

## Verdict: PASS-WITH-NOTES

Follow-on notes N1, N2, N3 and N5 are addressed. No blocking finding.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | R-GS source | Spec 124 R-GS and 124a §B20 cite `.cursor/archive/pilot2_load_ravines_active_task_closed_2026-08-27.md` :2 and :218. Both quotes match the file verbatim; the :218 quote uses "…" elisions only. The file is tracked (`git ls-files --error-unmatch` OK; e000dfb2). step.schema.json:4871 is kept as "implementation reference only". "y to liftinh A-5" is cited. |
| 2 | "untracked" claim | Removed. The only remaining "untracked" in 124 / 124a is the correction note ("an earlier draft called the plan untracked …"). |
| 3 | R-GQ shrink-only lock | `baselineShrinkFindings(current, committedBaseline())` checks the baseline against `git show HEAD:<baseline>`, keyed by step + key. Mutations in a throwaway worktree, all `--check` exit 1, each with the "not in the committed baseline (HEAD)" line: swapped key, swapped step, removed-then-re-added under a new key. Pure tests: the unchanged baseline and a shrunk baseline give []. The case only this lock catches, re-adding an entry after a shrink (HEAD minus X, then X back), is flagged. |
| 4 | Bundled night item (5) | Lists `--write` and the four re-citations R-AZ → R-GT: LC-D6/LC-D11 (`load-centreline` deviations[0]), M-D10 (`load-massing` deviations[4]), N-D5 (`load-neighbourhoods` N-D5 entry). I checked the indexes; each `adjudicated_by` still names R-AZ. R-GR's amendment says the ledger leads until that night. |
| 5 | generate-last-measured CLI | Throwaway worktree at 3d2e1e08, `git status` checked after each run: `--help` exit 0; no flag 2; `--bogus` 2; `-h` 2; `--check --write` 2; `--help --write` 0 (usage only); `--check` 0. Nothing was written in any case. `.husky/pre-commit`:31 still runs `generate-last-measured.mjs --check`. |
| 6 | Red-first | Tip `p2c4-last-measured.logic.test.ts` in a throwaway at ca807582: **6 failed / 22 passed (28)**, namely S1–S3 and C1–C3. As the commit says, the old generator rewrote 17 descriptors during that run; I put back the HEAD bytes in the throwaway and removed it. At the tip: 28/28. |
| 7 | Suite | Full suite **17,891 passed / 0 failed** (4 skipped), exit 0 (`h/tf1fix-suite2.log`). The first run, while other jobs were running, had 1 failure: `deepseek-exec-fences.infra` "directory junction … PATH_OUTSIDE_REPO", ENOENT in `cpSync` of an OS tmp template (`h/tf1fix-suite.log`). That file alone then passed 121/0, and the full rerun was clean. This looks like an environmental flake unrelated to the diff. |
| 8 | step-validate / #36 | `step-validate --all --fast` exit 0; **#36 568 / 134 / 0** PASS (`h/tf1fix-sv.log`). |
| 9 | spec-split / size | `spec-split-check --check` clean (38 moves, 6,721 citations). Spec 124 **377 lines**, 125,428 B (budget 126,959). |
| 10 | Diff scope | 6 files: Spec 124 (R-GQ, R-GR, R-GS cells), 124a (§B17 item (5), §B20 R-GS source + table + ACCURATE row), the generator, the test, 2 red/green evidence files. Matches the message. `~/Buildo-wt-tf1` is clean except the pre-existing `mobile/node_modules`. |

## Findings

**BLOCKING:** none.

**NOTE**

- **N1. The C1–C3 CLI tests run the generator in the live checkout.** If the CLI regresses, the test run itself rewrites the 17 descriptors in the developer's tree; the red-first run did exactly that. Consider pointing them at a temp copy, or passing a root so the tests run against a fixture tree.
- **N2. The shrink lock reads the working-tree baseline against HEAD, not the staged index.** It also relies on every commit passing pre-commit. S3 LIVE additionally pins the set to the commit that first added R-GQ, which bounds a hook bypass. This is acceptable.
- **N3. Flaky test.** `deepseek-exec-fences.infra` (junction case) failed once under concurrent load with an ENOENT on its tmp template copy. It is not related to this branch, but worth a ticket if it recurs.
- **N4. Carried:** follow-on N4 (backfill-9 R-FV/R-FX/R-FY vs R-GS/R-GT on LC-D7/LC-D11/LC-D12/M-D10/N-D1/N-D5) remains for the integration lane, as the commit says.

## Reproduction

`h/mut-tf1.mjs` (cwd = throwaway worktree), `h/tf1fix-suite.log`, `h/tf1fix-suite2.log`, `h/tf1fix-sv.log`. Throwaways `h/wt-3d2e` and `h/wt-ca80` were removed with `git worktree remove` after `git status` was clean.
