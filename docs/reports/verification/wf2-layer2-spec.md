# Verification: wf2/layer2-spec

- Branch: `wf2/layer2-spec` @ `aed98413` (worktree `~/Buildo-wt-l2spec`; parent `1fb8bd07` = wf2/spec-132, on int12 `208e8a82`)
- Lane: verify-13 (R-EZ, independent, read-only). Date: 2026-10-20.
- Method:
  - Checks ran in the lane worktree; afterwards `git status` showed only the untracked `mobile/node_modules` that was already there.
  - Mutation tests ran in a throwaway detached worktree `verify-13/wt-l2` at aed98413. Every mutated file was restored from `git show HEAD:` and the worktree was removed.
  - Red-first ran in a throwaway worktree at 1fb8bd07 with the tip test files copied in. It was restored and removed.
  - Scripts: `verify-13/cmp-dlog.cjs` and `verify-13/cmp-roles.mjs`.
  - No DB was used and .env was not read.

## Verdict: **PASS-WITH-NOTES**

## Checks

| # | Check | Result |
|---|---|---|
| 1 | Full suite at tip | **18,100 passed / 4 skipped / 0 failed** (808 files). The lane's own `scratchpad/l2spec/suite.log` shows 2 failed / 18,098, which was an earlier run; the tip is clean |
| 2 | `tsc --noEmit` | exit 0 |
| 3 | `step-validate --all --fast` | exit 0 |
| 4 | `spec-split-check --check` | clean: **41** moves (M36 added), 7,428 citations, budgets held, every spec has a role |
| 5 | `decision-log.mjs --check` | clean: 2 logs, 17 decisions, 17 register rows, 37 citations |
| 6 | `generate-step-handbook.mjs --check` | up to date |
| 7 | **(a) Page-export fidelity** (`cmp-dlog.cjs`) | All 14 entries compared field by field: group←`step`, question←`key`, recommendation←`note`, evidence[]←{file→label, quote}, decision←answers/`decision`, decided_at←answers/`updated_at`. **0 differences**, no entry missing, nothing extra. All 14 are `keep`. The export fields `stage`, `source`, `file` and `searched` are not carried over (constant, "scenario plan"/"plan"/"PLAN.md §3.7"/"") |
| 8 | (a) Chat decisions | The R-12 amendment `operator_quote` is exactly "your rigth we want the renovation section". The spec-roles log has `source.operator_quote: "y"` and Spec 123 `approved_option: "(a)"`. Every recommendation, summary, must-go-with, heading and Today cell is a **verbatim substring** of `scratchpad/spec132/RULINGS-NEEDED.md` (`cmp-roles.mjs`) |
| 9 | (b) Register rows vs recommendations | Rows read one by one against PLAN.md §3.7 and RULINGS-NEEDED.md. The substance matches in all 17. Scope additions are listed in N1–N4 |
| 10 | (c) `--check` mutation tests | **RED (exit 1)** for: M-231 row deleted; citation to unknown `#R-99`; citation to unknown log `2026-10-21-nope-rulings`; routed row renamed M-233→M-299; new approved decision R-15 with no row; R-HJ row citation removed; M-231 cites `#R-9` instead of `#R-4` ("R-4 … no register row cites it"); amendment with empty `operator_quote`; decision value outside the vocab. No mode or an unknown flag gives **exit 2**. Mutations that **survive** are in N5 |
| 11 | (d) Spec 134 vs R-1…R-9 | §1 = R-1 (scope table and full rescan), header/§1 = R-2, §7 = R-3 / R-8, §5 = R-4 (lot-wide, per target, 91,744 lower bound), §4 = R-5 (both sets plus the total map and the fallback named as a new ruling), §6 = R-6, §8 = R-7. R-9 (CoA `u`) is a scenario-step ruling and is in LC-60, not Spec 134, which is correct. Chain phases 22/24 match `scripts/manifest.json` sources (enrich_parcels is 22nd, link_parcel_abutments 24th). Design detail beyond the rulings is marked planned, open or P2-sourced; see N2 |
| 12 | (e) 120/121/123 roles | 120 and 121: one `historical` banner plus a dated note, Status `HISTORICAL`, baselines none / M1–M14. 123: `standard` banner. Line 12 (now 14) reads exactly as RULINGS-NEEDED (a) proposed. 123 has left `meta.historical_design_records` (parent list had it; tip list is 119/120/121/122a). `role_banner_pending` went from 108 to 105 |
| 13 | Red-first on parent 1fb8bd07 (tip tests) | `decision-log.logic` fails to load (no script). `spec134-resolve-bylaws.logic` is 14/15 FAIL. `hooks-composition.infra` has 3 FAIL (15 arms). `spec-split.infra` real-tree check FAILs. `spec132-handbook-roles.logic` has 5 FAIL (R-HH/HI/HJ, pending shrink, arm vii on 122a). Committed red evidence `docs/reports/red-evidence/decision-log/check-red.txt` shows 17/17 decisions uncovered |
| 14 | Hook | `.husky/pre-commit` gains `decision-log.mjs --check`, making **15** chain-era arms. `precommit-budget.json` was re-measured, with a new `hook_sha256` |
| 15 | V3 tables | 124a §B27 has conflict checks plus 10 seven-question tables (R-HH and R-HI share one) |

