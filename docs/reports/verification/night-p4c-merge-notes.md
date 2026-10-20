# wf2/p4-night-c → integrate: trial-merge notes (verify-13, R-EZ)

Trial: throwaway detached worktree `~/Buildo-wt-v13-p4c-trial` at `208e8a82` (int12), `git merge --no-commit --no-ff 51874abd`, then aborted and removed. Conflicts were union-resolved in the trial only so the checks could run. Pending-branch overlap was checked with `git merge-tree --write-tree <branch> 51874abd` (read-only) at the current tips: spec-132 `1fb8bd07`, layer2-spec `89708c1a`, report-schema `6e97f7c1`, bylaw-e2e-1 `fe1b02ce`, bylaw-fix-1 `3266cb59`, fix-lockless-env `02aa999f`. These tips are newer than the ones in `integrate-13-plan.md`. Evidence is in `verify-13/p4c-trial/`.

## 1. Textual conflicts onto int12 (2 files)

| File | Hunk | Resolution |
|---|---|---|
| `docs/specs/01-pipeline/124_step_standard_policy.md` | int12 added rows R-GP…R-GT plus the M34 pointer after R-FB. p4c added R-GZ and R-HA at the same spot. | Keep both sides: int12's rows and pointer first, then R-GZ and R-HA in id order. |
| `docs/specs/01-pipeline/124a_step_standard_policy_appendix.md` | Both sides append after §B20. int12 adds §B21 (R-FC…R-GO register), §B22, §B23 and §B24 (M35, R-DU…R-EP). p4c adds §B21 (R-GZ) and §B22 (R-HA). | Keep both sides, then **renumber p4c's two sections** (§2 below). |

Everything else merges automatically: defect-ledger, `load-coa.descriptor.json`, `src/tests/steps/coa/violations.test.ts`, and every generated or golden file.

## 2. Collisions and renumbering

- **124a section numbers: a real collision.** After a union merge the file has two `## Appendix §B21` and two `## Appendix §B22` headings (trial lines 587/819 and 633/847). The p4c sections must be renumbered.
  - On int12 alone they become **§B25 / §B26**.
  - If integrate-13 lands first they become **§B29 / §B30**. layer2-spec already uses §B25 (R-GU…R-GX), §B26 (M36: R-EQ…R-FB), §B27 and §B28.
  - Four strings change: the two headings and the "Conflict check and V3 table: 124a §B21 (provisional)" / "§B22 (provisional)" pointers in the R-GZ and R-HA rows. After the merge those pointers would silently resolve to int12's §B21 register and §B22 backfill sections, which is wrong. spec-split-check does not catch this; the trial ran clean.
- **R-GZ and R-HA ids: no collision.** int12 holds rows through R-GT. spec-132 and layer2-spec explicitly skip both ids: "R-GZ and R-HA are held by lane night-p4-c, so this lane skipped them" (layer2-spec `124_step_standard_policy.md`:286, 124a:921). With layer2-spec the order becomes R-GY, R-GZ, R-HA, R-HB…R-HM, so insert the two rows between R-GY and R-HB. Drop "provisional" from both ids at integration.
- **RE-FREEZE #38: free.** Every branch (int12 and all six pending) tops out at RE-FREEZE #37. The Spec 122 text and the `step.schema.json` `x-ruling` can drop "provisional number".
- **R-ET row amendment (p4c `bed070af`).** p4c appends `*(fitted to a bounded column's width, R-GZ, 2026-10-20)*` to the R-ET row in Spec 124.
  - On int12 R-ET is still in Spec 124 (line 244), so it merges cleanly.
  - layer2-spec's **M36 moves R-EQ…R-FB to 124a §B26**. p4c ⊕ layer2-spec therefore conflicts on the whole moved block: the p4c side holds rows R-DU…R-FB plus R-GZ/R-HA, and the layer2 side holds the M35/M36 pointers plus R-GP…R-HM (`p4c-trial/l2-124.md`, conflict lines 237–309).
  - Resolution: take the layer2 side, add the R-GZ/R-HA rows, and **re-apply the R-ET suffix to the moved R-ET row in 124a §B26** (layer2-spec 124a:907). Do not keep it in Spec 124. spec-split-check arm (i) (lossless move) must then accept the changed moved byte: the move's evidence/hash must be updated through spec-split-check's own sanctioned path, not by hand.
