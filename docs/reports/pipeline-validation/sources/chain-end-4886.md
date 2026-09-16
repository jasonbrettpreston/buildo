# Chain-end synthesis — sources (run_id: 4886)

**Status:** running | **Duration:** — | **Join:** chain_run_id

## Steps
| Step | Status | Verdict | Duration (ms) | chain_run_id |
|------|--------|---------|----------------|--------------|
| assert_schema | completed | PASS | 4887 | 4886 |
| load_ravines | completed | PASS | 3225 | 4886 |
| link_parcel_addresses | completed | WARN | 600371 | 4886 |
| compute_centroids | completed | WARN | 488054 | 4886 |
| link_parcels | completed | WARN | 154408 | 4886 |
| link_massing | completed | WARN | 205789 | 4886 |
| link_wsib | completed | PASS | 3296 | 4886 |

## Seam checks (scripts/lib/step/seam.js)
| Metric | Status | Threshold |
|--------|--------|-----------|
| seam_link_massing_before_enrich_parcels | PASS | enrich_parcels.started_at >= link_massing.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_compute_centroids_before_link_massing | PASS | link_massing.started_at >= compute_centroids.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_link_parcel_addresses_before_link_parcels | PASS | link_parcels.started_at >= link_parcel_addresses.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_link_massing_before_refresh_snapshot | PASS | refresh_snapshot.started_at >= link_massing.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_link_parcels_before_refresh_snapshot | PASS | refresh_snapshot.started_at >= link_parcels.completed_at (chain_run_id join, or legacy temporal fallback) |
| seam_link_wsib_before_refresh_snapshot | PASS | refresh_snapshot.started_at >= link_wsib.completed_at (chain_run_id join, or legacy temporal fallback) |

## validate_only tier (Ask 6(b) — chain-end is the declared cloud trigger point)
Cost cap (Fold B-9, computed live — not asserted): summed `last_measured.cost_ms` **32078ms** vs. chain duration **—ms** (ratio **—**, 0 entries unmeasured). Reported, not gated — see file header.

| Step | Metric | Source | Status | Value |
|------|--------|--------|--------|-------|
| link_parcel_addresses | missed_link_count | invariant | FAIL | "canceling statement due to statement timeout" |

_Generated 2026-09-15T23:24:21.629Z_