## Findings

**BLOCKING:** none.

**NOTE (scope additions in register rows: the operator should confirm or the text should be narrowed)**
- **N1. R-HG (124:260) widens the approved scope.** The recommendation said "The orchestrator checks programme-items.json / the R-DV, R-EB, R-EC rows **before scheduling N6**", and N6 is `compute_maxbld_scenarios` ①. The row says "Before scheduling commit ① of **either new by-law step**", and Spec 134 §8 repeats this. That extends the gate to `resolve_bylaws` ① (N5). The row itself still cites "Spec 78 P5.11 binds the scenario step's ①". Fix: narrow the row to the scenario step, or mark the widening as lane-inferred and ask the operator.
- **N2. R-HB (124:255) and Spec 134 §7 add implementation choices R-3 did not rule:** `execution.materialize_form: "rows"` (R-EH) and "`recovery.reset` truncates its tables". The operator approved "MATERIALIZER, because the write shape matches its own derived tables". Likewise:
  - **M-233 / Spec 134 §6** name a logic variable, `resolve_bylaws_storage_budget_mb` (`on_invalid: fail`).
  - **M-230** says "EXTERNALIZED: the population is a `resolve_bylaws_*` logic variable".
  - **Spec 134 §3** fixes a planned three-table lean split, though §11 does mark the split as open until P2-0.

  These follow existing rules (R-EH, R-CV, R-AY), so they are defensible defaults, but they are not operator rulings. Label them "design default (Spec 134), not ruled".
- **N3. R-GY says "the number assigned by the orchestrator"**, but the approved recommendation says "(the operator assigns the number)". The row is honest about it. The operator has not yet confirmed number 134.
- **N4. R-HK** is a lane-drafted rule, "recorded by lane layer2-spec, operator confirmation requested". The row says so, which is correct. It is still pending operator confirmation.

**NOTE (tooling)**
- **N5. Gaps in `decision-log --check`:**
  - **(i) The amendment text is not enforced.** The header comment says an amended decision's "row must carry the amended text", but `checkDecisionLogs` never checks it. With LC-62's operator quote removed, `--check` stays clean. Either enforce it (the row must contain `amendments[id].operator_quote`) or remove the claim from the header.
  - **(ii) Extra citations are not policed.** A routed decision may also be cited by an extra row in another register without complaint.
  - **(iii) Edits to the log are invisible.** A hand edit to a log's `recommendation` text passes `--check`, because the page export is not committed and so nothing can compare against it. Re-import is the only guard. Consider committing the export's sha in `source`.
- **N6. The spec-roles log came from `scratchpad/l2spec/roles-log.mjs`, not `decision-log.mjs --import`.** I verified its output as verbatim, but the transfer cannot be re-run from the repo. `--import` has no chat/markdown mode. This is acceptable for one log; it needs a mode if it recurs.
- **N7. Budget re-seeds (122_split_manifest).**
  - Spec 123 was re-seeded from 422→433 lines. That folds in +9 lines of earlier, undeclared growth since 0820685d; this lane added +2. It was within budget before the re-seed (464 cap).
  - Spec 131 was re-seeded from 131→136.
  - Both follow the "declared growth" precedent and are recorded in the `commit` note.
- **N8. R-HF is now satisfiable.** It is "OWED to the by-law fix lane", and wf1/bylaw-fix-1 `284596a4` ("INV-18 / INV-19 named locks; M-217..M-222, M-225 stale OWED cells reconciled") does that work. At integrate-13, confirm the titles exist and change R-HF's OWED cell to cite that commit.
