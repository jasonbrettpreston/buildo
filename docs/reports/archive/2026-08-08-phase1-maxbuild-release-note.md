# Release note — Phase 1: max-build envelope geometry fixes (WF3, cloud-applied 2026-08-07/08)

**Commits `8f6443f9..45e2452d` + panel fold `db6662ca` (branch `wf2/deep-scrapes-restore-l0`) · migrations 238 + 239 applied to cloud (verify 0 missing / 0 drift) · first successful `chain-sources` completion on cloud (scoped dispatch, run 31217446629, 2h16m, success).**

## What changed for users of the data

- **Corner parcels no longer report physically impossible envelopes.** The corner width formula charged the front setback (a depth loss) against the width — 13.49 m frontages read as 2.99 m-wide envelopes on ~6,900 corners. Post-fix: cloud corner sub-3 m widths = **0**; the high-side invariant (width ≤ frontage, length ≤ depth) measures **0** violations.
- **Sub-floor envelopes are withheld or coverage-scoped, never priced.** A build dimension below the 3.0 m viability floor (`max_build_min_dimension_m`, operator-tunable) is evidence the setback model doesn't describe the lot:
  - **Ravine sub-floor residual → `envelope_constraint_reason = 'ravine_constrained'` (12,967 parcels on cloud):** the whole envelope is withheld (dims/GFA/basis NULL, confidence low). **Envelope cost lines are suppressed on this class** (new-build / CoA-build / solar) — the class carries **$0 envelope cost** (pre-fix, the sub-floor formula subset alone held ~$2.13B cost_fb + $62.5M solar). Kitchen/bath/basement/underpin/gut/addition lines survive on their `cur_*` drivers — **menus are reduced, never deleted**. The above-floor ravine majority (11,559) keeps `'ravine'` and its envelope.
  - **Non-ravine sub-floor → coverage-only envelope** (`max_buildable_gfa_basis = 'coverage_only'`, 27,288 parcels): footprint = the lot-coverage cap; the degenerate box/buffer are excluded.
- **Stale optimal-config values self-heal.** The incremental pass now recomputes any parcel whose stored config diverged from its live envelope, and resets configs on parcels that lost eligibility (including the lot-NULL limbo class — e.g. the $26.6M phantom on parcel 475651's class). Cloud steady-state: the staleness predicate selects 0.
- **Exemplar:** parcel 23082 moved from a $25,765 phantom estimate to a coherent 6.11 m × 15.22 m, 186 m² envelope priced at **$1.216M** (the plan projected ~$1.3M).

## Operator-visible notes

- **Permit-level cost ladder:** on suppressed-envelope parcels the Spec 83 ladder degrades **T3→T4 holding coverage while values shift** — coverage metrics do not drop.
- **`build_ratio_null_rate_pct` WARN (53.7% dev-measured)** in compute_build_norms is the expected consequence of withheld envelopes NULLing the ratio's denominator — not a regression.
- **Mobile:** the new `ravine_constrained` reason renders as its **raw snake_case string** on the parcel screen — the pre-existing `lot_too_narrow` exposure class (verified render-safe; UI copy is a follow-up).
- **Coverage figures:** residential footprint coverage reads **93.89% on cloud** (94.03% dev) — the numerator now honestly excludes the withheld ravine class. The plan's ≥95% projection assumed a ~4,775-parcel class; the true class (including data-missing-NULL ravine rows) is ~13K, as the plan's own undershoot warning anticipated.
- **×2 benchmark:** healthy-population rate improved 48.23% → 50.16% (dev); corner class 26.13% → 49.61%. RD-only reads 61.58% raw / **97.58%** counting legit exceptions NULL-safely (over-coverage grandfathered stock, ravine, pocket-1-storey caps); the truly unexplained residual is 0.55% (follow-up filed).
- **New observability:** gated invariants `max_build_dim_exceeds_lot_dim`, `ravine_constrained_carries_priced_cost`, `max_build_dim_below_floor` (all 0/inert on cloud) + RC bounds + the `priced_newbuild_lt_30sqm` INFO tripwire (micro-envelope class, redesign filed to the ravine-directionality WF).
- **Deferred (filed):** D-B attached-unit side_count model (~14K parcels stay conservatively width-NULL) · ravine-directionality redesign · comps staleness predicate · RD residual pattern hunt.
