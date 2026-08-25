# Round-2 PLAN panel record — PHASE 1 Max-build envelope v2 (2026-08-06)

Four-agent re-review of `.cursor/active_task.md` v2, operator-ordered after two prior invalidation rounds.
Roster: **Integration** (code grounding, live tree) · **Reality-Check** (data grounding, CLOUD DB via pipeline pool) · **Fold Auditor** (v2 vs `.cursor/phase1_maxbuild_panel_record_2026-08-05.md`) · **Fresh Adversarial** (blinded to the round-1 record).

## Verdicts
| Agent | Verdict |
|---|---|
| Integration | SOUND-WITH-CORRECTIONS |
| Reality-Check | SOUND-WITH-CORRECTIONS (geometry exact; money side unsound) |
| Fold Auditor | FOLD FAITHFUL WITH GAPS |
| Fresh Adversarial | **NOT-READY** |

## Blocking findings (drive the v3 rewrite)

**R2-1 (CRITICAL, Fold F1 + Adversarial 1 — independent convergence): the ravine class has no defined end-state.** 4,423 parcels incl. exemplar 361249. No D-fix touches ravine geometry (RAVINE_SETBACK_M 10 subtracted from BOTH axes `:506`/`:509` + all-around buffer inset `:518`, direction-blind vs Ch.658's one-edge reality). With the fallback forbidden, post-fix they either still emit sub-3 m dims (failing step 7's gate) or go fully NULL (deleting ~4.4K cost menus — cost_fb via `COALESCE(opt_aor, max_buildable_gfa)` + SOLAR pricing footprint directly, `parcel-cost.js:82-86` — and ~1.6 pts footprint coverage). Step 5's red pins what must NOT happen, never what must.

**R2-2 (CRITICAL, Adversarial 2): step 7 gates pass vacuously on NULLs.** A still-buggy corner fix lands sub-3 m → D-C NULLs it → "0 emitted < floor" passes by construction; the invariant (`:128`) requires both sides non-null; "(0,10)→0" satisfied by NULLing; the ×2 benchmark has no target number (honest ceiling ~79%, 19-25% legit exceptions per WF1 report :48-61); "coverage ≥95%" names no metric — width coverage is *guaranteed* to fail if D-B defers (14,342 NULLs), footprint coverage guards nothing. Missing: per-class POSITIVE recovery counts.

**R2-3 (HIGH, Reality-Check 5): the money story is wrong by ~29× and half-unsourced.** $535.9M is the 319-parcel invariant subset; the 28,006-population exposure is **$15,728,182,177** (median $529,691/parcel, p99 $1.6M, max $4.52M) [cloud, exact]. Projected figures ($475.1M / 0.86 / 16-of-319 >1.5× / 51× / 23082→$1.3M) have ZERO panel provenance; proxy simulation reproduces the aggregate (0.837) but 0 parcels >1.5× and 23082 unmoved — the 51× claim requires D-D's optconfig recompute, untraced by anyone. Current-state figures ($535.9M/319, 27,961-of-28,006, 23082 = $25,765) all verified exact.

**R2-4 (HIGH, Adversarial 3): D-D fix shape under-specified; both obvious implementations fail.** `parcel_max_build` is TEMP ON COMMIT DROP (`:417`); optconfig runs post-commit on a separate pool conn (`:1405-1408`) — no change-set join possible. Event-based invalidation cannot heal the existing ~375 stale rows. Only workable shape under "NO new column": state-comparison predicate (stored `optimal_config→as_of_right→main_footprint_sqm` IS DISTINCT FROM current footprint; convergent because `buildTier` copies it, `optimal-config.js:188-190,215`). Missing anti-thrash red ("steady-state 2nd run selects 0 rows"). Spec 78 `:206-207` pins the OLD predicate in prose — must be amended same commit.

**R2-5 (HIGH, Adversarial 4-5): re-run sequencing wrong.** (a) Max-build incremental scope (Spec 65 §Incremental `:217`) re-fires on ~0 parcels for a formula-only change — steps 2/7 must say `--full`. (b) `stale_cost_fsi_without_gfa` false-reds at step 7 unless dev runs `compute_parcel_cost_estimates` before measuring. (c) Comps: pass-4 gate `sp.comp_count IS NULL` (`:982`) + neighbor-graph `build_ratio = roof/footprint` (`:969-970`) — 28K footprint changes leave every touching subject's comp_* stale forever without a full comps pass; none scheduled. (d) `compute-build-norms.js:74-76` denominators use `max_buildable_gfa_sqm` — permits-chain step, never re-run in steps 1-13; step 13 prices new envelopes against old-geometry norms. (e) Step 8's HALT gates (centreline recency/coverage `:315`/`:330`, coa link table `:345,354`, lineage stamps `:144,154`) unverified pre-flight; memory records coa centreline=0 until link_coa_to_parcels.

