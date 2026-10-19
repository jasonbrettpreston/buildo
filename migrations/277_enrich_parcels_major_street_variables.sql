-- 277: enrich_parcels — major-street membership (on_policy_road) distances and plausibility bounds.
--
-- Operator ruling 2026-10-19 (Q-MS-1 / Q-MS-2; .cursor/major-street-audit-2026-10-19.md; Spec 65 §2 step 7;
-- Spec 69a dated note on 800.50(457) "abut"): a lot abuts a Major Street when its primary frontage street
-- (enrich_centreline) carries the Major Streets line's name within enrich_parcels_major_street_frontage_m, OR it
-- is a corner / through lot within enrich_parcels_major_street_flank_m of the line. The old 5 m
-- road_overlay_distance_m buffer flagged 21 of 440,093 residential lots; road_overlay_distance_m stays for the
-- priority-retail layer only (Q-MS-4: audited separately before any change).
--
-- McDonald's Airtight V3: step-owned names (Spec 124 R-DE (v)), EXTERNALIZED (R-DF), shown in admin (R-DL); each
-- variable is read by the live step from this commit on, so no R-EO badge applies.
--
-- Numbered 277: 264/265 are held by the wave-1 lanes, 271/272/274/275 by the wave-4 lanes, 276 by the
-- front-setback lane (wf1/front-setback-reliability).
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 step 7
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-DE (v), R-DF, R-DL)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('enrich_parcels_major_street_frontage_m', 20,
   'Major-street membership, frontage arm (operator 2026-10-19 Q-MS-1; Spec 65 §2 step 7). A lot abuts a Major Street (800.50(457), parcels.on_policy_road) when its primary frontage street has the same name as a Major Streets line within this many metres. CONSUMED by enrich_parcels (pass 1).'),
  ('enrich_parcels_major_street_flank_m', 13,
   'Major-street membership, flank arm (operator 2026-10-19 Q-MS-2; Spec 65 §2 step 7). A corner or through lot abuts a Major Street when it is within this many metres of a Major Streets line. CONSUMED by enrich_parcels (pass 1).'),
  ('enrich_parcels_major_street_res_pct_fail_floor', 2,
   'Major-street plausibility FAIL floor: the % of residential base-zone lots (R, RD, RS, RT, RM) flagged on_policy_road must be at least this (operator 2026-10-19 Q-MS-1). CONSUMED by enrich_parcels via checks[].limit_from_config (major_street_residential_pct_fail).'),
  ('enrich_parcels_major_street_res_pct_warn_ceiling', 15,
   'Major-street plausibility WARN ceiling: above this % of residential base-zone lots flagged on_policy_road the derivation is over-matching (operator 2026-10-19 Q-MS-1). CONSUMED by enrich_parcels via checks[].limit_from_config (major_street_residential_pct_warn).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- DELETE FROM logic_variables WHERE variable_key IN ('enrich_parcels_major_street_frontage_m', 'enrich_parcels_major_street_flank_m', 'enrich_parcels_major_street_res_pct_fail_floor', 'enrich_parcels_major_street_res_pct_warn_ceiling');
