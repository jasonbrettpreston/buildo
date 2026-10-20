# verify-12g: wf2/tooling-fix-1 follow-on @ ca807582

Lane: verify-12g (R-EZ independent verification, operator y 2026-10-20). Read-only. I did not write this work.
Branch: `wf2/tooling-fix-1`. Four commits after 47de0640 (verify-12e PASS-WITH-NOTES): abdc435b (R-GQ), addb4023 (R-GR), d2370245 (test fix), ca807582 (R-GS, R-GT). Worktree `~/Buildo-wt-tf1`.

## Verdict: PASS-WITH-NOTES

No blocking finding.

**The key check: is R-GS (A-5) a real operator decision? Yes.** A-5 was put to the operator as a recommendation ("Ask") in the Pilot 2 plan. The operator approved the plan verbatim. The plan is tracked in git, and it carries both the ask and the approval:

- `.cursor/archive/pilot2_load_ravines_active_task_closed_2026-08-27.md`:2 (committed 4976c287 / e000dfb2; copy at `.cursor/pilot2_load_ravines_active_task.md`:2): *"Status: Implementation (authorized 2026-08-25 "proceed. Looks good!" — rulings: … A-5 `override.accept_anomaly[]` box …)"*.
- The ask text itself is at :218 ("A-5 — a box for accept-anomaly overrides … never suppress the FAIL row").

The operator also said "y to liftinh A-5" on 2026-10-20 (QUEUE :1659, :1660). So R-GS records an operator decision. The weakness is in how it cites the source (N1), not in the authority.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | R-GS authority | Operator words found (above). `git log --all -S "A-5"` shows 4976c287 (2026-08-25, "rulings A-1..A-5 recorded") ahead of 1a440908 (schema text). |
| 2 | R-GS covers LC-D7 | Yes. `load-centreline.descriptor.json` declares `override.accept_anomaly[0]` = {`CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT`, `centreline_count_drift_pct`}. The check stays `severity: FAIL`, and the WHY text names the standing WARN row. This matches A-5's text. LC-D12 (batching) is rightly not covered. |
| 3 | R-GT text vs LC-D6/LC-D11/M-D10/N-D5 | LC-D6/LC-D11 `CENTRELINE_LOCAL_ZIP` env path is case (a). M-D10 is the `data/3d-massing-wgs84/` cache + `argv[2]` + execSync unzip/PowerShell, cases (a)+(b). N-D5 is the `data/neighbourhoods-4326.geojson` cache + `argv[2]/[3]`, cases (a)+(b), and the cache was measured byte-identical. All four have descriptor `deviations[]` entries. The "Not accepted" list and "Narrows nothing; sits beside R-AZ" are accurate. Operator scope ("new narrow rule for local-file/argv overrides (LC-D6, LC-D11, M-D10, N-D5)", QUEUE :1659) matches. |
| 4 | Every CLOSED row cites a covering rule | COA-D11 (R-EV), N-D4 (R-W), LC-D7 (R-GS), LC-D6/LC-D11/M-D10/N-D5 (R-GT): 7 CLOSED rows, all resolving. LC-D12 and N-D1 read `OPEN · **PIN** RULING-OWED`, as the operator directed for N-D1 and as "close LC-D12 if covered" allows. See N3 for the descriptor side. |
| 5 | R-GQ baseline = generator's real stale set | `generate-last-measured.mjs --check` at the tip: 18 descriptors, changed 84, unsourced 0; "baseline (R-GQ): 84 listed … 0 problem(s)", exit 0. 0 problems means no new and no fresh entries, so the baseline equals the stale set exactly. 17 steps (one descriptor of 18 has none stale). |
| 6 | R-GQ enforcement | `baselineDecision`: RED on a new stale entry, a listed-but-fresh entry, a missing pin, a duplicate or a missing file. Unsourced entries are also RED. `--shrink-baseline` only removes. Wired in `.husky/pre-commit` after the data-bounds descriptor check. B1–B6 and hooks-composition RED at 47de0640, green at the tip. Gap: N2. |
| 7 | Pre-commit budget | `precommit-budget.json` `hook_sha256` = sha256 of the tip `.husky/pre-commit` (7de50433…). docs_only 22.62 s ≤ 25.3, registry 22.56 s ≤ 27.5. The new stage is 0.08 s. Per-stage timings moved down slightly across the board (a re-measure, not an edit of one value). Legit. |
| 8 | R-GR form lock | `ledgerStatusFormFindings` (v3-label.mjs): skips rows that are not declared-deviation and rows in OPEN·PIN form. CLOSED must be `CLOSED · declared deviation (<ids>)` with every id in the register. L1–L5 RED at 47de0640, green at the tip. |
| 9 | Red-first | Tip `p2c4-last-measured.logic`, `ledger-status-form.logic` and `hooks-composition.infra` copied into a throwaway worktree at 47de0640: **14 failed** (B1–B6, L1–L5, 3 hook arms). All green in the tip suite. Worktree removed. |
| 10 | Reproduce | Suite **17,885 passed / 0 failed** (4 skipped), exit 0 (`g/tf1-suite.log`). `step-validate --all --fast` exit 0, R-EY 1/43 V3, **#36 568 / 134 / 0** PASS. `spec-split-check --check` clean (38 moves). Spec 124 **377 lines / 124,907 B** (budget 380 / 126,959). |

