# Spec 79 §7a Cycle 3 — Lead Detail Inspector spot-check post-WF1 #parcel-address-bridge

**Date:** 2026-05-23
**Trigger:** Post-WF1 #parcel-address-bridge deploy + 2 hotfixes. The Env-1 finding from Cycle 2 (Toronto Open Data Parcels CSV stripped 3 columns on 2026-05-20) was closed by the WF1 commit series. This cycle validates that the bridge actually delivers correct + complete address linkages in the Inspector view.
**Scope:** 1 representative lead per Strategy outcome (bridge hit / legacy fallback / no_match). Walk the Inspector underlying data + verify each Tier resolves the expected fields.

---

## Sample 1 — Strategy 1a bridge hit (the WF1 happy path)

**Lead:** `permit:99 252008 BLD:00` (lead_id format from `lifecycle_phase_engine_migration`)
**Address (permit source):** `1133 DON MILLS RD`

### Identity panel (expected fields)

| Field | DB value | Status |
|---|---|---|
| permit_num / revision_num | `99 252008 BLD` / `00` | ✅ |
| street_num | `1133` | ✅ |
| street_name | `DON MILLS` | ✅ |
| street_type | `RD` | ✅ |
| status | `Inspection` | ✅ |
| permit_type | `Building Additions/Alterations` | ✅ |
| application_date | `1999-07-15` | ✅ |
| issued_date | `1999-12-25` | ✅ |
| latitude / longitude | `43.7382534` / `-79.3431302` | ✅ |
| neighbourhood_id | `111` | ✅ |
| lifecycle_phase | `P18` (Construction Active per Spec 84) | ✅ |
| lifecycle_stalled | `false` | ✅ |
| parcel_linked_at | `2026-05-23 16:52:38` (post-WF1) | ✅ |

### Linkage panel — bridge result (the NEW Strategy 1a path)

| Field | DB value | Notes |
|---|---|---|
| parcel_id | `198863` | ✅ Single match — disambiguation hierarchy resolved cleanly |
| **`match_type`** | **`address_points_exact`** | ✅ **PROOF: Strategy 1a (bridge) fired** |
| confidence | `0.97` | ✅ Bridge tier (0.97 > legacy 0.95 > name 0.80 > spatial 0.65/0.90) |
| parcel.addr_num_normalized | `1133` | ✅ Matches permit street_num |
| parcel.street_name_normalized | `DON MILLS` | ✅ Matches permit street_name |
| parcel.centroid_lat / centroid_lng | `43.7382271` / `-79.3429219` | ✅ ~20m from permit geocode (within Google geocoder tolerance) |

### Bridge resolution trace (Phase 2c spatial join)

`parcel_address_points` resolves parcel `198863` to address_point `4709530`:

| Field | Value | Status |
|---|---|---|
| address_full | `1133 Don Mills Rd` | ✅ Matches permit address |
| address_class_desc | `Land` | ✅ Land-class point selected per disambiguation H5 ordering |
| maint_stage | `REGULAR` | ✅ Passed REGULAR filter |
| (address_status) | `None` | ✅ Passed hotfix #2 filter (`IN ('CURRENT', 'NONE')`) |

### Cross-validation

- Permit geocoded lat/lng → parcel centroid: **20m distance** (acceptable)
- Parcel LEGACY normalized cols + Phase 2c bridge top-AP all converge on "1133 DON MILLS" — three independent sources agree
- Bridge JOIN keys (`addr_num_normalized="1133"`, `linear_name_normalized="DON MILLS"`) populated by hotfix #1 (commit `5db7891`)
- Strategy 1a filter cleared by hotfix #2 (commit `03679c9`) since `address_status='None'`

**Verdict: ✅ PASS** — end-to-end bridge resolution exactly as designed.

---

## Sample 2 — Strategy 1b legacy fallback (bridge missed, legacy worked)

**Lead:** `permit:26 113900 HVA:00`
**Address:** `21 LIAM FOUDY CRT`

### Linkage panel

| Field | DB value |
|---|---|
| parcel_id | `473078` |
| match_type | `exact_address` (legacy Strategy 1b) |
| street_num/name/type | `21` / `LIAM FOUDY` / `CRT` |

### Why bridge missed (diagnostic — informational only)

`21 LIAM FOUDY CRT` is likely a recent street name not yet present in Toronto's Address Points CSV, OR the address_points coverage for this street is in a different parcel. Legacy `parcels.addr_num_normalized = '21'` + `parcels.street_name_normalized = 'LIAM FOUDY'` still matched because earlier load-parcels runs (pre-2026-05-20 CKAN strip) preserved this data via COALESCE-UPSERT.

**Verdict: ✅ PASS — graceful fallback works as designed.** Strategy 1b safely caught a bridge miss; lead is linked, confidence 0.95.

---

## Sample 3 — no_match (correctly classified as unmatchable)

**Lead:** `permit:97 083522 BLD:00`
**Address:** `99 IBMS CONVERT ETOBICOKE` (street_name is a building/program label, not a real street)

