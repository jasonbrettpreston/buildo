# integrate-13: merge and collision plan, v2 (verify-13b)

This replaces `integrate-13-plan.md`. Base: **`wf2/p4-integrate-12` = `208e8a82`**. Lane night-p4-c (wf2/p4-night-c @ 51874abd, parent int11 5f1cc5ba) integrates later and is out of this plan except §6.

| # | Branch | Tip | Parent | Verdict (report) |
|---|---|---|---|---|
| 0 | wf2/fix-lockless-env | 02aa999f | 208e8a82 | one-test determinism fix: R-DF locks count only `git ls-files`-tracked files. Read; passes in the trial |
| 1 | wf2/spec-132 | 1fb8bd07 | 208e8a82 | PASS-WITH-NOTES (`wf2-spec-132.md`) |
| 2 | wf2/layer2-spec | 89708c1a | aed98413 ⊃ 1fb8bd07 | **PASS-WITH-NOTES** (`wf2-layer2-spec-fix.md`) |
| 3 | wf2/report-schema | 6e97f7c1 | 326eca17 | **PASS-WITH-NOTES**, alone. Its F2 integration fix is needed once bylaw-fix-1 lands (`wf2-report-schema-fix.md`) |
| 4 | wf1/bylaw-e2e-1 | fe1b02ce | 53a21030 | **PASS-WITH-NOTES**; B1 closed (`wf1-bylaw-e2e-1-fix.md`) |
| 5 | wf1/bylaw-fix-1 | 3266cb59 | 208e8a82 | **PASS-WITH-NOTES** (`wf1-bylaw-fix-1.md`) |

## 1. Merge order

0. lockfix 02aa999f
1. spec-132
2. layer2-spec (contains 1, so it is fast-forward-shaped)
3. report-schema
4. bylaw-e2e-1
5. bylaw-fix-1
6. **integration fix commits** (§3), each by the owning lane

Reasons for this order:
- e2e-1 goes before bylaw-fix-1, so that the golden files resolve to e2e-1's newer harness plus fix-1's fixed classes.
- report-schema goes before bylaw-fix-1, so that its RS-5 switch (§3.2) is made against the final lineage.

## 2. Trial merge (done; throwaway worktree `verify-13/b/wt-trial`)

`git merge-tree --merge-base=208e8a82` chained 02aa999f ⊕ layer2-spec → ⊕ report-schema (`9eb52fd4`) → ⊕ e2e-1 (`d2fbd583`) → ⊕ bylaw-fix-1 (`b752d748`). Steps 0–4 are clean. **Step 5 conflicts in 5 files.**

### 2.1 Spec 69a: one hunk (the M-228…M-234 block)

Resolution: take **bylaw-fix-1's** M-228 / M-229, its 2026-10-20 golden-lot dated note and its **M-230** (CHAT-5). Then append **layer2-spec's M-231…M-234** unchanged.
- layer2-spec does not edit M-228 / M-229; its rows are byte-identical to the base.
- The result is bylaw-fix-1's 69a plus exactly 4 lines.
- 69a then holds **M-230 (fix-1, CHAT-5) and M-231…M-234 (layer2)**. M-234's "drafted as M-230" note stays true.

### 2.2 The four golden-lot files: add/add (bylaw-fix-1 ported an older copy from 53a21030)

`git merge-file` with base = the 53a21030 copy:

| File | Resolution |
|---|---|
| `src/tests/helpers/bylaw-golden-lots.ts` | merges clean: e2e-1's shared `assembly.mjs` form |
| `src/tests/bylaw-golden-lots.logic.test.ts` | merges clean: e2e-1's freshness and UNREACHED tests, plus fix-1's `if (CASES.some(FAILS))` guard around the FAILS describe |
| `scripts/analysis/bylaw-validation/golden-lots-cases.mjs` | one hunk; take **fix-1's** side (the F-03 entries without `class: FAILS`). Everything else auto-merges: e2e-1's `owed_field` / `PARTIAL` code, e2e-1's F-01 / F-02 OWED entries (fix-1 carries the same text), and fix-1's F-04 / F-05 / F-06 "fixed" notes |
| `src/tests/fixtures/bylaw-golden-lots/cases.json` | **generated: do not hand-merge.** Take either side, then regenerate (§3.1). `lots.json` is identical on both sides |

`assembly.mjs` (e2e-1 only) and `eval-lots.mjs` merge clean.