- **Stale line citations in p4c's conflict-check tables** (spec-split-check does not check these):
  - `124:240` (R-DY): on int12 the row is at 124a:801 (§B24, M35).
  - `124:261` (R-ET, cited twice): int12 has it at 124:244; layer2-spec at 124a:907.
  - `124:263` (R-EV): 124:246 on int12; 124a:909 on layer2-spec.
  - `124:265` (R-EX): 124:248 on int12; 124a:911 on layer2-spec.
  - `124a:391/476/478` (R-CZ/R-DN/R-DP) still resolve on int12 and on layer2-spec.
- **R-GR ledger form: no conversion needed.** COA-D15 and COA-D16 are fixed defects, not declared deviations: status `**CLOSED** (Spec 124 R-EX, R-EW (ii); no new rule)` and `**CLOSED** (Spec 124 R-HA, R-DY (a); operator y 2026-10-20)`. `ledgerStatusFormFindings` on the merged ledger returns `[]`, and R-GZ/R-HA resolve as register ids (`p4c-trial/grform.mjs`).
- **Spec 124 line budget: holds.** Budget is `measured_at` 346 lines / 115,418 bytes with 10% headroom, so the limit is 380 lines / 126,959 bytes.
  - int12+p4c: 369 lines / 104,162 bytes, and spec-split-check is clean.
  - With layer2-spec (376 lines / 101,315 bytes) plus 2 rows (~2.5 KB): about 378 lines / ~103.8 KB. That leaves only 2 lines of headroom for the next lane.

## 3. BLOCKING after the merge: the coa-chain POST captures go STALE

On the int12+p4c tree, `step-validate --all --fast` **exits 1** with three new hard stops versus int12:

```
[step-validate] HARD STOP: #44 WITNESS failed for pending slug coa             (FAIL:STALE coa, coa-forced-data-hash, coa-forced-status, standalone)
[step-validate] HARD STOP: #44 WITNESS failed for pending slug link_coa_to_parcels
[step-validate] HARD STOP: #44 WITNESS failed for pending slug enrich_coa_zoning
```

Cause: int12's V3 condition-9 backfill re-cited `deviations[].adjudicated_by` in all three descriptors, e.g. `load-coa.descriptor.json`:829 `"… (CoA decision 4) [register: Spec 124 R-GM; V3 condition-9 backfill 2026-10-20]"`, and in the lctp and ecz descriptors. The descriptor is an input to `computeSourceFingerprint` (`step-validate.mjs`:6186). Every POST trace p4c captured at int11 bytes therefore fails `trace.source_fingerprint !== currentFingerprint` (`gates/witness.mjs`:1021).

int12 by itself has no #44 hard stop (`int12-sv.log`). The other trial hard stops (permits, assert_entity_tracing, assert_network_health, assert_staleness, assert_lifecycle_phase_distribution) are the same as int12's.