**R2-6 (HIGH, Integration F1): the D-A "regression lock" does not exist.** The quoted text is Spec 65 §5 `:282`, not the test; `enrich-parcels-maxbuild.db.test.ts` never sets `is_corner_lot` true; §5:282 also claims through-lot/lot_too_narrow/garden-suite-gate tests that don't exist. Step 3 = WRITE the lock + fix the stale §5 sentence in the same spec amendment.

## Corrective findings (fold, non-blocking)
- **Integration F2:** surface (5)'s edit site is `EXPECTED_LOGIC_VAR_KEYS` in `control-panel.logic.test.ts` (~:59-257, no-extras :266-271); `control-panel.ts:159-161` auto-derives from seed JSON. Surface (3) is TWO touches: `.strict()` schema :19-41 AND `resolvedVars` ~:1330-1348 + threading into `buildMaxBuildSql`.
- **Integration F3/F4:** RS side_count=1 (reduced, not zeroed; RT=0, else 2 — `max-build.js:114-128`); rear setback is 7.5 (13.5 = front 6.0 + rear 7.5 combined).
- **Adversarial 6:** D-A's flat `frontage − side − flankage` isn't side_count-aware (corner semi RS over-subtracts); D-A and D-B each fix one branch — neither owns attached-corner intersection. 152 corner∩ravine overlap (RC verified: all 152 clear 3 m with or without ravine stack — no hidden bug).
- **Adversarial 8:** MB-3 amendment content blank — "what constrains depth in the clamped case" posed, never answered (depth-collapsed lots get lot×33% with zero depth information).
- **Adversarial 9:** money accounting tracks cost_fb only; also moving: cost_solar (prices footprint directly), mobile basis label flip (`parcelCostFormat.ts:57-60`), permit/CoA-level Spec 83 costs (permits/coa chains, outside step 13's "through compute_parcel_cost_estimates").
- **Fold F2/F3:** "seven-reviewer panel incl. Reality-Check" false — record holds SIX verdicts, no RC section; elbow figures had no provenance (RC has NOW verified all four exact: 6,303/18,143/28,006/61,198); "≥2 reviewers" banner false for money/mobile/8,713 figures; phantom-column count is 3 reviewers, not 5.
- **Fold F4/F5/F7/F8/F11/F12:** DS-5 rollback/cloud-abort runbook DROPPED; confirmed-compliant idempotency step DELETED; MB-3 edit pinned to no step; GT-4 floor-vs-"coverage never undercut" adjudication absent; CHECKS fork (refactor vs parity test) unchosen; DS-8 Phase B post-fix revisit DROPPED.
- **Fold F9/F10/F13/F15:** step 6 basis split reopens SF-F3's consumer list (`assert-global-coverage.js:252` FILTER 'coverage_box', `coverage_defaulted_cnt`, 'rect_approx' db-test) — must be re-owned; DS-3's gated-predicate (461) acceptance absent; DS-4 missing-variable-window semantics unstated; CF-7 vitest-related locks, CF-10 Number()+Zod bound, CF-11 Technical Implementation section, GT DOC-MISSING runbook/lineage-map, `mislink_footprint_lot_tol` drift — all dropped LOW-tier.
- **RC 1/3/4/10/11/12 [all cloud-verified]:** corner/ravine/neither split exact BUT 152 overlap unstated (sum 25,726, distinct 25,574); 15,506 exact but 14,348 width-NULL vs 1,158 length-only — say "width OR length"; propagation drifted to 12,302/1,783 — step 8 gate must be live re-measure; exemplar table uses internal `id` not `parcel_id` (361249 → '5255162'); garage ceiling 10 consistent, rear_suite 6,705 UNVERIFIED-not-contradicted; 8,713 no-*footprint* vs GT-7's 28,002 have-*building-link* — different measures, both exact, needs one reconciling sentence; exemplar cost menus $626K–$3.66M on 0.02–24.7 m² envelopes (cost prices opt_aor, not max_build — money runs through D-D).
- **Adversarial 3 (residual):** ravine buffer NULL 98.1% full-population (4,341/4,423) — corroborates the 295/300 sample.

## Systemic audit blind spots (RC Task 2 — operator ordered these CORRECTED in-plan, 2026-08-06)
1. `newbuild_cost_per_sqm_out_of_band` MED/ungated; worst **$5,089,221/m²**; all 6 sampled worst rows have width 0.01–0.17 m — SAME defect population as Phase 1; 43 high-side violators today.
2. `opt_aor_gfa_sqm` — NO absolute bound anywhere (worst 3,843 m²); all checks relative.
3. `comp_fsi_p50` — low bound only (<0.05); worst **6.62**; 212 violators; previously-known gap, still open.
4. `realized_fsi_p90_out_of_range` — INERT: field 100% NULL on 496,422 rows; green-passes exercising nothing.
5. `lot_size_out_of_range_on_buildable` — self-excluding: `applies` requires footprint NOT NULL, but out-of-[50,2000] lots get emit=false → footprint NULL → never enter the check. Worst: **543,499.59 m²** tagged residential.
Pattern: a field reads "covered" by a check that has no upper bound, excludes its own outliers, or runs on an empty population.
