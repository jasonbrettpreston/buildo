# P16 16F — inference-layer flip: validated re-run + before/after (2026-07-10)

_Spec 80 §5.C FINAL model go-live. Gate: `p16_inference_layer_enabled` 0→1 (flipped AFTER the
16E consumer contract shipped, per [BUG-6]). Companion: `2026-07-09-p16-lean-complement-eval.md`
(the 16B GO gate) + `2026-07-10-p16-16a-notes.md`._

## Rollback path (created BEFORE the flip)

| backup table | rows | restores |
|---|--:|---|
| `_backup_permit_trades_pre_p16` | 3,018,833 | full pre-P16 permit_trades (evidence 1,257,054 active / 1,761,779 inactive coarse-bundle) |
| `_backup_lead_trades_coa_pre_p16` | 939,257 | the CoA lead_trades subset |
| `_backup_permits_watermark_pre_p16` | 252,753 | `permits.trade_classified_at` (one-UPDATE restore) |
| `_backup_coa_watermark_pre_p16` | 33,331 | `coa_applications.trade_classified_at` |

One-UPDATE watermark restore (per the P7 precedent):
`UPDATE permits p SET trade_classified_at = b.trade_classified_at FROM _backup_permits_watermark_pre_p16 b WHERE b.permit_num=p.permit_num AND b.revision_num=p.revision_num;`
(coa twin via id). Row-level restore: truncate + `INSERT INTO permit_trades SELECT * FROM _backup_permit_trades_pre_p16` with the mirror trigger disabled, then flip the gate to 0.

## Ops sequence executed

1. Backups above (2026-07-10).
2. `p16_inference_layer_enabled` → **1**.
3. Scoped counted reset: `permits.trade_classified_at = NULL` → **252,753**;
   `coa_applications.trade_classified_at = NULL` → **31,398** (33,331 minus never-classified).
4. Validated re-run via `run-chain.js`: **coa chain FIRST, then permits chain, strictly
   sequential** (advisory locks SKIP on contention — never overlapped), detached.

## BEFORE (baseline, 2026-07-10 pre-flip)

| metric | value |
|---|--:|
| permit_trades total | 3,018,833 |
| permit_trades active (= evidence) | 1,257,054 |
| permit_trades inactive coarse-bundle ('inference' backfill label) | 1,761,779 |
| lead_trades coa total / active | 939,257 / 442,532 |
| trade_forecasts | 1,832,103 |
| mean active trades / permit-with-trades | 5.06 |
| median / p95 active | 1 / 15 |
| starved trades (13) active | all 0 |
| default_calibration_pct (latest run 2026-07-07) | 60.3% (WARN) |
| mig-213 `idx_lead_trades_trade_active` | 52,379,648 bytes |

## AFTER (post-re-run, 2026-07-10) — BOTH chains ran END-TO-END via run-chain.js

**Run shape:** coa chain (16/16 steps, exit 0) THEN permits chain (30 steps incl. CKAN load /
geocode / classify / costs / forecasts / scores / asserts / backup, exit 0), strictly sequential,
detached. Every step landed §R10+§R11 `pipeline_runs` rows. **No separate operational coa→permits
run is required — this WAS the full validated run.**

### Distribution before → after

| metric | BEFORE | AFTER | reading |
|---|--:|--:|---|
| permit_trades total | 3,018,833 | **1,776,010** | the 1,761,779 coarse-bundle rows RETIRED [GRD-1c]; **zero inactive rows remain** |
| — evidence-active | 1,257,054 | 1,175,377 | ceiling (7,000 permits capped) + refreshed classify; posture PRESERVED |
| — inference-active | 0 | 600,633 | the lean layer (104,459 permits gained inference) |
| mean active / permit-with-trades | 5.06 | **7.15** | PASS in the global band (WARN>11/FAIL>13); p95 21, max 23 |
| evidence mean / permit | 5.06 | **4.73** | D1 guard PASS (≤7) — evidence posture *improved* (the D2 ceiling removed over-attachment) |
| starved trades (8 covered) | all 0 | **8/8 recovered** | caulking 1,035 · eavestrough-siding 64,347 · millwork-cabinetry 75,693 · overhead-doors 7,060 · solar 408 · stone-countertops 43,779 · tiling 80,026 · trim-work 94,116 |
| starved trades (5 uncovered) | all 0 | all 0 | ACCEPTED (enumerated INFO band; no line honestly implies them) |
| lead_trades CoA total / active | 939,257 / 442,532 | 939,892 / **557,662** | 114,898 CoA inference rows emitted; evidence median 15 / all-active median 21 |
| trade_forecasts | 1,832,103 | **1,091,522** | stale bundle-era forecasts purged; 445,694 inference-basis inputs (weighted 0.5×) |
| default_calibration_pct [GRD-4] | 60.3% (WARN) | **62.7% (PASS)** | +2.4 pts — the predicted uncalibrated-influx rise; `calibration_thresholds_relaxed` WARN **still fires every run** (escalation semantics intact); cohort_fill 37.3% |
| mig-213 `idx_lead_trades_trade_active` | 52,379,648 B | 52,379,648 B | physical size unchanged (entry churn absorbed in existing pages; settles at next VACUUM) |
| attachment_basis NULL rows | — | **0** | [FAB1v2] hard gate PASS |
| permit_type_ceiling_applied_count | — | 7,000 | ~matches the panel's 6,191 broad-scope estimate |