## Findings

**BLOCKING:** none.

**NOTE**

- **N1. R-GS cites the wrong source and states a false fact about the plan.** 124a §B20 follow-on (c) says the pilot plan "is untracked and now holds a later task, so the tracked schema text is the verbatim source". The plan is tracked: `.cursor/archive/pilot2_load_ravines_active_task_closed_2026-08-27.md` (and `.cursor/pilot2_load_ravines_active_task.md`). It holds the operator's words. The schema description is agent prose that says "OPERATOR RULING A-5"; it is not the operator speaking. **Fix at integrate-12:** R-GS's source cell and 124a should cite plan :2 (operator, verbatim: "proceed. Looks good!", authorizing ruling A-5) and plan :218 (the A-5 text). Keep step.schema.json:4871 as the as-built form. Also cite the 2026-10-20 "y to lifting A-5".
- **N2. "Shrink-only" is enforced by count only, against a fixed 84.** B6 asserts `entries.length ≤ 84`. After a shrink to, say, 80, up to 4 entries can be added back. A hand edit can also swap one stale key for another and keep the count. Consider ratcheting the cap to the committed count, or locking that the entry set is a subset of the R-GQ-time set (pin the 84 keys or their hash).
- **N3. The R-GR definition does not match four CLOSED rows.** R-GR says the CLOSED id is "the register rule its acceptance record (descriptor `deviations[].adjudicated_by` …) names". The descriptors for LC-D6/LC-D11 ("operator ruling, Spec 124 R-AZ / LC-D6, LC-D11"), M-D10 ("Spec 124 R-AZ, parcels/address_points precedent") and N-D5 ("Spec 124 R-AZ, M-D10 precedent") still name R-AZ, while the ledger now says R-GT. LC-D6's ledger description also still says "(R-AZ-class)". Editing the descriptors moves fingerprints, so re-cite them on REFREEZE-BUNDLE-1, or have the R-GR amendment say that an operator-y rule supersedes the descriptor's text until then.
- **N4. Integration conflict with backfill-9 on the same rows.** See `integrate-12-plan.md` §3. `wf2/v3-backfill-9` cites LC-D7/LC-D11/LC-D12 → **R-FV** (load_centreline plan, operator-authorized 2026-09-24), M-D10 → **R-FX**, and N-D1/N-D5 → **R-FY**. If those plan rulings hold, LC-D12 and N-D1 have a register rule, which contradicts this branch's "RULING-OWED, no register rule accepts it". It also gives LC-D7, LC-D11, M-D10 and N-D5 two accepting rules. The operator should see both readings before the ledger merge.
- **N5. Process (mine): I accidentally wrote tracked files in this worktree.** At 12:10:10 I ran `node scripts/analysis/generate-last-measured.mjs --help`. The script has no `--help` and fell through to write mode, rewriting `last_measured` in 17 descriptors in `~/Buildo-wt-tf1`. The worktree had been clean before. I put back the exact HEAD bytes (`git show HEAD:<path> > <path>` for each of the 17; no checkout/restore/reset/stash). `git status` is clean again (only the pre-existing untracked `mobile/node_modules`). The full suite had finished at 12:10:06, before the write, so its result stands. I re-ran `step-validate --all --fast` and `generate-last-measured --check` after the restore; the numbers above come from that clean run. Related hazard for the codebase: the generator's default with no flags is WRITE, and an unknown flag such as `--help` falls through to it.

## Reproduction

- Logs: `g/tf1-suite.log` and `g/tf1-sv.log` (clean re-run).
- `g/rgr-on-bf9.mjs`: the tip's R-GR lock applied to backfill-9's ledger. 5 third-form rows (LC-D6, LC-D7, LC-D11, LC-D12, COA-D11); tooling's cells fix all of them at merge.

## Update — verify-12h @ 3d2e1e08 (fix 2): PASS-WITH-NOTES

- **N1 fixed.** R-GS cites the tracked plan :2 and :218 verbatim, and "untracked" is corrected.
- **N2 fixed.** `--check` rejects any baseline entry not in HEAD's baseline (step + key). Swap, step-swap and re-add mutations all exit 1. The re-add-after-shrink case is caught.
- **N3 fixed.** Bundled-night item (5) names the four descriptor re-citations, with the indexes verified.
- **N5 hazard fixed.** `generate-last-measured` writes only on `--write`. `--help` exits 0; no flag or an unknown flag exits 2. `git status` stayed clean after every invocation. Pre-commit still runs `--check`.

Red-first: S1–S3 and C1–C3 fail 6/28 at ca807582. Suite 17,891 / 0, on a clean rerun after a one-off deepseek-exec-fences tmp flake. `step-validate --all --fast` exits 0, #36 568/134/0. spec-split-check is clean. Spec 124 is 377 lines.

New notes: the C1–C3 tests run the CLI in the live tree, so a regression rewrites real descriptors. N4 (backfill-9 conflict) is still for integration.

Detail: `wf2-tooling-fix-1-fix2.md`.
