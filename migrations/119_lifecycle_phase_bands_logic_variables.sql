-- 119: Lifecycle phase distribution bands → logic_variables (WF2)
--
-- Spec 47 §4 + §R5: "Any value in a spec's logic_variables or
-- trade_configurations table MUST be loaded from the DB at startup."
-- Spec 84 §3.4: phase distribution bands are operator-tunable
-- thresholds (precedent: lifecycle_orphan_stall_days etc).
-- Spec 86 §1: admin Control Panel surfaces logic_variables via the
-- Marketplace Constants Card; bands are now editable from there.
--
-- Moves the hardcoded EXPECTED_BANDS constant + 3 cross-status
-- thresholds out of scripts/quality/assert-lifecycle-phase-distribution.js
-- and into the DB. The script will load these via loadMarketplaceConfigs
-- + Zod schema at startup (Spec 47 §R4-R5).
--
-- Defaults are calibrated against the 2026-05-07 post-WF3 snapshot
-- with ±15% tolerance for phases ≥1000 and ±30% for phases <1000.
-- Operators can tune via /admin/control-panel after deployment.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  -- Pre-issuance phase bands (P3–P6) ─────────────────────────────────
  ('lifecycle_band_p3_min',  716,  'Min count for lifecycle_phase=P3 (Intake) before assert-lifecycle-phase-distribution emits a band-violation FAIL. ±15% of 2026-05-07 baseline.'),
  ('lifecycle_band_p3_max',  970,  'Max count for lifecycle_phase=P3 (Intake) before band-violation FAIL.'),
  ('lifecycle_band_p4_min',  3471, 'Min count for lifecycle_phase=P4 (Examination/review).'),
  ('lifecycle_band_p4_max',  4695, 'Max count for lifecycle_phase=P4 (Examination/review).'),
  ('lifecycle_band_p5_min',  1247, 'Min count for lifecycle_phase=P5 (On Hold/deficiency).'),
  ('lifecycle_band_p5_max',  1687, 'Max count for lifecycle_phase=P5 (On Hold/deficiency).'),
  ('lifecycle_band_p6_min',  2491, 'Min count for lifecycle_phase=P6 (Ready for issuance).'),
  ('lifecycle_band_p6_max',  3370, 'Max count for lifecycle_phase=P6 (Ready for issuance).'),

  -- Issued time-bucketed phase bands (P7a/b/c/d) ─────────────────────
  ('lifecycle_band_p7a_min', 1749, 'Min count for lifecycle_phase=P7a (issued, ≤30 days fresh).'),
  ('lifecycle_band_p7a_max', 2367, 'Max count for lifecycle_phase=P7a.'),
  ('lifecycle_band_p7b_min', 2154, 'Min count for lifecycle_phase=P7b (issued, 31–90 days active).'),
  ('lifecycle_band_p7b_max', 2914, 'Max count for lifecycle_phase=P7b.'),
  ('lifecycle_band_p7c_min', 28311, 'Min count for lifecycle_phase=P7c (issued, >90 days bulk).'),
  ('lifecycle_band_p7c_max', 38303, 'Max count for lifecycle_phase=P7c.'),
  ('lifecycle_band_p7d_min', 1674, 'Min count for lifecycle_phase=P7d (issued, not started).'),
  ('lifecycle_band_p7d_max', 2264, 'Max count for lifecycle_phase=P7d.'),

  -- Active + revised + inspection phase bands (P8, P18) ──────────────
  ('lifecycle_band_p8_min',  16117, 'Min count for lifecycle_phase=P8 (revision in progress).'),
  ('lifecycle_band_p8_max',  21805, 'Max count for lifecycle_phase=P8.'),
  ('lifecycle_band_p18_min', 91112, 'Min count for lifecycle_phase=P18 (Inspection-status fallback when no detailed inspection records).'),
  ('lifecycle_band_p18_max', 123270, 'Max count for lifecycle_phase=P18.'),

  -- Terminal phase bands (P19, P20) ──────────────────────────────────
  ('lifecycle_band_p19_min', 6748, 'Min count for lifecycle_phase=P19 (winddown / pre-occupancy).'),
  ('lifecycle_band_p19_max', 9130, 'Max count for lifecycle_phase=P19.'),
  ('lifecycle_band_p20_min', 7355, 'Min count for lifecycle_phase=P20 (terminal / occupancy).'),
  ('lifecycle_band_p20_max', 9951, 'Max count for lifecycle_phase=P20.'),

  -- Aggregate band: P9–P17 inspection-stage subphases ────────────────
  -- Wide tolerance because scraper coverage of detailed inspection
  -- stages is currently ~5.5%. Tighten as inspection ingestion scales.
  ('lifecycle_band_p9_p17_agg_min', 0,     'Min sum of permits in P9–P17 (detailed inspection-stage phases). Wide tolerance — scraper coverage ~5.5%.'),
  ('lifecycle_band_p9_p17_agg_max', 80000, 'Max sum of permits in P9–P17. Wide upper bound until inspection ingestion scales up.'),

  -- Orphan phase bands (O1, O2, O3) ──────────────────────────────────
  ('lifecycle_band_o1_min', 2549, 'Min count for lifecycle_phase=O1 (active orphan trade permit).'),
  ('lifecycle_band_o1_max', 3449, 'Max count for lifecycle_phase=O1.'),
  ('lifecycle_band_o2_min', 2461, 'Min count for lifecycle_phase=O2 (orphan trade permit, mid-lifecycle).'),
  ('lifecycle_band_o2_max', 3329, 'Max count for lifecycle_phase=O2.'),
  ('lifecycle_band_o3_min', 36913, 'Min count for lifecycle_phase=O3 (stalled orphan trade permit).'),
  ('lifecycle_band_o3_max', 49941, 'Max count for lifecycle_phase=O3.'),

  -- CoA phase bands (P1, P2) ─────────────────────────────────────────
  -- Small counts; ±30% tolerance per existing convention.
  ('lifecycle_band_coa_p1_min', 30,  'Min count for CoA lifecycle_phase=P1 (received). Small counts; ±30%.'),
  ('lifecycle_band_coa_p1_max', 80,  'Max count for CoA lifecycle_phase=P1.'),
  ('lifecycle_band_coa_p2_min', 120, 'Min count for CoA lifecycle_phase=P2 (decision).'),
  ('lifecycle_band_coa_p2_max', 200, 'Max count for CoA lifecycle_phase=P2.'),

  -- Cross-status mismatch thresholds ─────────────────────────────────
  -- Operator-tunable thresholds for the assertion's secondary checks
  -- (enriched_status vs lifecycle_phase consistency).
  ('lifecycle_cross_stalled_threshold',
    1000,
    'Max count of permits with enriched_status=Stalled but lifecycle_stalled=false before the assertion FAILs (was hardcoded at 1000).'),
  ('lifecycle_cross_active_inspection_threshold',
    500,
    'Max count of permits with enriched_status=Active Inspection NOT in P9-P18/O1-O3 before the assertion FAILs (was hardcoded at 500).'),
  ('lifecycle_cross_issued_threshold',
    500,
    'Max count of permits with enriched_status=Permit Issued NOT in P7a/b/c/d/P8/P18/O1-O3 before the assertion FAILs (was hardcoded at 500).')
