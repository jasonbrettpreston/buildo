# Lead-Serving Reliability — Pre-Implementation Baseline Snapshot (2026-07-06)

**WF2 Active Task:** `.cursor/active_task.md` (Lead-Serving Reliability — lifecycle + forecasts + scores + CoA surfacing).
**Purpose:** Frozen pre-implementation baseline (Phase 0). Every Phase 7 re-run diff is measured against these numbers. Captured off-branch `auto-unblock/validation-2026-05-23` at commit `4b1712f` before any P1+ code lands.
**DB:** local `buildo` (dev). All figures from live `psql`.

---

## (a) cost_source distributions — cost_estimates

### permits (`lead_id LIKE 'permit:%'`)
| cost_source | rows |
|---|---|
| none | 103,757 |
| archetype_parcel | 85,368 |
| model | 33,930 |
| archetype_declared_area | 17,399 |
| permit | 6,728 |
| archetype_rate | 4,718 |

### coa (`lead_id LIKE 'coa:%'`)
| cost_source | rows |
|---|---|
| archetype_parcel | 19,449 |

(CoA `none` rows are not materialised in `cost_estimates` — CoA nones live as absent rows / on `coa_applications`. P5 re-derives the CoA coverage funnel on the open subset.)

## (b) Residential-lowrise `none` by project_type
Filter: `cost_source='none'` AND permit `structure_type` NULL or matching `archetype-cost-map.js` `LOW_RISE_RESIDENTIAL_RE` (`sfd|townhouse|duplex|converted house|laneway|rear yard suite|unit - (detached|semi)`).

| project_type | rows |
|---|---|
| mechanical | 13,716 |
| other | 6,591 |
| addition | 2,937 |
| new_build | 2,694 |
| demolition | 2,553 |
| renovation | 1,442 |
| (null) | 363 |
| repair | 93 |
| **total** | **30,389** |

**Priceable-but-none gap (addition + new_build + renovation) = 7,073** — matches the plan's RC1 figure exactly. (Total 30,389 vs plan's ~30,427; within snapshot drift.)

## (c) trade_forecasts — counts, urgency, calibration_method
Total `trade_forecasts` rows: **1,743,244**

### Urgency distribution
| urgency | rows | share |
|---|---|---|
| imminent | 1,015,910 | 58.3% |
| delayed | 696,166 | 39.9% |
| upcoming | 31,111 | 1.8% |
| overdue | 57 | ~0% |
| expired | 0 | 0% |
| on_time | 0 | 0% |

(`expired + on_time = 0` — the RC5 synthetic-under-default-calibration signature. D2(a)/(b) will NOT move this; only calibration warm-up / D2(c) can.)

### calibration_method distribution
| calibration_method | rows |
|---|---|
| default | 1,040,193 |
| fallback_issued_all | 362,772 |
| fallback_all_types | 213,906 |
| exact | 93,364 |
| fallback_issued_type | 25,834 |
| fallback_all_cohorts | 5,745 |
| fallback_all_type_classes | 959 |
| fallback_all_project_types | 471 |
| (null) | 0 |

**`default_calibration_pct` = 1,040,193 / 1,743,244 = 59.67%** — the current hardcoded gate reads `>=50 FAIL`, so today's verdict is **FAIL** (blocks nothing; verdict-only). Post-P1 (+~76K uncalibrated new rows) this rises toward ~61-64%; the P2 externalized thresholds (warn 70 / fail 85) land it PASS.

## (d) lifecycle_stalled
`SELECT COUNT(*) FROM permits WHERE lifecycle_stalled = true` = **34,465**
(The forecast SOURCE_SQL excludes these — G1 coupling. Any P3 lifecycle fix that un-stalls permits must re-measure this before the P7 run.)

## (e) lifecycle NULL counts (permits)
| metric | count |
|---|---|
| total `lifecycle_phase IS NULL` | 1,833 |
| live-status NULL (`lifecycle_phase IS NULL AND matched_rule IS NULL`) | 544 |
| never-classified (`lifecycle_classified_at IS NULL`) | 544 |

(The remaining 1,833 − 544 = 1,289 NULL-phase rows carry a non-null `matched_rule` — dead-status NULL-by-design. P3 investigates the 544.)

## (f) CoA servable funnel
| stage | count |
|---|---|
| total coa_applications | 33,280 |
| geocoded + open (`latitude NOT NULL AND lifecycle_group IN ('C1','C2','C3')`) | 3,200 |
| + cost (`estimated_cost NOT NULL`) | 1,585 |
| + forecast (`EXISTS trade_forecasts`) | 1,421 |
| + score (`trade_forecasts.opportunity_score NOT NULL`) | 1,421 |

**Servable CoA floor today ≈ 1,421 leads.** (Distinct CoA lead_ids with any forecast row: 2,443; the open+cost+forecast+score servable subset is 1,421.) lifecycle_group terminal split: C4=29,864, C2=1,631, C1=1,571, C3=214.

## (g) Unmapped trade slugs (Spec 80 P4 gap)
Active `permit_trades` slugs absent from `trade_configurations`:
| slug | active permit_trades rows |
|---|---|
| site-maintenance | 108,604 |
| site-preparation | 80,213 |
| overhead-doors | 75,622 |

All three exist in `trades` but have no `trade_configurations` row (the 33-row control panel) → they hit the `unmapped_trades` counter (aggregate ≈ 207,538 = 3.6% of permit_trades). P1 maps `site-preparation` + `overhead-doors` and excludes `site-maintenance`.

---

## Environment state at capture
- `node scripts/ai-env-check.mjs`: PASS except migrations "8 drift" (checksum-changed 163/179/180/183/190/195/202/209 — pre-existing, documented user migrations; 0 missing).
- `npm run migrate -- --verify`: 0 missing, 8 drift (same set).
- Branch `auto-unblock/validation-2026-05-23` pushed to origin (`c8b3647..4b1712f`).
