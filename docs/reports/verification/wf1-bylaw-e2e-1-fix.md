# Verification: wf1/bylaw-e2e-1 fix (verify-13 B1)

- Branch: `wf1/bylaw-e2e-1` @ `fe1b02ce` (parent 53a21030; lane worktree `~/Buildo-wt-e2e`, untouched).
- Lane: verify-13b (R-EZ, read-only). Date: 2026-10-20. Prior report: `wf1-bylaw-e2e-1.md` (B1 BLOCK, N1–N9).
- Throwaway worktrees: `b/wt-e2e` (full run), `b/red-53a21030` (eval-lots before), `b/wt-e2emut` (staleness mutation, restored).

## Verdict: **PASS-WITH-NOTES**. B1 is closed.

| # | Check | Result |
|---|---|---|
| 1 | Full suite | **19,184 passed / 4 skipped / 936 todo / 0 failed** (as the commit claims) |
| 2 | tsc / step-validate --all --fast / all 14 pre-commit `--check` arms / tracker / lineage / golden `--check` | all exit 0 |
| 3 | **B1 / F-02** (`150.7.60.20(3)(A)`) | Reclassified OWED, with `owed: suite_rear_setback_m (M-198(1): max(the subject lot's Layer 2 front_setback_m …, 1.5 m) … P5.13)`. Checks: reach on 5370045 / 5397229 (through lots) and excluded on 5403712 (`condition through_lot`). **No value is asserted.** The note quotes M-198(1) verbatim (69a:326). Correct |
| 4 | **F-01** (`150.7.60.20(6)(C)`) | OWED, `suite_side_setbacks_m`. The owed text restates M-198(2) faithfully ("the larger of (A) (the same proxy, averaged with the principal's required side yard, min 1.5 m) and (C)"). Reach on corner lots 5396831 / 5144129; excluded on the interior lots 5403712 / 5118342. No value. Correct |
| 5 | Operator's-words lines (N4) | 8 lines are labelled "Operator's words (`envelope-answers.json` note, `<unit>`)". Compared mechanically with `docs/reference/envelope-answers.json`: **7 are verbatim** apart from whitespace collapse (double spaces become single). `10.10.40.1(7)#whole` is cut at 400 of 430 characters **with no ellipsis**. No "Operator answer:" line remains. The disposition text is labelled "Disposition (corrected value)" |
| 6 | Shared `assembly.mjs` (N1) | `eval-lots.mjs` was run at 53a21030 and at fe1b02ce on the same `lots.json`. Both print `sha f50bc38fcbea`. The output files differ **only in the `root` path field**, so the evaluation is byte-identical. The helper and eval-lots now both import `loadRealLotAssembly` |
| 7 | Staleness test (N9) | The new `it('cases.json is fresh …')` runs `golden-lots-cases.mjs --check`. **Mutation:** one tracker row's verdict `wrong` → `matches` makes the test **RED** (1 failed). Restored → green. A `state`-only edit stays green, which is correct because `state` is not a generator input |
| 8 | Lot existence (prior check 12; `e2e-dbcheck.cjs` under the dblock, READ ONLY transaction) | **10 of 10 found.** Zone, exception, corner / through / lane / major flags, frontage and depth all equal the fixture (`b/e2e-dbcheck.out`) |
| 9 | N3 / N5 / N6 / N7 / N8 | Fixed as described: F-03 cites M-198(4); the self-reference is gone; the `buildings_on_same_lot` partial check is added; the OWED case with no check is named; there is no UNREACHED class; and the NOT_EXERCISABLE assertion now checks every golden exception lot |

## Notes
- **N-a.** `10.10.40.1(7)` operator quote: truncated without "…". This is cosmetic.
- **N-b. The staleness test turns the integrate-13 merge RED until cases.json is regenerated.** Now that the test is in the suite, the merge with bylaw-fix-1 cannot pass `npm test` until a lane runs `golden-lots-cases.mjs --write` on the merged tree. That is intended (prior N9), and it is listed in the plan.
- **N-c. add/add collision with bylaw-fix-1.** That branch ported an older copy of the four golden files (generator, test, helper, cases.json). Resolution is in plan §4.2.