### Precision (D7d) — realized on the 122-permit inspection corpus

Re-running the eval harness against the LIVE post-flip corpus (its "current active" scenario now
reads the realized evidence ∪ inference state): **mean 9.5 / recall 57.9% / prec(insp) 70.9%** —
precision ABOVE the 65.8% evidence baseline (and the 70.5% hold-out simulation), recall +19.7 pts
over evidence-only (38.2%), 4.7 pts under the pre-P13-3 62.6% anchor at 43% fewer attachments per
permit. (Post-flip, the harness's scenario-6 row double-stacks and is no longer meaningful;
scenario-2 IS the realized measure.)

### FAIL/WARN rows — every one, with cause

| step | verdict | cause | disposition |
|---|---|---|---|
| coa:classify_coa_trades | WARN | `avg_active_trades_per_lead` 18.53 vs the 18 ceiling — evidence alone is 14.56 (+realtor +~3.8 inference); a 3% overage, not a P6.6-style 33-blowup | honest label stands; ceiling tune (18→19/20) filed as an operator decision |
| coa:compute_coa_cost_estimates | WARN | pre-existing null_reason posture; **priced count ROSE 19,449→20,456 (+5.2%), corpus coverage 58.4→61.4%** — the [GRD edit-3] guard passes in the good direction | no action |
| coa:link_coa_to_parcels / lifecycle-distribution / phase-calibration | WARN | pre-existing postures (link rate / seq bands / sample sizes), unchanged by P16 | no action |
| coa:assert_global_coverage | **FAIL** | `coa_applications.estimated_cost` 61.2% vs the generic pass floor — **pre-existing** (0% on 06-21, 58.4% on 07-07) and IMPROVED by this run; the known structural Spec 80 Phase-4 gap (severance/demolition/unparcelled CoAs are unpriceable) | pre-existing, not P16; the Phase-4 epic owns it |
| permits:classify_permits | WARN | (a) `fb_line_inference_rows` 291,595/600,633 = 48.5% > 40% — the DESIGNED new-build-stratum watch firing (watched, not assumed, until the deep_scrapes re-measure); (b) `cov_trade_vocab` 30/35 — exactly the 5 accepted uncovered starved trades, whose retired bundle rows no longer pad coverage | both are the honest designed labels |
| permits:compute_build_norms / cost_estimates / data_bounds / engine_health / lifecycle-distribution / phase-calibration / global_coverage | WARN | pre-existing postures (norms samples, cost nones, bounds watches, seq bands) | no action |
| permits:compute_trade_forecasts | WARN | `calibration_thresholds_relaxed` (designed loud, every run) + `coa_audit_gate_status = pass_or_warn_accepted` (the D3 policy row, visible by design) | designed |
| permits:assert_entity_tracing | **FAIL** | `opportunity_score_coverage_pct` **79.95% vs ≥80%** (836,820/1,046,609 scored>0) — a 0.05-pt boundary miss after P16 grew the denominator ~45% with inference-derived forecasts whose leads carry no cost/analytics (legitimately score 0) | filed: make the >0 gate basis-aware or re-baseline; NOT masked |
| permits:backup_db | UNKNOWN | the backup step emits no audit verdict (pre-existing) | no action |

### Residuals filed

1. **entity-tracing 79.95%** boundary miss → `docs/reports/review_followups.md`.
2. **CoA stale inactive rows:** 382,230 pre-P16 bundle rows persist in `lead_trades` at
   `is_active=false` (the CoA writer upserts but has no ghost-cleanup; the permit writer does).
   Invisible to every consumer (all serving predicates require `is_active=true`); a one-off purge
   or a ghost-cleanup pass filed.
3. **CoA all-active ceiling 18** — 18.53 marginal WARN; operator tune decision filed.
4. **deep_scrapes-resume re-measure** — the standing D8a obligation (the gate stays flip-off-able).
5. **NOT-NULL migration for `attachment_basis`** — deferred per [GRD-6]; with every writer emitting
   and `attachment_basis_null_count = 0`, a follow-up migration can now add NOT NULL.

## Spec 48 §3.7 pre-ack (the designed step-change — [D-2])

The 7-day observer must record the following as EXPECTED (not drift); Spec 79 rows for
`classify_permits` (permits step 13) + `classify_coa_trades` (coa step 6) now declare the
T9/T11 distribution-drift profile with these EXIT criteria:
- `inference_mean_trades_per_permit` lands in the [8,11]-anchored global band (WARN>11/FAIL>13);
- the 8 complement-covered starved trades flip >0 active (`starved_trades_recovered_fail_band` PASS);
- `evidence_mean_trades_per_permit` stays ≤7 (baseline 5.06 — the D1 evidence posture);
- `attachment_basis_null_count` = 0;
- ~1.76M coarse-bundle rows RETIRE (permit_trades total shrinks; the mig-213 active-partial
  index GROWS by the inference influx — both recorded below);
- `default_calibration_pct` RISES (inference forecasts start uncalibrated) — [GRD-4]: the delta
  is recorded below and the calibration-guard escalation semantics re-checked against it;
- CoA: all rows active with basis; severance-only stays 0; all-active mean ≤ 18.
