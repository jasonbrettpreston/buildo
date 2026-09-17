# Chain-end synthesis — sources (run_id: 5021)

**Status:** completed_with_warnings | **Duration:** 2663.4s | **Join:** chain_run_id

## Steps
| Step | Status | Verdict | Duration (ms) | chain_run_id |
|------|--------|---------|----------------|--------------|
| refresh_snapshot | completed | PASS | 471851 | 5021 |
| assert_data_bounds | completed | WARN | 544492 | 5021 |
| assert_engine_health | completed | WARN | 19573 | 5021 |
| assert_schema | completed | PASS | 5401 | 5021 |
| assert_global_coverage | completed | PASS | 1618598 | 5021 |

## Seam checks (scripts/lib/step/seam.js)
| Metric | Status | Threshold |
|--------|--------|-----------|
| seam_link_massing_before_enrich_parcels | PASS | enrich_parcels.started_at >= link_massing.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_compute_centroids_before_link_massing | PASS | link_massing.started_at >= compute_centroids.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_geocode_permits_before_link_neighbourhoods | PASS | link_neighbourhoods.started_at >= geocode_permits.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_link_parcel_addresses_before_link_parcels | PASS | link_parcels.started_at >= link_parcel_addresses.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_link_massing_before_refresh_snapshot | PASS | refresh_snapshot.started_at >= link_massing.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_link_parcels_before_refresh_snapshot | PASS | refresh_snapshot.started_at >= link_parcels.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_link_wsib_before_refresh_snapshot | PASS | refresh_snapshot.started_at >= link_wsib.completed_at (chain_run_id join, or legacy temporal fallback) |

## validate_only tier (Ask 6(b) — chain-end is the declared cloud trigger point)
Cost cap (Fold B-9, computed live — not asserted): summed `last_measured.cost_ms` **32078ms** vs. chain duration **2663402ms** (ratio **1.2%**, 0 entries unmeasured). Reported, not gated — see file header.

| Step | Metric | Source | Status | Value |
|------|--------|--------|--------|-------|
| link_parcel_addresses | missed_link_count | invariant | FAIL | "canceling statement due to statement timeout" |

_Generated 2026-09-17T10:06:25.838Z_
