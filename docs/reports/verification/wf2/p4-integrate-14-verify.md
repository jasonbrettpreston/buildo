# Verification report: verify-14 on wf2/p4-integrate-14 @ a7655cec

**Verdict: PASS-WITH-NOTES.** Nothing blocks. Every claim checked holds. The notes below are about bookkeeping and record-keeping only.

- **Target:** `wf2/p4-integrate-14` @ `a7655cec` (`~/Buildo-wt-int14`).
- **Base:** `70ec6aed`, which is pushed.
- **Merged branch:** `wf2/p4-night-c` @ `51874abd`.
- **Merge base of the two parents:** `5f1cc5ba`.
- **Method:** read-only. Checks ran in throwaway detached worktrees at `a7655cec` and `6b0ecede`, under `<scratchpad>/verify-14/`. Both were removed with a plain `git worktree remove`. There were no DB writes, no captures and no `.env` reads. `~/Buildo-wt-int14` is unchanged: HEAD is `a7655cec`, and the only untracked entry is the `mobile/node_modules` symlink that was already there.

## Checks

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Commit trail | `git log 70ec6aed..a7655cec` | Four integration commits (`017538a2`, `bcabfe19`, `6b0ecede`, `a7655cec`) plus the night-c history. All four cite the R-EZ index, `docs/reports/verification/wf2/p4-integrate-14.md`. |
| 1a | Cite spot-check (13 cites, including all 4 stale-cite fixes) | `sed -n <line>p` plus `grep -F <quote>` on the tip's 124 / 124a | All 13 resolve, and every quote is at its line. Checked: 124a:391, :476, :478, :479, :801, :817, :907, :909, :911, :913; 124a §B-AM (line 192); 124:266 (R-HK). |
| 2a | No int13 row lost | Register-row id extraction from 124 / 124a at `70ec6aed` vs the tip | 0 rows lost from int13. Spec 124 gains exactly R-GZ and R-HA, between R-GY and R-HB. |
| 2b | Renumber changed numbering only | `diff` of night-c §B21/§B22 (`51874abd`) against the tip's §B29/§B30 | 55 lines on each side. The only changes are the two headings ("provisional numbering" became "renumbered from §B2x at integrate-14") and the 6 stale cites rewritten to their 124a lines. No other content changed. |
| 2c | Dropped blank line moved no `124a:<line>` cite | For every `124a:N` cited anywhere in the tree at the base or the tip, compare line N at `70ec6aed` and at `a7655cec` | 0 cites moved (47 cited lines at the base, 55 at the tip). One blank line is removed at old line 195 and one bullet is added at new line 202, so every line from 202 onward keeps its number. R-ET (124a:907, in §B26) is byte-identical. |
| 3a | Full suite | `npx vitest run --exclude '**/*.db.test.ts'` | 19,315 passed plus 24 on a re-run, so **19,339 passed**, matching the claim. The first run failed one file, `admin-lead-schemas.contract.test.ts`, because the fresh worktree had no `mobile/node_modules` (`expo/tsconfig.base` could not be resolved). That was a setup problem in my worktree. After symlinking it, the file passed 24/24. |
| 3b | Typecheck | `npx tsc --noEmit` | exit 0 |
| 3c | Step validation | `node scripts/analysis/step-validate.mjs --all --fast` | exit 0. coa, link_coa_to_parcels, enrich_coa_zoning and enrich_parcels are each 17/17 with hard-stop=false. G8 reads stale-fingerprints=0 and unexplained-diffs=0. R-EY: **4/43** read V3. |
| 3d | Spec split | `node scripts/analysis/spec-split-check.mjs --check` | exit 0: 41 moves verified, 7,546 citations checked, 0 dangling, every spec has a role. |
| 3e | Handbook | `node scripts/generate-step-handbook.mjs --check` | exit 0, Spec 132 is up to date. |
| 3f | Decision log | `node scripts/analysis/decision-log.mjs --check` | exit 0: 5 logs, 26 decisions, 27 register rows, 52 citations, 0 owed. |
| 3g | Report schema | `node scripts/analysis/report-schema.mjs --check` | exit 0. RS-5 is a WARN (54); every other check passes. |
| 3h | Badge generator (extra) | `node scripts/generate-logic-variable-effect.mjs --check` | exit 0, up to date: 25 takes-effect-at-cutover, 12 not read. |
| 4a | Red first | `a7655cec`'s `variable-effect.logic` and `variable-effect.infra` tests run on `6b0ecede` | **2 failed, 18 passed (20)**. The two failures are the shared-template fixture and the real-tree enrich_permits row. This matches `red-evidence/var-effect-shared-template/red.json`, and `green.json` shows 20/20. The parent's files were then rewritten to their committed content, leaving its status clean. |
| 4b | Badge diff is exactly one entry | `git show a7655cec -- src/features/admin-controls/generated/logic-variable-effect.json` | +7 lines, one key: `enrich_permits_centreline_coverage_min`, badge takes_effect_at_cutover, legacy_name `centreline_propagation_coverage_min`. Nothing else in the file changed. |
| 5a | Trace heads and fingerprints | Header of all 10 POST traces | All have git_head `017538a2`. coa is `695367ed…`, link_coa_to_parcels `4fdbcb3f…`, enrich_coa_zoning `acf7521a…`, as claimed. |
| 5b | POST hashes | `table_state` of the golden files | coa: 33966/5f16985b and 381698/9b1ea64b. link_coa_to_parcels: 33966/e879292a and 277032/259f294d. enrich_coa_zoning: 33966/005c56aa. All match the claims. |
| 5c | R-EQ order and R-DQ (plain captures before brackets) | `pipeline_runs_max_id_before` across the 10 goldens | Strictly increasing from 3663 to 3681 in this order: coa (plain chain, standalone, forced-status, forced-data-hash), then link_coa_to_parcels (plain chain, standalone, coa-forced), then enrich_coa_zoning (plain chain, standalone, coa-forced). |
| 5d | Hash moves explained | `explained-diffs.json` for enrich_coa_zoning and link_coa_to_parcels | Both have `table_state[].content_hash` entries covering a140d3ef → 005c56aa and 432e6ead → e879292a. Both quote R-DQ 124a:479 verbatim, and the quote is at that line. Both explanations agree with night-c's own bracket captures, which already read 005c56aa and e879292a at `51874abd`. |
| 5e | Decision-log quote | Raw chat record, the generated log, the R-GZ/R-HA rows and the operator queue | operator_quote is "y" for both decisions. The rows read "operator y 2026-10-20, to the night-p4-c draft" and cite `2026-10-20-chat-night-p4c#FIT-WIDTH` and `#DERIVED-WITNESS`. Both recommendations match the operator queue's night-p4-c r2/r3 drafts (lines 1680 and 1685) verbatim. |
| 6 | Purity and hygiene | Integrator-only files (files changed in 70ec6aed..tip that are not night-c's own); remerge-diff; secret grep | Only 12 files are new relative to night-c, all inside the four listed actions. Every night-c file that differs at the tip is explained by the merge's remerge-diff, the int13 side, `6b0ecede` or `a7655cec` (0 unexplained). Every generator `--check` passes. No `.env` file is committed, and the trace `db_target` passwords are masked (`***`). Both landed reports are byte-identical to verify-13's scratchpad originals (`cmp`). |
| 7 | Open items, and nothing moved to ③ | Descriptor `deviations[]`, step-validate's R-EY (9) lines, `converted.json` | All three descriptions are accurate (see N6). `converted.json` still has 29 converted and 14 pending entries. The only change is coa, link_coa_to_parcels and enrich_coa_zoning moving from compute_ported to runner_wired, which R-EQ allows. Registration stays at ③, so EP-PIN-D17 holds. |

## Findings

**BLOCKING:** none.

**N1 (NOTE). Inserting the two Spec 124 rows shifts later Spec 124 line numbers by +2.**
- R-GZ and R-HA now sit at 124:255–256, so every Spec 124 line from 255 down moves by two.
- I checked every `124:N` cite in the tree that pointed at a shifted line: it resolved, by rule id, at `70ec6aed`, and now does not. None did. Every cite into that range was already stale at the base (for example, the coa assessment's cites to R-DX, R-DY and R-DZ at 124:256–258, which name rows that had long since moved to 124a).
- The one new Spec 124 line cite, R-HK at 124:266 in `6b0ecede`, is correct after the shift.
- So the merge broke nothing here. The pre-existing stale Spec 124 line cites in historical reports remain stale, and spec-split-check still reports 0 dangling.

**N2 (NOTE). One bracket hash moved and is not listed among the explained moves.**
- The coa forced-status bracket golden's `lifecycle_status_history` hash went from dc3aae31 at night-c to f764b546 at the tip. The row count is the same on both sides: 381,748.
- Bracket captures are not part of G8's PRE→POST comparison, and step-validate reports unexplained-diffs=0. Neither the merge commit message nor the index lists this move, though.
- A likely cause is the timestamps on the 50 rows the bracket writes. I could not confirm that without the DB.

**N3 (NOTE). The witness catalog gained 5 backup-table entries without a mention in the merge message.**
- `docs/reports/witness/_catalog.json` gains: `coa_applications_cohort_bak_20261020t2100z`, `…t2101z`, `…t2103z`, `lead_parcels_cohort_bak_20261020t2102z` and `lifecycle_status_history_cohort_bak_20261020t2100z`.
- This is the established capture side effect: 104 such entries existed at night-c and 93 at int13. The merge commit message just doesn't mention it.

**N4 (NOTE). All 10 traces carry git_head `017538a2`, not the merge commit.**
- The captures were taken in the uncommitted merge tree, whose HEAD was `017538a2`.
- The source fingerprints are fresh at the tip: step-validate reports stale-fingerprints=0 and #44 passes.

**N5 (NOTE). Minor wording points in the integration commits.**
- `017538a2` quotes R-EZ without the backticks around `docs/reports/verification/<branch>.md` that 124a:913 has. The words are otherwise verbatim.
- `a7655cec` records that `generate-logic-variable-effect.mjs` has no explicit write flag, so a bare run writes. That disclosure is correct and matches the constraint to note such generators.

**N6 (NOTE). The open deviations are accurately described, but the index does not carry them forward.**
- **enrich_coa_zoning, ×3:** all three `adjudicated_by` entries read "operator ruling owed at integration". They do cite rule ids: #1 cites R-GO, and #2 and #3 cite R-BZ. That is why R-EY (9) does not flag them.
- **link_coa_to_parcels, deviation 4:** reads "the type counters await the operator".
- **coa, ×2 without rule ids:** step-validate's R-EY (9) gives coa 2/10 uncited. They are deviation 5 (`$9/$10::timestamptz[]` into DATE columns, adjudicated by COA-D3) and deviation 6 (`avg_latency_ms` / `api_errors`, adjudicated by the load_zoning precedent). verify-13 named deviations 4 and 8 at night-c. Since then, int12's backfill gave deviation 4 a rule id (R-GM), and deviation 8 is not flagged at the tip.
- None of these was ruled in integrate-14, and none moved to ③.
- The integrate-14 index records actions only for verify-13's N1 and N3. It does not carry forward verify-13's N2, that the operator should rule before ③.

**N7 (NOTE). Running the full suite in a fresh detached worktree needs two symlinks.**
- Both `node_modules` and `mobile/node_modules` must be symlinked. Without the second, `admin-lead-schemas.contract.test.ts` fails because `expo/tsconfig.base` cannot be found.

## Merge-specific confirmations

- **Spec 124:** int13's side is intact (0 rows lost). R-GZ and R-HA are inserted in id order, and their pointers read 124a §B29 and §B30.
- **Spec 124a:**
  - §B29/§B30 have the same content as night-c's §B21/§B22 apart from the headings and the cite fixes.
  - The four stale cites (124:240/261/263/265) now read 124a:801/907/909/911, and each quote checks at its line.
  - night-c's other cites (124a:391/476/478) still resolve.
  - The R-ET amendment is recorded as a §B-AM bullet. Its quoted text is verbatim at 124a:907, and §B26 is byte-identical.
- **rule-map.json** (the merge's remerge-diff):
  - R-GZ: `x-captures.2`, lock `src/tests/cohort-fit-width.logic.test.ts`, MERGE-4.
  - R-HA: `core.14`, lock `src/tests/witness-derived-target.logic.test.ts`, MERGE-3.
  - R-CZ and R-ET gain `by` R-GZ; R-BK and R-DB gain `by` R-HA. R-DB and R-ET change from active to amended-by.
- **Spec 132:** matches its generator (`--check` passes).

Scratch files: `/private/tmp/claude-501/-Users-brettpreston-macmini-Documents-Buildo/283db04f-d1a3-46ef-9c75-8feef36f0684/scratchpad/verify-14/` holds `vitest-full.log`, `tsc.log`, the `chk-*.log` files, and the spec snapshots and cite lists.
