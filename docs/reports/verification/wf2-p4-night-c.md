# verify-13c: wf2/p4-night-c @ 51874abd (R-EZ independent verification)

**Verdict: PASS-WITH-NOTES.** Nothing blocks on the branch as built (base int11 5f1cc5ba). There is one integration blocker, which the lane must fix after merging int12: the coa-chain POST captures go STALE (merge notes §3).

Evidence for this check is in `verify-13/p4c/`: suite.log, tsc.log, sv.log, ssc.log, testdb.log, db-state.txt, e-tests.md, fp.cjs, trdiff.cjs, dbq.cjs. Merge notes are in `verify-13/night-p4c-merge-notes.md`, with trial evidence in `verify-13/p4c-trial/`.

## (g) Reproduced at 51874abd
- `vitest` (no .db): **802 files / 17,895 passed**, 4 skipped. EXIT 0. This matches the claim.
- `tsc --noEmit`: EXIT 0.
- `step-validate --all --fast`: EXIT 0. Every label line is identical to the lane's `p4c/r4/sv-final.txt`. 0 lib_fingerprint rows.
- `spec-split-check --check`: clean. `generate-step-handbook.mjs` does not exist on this base (int12-only).
- `test:db` (run under the dblock, then released): **888 passed**, 17 skipped. EXIT 0.
- The worktree is clean after all runs (only `?? mobile/node_modules`, which was there before).

## (a) Swap commits: goldens, hashes, diffs, brackets
- **Source fingerprints** were recomputed from git objects (`p4c/fp.cjs`):
  - Each PRE equals the legacy shell at the swap's parent: coa 16ba0524 @fa899041, lctp 7d4a79e0 @42c9d3d5, ecz 698e0e42 @2f0d4446.
  - Each POST equals the swap commit's tree and still equals HEAD: coa bfa1edea, lctp 50bb4b92, ecz 8198d007.
- **coa:**
  - table_state is identical in PRE coa/standalone and POST coa/standalone/forced-data-hash: coa_applications **33966/5f16985b**, lifecycle_status_history **381698/9b1ea64b**.
  - forced-status reads 381748/dc3aae31. That is the expected pre-restore +50.
- **ecz:** **33966/a140d3ef** in all four plain captures. coa-forced reads 005c56aa because the heal re-stamped zoning_enriched_at; R-DQ allows this.
- **G8:** compare ran on all three steps. Diffs found coa 203, lctp 271, ecz 878; **unexplained 0**. #38, #39 (89 post captures fresh), #40 and #54 PASS. #44 WITNESS PASS on all three.
- **Explained-diff citations:**
  - Spot-checked against the descriptors: coa deviations[] 1/3/4/6/7, lctp deviations[] 1–4 (Ruling 1/2/3, LCTP-D5/D8), ecz deviations[] 1–3.
  - Each cited deviation exists and its `from`/`why` covers the diff. Examples: max_days_stale 0→6 is COA-D6, deviation 3; the linked_permit_num read is deviation 4; the Turf neighbourhoods reads are deviation 3 / R-W.
- **R-EX rerun proofs:** PASS in every POST.
  - coa: seen_drift, seen_touch_only, 2689 rewritten = 2689 touched, Δ0. lifecycle_status_history strict zero.
  - lctp and ecz: strict zero.
- **#38 brackets:** all four logs (`p4c/r4/{status,hash}-run.log`, `r4/lctp/run.log`, `r4/ecz/run.log`) show the assert PASS, the heal, and POST-RESTORE OK.

  | Bracket | Result |
  |---|---|
  | R-ET derived_status | count_path 50, restore deleted 50 ledger rows |
  | data_hash append_text, R-GZ fitted `left(data_hash, 64-n)\|\|s` | 50 healed |
  | R-DP delete_reinsert | 50 re-inserted |
  | R-CZ add_number | 50 healed |

## (b) link_coa_to_parcels re-match
- **The re-match is covered.** Deviation 1 (Ruling 1, operator y 2026-10-18) declares that every eligible CoA is re-matched every run, that departed pairs and vanished leads are retracted, and that the back-fill fires only on a link change. So the first converted POST necessarily re-matches the write-once legacy backlog:
  - 1811 inserted, 111 updated, 226 retracted, 1931 back-filled.
  - lead_parcels 275,447 → 277,032.
  - Rerun proof strict zero, so this is the step's fixed point.
