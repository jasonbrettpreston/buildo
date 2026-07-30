-- Spec 65 Phase 3 — output validation (accuracy, not just population). Run against parcels post enrich.
-- Usage: PGPASSWORD=postgres psql -h localhost -U postgres -d buildo -f scripts/analysis/phase3-accessory-validation.sql

\echo '================ 1. POPULATION (parcels with an emitted max-build envelope) ================'
SELECT
  count(*)                                                        AS parcels_total,
  count(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)       AS with_maxbuild,
  count(*) FILTER (WHERE imagery_roof_gfa_sqm IS NOT NULL)            AS with_existing,
  count(*) FILTER (WHERE abuts_laneway)                           AS abuts_laneway,
  count(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL)          AS garage_fits,
  count(*) FILTER (WHERE rear_suite_type = 'laneway')             AS suite_laneway,
  count(*) FILTER (WHERE rear_suite_type = 'garden')              AS suite_garden,
  count(*) FILTER (WHERE rear_suite_type IS NULL)                 AS suite_none
FROM parcels;

\echo '================ 2. PERMISSION DISTRIBUTION (CoA-vs-as-of-right split) ================'
SELECT 'garage' AS kind, garage_permission AS permission, count(*) FROM parcels GROUP BY 2 ORDER BY 2
UNION ALL
SELECT 'rear_suite', rear_suite_permission, count(*) FROM parcels GROUP BY 2 ORDER BY 2;

\echo '================ 3. ACCURACY: max-build vs existing (should EXCEED existing on a normal lot) ================'
-- ratio = max buildable GFA / current GFA. Expect mostly >1 (more can be built than exists);
-- ~1 on heritage (frozen to existing); <1 only where existing over-built vs by-law (legal non-conforming).
SELECT
  count(*)                                                                 AS n,
  round(avg(max_buildable_gfa_sqm / NULLIF(imagery_roof_gfa_sqm,0))::numeric,2) AS avg_ratio,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY max_buildable_gfa_sqm / NULLIF(imagery_roof_gfa_sqm,0)))::numeric,2) AS median_ratio,
  count(*) FILTER (WHERE max_buildable_gfa_sqm >= imagery_roof_gfa_sqm)        AS maxbuild_ge_existing,
  count(*) FILTER (WHERE max_buildable_gfa_sqm <  imagery_roof_gfa_sqm)        AS maxbuild_lt_existing
FROM parcels
WHERE max_buildable_gfa_sqm IS NOT NULL AND imagery_roof_gfa_sqm IS NOT NULL AND imagery_roof_gfa_sqm > 0;

\echo '   3b. of the max < existing cases, how many are heritage (expected: freeze ~= existing) vs other'
SELECT
  count(*) FILTER (WHERE is_heritage_designated)      AS heritage,
  count(*) FILTER (WHERE NOT is_heritage_designated)  AS non_heritage
FROM parcels
WHERE max_buildable_gfa_sqm < imagery_roof_gfa_sqm AND imagery_roof_gfa_sqm > 0;

\echo '================ 4. SANITY GUARDS (each should be 0) ================'
SELECT
  count(*) FILTER (WHERE rear_suite_type = 'garden' AND abuts_laneway)                 AS garden_on_lane_lot_BAD,
  count(*) FILTER (WHERE rear_suite_type = 'laneway' AND NOT abuts_laneway)            AS laneway_without_lane_BAD,
  count(*) FILTER (WHERE max_garage_gfa_sqm > 60.01)                                   AS garage_over_cap_BAD,
  count(*) FILTER (WHERE garage_permission IS NOT NULL AND max_garage_gfa_sqm IS NULL
                         AND garage_permission <> 'not_permitted')                     AS garage_perm_without_gfa_BAD,
  count(*) FILTER (WHERE rear_suite_type IS NOT NULL AND max_rear_suite_gfa_sqm IS NULL) AS suite_type_without_gfa_BAD,
  count(*) FILTER (WHERE cur_storey_gfa_sqm < 0)                                       AS negative_storey_headroom_BAD,
  count(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL AND (max_garage_gfa_sqm > lot_size_sqm)) AS garage_exceeds_lot_BAD
FROM parcels;

\echo '================ 5. GREENSPACE → PERMISSION coherence (as_of_right should have MORE greenspace headroom) ================'
SELECT garage_permission,
  count(*) AS n,
  round(avg(existing_greenspace_sqm)::numeric,0)            AS avg_existing_greenspace,
  round(avg(lot_size_sqm)::numeric,0)                       AS avg_lot,
  round(avg(max_garage_gfa_sqm)::numeric,1)                 AS avg_garage_gfa
FROM parcels WHERE garage_permission IS NOT NULL GROUP BY 1 ORDER BY 1;

\echo '================ 6. TEN SAMPLE PARCELS across varied conditions (existing vs max-build vs accessory) ================'
\pset format aligned
WITH tagged AS (
  SELECT p.*,
    CASE
      WHEN is_heritage_designated THEN 'heritage'
      WHEN is_in_ravine_protection_area THEN 'ravine'
      WHEN rear_suite_type = 'laneway' THEN 'laneway-suite'
      WHEN garage_permission = 'coa_required' THEN 'garage-CoA'
      WHEN rear_suite_permission = 'coa_required' THEN 'suite-CoA'
      WHEN max_garage_gfa_sqm IS NOT NULL AND rear_suite_type='garden' THEN 'garage+garden'
      WHEN is_corner_lot THEN 'corner'
      WHEN rear_suite_type IS NULL AND max_buildable_gfa_sqm IS NOT NULL THEN 'no-rear-suite'
      WHEN max_build_confidence='high' THEN 'high-conf'
      ELSE 'other' END AS scenario
  FROM parcels p
  WHERE max_buildable_gfa_sqm IS NOT NULL
)
SELECT DISTINCT ON (scenario)
  scenario, parcel_id,
  round(lot_size_sqm)            AS lot,
  round(imagery_roof_footprint_sqm)  AS exist_fp,
  existing_stories               AS exist_st,
  round(imagery_roof_gfa_sqm)        AS exist_gfa,
  round(max_buildable_gfa_sqm)   AS maxbuild_gfa,
  max_build_stories              AS mb_st,
  round(max_garage_gfa_sqm)      AS garage_gfa,
  garage_capacity_cars           AS cars,
  garage_permission              AS garage_perm,
  rear_suite_type                AS suite,
  round(max_rear_suite_gfa_sqm)  AS suite_gfa,
  rear_suite_permission          AS suite_perm,
  abuts_laneway                  AS lane
FROM tagged
ORDER BY scenario, parcel_id
LIMIT 12;