Fix (owner: the night-p4-c lane, before integration):
1. Merge int12 into the branch.
2. Re-capture POST for coa (4 invocations, including both #38 brackets), link_coa_to_parcels (3) and enrich_coa_zoning (3) on the merged bytes, under the dblock. Alternatively, re-capture through the replay/recapture path, if R-CZ's committed-data replay reproduces them without a live run.
3. Refresh `recapture.json`, the goldens, the witness traces and `_catalog.json`.
4. Re-run G8/#44.

No int13 branch touches these fingerprint inputs: no file matching coa, `scripts/lib/step` or the three computes. So the recapture is needed once, after int12, whatever order int13 lands in.

## 4. Other suite failures on the trial tree

Full suite on the trial: 4 failed / 18,058 passed / 4 skipped, in 2 files.

- `handbook-rule-map.logic` (3 tests). **Real.** int12's R-HK-era lock requires a `scripts/steps/_schema/rule-map.json` entry with a `handbook_line` for every register id. The finding is `{"arm":"a","id":"R-GZ"}` and the same for R-HA. Add the two rule-map entries, then regenerate the handbook.
- `template-freeze.infra` "frozen_at … ancestor of HEAD" (1 test). **Trial artifact.** `frozen_at` = `bed070af` (a p4c commit) is not an ancestor of HEAD in an uncommitted merge. It passes once the merge is committed.
- `tsc --noEmit`: exit 0.

## 5. Generators: what must be regenerated, in order

Every pre-commit `--check` ran on the trial tree (`p4c-trial/gen-checks.txt`):
- All clean: churn, template-freeze, target-files, src-sql-ledger, chain-args, bylaw-provisions, ingest-batch, sharing-phase, logic-variable-groups, **logic-vars-docs**, probe lists, the three assert descriptors, last-measured (R-GQ baseline holds), **report-fields** (`maxbld-report-field-inventory`), **conversion-roadmap**, programme-backlog, surface-registry, **schema-to-vocab** (122-vocabulary), generated-docs, **spec-split-check**.
- Stale: `generate-step-handbook --check` only.

Order:
1. Resolve the two specs (renumber §B, re-cite lines, R-ET suffix to 124a §B26 if layer2-spec is in).
2. Add the R-GZ/R-HA entries to `rule-map.json`.
3. `node scripts/generate-step-handbook.mjs --write`. Rendered vs committed differs in Table 1, which now shows coa, enrich_coa_zoning and link_coa_to_parcels as `runner_wired` and no longer "legacy shell". The defect-ledger line citations also shift by +2 (CCS-D3 l.351→353, CCCE-D2 l.392→394) because of the COA-D15/D16 rows.
4. Re-capture the three POST slugs (§3).
5. `step-validate --all --fast` must exit 0.
6. spec-split-check, decision-log (`--check`, once layer2-spec is in), and the handbook `--check` again.

Not affected:
- `converted.json`, witness `_catalog.json`, `template-freeze.json`, `logic-variable-effect.json`, the logic-vars registry and `122-conversion-roadmap.md`: int12 did not touch them and their checks are clean.
- Golden-lots `cases.json` (lands with bylaw-e2e-1/bylaw-fix-1): its inputs are lots.json, the envelope tracker and dispositions, bylaw-provisions.json, vocab.json and maxbld-field-lineage.json. p4c touches none of them, so it is not made stale by p4c.
- `maxbld-report-field-inventory.{md,json}`: p4c (enrich_parcels trace hashes) and bylaw-fix-1 (vocab.json hash) change different lines and auto-merge. Re-run `report-fields --check` after both land.
- Scorecards: p4c commits none.

## 6. Overlap with the pending integrate-13 branches

| Branch | Files shared with p4c | Note |
|---|---|---|
| wf2/spec-132 | Specs 122, 124, 124a | Spec 124/124a conflicts (id rows and §B sections). The 122 RE-FREEZE text auto-merges. |
| wf2/layer2-spec | Specs 122, 124, 124a | M36 block conflict (§2): §B29/§B30, R-ET suffix to 124a §B26, rows between R-GY and R-HB. |
| wf1/bylaw-fix-1 | maxbld-report-field-inventory.{md,json} | Auto-merges (different lines). |
| wf2/report-schema, wf1/bylaw-e2e-1, wf2/fix-lockless-env | none | Their only conflicts are the int12 hunks above, because p4c's base is int11. |

**Recommended order:** land int13 first, then have the p4c lane merge the int13 tip into its branch (§B29/§B30, R-ET into §B26), add the rule-map entries, regenerate the handbook, re-capture the three POST slugs, and re-verify. The alternative order (p4c on int12 first) means renumbering twice.

**Process note (R-HK, provisional on layer2-spec).** The operator's "y" to the night-p4-c R-GZ/R-HA drafts is a chat decision. Under R-HK / CONSTRAINTS ("Operator decisions are transferred mechanically (decision log + generator + coverage lock)") it should be imported as a `docs/reports/decisions/` log (`decision-log.mjs --import --chat`) and cited from the two rows. `decision-log --check` does not require it, so this is not a blocker.
