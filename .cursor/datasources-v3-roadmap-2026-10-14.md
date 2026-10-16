# Datasources (sources chain) — Airtight V2 → V3 gap roadmap, 2026-10-14

**Lane F, re-scoped by the operator 2026-10-14.** Every sources step is already converted; this page lists only the remaining V2 → V3 gap and orders it. It plans no conversion.
- **V3** = R-BA (five words) + R-BF (registry and cross-step truth, Spec 122 §6.6.1) + R-BZ/R-CA (compute purity).
- **Chain complete** = R-BC (a)–(e), Spec 122 §6.6.
- **Order (operator 2026-10-14):** McBylaw P2 → McBylaw P3 → this V3 work → H7–H9.
- **68/69:** N/A, except where a row below says it touches by-law-derived fields.

**Evidence key:** [M] measured this session on tip `2d7b0d84` (main tree) · [E] enforced by a named gate · [D] declared (plan or spec text, not re-executed).

## 1. Measured state

### Sources-chain totals
- **(a) Converted** [M]: 27 of 28 slugs are in `converted.json`. The 28th, `reconcile`, is `runner_owned`-exempt (R-AP). (a) HOLDS.
- **Validator** [M]: `node scripts/analysis/step-validate.mjs --all --fast` is read-only (no `--write`) and took about 10 min. Exit 0, 0 hard stops.
  - The five words are PASS on every step, but only through ledger rows.
  - The `standard=` label reads V3 on 12 slugs and V2 on 15.
- **Ledger** [M]: `standard-gates-ledger.json` holds 216 rows, and (b) needs 0 of them for the chain.

| Rows | What | Closes on | Owner |
|---:|---|---|---|
| 44 | gate E purity, codes G6/G7/G10/G12/G13 | CP-PLANA | **lane C** |
| 8 | gate E purity | CP-S5 | **lane C** |
| 2 | gate E purity | CP-S1 | **lane C** |
| 1 | gate E purity, refresh_snapshot `sync_runs` | CP-PERMITS | blocked on the permits chain |
| 2 | gate E `physical_constant` (load-parcels `mPerDegLat`, R-BZ) | permanent | Q2 below |
| 27 | gate E literals (assert-data-bounds 10, load-ravines 4, load-parcels 3, assert-global-coverage 3, link-massing 2, link-wsib 2, refresh-snapshot 2, enrich-parcels 1) | "chain_sources conversion complete" | burn-down plan |
| 132 | non-E: G 31, I 57, K 18, B 12, A 8, F 6 | the same | burn-down plan |

