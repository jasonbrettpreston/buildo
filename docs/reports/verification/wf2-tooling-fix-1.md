# Verification — wf2/tooling-fix-1

- Branch: `wf2/tooling-fix-1` @ `47de0640` (worktree `~/Buildo-wt-tf1`; parent `1d16f155`)
- Lane: verify-12e (R-EZ, independent, read-only). Date: 2026-10-20.
- Commits checked: `43b238ab` (massing §5.1 gets a Ledger status column), `b3835b34` (#36 `DEFECT_ID_RE` {2,5}→{1,5}), `fadc661c` (43 scorecards), `47de0640` (R-GP / MV-DRIFT).
- Method: throwaway detached worktrees at 1d16f155, b3835b34, 47de0640 and wf2/p4-integrate-11 under scratchpad. Each was removed afterwards; the two copied test files were restored first by writing `git show HEAD:` content back. `git merge-tree --write-tree` was used for collision checks (read-only). No DB, and .env was not read.

## Verdict: **PASS-WITH-NOTES**

Nothing blocks. The notes below are for integrate-12 and future PINs.

## Checks

### 1. Rule citations and R-GP's conflict check — PASS
| Citation | Resolves | Says what is claimed |
|---|---|---|
| R-BA gate I, 124a:211 | yes | "STANDARDIZED (gate A closed check bounds; gate I registry coverage)" |
| #36 contract, step-validate.mjs:2313-2316 | yes (comment block 2312-2318) | "a KNOWN-DEFECT id is DEFINED by a table row whose FIRST cell is exactly that id … DISAGREEING status cells is RED" |
| `defectPrefixFor`, step-validate.mjs:931-934 | yes | one letter per underscore word, so massing→M, neighbourhoods→N, parcels→P |
| registries.mjs:53 (now :54-59) | yes | "step prefix + `-D` + ordinal" |
| R-BF, 124a:216 | yes | quote matches verbatim |
| R-R, 124a:132 | yes | quote matches verbatim |
| R-DJ (1), 124a:472 | yes | quote matches verbatim |
| step.schema.json :250 / :268 / :283 / :286 | yes | Fold B-4 re-timing text, `at` text, `sample_n` text and `source_run` text all match |
| generate-last-measured.mjs:192 | yes | write-only-on-change line matches |
| capture-step-golden.js `mergeMeasured` +1 per fold | yes (:1003-1004) | sample_n already counted folds |

The conflict check is real: seven rows, each with a resolving quote. The V3 table answers all seven questions (STANDARDIZED, OBSERVABLE, RECORDED, SCALABLE, ACCURATE, SIMPLE, EXTERNALIZED). R-GP is a free id on every local wf1/wf2/wf3 branch; only tooling-fix-1 defines it. One caveat on the R-DJ (1) row is in Note N2.

### 2. M-D1…M-D13 true status — PASS (claim holds, with Note N3)
- **Deviations.** M-D1/3/6/7/10/11/12 are `deviations[].from` in `scripts/load-massing.descriptor.json` at :379, :388, :397, :406, :415, :424 and :433 (all cited lines resolve). All 13 M-D entries are present at `98412d53` (②), which is an ancestor of the tip. Cutover ③ is `1b9ee7de`.
- **Limitations.** M-D2/4/5/8/9/13 are `limitations[].what` at :471, :476, :481, :486, :491 and :496.
- **F1/F2/F3 not landed.**
  - `geometry_repair: "none"` is still at :34.
  - `guard_columns` at :51 still lacks `elev_z`/`estimated_stories`.
  - The `computeCentroid` fallback is still in `scripts/lib/compute/load-massing.js`. The comment at :30 says "M-D9 keeps the WRONG form", and the fallback is still used at :76-78.
- **Old fifth cell.** The assessment's old fifth cell was a "Post-conversion" plan, not a status. The ledger's status cells match the shipped descriptor and code. The new column copies the ledger verbatim: #36 compares the strings exactly and finds 0 disagreements.
- **Copy vs. correct.** Adding a column is the right fix. Overwriting the Post-conversion column would lose the F1/F2/F3 plan. The new column follows the f2bd5bcb precedent: LC-D1..13 got the same column, for the same gate. #36 reads status by position (`cells[5]`), which is why the new column has to be the fifth (see Note N4).
- **#36 now sees both copies.** It finds 13 new M mirrors and 20 N mirrors, so 101→134 mirrors with 0 disagreements. Before 43b238ab, the widened regex applied to the parent tree reports exactly 13 violations, M-D1…M-D13. That confirms the drift was real and that this commit fixed it.

### 3. Red-first — PASS
- `gate-registries.infra` with tip tests on `1d16f155`: T6g, T6h and T6i FAIL (3 failed / 26 passed). At the tip all pass.
- `p2c4-last-measured.logic` with tip tests on `b3835b34`: M14 and M15 FAIL (2 failed / 14 passed). M16 passes there, as a preserved-behaviour lock should. At the tip, both files together give 45/45 passing.

### 4. Regex widening: false matches and counts — PASS
- The only single-letter ids now counted are:
  - `defect-ledger.md`: P×5, M×13, N×20 (38 rows)
  - massing assessment: M×13
  - neighbourhoods assessment: N×20

  Nothing else matches anywhere in the ledger or the 43 assessment reports.
- `DEFECT_ID_RE` is used only by #36 (`defectDefinitionRows`). `v3-label.mjs:115` already accepted one-letter prefixes.
- Counts reproduce:
  - parent (old regex): 497/101/0
  - tip: 568/134/0, which is +71 definitions (38+33) and +33 mirrors
- `fadc661c` touches exactly 43 lines in 43 files, all of them the `| 36 |` line.

### 5. MV-DRIFT proof — PASS by logic proof (live proof not reproduced, Note N1)
I ran tip `foldValidateOnlyMeasured` over the two real committed sidecars (assert_parcel_sanity, link_parcel_addresses):
- Unchanged values with new durations, run twice: 0 folds and the bytes stay identical.
- One value changed: the entry is rewritten, and `generate-last-measured --check` reacts.

Then I restored the files. `generate-assert-parcel-sanity-descriptor.js --check` exits 0 at the tip, and `git status` is clean after `step-validate --all --fast`. I did not run `--all --write --fast` live: the throwaway tree has no DB env, and I did not read .env.

### 6. Readers of `at` that treat it as freshness — none found
A repo-wide `git grep` for `last_measured|lastMeasured|measured-validate` outside docs finds only these code readers:
- `generate-last-measured.mjs`: copies `at`
- `generate-assert-parcel-sanity-descriptor.js`: uses `lastMeasuredFromSidecar`
- `chain-end-synthesis.mjs`: sums `cost_ms` only
- `capture-step-golden.js`: strips `last_measured` from the fingerprint and merges
- `step-validate.mjs`: the writer
- the one-time grounder script
- `assert-parcel-sanity-fields.js`: comment only

No reader in src/ (admin or dashboards) or mobile/, and no tests outside the locks. Nothing compares `at` or `commit` against now or HEAD. The schema text still says "the measurement" / "timings"; PIN MV-SCHEMA-TEXT records this.

### 7. Reproduce — PASS
| Command (tip, throwaway worktree) | Result |
|---|---|
| suite (`vitest run --exclude **/*.db.test.ts`) | **17,873 passed / 0 failed / 4 skipped** (17,849 + 24 from `admin-lead-schemas.contract`, which first failed only because the throwaway lacked the `mobile/node_modules` symlink and passed 24/24 once it was added) |
| `tsc --noEmit` | exit 0 |
| `step-validate --all --fast` | exit 0; #36 reads 568/134/0; tree clean after |
| `spec-split-check --check` | clean (38 moves, 6643 citations, budgets held) |

### 8. Integration collisions — see the proposal below

## Findings

No BLOCKING findings.

**NOTES**
- **N1 — live MV-DRIFT proof not reproduced.** The ACCURATE row says "Live: two consecutive `--all --write --fast` runs leave the tree clean". I proved this by logic over the real sidecars, not live. The integrate-12 verifier, under the DB lock, could run the two live passes if the operator wants it.
- **N2 — `generate-last-measured.mjs --check` exits 1 at parent and tip.**
  - It reports 84 drifted `last_measured` entries across 18 descriptors, including link_parcel_addresses `missed_link_count`.
  - It is not in `.husky/pre-commit`.
  - The problem predates this branch and R-GP does not cause it. But R-GP's R-DJ (1) row ("every chain-era generator `--check` runs at pre-commit") is not true for this generator, and R-BF's "declared == observed" is not met for those 84 entries.
  - While I was verifying (11:29-11:30), uncommitted edits appeared in `~/Buildo-wt-tf1`, apparently the lane continuing work past 47de0640. They touch `.husky/pre-commit`, `generate-last-measured.mjs`, `hooks-composition.infra.test.ts` and `p2c4-last-measured.logic.test.ts`, and add `scripts/steps/_schema/last-measured-stale-baseline.json`. They are outside this verification. If committed, they need their own R-EZ pass before integrate-12.
- **N3 — ledger status vocabulary is split across the estate.**
  - The ledger header says a row is "OPEN until the closing commit lands". For M-D1/3/6/7/10/11/12, ② (98412d53) and ③ (1b9ee7de) have landed and the deviations are declared, yet the rows read `OPEN · **PIN** (declared deviation at ②)`.
  - LC-D6/7/11/12 use `CLOSED · declared deviation at ②` for the same situation.
  - "Ledger right" holds against the majority form (25 rows), not against the header rule. Mirroring is still the correct #36 fix either way. A ruling on which form is right would decide whether about 25 rows flip, with their mirrors.
- **N4 — #36 reads the status cell by position (`cells[5]`), not by header.** That is why the Ledger status column had to go fifth. A future table with a non-status fifth column would give a false RED, or would agree by accident. Consider an R-FB-style header-named reader (PIN).
- **N5 — edge case in the comparison.** `JSON.stringify` equality treats an object-valued `value` with a different key order as a change. That is conservative and harmless (at worst one extra rewrite), and today's values are all scalars.
- **N6 — Spec 124 line budget is tight.** Projected integrate-12 size (integrate-11 + backfill-9 + tooling-fix-1) is about 379/380 lines and about 124.2 KB of 126.96 KB. R-GP fits, but the next §5 row will need a spec-split move.
- **N7 — `rule-map.json` exists only on wf2/handbook-1 and has R-FB only.** It needs R-FC…R-GO (backfill-9) and R-GP when handbook-1 integrates.

## Integration collisions (simulated with `git merge-tree`, read-only)
- **tooling-fix-1 × wf2/p4-integrate-11** (which already holds rulings-7 at §B20, plus scorecard-max and rulings-8):
  - Conflicts: 43 scorecard `| 36 |` lines, and 124a (both add a §B20).
  - Fix the scorecards by regenerating them; do not hand-merge.
  - Simulated merged #36 (tip regex over integrate-11 reports plus the tf1 massing table): **574 definitions / 134 mirrors / 0 disagreements**. N-D21, N-D22 and AGC-D8 add no disagreement.
  - On integrate-11 without the massing table change, the widened regex gives 13 RED, so `43b238ab` must travel with `b3835b34`.
- **tooling-fix-1 × wf2/v3-backfill-9:**
  - Conflicts in Spec 124 (R-GP is inserted after R-FB, where backfill-9 adds and moves rows) and in 124a (§B20 on both sides).
  - backfill-9 edits M-D/N-D ledger rows only outside the status cell, so the mirrors still agree.
- integrate-11 ↔ backfill-9 also conflict (ledger, coa assessment, 124, 124a). That is not this lane's doing.

## Proposed 124a section numbering for integrate-12
| § | Content | Source |
|---|---|---|
| §B17 | V3 tables for R-EY, R-EZ, R-FA (v3-label) | unchanged |
| §B18 | Register rows R-DF…R-DT (M33) | unchanged |
| §B19 | R-FB V3 table (rulings-8) | unchanged |
| §B20 | Conflict checks and V3 for R-EW, R-EX (rulings-7) | as integrate-11 already has it |
| **§B21** | Register rows R-FC…R-GO (moved from Spec 124 §5) | backfill-9's §B20; update **M34** `to_anchor` in `122_split_manifest.json` |
| **§B22** | V3 tables for R-FC…R-GO and the condition-9 backfill record | backfill-9's §B21 |
| **§B23** | #36 single-letter prefixes and the R-GP V3 table | tooling-fix-1's §B20 |

Follow-ups for integrate-12:
- Retarget every "124a §B20" / "§B21" citation in the incoming rows: R-GP's row becomes "124a §B23", and backfill-9's rows become §B21/§B22.
- Keep the id R-GP (free).
- Keep the R-GP row in Spec 124 §5 (it fits the budget, see N6).
- Regenerate the 43 scorecards after merging. Expect #36 = 574/134/0, plus any change from backfill-9's ledger rows.
- Run `spec-split-check --check`.
- Add R-FC…R-GO and R-GP to `rule-map.json` when handbook-1 lands.