### 2.3 Results on the resolved trial tree

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 |
| `step-validate --all --fast` | exit 0 |
| All **15** pre-commit `--check` arms | exit 0, including `decision-log` (4 logs, 24 decisions, **1 owed**), `spec-split-check` (41 moves, 7,449 citations, every spec has a role), `generate-step-handbook` (Spec 132 up to date) and `generate-bylaw-provisions` |
| `generate-answer-tracker --check` | clean, 784 / 4 |
| `generate-maxbld-lineage --check` | clean, 107 fields |
| **`golden-lots-cases --check`** | **RED: "cases.json is stale"** (expected, §3.1) |
| **`report-schema --check`** | **RED**: RS-5 / RS-9 on the 15 new lineage fields (e.g. "lineage suite_coa_status: neither declared nor listed not_in_report"), plus generated drift (expected, §3.2) |
| **Full suite** | **19,322 passed / 4 failed / 4 skipped / 936 todo** (813 files) |

The 4 failures are exactly the two expected REDs:
- `bylaw-golden-lots.logic` › "cases.json is fresh against the tree";
- `report-schema.logic` › "--check finds no drift", "no gate FAILs", "seed-report-v2 --check".

The lockfix's R-DF lock test passes on the merge. All other tests pass, including `spec124-register-locks`, `decision-log.logic`, `hooks-composition` and `bylaw-eval-perf`.

## 3. What the integrator (and the owning lanes) must regenerate or fix, in order

### 3.1 Golden cases (e2e lane, on the merged tree)
- Run `node scripts/analysis/bylaw-validation/golden-lots-cases.mjs --write`. The integrator must not hand-edit. verify-13b did not run `--write`, per CONSTRAINTS.
- Then re-review the counts:
  - Expect every F-03…F-06 case to flip FAILS → PROVEN; the probes confirm the production values on the named lots.
  - Expect FAILS = 0, so the FAILS describe disappears under fix-1's guard.
  - Expect F-01 / F-02 to stay OWED.
- Update `docs/reports/2026-10-20-bylaw-e2e-verification.md`: counts and finding status (F-03…F-06 fixed by bylaw-fix-1 28b959c2 / cf4e57a4).
- The freshness test is now in the suite, so `npm test` stays RED until this is done.

### 3.2 report-schema × lineage (report-schema lane, after bylaw-fix-1 is in)
- bylaw-fix-1 is the sole writer of `maxbld-field-lineage.json` (f5f82087 added the 15 queue fields and RE / RF). The seed reads that lineage. **Any later lineage edit turns `report-schema --check` and `seed --check` RED.** So the order is always: lineage → `seed --write` → `report-schema --write`.
- Edit the seed rules so the 17 queue rows / 15 fields and cards RE / RF use the source `lineage:<field>`. A plain `seed --write` is not enough; it leaves them UNREVIEWED, which RS-9 rejects.
- Then run `seed-report-v2.mjs --write` and `report-schema.mjs --write`.
- Check the regenerated sample's `suite_coa_status` (currently "precedent_estimate") against Q-4: "not_evaluated:coa_factor_unfitted:suite until calibrated".
- **Same commit or the next one:**
  - Import operator **CHAT-11** (`chat-decisions/2026-10-20-batch-b.json`; approves the 10 `Q-7-scope` rows) through the seed's chat overlay or `decision-log --import --chat`, not by hand.
  - Rename **R-RS → R-HM** in `report-schema.mjs` (header and the md `Rule:` line) and in `seed-report-v2.mjs`, then regenerate.
  - Cite the committed `2026-10-20-chat-batch-a#CHAT-4`, not the scratchpad path.
  - Fix the R-HM row's "RS-0…RS-9" to RS-0…RS-11.
- Ask the operator whether "REVIEW §6 / gap 4" is the decision of record for the 11 lineage fields with no Q-file (bylaw-fix-1 N1).

### 3.3 Decision-log routing of CHAT-5 (integrator commit, rule R-HK)
- **The merged tree is GREEN here, but silently wrong.** fix-1's M-230 row cites the scratchpad path, not `2026-10-20-chat-batch-a#CHAT-5`. So `--check` cannot see that the owed row has landed, and it keeps reporting "1 owed by another lane" forever.
- Fix, tested in the trial:
  1. Add `` `2026-10-20-chat-batch-a#CHAT-5` `` to the M-230 row. `--check` then goes RED: "routed row M-230 now exists, but the routing still says owed … drop "owed"".
  2. Remove `"owed"` from CHAT-5's routing in `docs/reports/decisions/2026-10-20-chat-batch-a.json`. `--check` is then clean: 25 rows, 50 citations, 0 owed.
  3. Update `src/tests/decision-log.logic.test.ts`. Two R-HK real-tree tests fail after step 2 because they assert the owed state (`/^wf1\/bylaw-fix-1/`). Make them assert CHAT-5 → M-230 cited.
- Tooling note for layer2's lane: an owed decision whose row lands without the stem#id citation is invisible to `--check`. Consider detecting the routed row id in the register itself.