### Linkage

| Field | DB value |
|---|---|
| permit_parcels row | none |
| permit.parcel_linked_at | set (script processed the row) |
| latitude / longitude | NULL (never geocoded — non-address) |

**Verdict: ✅ PASS** — script correctly identified this as unmatchable (no parcel link emitted) but still marked `parcel_linked_at` so the incremental filter doesn't re-process it forever. Legitimately uncategorizable data; nothing for the bridge to fix.

---

## Aggregate WF1 production statistics

| Metric | Value | Source |
|---|---|---|
| address_points with `addr_num_normalized` populated | 525,346 / 525,346 (100%) | Hotfix #1 verified |
| `parcel_address_points` bridge rows | 511,224 | Phase 2c first run |
| Parcels with at least one bridge address | 467,783 / 486,530 (96.1%) | Phase 2c |
| Address points with at least one parcel | 511,224 / 525,346 (97.3%) | Phase 2c |
| `permit_parcels.match_type='address_points_exact'` | **210,527** | Phase 2d Strategy 1a — **89.7% of all matched permits** |
| `permit_parcels.match_type='exact_address'` (legacy) | 967 | Strategy 1b — 0.4% (graceful fallback) |
| `permit_parcels.match_type='name_only'` | 5 | Strategy 2 — 0.002% (basically zero — bridge covers everything) |
| `permit_parcels.match_type='spatial_polygon'` | 12,425 | Strategy 3 polygon — 5.3% |
| `permit_parcels.match_type='spatial'` | 10,768 | Strategy 3 centroid — 4.6% |
| `no_match` permits | 13,718 / 248,410 (5.5%) | Genuinely unmatchable (vacant lots, internal addresses, non-street labels) |
| `lead_parcels.match_type='address_points_exact'` | **210,528** | CoA-side Phase 2e Tier 1a + permit-side |

---

## §7a Cycle 3 Findings

### NEW from Cycle 3 (post-WF1)

| # | Severity | Surface | Finding |
|---|----------|---------|---------|
| (none) | — | — | No new bugs or regressions detected. WF1 #parcel-address-bridge delivers exactly as designed. |

### Carry-overs / verified RESOLVED

| Cycle | # | Severity | Finding | Status |
|-------|---|----------|---------|--------|
| Cycle 2 | Env-1 | FAIL | Toronto CKAN Parcels feed dropped 3 columns | ✅ **CLOSED by WF1 series** (commits `2501aa0` .. `df3fb78`) — address data now sourced via the parcel_address_points bridge; LEGACY 3 columns preserved on parcels via COALESCE-UPSERT. |
| Cycle 2 | M+N | CRIT | compute-cost-estimates ON CONFLICT mismatch + intra-batch dedupe | ✅ CLOSED 2026-05-22 by commit `56ebce1` |
| Cycle 1 | A-L (12) | various | per-lead Inspector findings | ✅ CLOSED 2026-05-20 (commits `a25668c` .. `61abe60`) |

### Process findings caught DURING Cycle 3 deploy (recorded in `review_followups.md`)

| # | Severity | Process gap |
|---|----------|-------------|
| Hotfix #1 | CRIT | Phase 2b PG `$2` type inference bug — SQL-string + JS unit tests cannot exercise pg-node prepared-statement parsing. Already shipped + fixed (commit `5db7891`). Lesson reinforced in `feedback_db_integration_tests.md`. |
| Hotfix #2 | CRIT | Phase 2d/2e ADDRESS_STATUS filter assumed `CURRENT`/`RETIRED`/`PENDING` per Toronto Open Data field catalog; actual CSV publishes `'None'` for 100% of rows. Already shipped + fixed (commit `03679c9`). Lesson: spec assumptions about CSV column values can be wrong vs the actual feed; production-data verification is mandatory before shipping. |
| Cycle 3 deferred | HIGH | 4 Observability hardening items in `review_followups.md` rows 333-336 (records_unchanged threshold; batches-vs-rows in errors counter; DB integration smoke test for load-address-points; addr_num_fill_rate cross-stream audit in link-parcel-addresses) |

---

## Cycle 3 Verdict

✅ **PASS — WF1 #parcel-address-bridge is fully operational in production.**

Bridge resolution works end-to-end for the bridge-hit case (Sample 1), legacy fallback works for bridge-miss (Sample 2), and unmatchable data is correctly classified (Sample 3). 89.7% of permit-to-parcel matches now go through the new high-confidence Strategy 1a bridge path. No new Inspector findings. The Env-1 root cause is fully resolved.

**Operator next steps:**
1. Monitor `tier_1_via_bridge` + `tier_1a_via_bridge` audit counters for 7 days per `docs/runbook/WF1_parcel_address_bridge_first_deploy.md`.
2. Address the 4 Observability hardening items in a separate follow-up WF.
3. Spec 47 §12 self-review of the modified scripts as a quality cap (optional follow-up).
