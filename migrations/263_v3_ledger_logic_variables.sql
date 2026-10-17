-- 263: McDonald's Airtight V3 ledger A8 + E — hard-coded check bounds and compute literals become logic variables.
--
-- Operator 2026-10-17 ("advance the ledger", carried by fleet night N6; Spec 124 R-BA gates A and E, R-BC(b)):
-- a check bound is limit_from_config / warn_limit_from_config or exactly "viol == 0", and a compute holds no
-- tunable literal. Each variable below carries the former literal as its default, so behaviour is byte-identical
-- at these defaults (refresh_snapshot's three metric windows are pinned min = max to the metric names they define).
-- A8: enrich_parcels_ambiguous_zone_max_pct, link_neighbourhoods_loaded_warn_min.
-- E:  20 variables for load_ravines, link_wsib, link_massing, assert_data_bounds, assert_global_coverage,
--     refresh_snapshot.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3 tunables externalized; R-BA gates A and E)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('enrich_parcels_ambiguous_zone_max_pct', 5,
   'McDonald''s Airtight V3 ledger A8 (operator 2026-10-17; Spec 124 R-BA gate A): the WARN bound on parcels whose dominant zoning area share is < 0.60, as a percent of scoped parcels. Formerly the hard-coded check limit "pct <= 5" (ported from result.ambiguous > 0.05*result.scoped). CONSUMED by enrich_parcels via checks[].limit_from_config (parcels_ambiguous_zone_count).'),
  ('link_neighbourhoods_loaded_warn_min', 1,
   'McDonald''s Airtight V3 ledger A8 (operator 2026-10-17; Spec 124 R-BA gate A): the WARN floor of link_neighbourhoods'' neighbourhoods_loaded check — fewer geom-bearing polygons than sources_neighbourhoods_floor (the FAIL bound) but at least this many is WARN; below it is FAIL. Formerly the hard-coded warn_limit "value_min 1". CONSUMED by link_neighbourhoods via checks[].warn_limit_from_config.'),
  ('load_ravines_round_scale', 1000,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E, the load_centreline_round_scale precedent) — DISPLAY precision of the ratio values in load_ravines'' audit rows and §9 producer block (Math.round(n * scale) / scale). 1000 = the former module-level literal ROUND_SCALE, carried byte-for-byte. Compared against nothing. CONSUMED by load_ravines (scripts/lib/compute/load-ravines.js round3, via ctx.config).'),
  ('load_ravines_max_detail_keys', 50,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E, the load_centreline_max_detail_keys precedent) — LR-D1: how many dropped source ids ONE ravine_geometry_skipped_pct audit row carries in its detail. 50 = the former MAX_DETAIL_KEYS literal. A DISPLAY bound: dropped_count is always exact and dropped_ids_truncated says when the list is a prefix. CONSUMED by load_ravines (scripts/lib/compute/load-ravines.js, via ctx.config).'),
  ('link_wsib_exact_name_min_length', 3,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — S2 / LW-D6: the minimum normalized-name length the two EXACT-match tiers (trade name, legal name) accept. 3 = the former EXACT_LENGTH_FLOOR compute literal. Bound as a query parameter, never interpolated. CONSUMED by link_wsib (scripts/lib/compute/link-wsib.js buildDerivationSql, via ctx.config).'),
  ('link_wsib_fuzzy_name_min_length', 5,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — S2 / LW-D6: the minimum normalized-name length on BOTH sides of a fuzzy (trigram) match; higher than the exact floor because a fuzzy match on a short string is garbage. 5 = the former FUZZY_LENGTH_FLOOR compute literal. Bound as a query parameter. CONSUMED by link_wsib (scripts/lib/compute/link-wsib.js buildDerivationSql, via ctx.config).'),
  ('link_massing_bbox_degree_divisor', 78000,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E; the enrich_parcels_bbox_degree_divisor precedent) — the metres-to-degrees divisor that widens link_massing''s nearest-fallback bounding-box prefilter (B-10) into degree space. A degree of longitude is ~80.5 km at Toronto''s latitude, so dividing by 78000 over-covers on purpose: the exact cut is the geography ST_DWithin that follows. Changes what the cap COSTS to find, never what is accepted. 78000 = the former DEGREES_PER_METRE_DIVISOR literal. CONSUMED by link_massing (scripts/lib/compute/link-massing.js buildMatchSql, via ctx.config).'),
  ('link_massing_round_scale', 10000,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E; the load_centreline_round_scale precedent) — DISPLAY precision of link_massing''s audit-row ratio values (Math.round(n * scale) / scale). 10000 = the former ROUND_SCALE literal. Compared against nothing. CONSUMED by link_massing (scripts/lib/compute/link-massing.js, via ctx.config).'),
  ('assert_data_bounds_recent_window_hours', 24,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — the recent-permits window (hours before the run clock) for the null-description / null-builder / null-status rates and their denominator (formerly the SQL literal INTERVAL ''1 day''). Bound as a query parameter, never interpolated. CONSUMED by assert_data_bounds (scripts/lib/compute/assert-data-bounds.js, via ctx.config).'),
  ('assert_data_bounds_ghost_last_seen_days', 30,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — how many days before the run''s calendar date a still-open permit (lifecycle_phase not P19/P20) may go unseen before it counts as a ghost record (formerly the SQL literal INTERVAL ''30 days''). Bound as a query parameter, never interpolated. CONSUMED by assert_data_bounds (scripts/lib/compute/assert-data-bounds.js, via ctx.config).'),
  ('assert_data_bounds_ancient_hearing_before_year', 2010,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — coa_applications.hearing_date before 1 January of this year counts as an ancient hearing (formerly the SQL date literal ''2010-01-01''; its row-count ceiling is coa_ancient_hearing_count_warn_max). Bound as a query parameter, never interpolated. CONSUMED by assert_data_bounds (scripts/lib/compute/assert-data-bounds.js, via ctx.config).'),
  ('assert_data_bounds_ancient_inspection_before_year', 2020,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — permit_inspections.inspection_date before 1 January of this year counts as an ancient inspection date (formerly the SQL date literal ''2020-01-01''; its row-count ceiling is inspection_ancient_dates_count_warn_max). Bound as a query parameter, never interpolated. CONSUMED by assert_data_bounds (scripts/lib/compute/assert-data-bounds.js, via ctx.config).'),
  ('assert_data_bounds_lot_size_max_sqm', 1000000,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — parcels.lot_size_sqm above this many square metres (or <= 0) is a lot-size outlier (formerly the SQL literal 1000000). Bound as a query parameter, never interpolated. CONSUMED by assert_data_bounds (scripts/lib/compute/assert-data-bounds.js, via ctx.config).'),
  ('assert_data_bounds_max_height_max_m', 500,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — building_footprints.max_height_m above this many metres (or < 0) is a height outlier (formerly the SQL literal 500). Bound as a query parameter, never interpolated. CONSUMED by assert_data_bounds (scripts/lib/compute/assert-data-bounds.js, via ctx.config).'),
  ('assert_global_coverage_pre_permit_aged_months', 18,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — a PRE- permit issued more than this many months before the run clock counts as aged (formerly the SQL literal INTERVAL ''18 months''). Bound as a query parameter, never interpolated. CONSUMED by assert_global_coverage (scripts/lib/compute/assert-global-coverage.js, via ctx.config).'),
  ('assert_global_coverage_engine_health_window_hours', 25,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — an engine_health_snapshots row captured within this many hours of the run clock counts as today''s (formerly the SQL literal INTERVAL ''25 hours'' at both sites). Bound as a query parameter, never interpolated. CONSUMED by assert_global_coverage (scripts/lib/compute/assert-global-coverage.js, via ctx.config).'),
  ('assert_global_coverage_forecast_lookback_years', 3,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — a permit whose phase/issue/application date is within this many years of the run clock is forecast-eligible (formerly the SQL literal INTERVAL ''3 years''). Bound as a query parameter, never interpolated. CONSUMED by assert_global_coverage (scripts/lib/compute/assert-global-coverage.js, via ctx.config).'),
  ('refresh_snapshot_updated_24h_window_hours', 24,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — the window of the updated_24h metric, in hours before the run clock (formerly INTERVAL ''24 hours''). Pinned min = max: the metric''s name states the window, so it is visible, not tunable. Bound as a query parameter. CONSUMED by refresh_snapshot (scripts/lib/compute/refresh-snapshot.js buildPermitsScalarQuery, via ctx.config).'),
  ('refresh_snapshot_updated_7d_window_days', 7,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — the window of the updated_7d metric, in days (formerly INTERVAL ''7 days''). Pinned min = max to the metric''s name. Bound as a query parameter. CONSUMED by refresh_snapshot (scripts/lib/compute/refresh-snapshot.js buildPermitsScalarQuery, via ctx.config).'),
  ('refresh_snapshot_updated_30d_window_days', 30,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — the window of the updated_30d metric, in days (formerly INTERVAL ''30 days''). Pinned min = max to the metric''s name. Bound as a query parameter. CONSUMED by refresh_snapshot (scripts/lib/compute/refresh-snapshot.js buildPermitsScalarQuery, via ctx.config).'),
  ('refresh_snapshot_cost_oor_min_cad', 100,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — an active permit with est_const_cost below this many dollars counts toward cost_oor (formerly the SQL literal 100). Bound as a query parameter. CONSUMED by refresh_snapshot (scripts/lib/compute/refresh-snapshot.js buildPermitsScalarQuery, via ctx.config).'),
  ('refresh_snapshot_cost_oor_max_cad', 1000000000,
   'McDonald''s Airtight V3 ledger E (operator 2026-10-17; Spec 124 R-BA gate E) — an active permit with est_const_cost above this many dollars counts toward cost_oor (formerly the SQL literal 1000000000). Bound as a query parameter. CONSUMED by refresh_snapshot (scripts/lib/compute/refresh-snapshot.js buildPermitsScalarQuery, via ctx.config).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key IN ('enrich_parcels_ambiguous_zone_max_pct', 'link_neighbourhoods_loaded_warn_min', 'load_ravines_round_scale', 'load_ravines_max_detail_keys', 'link_wsib_exact_name_min_length', 'link_wsib_fuzzy_name_min_length', 'link_massing_bbox_degree_divisor', 'link_massing_round_scale', 'assert_data_bounds_recent_window_hours', 'assert_data_bounds_ghost_last_seen_days', 'assert_data_bounds_ancient_hearing_before_year', 'assert_data_bounds_ancient_inspection_before_year', 'assert_data_bounds_lot_size_max_sqm', 'assert_data_bounds_max_height_max_m', 'assert_global_coverage_pre_permit_aged_months', 'assert_global_coverage_engine_health_window_hours', 'assert_global_coverage_forecast_lookback_years', 'refresh_snapshot_updated_24h_window_hours', 'refresh_snapshot_updated_7d_window_days', 'refresh_snapshot_updated_30d_window_days', 'refresh_snapshot_cost_oor_min_cad', 'refresh_snapshot_cost_oor_max_cad');