- **#44 witness** (report-only until P1-C9) [M]:
  - 112 FAIL rows on 14 slugs (declared ≠ touched);
  - 25 compute-attributed FAILs on 24 slugs. Of those, 23 are `a:pipeline_runs.*` (CP-S1's reader, lane C) and 2 are `a:columns.*` (CP-S5, lane C).
- **R-BF** [M]: NOT MET. The marker `R-BF WITNESS GATE (#44)` has 0 hits in `step-validate.mjs`, so the spec124-register lock holds the status at NOT MET.
- **Programme items** [M]: LDG-10 NOT_STARTED; CHAIN-TOOLING NOT_STARTED; P1-C9 NOT_STARTED; EP-PIN-D17 PARTIAL; ACC-1 NOT_STARTED.
  - LDG-10, CHAIN-TOOLING and EP-PIN-D17 are `cutover_prereq` blocking 38 non-sources slugs.
- **Other registry gaps** [M]:
  - gate D: 41 unproduced `src/` reads (report-only);
  - #46: `checks[].reads` declared by 2/27 steps, `write_inventory.by_mode` by 0/27;
  - #49: 150 terminals unwitnessed.

### Per step [M]
Columns:
- **pur** = purity rows (R-BZ);
- **lit** = gate-E literal rows;
- **other** = the step's non-E rows, by gate;
- **#44** = witness FAIL rows;
- **min** = that step's successful H5 capture minutes (fleet4-run logs, 2026-10-13/14).

| step | score | std | pur | lit | other | #44 | min |
|---|---|---|---:|---:|---|---:|---:|
| assert_schema | 16/17 | V2 | 9 | 0 | B3 G1 K1 | 1 | 2 |
| address_points | 14/17 | V2 | 2 | 0 | G1 K1 | 0 | 9 |
| geocode_permits | 17/17 | V3 | 0 | 0 | G1 K1 | 0 | 2 |
| parcels | 16/17 | V2 | 5 | 3 | G1 K1 | 6 | 21 |
| load_ravines | 16/17 | V2 | 2 | 4 | B3 G2 K1 | 3 | 6 |
| load_heritage | 17/17 | V2 | 3 | 0 | 0 | 0 | 2 |
| load_centreline | 16/17 | V2 | 2 | 0 | 0 | 0 | 3 |
| link_parcel_addresses | 14/17 | V3 | 0 | 0 | B1 G1 K1 | 0 | 8 |
| compute_centroids | 14/17 | V3 | 0 | 0 | B1 G2 K1 | 0 | 3 |
| link_parcels | 16/17 | V3 | 0 | 0 | B1 G3 K1 | 2 | 16 |
| enrich_ravines | 12/17 | V2 | 2 | 0 | F1 G2 K1 | 0 | 2 |
| enrich_heritage | 10/17 | V2 | 2 | 0 | F1 G2 K1 | 3 | 2 |
| enrich_centreline | 17/17 | V3 | 0 | 0 | 0 | 0 | 44 |
| massing | 16/17 | V2 | 4 | 0 | 0 | 0 | 37 |
| link_massing | 16/17 | V3 | 0 | 2 | B3 G1 | 1 | 110 |
| neighbourhoods | 16/17 | V2 | 2 | 0 | 0 | 0 | 2 |
| link_neighbourhoods | 17/17 | V3 | 0 | 0 | A1 G2 K1 | 8 | 2 |
| load_wsib | 17/17 | V3 | 0 | 0 | 0 | 0 | 1 |
| link_wsib | 16/17 | V3 | 0 | 2 | G3 K1 | 0 | 13 |
| load_zoning | 17/17 | V2 | 1 | 0 | 0 | 0 | 5 |
| enrich_parcels | 16/17 | V2 | 2 | 1 | A1 G3 | 43 | 102 |
| compute_parcel_cost_estimates | 10/17 | V3 | 0 | 0 | A5 F1 G1 K1 | 5 | 8 |
| refresh_snapshot | 16/17 | V2 | 5 | 2 | G1 K1 | 2 | 4 |
| assert_global_coverage | 16/17 | V2 | 6 | 3 | A1 G1 K1 | 15 | 4 |
| assert_parcel_sanity | 16/17 | V3 | 0 | 0 | G1 K1 | 1 | 3 |
| assert_data_bounds | 16/17 | V2 | 9 | 10 | G1 K1 | 10 | 3 |
| assert_engine_health | 16/17 | V3 | 0 | 0 | G1 K1 | 12 | 2 |

Rows not tied to one step:
- `(registry)`: I 57 (defect-id prefixes AS 11, LR 9, LM 15, AGC 7, ADB 6, AEH 6, AP 3) and F 3 (EOL);
- `vocab-coverage`: 1 purity row.

**Label finding** [M]: `standardFor()` (compute-literals.mjs:106) says V3 whenever a module has no purity row. Two measured cases contradict that label:
- link_neighbourhoods reads V3 with 8 witness FAILs;
- assert_engine_health reads V3 with 12 witness FAILs.

So the label is purity-only, while R-BF is NOT MET fleet-wide. No sources step is V3 today. See proposed row P1.

## 2. Costs (measured inputs)
- Full fleet recapture: about **431 min (7.2 h)** of successful captures, measured over H5.
  - The heavy steps are link_massing 110, enrich_parcels 102, enrich_centreline 44, massing 37 and parcels 21 min.
  - Most other steps take ≤ 16 min.
- `step-validate --all --write`: 8.5 min. `--all --fast`: about 10 min.
- Witness write + check: 1.5 min.
- Full suite at 2 forks: 19 min (1,134 s, H5).
- A descriptor, notes or compute edit moves that step's fingerprint, so it needs the step's own recapture [D, from burn-down plan R2 `capture-step-golden.js:326-341`]. A `scripts/lib/step/**` edit forces the whole 7.2 h fleet [D, ibid.].

## 3. Unblocked NOW (L lane, no capture, no fingerprint move, no collision with lanes A/C/E)
1. **Re-ground the two parked plans on `2d7b0d84`** (docs only, about 1 h each, 0 H):
   - `.cursor/wf2_sources_ledger_burndown_active_task.md` was measured on 10-06 (167 rows). The live count is 216 rows, of which 159 are non-lane-C.
   - `.cursor/wf1_ldg10_ledger_complete_active_task.md` is plan E; the operator asked for it to be re-scoped.
   - Neither is authorized. Re-grounding only refreshes counts and drops the H5-closed rows (CP-S2..S4 rows are 0 now [M]).
2. **Gate F, two test-file EOL rows** (`src/tests/steps/{geocode_permits,link_neighbourhoods}/violations.test.ts`): renormalise to LF and delete the 2 rows. Tests are not capture inputs, so the cost is 0 H.
   - The third row (`geocode-permits.notes.json`) is a capture input, so it rides the step's next recapture.
3. **Gate I, prefixes LR 9 / LM 15 / AP 3 (27 rows)**: make the assessment-report tables agree with `defect-ledger.md` (burn-down Batch 1b / Q10(a)). Reports are not capture inputs [D]. Cost 0 H.
   - AS/AGC/ADB/AEH (30 rows) wait for lane C, which edits those steps.
- Everything else either moves a fingerprint, touches by-law-derived reads (enrich_parcels' 43 witness rows are `zoning_bylaw_areas.*` / CoA columns, which McBylaw P2 changes), or is lane C's. It all waits for P2 + P3.

## 4. Ordered V3 work AFTER McBylaw P2 + P3
**Rule:** every fingerprint-moving item below rides ONE fleet recapture night (Spec 122 §8), with `lib_fingerprint` frozen from that night until R-BC(b) is measured.

| # | Item | Closes | L effort | H cost |
|---|---|---|---|---|
| V3-1 | Lane C lands CP-S1/S5/PLANA (prerequisite, not lane F) | 54 purity rows; 25 attributions | lane C | rides V3-5 |
| V3-2 | **P1-C9**: #44 hard for every converted step (R-BF arm; Spec 122 §6.6.1(f)). First, descriptor `inputs.reads` fixes for the 112 witness rows (14 steps). | R-BF MET | ~14 briefs | rides V3-5 |
| V3-3 | **Burn-down Batch 2** (A 8, B 12, E-literal 27): code/descriptor briefs per step | 47 rows | ~20 briefs [D plan] | rides V3-5 |
| V3-4 | **Gate K** red-evidence for 18 steps (Q5(b) mutation-red recipe) + the K tightening | 18 rows | ~10 briefs + targeted vitest | 0 |
| V3-5 | **ONE fleet recapture night**, then G-X explained diffs | G 31 + all of the above | — | **~7.2 h captures + 8.5 min validate + 19 min suite ≈ 8 h** |
| V3-6 | **LDG-10** (R-BC(c)): five §6.1 edge classes gated both ways; ordering derived, replacing `chain.logic.test.ts` `indexOf`; §6.4a centroid re-proof | LDG-10 BUILT | plan E re-scoped | its class-1 witness proof reuses V3-5's traces; 0 extra if it lands first |
| V3-7 | F1 score floor: enrich_ravines 12, enrich_heritage 10, cpce 10 → ≥ 14/17 (report sections) | 3 F rows | 3 briefs | 0 |
| V3-8 | **CHAIN-TOOLING** (R-BC(e)): hooks-composition lock, pre-commit ≤ +10% wall time, ai-env-check per-chain line, `cloud:pre` seed coverage | item BUILT | 1 WF2 | ~20 min (suite + timing) |
| V3-9 | Closeout: `step-validate --all --write`, measure R-BC(b) = 0 | (b) HOLDS | — | ~30 min |
| — | (d) cloud acceptance = H9 / EP-PIN-D17 (R-AQ.1) | — | — | outside this roadmap |

**Total H** ≈ one 8 h night plus about 1 h of short windows. The fleet night is the only heavy job.

**Time bomb** [D, burn-down R2]: `cost_rates_stale` flips WARN on about 2026-10-30. Any compute_parcel_cost_estimates capture after that shows a G8 diff, which must be explained or the rates refreshed. Re-measure this before V3-5.

**Out of scope here** [M]: the permits, coa, entities, wsib, coa_notices and deep_scrapes chain files are absent from `converted.json` (only load_coa_notices is pending). CP-PERMITS (1 row) waits on that.