### 3.4 Register rows (integrator or layer2 lane, citing R-HK / R-GU)
- **R-HF** (124:259): change the OWED cell to cite **bylaw-fix-1 284596a4**. That commit's `bylaw-evaluator-fixes.logic.test.ts` describes "INV-18 — …", "INV-19 — …" and "INV-19 open arm …"; verified present and green, with red evidence `docs/reports/red-evidence/bylaw/inv18-inv19-red.json`.
- **R-HM** (124:266): the lock becomes `report-schema --check` + `report-schema.logic` once report-schema has landed. Repoint the **rule-map** entry (`scripts/steps/_schema/rule-map.json` currently points at `decision-log.logic`).
- After any rule-map change, run **`generate-step-handbook.mjs --write`** (the Spec 132 generated block), then `--check`.
- Spec 124 is at **376 / 380 lines** on layer2-spec. These are cell edits (no new rows), so they fit.

### 3.5 Spec 69a M-230 hygiene (bylaw-fix-1 lane, optional)
- Note in M-230 that arm (2)'s apartment 25.0 m follows by the same correction (N3).
- Record the R townhouse side-yard knock-on of F-04 in the dated note: 27 golden R lots, 7.5 m → `condition_unknown:all_units_front_street` (N2).

### 3.6 Pre-commit hook arms
- Trial tree: **15** chain-era arms (layer2 added `decision-log --check`); `hooks-composition` expects `toHaveLength(15)`.
- Wiring **`report-schema.mjs --check`** (R-DJ (1) precedent, as with `report-fields.mjs --check`) gives **16**.
- Also wiring **`golden-lots-cases.mjs --check`** gives **17**.
  - The golden check now also runs in the suite (e2e-1's freshness test), so pre-push catches it.
  - The pre-commit arm costs about 20 s, because it evaluates 170 lots.
  - Recommendation: report-schema **yes**; golden is the **operator's call**.
- For each arm added:
  - add it to `CHAIN_ERA_GENERATOR_CHECKS`;
  - bump `toHaveLength`;
  - **re-measure `docs/reports/generated/precommit-budget.json`** with `scripts/analysis/precommit-budget.mjs`, because the hook sha changes (#52). Re-measure the decision-log stage too: 0.09 s recorded vs about 0.31 s now (layer2 N-E).

### 3.7 System map
`generate-system-map.mjs` has **no mode flag**: it always writes. Run it only in a scratch copy of the merged tree and diff the result against the merged `00_system_map.md`. The prior plan found the 132 / 134 / report-schema rows byte-identical; bylaw-fix-1 and e2e-1 add no system-map rows. A `--check` mode is still owed (CONSTRAINTS).

## 4. Identifier ledger on the merged line

| Kind | Allocation |
|---|---|
| R-ids | R-GU…R-GX (spec-132); R-GY, R-HB…R-HK (layer2); R-HL, R-HM (layer2 fix; R-HM = the former R-RS). Next free: **R-HN**. R-GZ / R-HA stay reserved for night-p4-c. bylaw-fix-1, e2e-1 and report-schema add no R-rows |
| M-ids | M-230 = bylaw-fix-1 (CHAT-5); M-231…M-234 = layer2. Next free: **M-235** |
| LC-ids | LC-60…LC-62 (layer2). bylaw-fix-1 adds a Spec 131 line (LC-49 dated note, f5f82087); it auto-merged with layer2's Spec 131 edits, and the spec-split budgets held |
| 124a sections | §B25 (spec-132), §B26, §B27, **§B28** (layer2 fix: R-HL / R-HM). **night-p4-c's provisional §B21 / §B22 must become §B29 / §B30**, not §B28 / §B29 as the v1 plan said |
| Spec numbers | 132, 134 (134 on "no objection", layer2 N-A); 133 reserved |

## 5. Integrator checklist after §3

- `npm test`: expect 0 failed
- `tsc --noEmit`
- `step-validate --all --fast`
- every hook arm `--check`
- `decision-log --check`: 0 owed
- `golden-lots-cases --check`
- `report-schema --check` and `seed-report-v2 --check`
- `generate-answer-tracker --check`
- `generate-maxbld-lineage --check`
- `generate-bylaw-provisions --check`
- `spec-split-check --check`
- `generate-step-handbook --check`
- `hooks-composition` arm count
- `precommit-budget` re-measured
- system-map scratch diff empty
- `test:db` (bylaw-fix-1 tip: 888 passed / 17 skipped; no branch here touches DB code)

## 6. night-p4-c (later)

The v1 plan's items still hold:
- It must merge or rebase onto int12 first.
- Apply its R-ET edit to the 124a §B26 copy.
- RE-FREEZE #38 is free.

Changed: its 124a sections become **§B29 / §B30**. Its +2 rows take Spec 124 to 378 / 380 lines, so the next row-adding lane needs an M37 move.