- **Retractions were before-imaged.** The 32 `before_image_written:lead_parcels` audit rows sum to **226**. The file `docs/reports/golden/link_coa_to_parcels/before-image/2026-10-20T18-26-26.298Z-lead_parcels.jsonl` has 226 lines.
  - NOTE: that path is gitignored (`.gitignore`:120), so the before-image is local-only evidence. This is by design, but it is not in the commit.
- **Bracket side effect: no rule is violated.** R-DQ (124a:479) states it directly: "the R-AS instrument restores only the column it perturbed. So a column the step writes while healing keeps its new value … Restoring every column was rejected: it would undo the step's own legitimate write." The forced capture is ordered after the plain captures. Its coa_applications hash moved (432e6ead → e879292a over id/lat/lng/neighbourhood_id), which shows the 50 CoAs' coordinates actually changed.
  - Reading: these CoAs kept legacy-era coordinates through the first converted run because their link did not change (Ruling 1), and the bracket made their link change. This is declared behaviour, and recapture.json/cohort.json state it.
- **The DB is consistent.** Read-only SELECTs under the dblock (`p4c/db-state.txt`):
  - lead_parcels 277,032 (31,762 coa:), matching POST.
  - coa_applications 33,966.
  - lifecycle_status_history 381,698, restored to the PRE count.
  - 0 rows carrying a "forced" marker.
  - The cohort's 50 CoAs are stamped 18:27:45, separate from the 1,931 stamped at 18:26.
  - No advisory locks are held. Cohort backup tables are left in place, as in every prior night.

## (c) enrich_coa_zoning ordering diff
- **The claim is justified.** The table hash a140d3ef is identical across the legacy PRE coa, the legacy PRE standalone (0 writes), the converted POST coa and standalone, and the strict rerun proof. ecz is always full (Spec 66 DEC-3), so converted writing 0 against the legacy-settled corpus shows its output equals the legacy output on all 33,966 rows over the 100-column projection. The coa-forced bracket shows the converted step does write and heal (records_updated 50), so the 0 is not a no-op.
- **NOTE:** the converted step's catch-up from an unsettled state (8,746 refreshes, 9 orphan clears) was not exercised. writes[1] (orphan nullify) has no live non-zero POST evidence. cohort.json says so ("writes nothing on a settled DB"), and #38 is per table, so this is allowed. Carry it as a known gap.

## (d) R-HA
- **Rule text matches the operator draft** (QUEUE.md:1685/1687: "derived target witnessed by ≥1 fresh POST trace; per-trace write count range; write_inventory.derived_statements"). The 124 row, Spec 122 RE-FREEZE #38 and 124a §B22 all say the same.
- **Red-first is real.** I ran the e79ee96b test and fixtures against bed070af's witness.mjs in a throwaway worktree (removed afterwards): 3/6 fail, with exactly the claimed rows (`b:lifecycle_status_history`, `c:statements:2!=3`).
  - NOTE: the fixture traces are the r3 captures (@bed070af), not the committed POST traces. They differ only in source_fingerprint, git_head, timing, client pid and one pipeline_runs param. The write-statement fingerprints and touched.writes are identical (`p4c/trdiff.cjs`).
- **The template-freeze change is non-stale.** The only diff is `frozen_at` plus `schema_sha256`. `generate-template-freeze --check` is clean. `git diff 5f1cc5ba..51874abd -- scripts/lib/step` is empty, and #39 passes fleet-wide.
- **The step.schema.json change is additive.** It adds one optional property, `write_inventory.derived_statements` (integer ≥ 0, x-trust, x-ruling). `required` is unchanged.

