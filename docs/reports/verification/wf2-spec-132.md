# Verification: wf2/spec-132

- Branch: `wf2/spec-132` @ `1fb8bd07` (worktree `~/Buildo-wt-s132`; parent `208e8a82` = wf2/p4-integrate-12)
- Lane: verify-13 (R-EZ, independent, read-only). Date: 2026-10-20.
- Method: ran the checks in the lane worktree (no tracked change, `git status` afterwards showed only the untracked `mobile/node_modules` that was already there). Red-first was run in a throwaway detached worktree at 208e8a82, which has since been removed. No DB was used and .env was not read.

## Verdict: **PASS-WITH-NOTES**

## Checks

| # | Check | Result |
|---|---|---|
| 1 | Full suite (`vitest run --exclude **/*.db.test.ts`) at tip | **18,066 passed / 4 skipped / 0 failed** (805 files). Matches the claim. Log: `verify-13/s132/suite.log` |
| 2 | `tsc --noEmit` | exit 0 |
| 3 | `step-validate --all --fast` | exit 0. R-EY: 4/43 read V3; E1/E2 PASS |
| 4 | `spec-split-check --check` | clean: 40 moves, 7,360 citations, 0 dangling, budgets held, totality holds, every spec has a role |
| 5 | `generate-step-handbook.mjs --check` | "132_step_standard_handbook.md is up to date", exit 0 |
| 6 | Size claim | 617 lines / 74,851 B; `generated_size_caps["132"]` = 925 lines / 112,000 B, with a measured why. Matches the claim |
| 7 | Red-first: tip `spec132-handbook-roles.logic` on parent 208e8a82 | **14/14 FAIL**. At tip, 14/14 pass. Matches the committed red/green evidence (`docs/reports/red-evidence/spec132/roles-lock-{red,green}.json`) |
| 8 | Arm (iii-b) mutation, on the aed98413 tree (a superset) | Each mutation came back as DRIFT exit 1: `Spec 132 §core.99 (R-L)` ("not a handbook line") and `Spec 132 §core.1 (R-EY)` ("R-EY maps to x-v3.1, not core.1") |
| 9 | Arm (vii) mutation | Each came back as DRIFT: removing Spec 124's role banner ("no role banner"), and adding `\| R-ZZ \|` to historical Spec 120 ("new rule id R-ZZ in a historical spec") |
| 10 | `role_banner_pending` | 108 at this tip (R-GW says "108 at landing"). It shrinks to 105 on layer2-spec, as the shrink-only rule allows |
| 11 | Spec 124:11 flip (R-GV) | The text was amended from "On conflict during the transition, Spec 122 governs" to the register/standard split, citing "y to this revised version". Spec 122 has left `historical_design_records`; 119/120/121/123 are still listed |
| 12 | 124a §B25 | It has conflict checks and four seven-question V3 tables (R-GU…R-GX) that include EXTERNALIZED |

## Findings

**BLOCKING:** none.

**NOTE**
- **N1.** R-GU…R-GX cite chat approvals ("y to both", "y to this revised version") but have no decision log. R-HK (decision logs, introduced next on wf2/layer2-spec) does not require one retroactively, and `decision-log --check` only checks logs that exist. Backfilling a `2026-10-20-spec132-rulings.json` would make these four rulings mechanically traceable like the rest. This is optional and the operator decides.
- **N2.** The ids are provisional (R-GU…R-GX) and spec-132 is an ancestor of wf2/layer2-spec, so landing layer2-spec lands this commit too. See `integrate-13-plan.md`.