ON CONFLICT (variable_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- ═══════════════════════════════════════════════════════════════════
-- Same convention as migration 118: a transactional DOWN would risk
-- destroying any operator-tuned values applied via /admin/control-panel
-- after deployment. To roll back manually (only if absolutely required):
--
--   DELETE FROM logic_variables WHERE variable_key IN (
--     'lifecycle_band_p3_min',  'lifecycle_band_p3_max',
--     'lifecycle_band_p4_min',  'lifecycle_band_p4_max',
--     'lifecycle_band_p5_min',  'lifecycle_band_p5_max',
--     'lifecycle_band_p6_min',  'lifecycle_band_p6_max',
--     'lifecycle_band_p7a_min', 'lifecycle_band_p7a_max',
--     'lifecycle_band_p7b_min', 'lifecycle_band_p7b_max',
--     'lifecycle_band_p7c_min', 'lifecycle_band_p7c_max',
--     'lifecycle_band_p7d_min', 'lifecycle_band_p7d_max',
--     'lifecycle_band_p8_min',  'lifecycle_band_p8_max',
--     'lifecycle_band_p18_min', 'lifecycle_band_p18_max',
--     'lifecycle_band_p19_min', 'lifecycle_band_p19_max',
--     'lifecycle_band_p20_min', 'lifecycle_band_p20_max',
--     'lifecycle_band_p9_p17_agg_min', 'lifecycle_band_p9_p17_agg_max',
--     'lifecycle_band_o1_min',  'lifecycle_band_o1_max',
--     'lifecycle_band_o2_min',  'lifecycle_band_o2_max',
--     'lifecycle_band_o3_min',  'lifecycle_band_o3_max',
--     'lifecycle_band_coa_p1_min', 'lifecycle_band_coa_p1_max',
--     'lifecycle_band_coa_p2_min', 'lifecycle_band_coa_p2_max',
--     'lifecycle_cross_stalled_threshold',
--     'lifecycle_cross_active_inspection_threshold',
--     'lifecycle_cross_issued_threshold'
--   );  -- 39 keys total (36 band + 3 threshold)
--
-- Then revert the JS-side `EXPECTED_BANDS` constant in
-- scripts/quality/assert-lifecycle-phase-distribution.js + the
-- GlobalConfigCard.tsx GROUPS array entry in one commit.