## (e) Re-homed tests (fork result, `p4c/e-tests.md`)
- **84 tests in 10 files confirmed.** The old versions run on HEAD give 84 failed / 721. The new versions give 713/713. The 8 removed tests are per-script load-coa.js parametrised cases, following the RE-HOMED pattern.
- **Legacy oracle fixtures are byte-identical** to the shells at 5f1cc5ba and at each swap's parent: coa 31336a9c…, lctp 94186017…. ecz is a pass-through and needs no fixture.
- More than 25 assertions were compared. No silent loosening: they are path swaps, retargets of equal strength, and 3 it.fails flipped to it.
- **NOTE N1:** `variable-effect.infra.test.ts`:30-41 now omits `enrich_permits_centreline_coverage_min`. That entry, along with its `takes_effect_at_cutover` badge, disappeared from the generated `logic-variable-effect.json` (b2ea1532).
  - enrich_permits still runs legacy `scripts/enrich-permits.js`:320 (`centreline_propagation_coverage_min`), so the admin page now falsely reads as in effect.
  - Cause: the now-live template literal `scripts/lib/enrich-lead-zoning.js`:302 matches both slugs.
  - The test cites "R-EO's documented known limit", but the documented limit (`variable-effect.mjs`:19-20) is console-only reads, so the citation is loose.
  - PIN VAR-EFFECT-SHARED-TEMPLATE exists only in a test comment and in QUEUE.md. It should be registered properly.

## (f) V3 labels
All three steps read 17/17, hard-stop=false, standard=V2. These are as claimed and identical to the lane's run:
- coa: fails 8 (LDG-10, CHAIN-TOOLING, EP-PIN-D17) and 9 (deviations 4/8 no rule id).
- link_coa_to_parcels: fails 8 and 9 (grandfathered, plus deviations 2/4).
- enrich_coa_zoning: fails 8 and 9 (deviations 1/3).

enrich_parcels stays 17/17 V2 on condition 9.

- **NOTE N2:** all three ecz deviations say "operator ruling owed at integration", and lctp deviation 4's type counters "await the operator". The swap made these behaviours live (runner_wired). R-EQ does not gate on this and the V2 label is honest, but the operator should rule before ③.

## Other notes
- **N3:** R-GZ and R-HA are operator "y" chat decisions. They are not yet imported as decision logs under R-HK (layer2-spec) or under the CONSTRAINTS "transferred mechanically" rule. Import them at integration.
- **N4:** COA-D15 dropped the `detail: skipReasons` from the records_skipped row. The reasons are preserved in `records_meta.coa_load.skip_reasons` (verified in POST).

## (h) Merge summary
See `night-p4c-merge-notes.md` for the full notes.
- **Textual conflicts onto 208e8a82:** only Spec 124 (rows) and 124a (appendix tail).
- **124a §B21/§B22 collide with int12's.** Renumber them to §B25/§B26 on int12 alone, or §B29/§B30 after int13. Fix the "124a §B21/§B22 (provisional)" pointers by hand, because spec-split-check does not catch them.
- **No id collisions:** R-GZ/R-HA are free (layer2-spec skips them), and RE-FREEZE #38 is free.
- **R-ET suffix:** with layer2-spec's M36 it must be re-applied inside 124a §B26 through spec-split-check's sanctioned path.
- **Stale line citations** in p4c's conflict tables: 124:240, 261, 263, 265.
- **No R-GR conversion needed:** COA-D15/D16 are CLOSED fixed defects.
- **Spec 124 budget:** about 378/380 lines with layer2-spec.
- **BLOCKING at integration:**
  - int12's condition-9 backfill re-cites `adjudicated_by` in the three descriptors. That moves the source_fingerprint, so `step-validate --all --fast` exits 1 with #44 STALE hard stops on coa, link_coa_to_parcels and enrich_coa_zoning. The lane must merge int12 (or the int13 tip) and re-capture the 10 POST invocations under the dblock.
  - `handbook-rule-map.logic` fails (3 tests) until rule-map.json gains R-GZ/R-HA. Then regenerate the handbook with `generate-step-handbook --write`.
- **Not stale:** golden-lots cases.json, converted.json, logic-variable docs, the roadmap, template-freeze and report-fields; all were checked clean.
- **Recommended order:** land int13, then the lane merges the int13 tip, renumbers, adds the rule-map entries, regenerates the handbook, re-captures, and is re-verified.
