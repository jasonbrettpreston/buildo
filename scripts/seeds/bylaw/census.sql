-- SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-UNIVERSE (census arm), §10 (--refresh-census);
--            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (direct-lot census; R -1 sentinel), M-42 (R-ZV)
--
-- McBylaw S11 census. ONE SELECT statement, run by `--refresh-census` inside BEGIN TRANSACTION READ ONLY.
-- R-ZV (M-42): reads the parcel's DOMINANT label columns (zoning_class, exception_number) and the
-- zoning_overlays provenance JSON — never the precedence-aggregated parcels.bylaw_* columns.
-- Shape (checked by census.mjs, because the witness resolver does not descend UNION arms): catalog
-- tables are read only inside the CTE `base`; the UNION ALL arms read only `base`.
-- Residential = the 569-2013 residential zone classes, bound as $1 from vocab.json `zone` (R / RD / RS / RT / RM;
-- Spec 68 §6.5, Spec 69 M-15 denominator) — one source, never a second hand-kept list; census.json records the set.
-- Every residential parcel lands in exactly one of: exception (number > 0), sentinel (-1),
-- exception_invalid (any other number <= 0), no_exception (NULL); census.mjs checks the sum.
WITH base AS (
  SELECT p.zoning_class AS zone,
         p.exception_number AS exception_number,
         p.zoning_class = ANY ($1::text[]) AS residential,
         (p.zoning_overlays -> 'lot_coverage_overlay' ->> 'coverage_max_pct') IS NULL AS coverage_null
    FROM parcels p
)
SELECT 'database' AS kind, NULL::text AS zone, NULL::integer AS exception_number, current_database() AS label, NULL::bigint AS n
UNION ALL
SELECT 'source_rows', NULL, NULL, 'parcels', count(*) FROM base
UNION ALL
SELECT 'residential', b.zone, NULL, NULL, count(*) FROM base b
 WHERE b.residential
 GROUP BY b.zone
UNION ALL
SELECT 'exception', b.zone, b.exception_number, NULL, count(*) FROM base b
 WHERE b.residential AND b.exception_number > 0
 GROUP BY b.zone, b.exception_number
UNION ALL
SELECT 'sentinel', b.zone, b.exception_number, NULL, count(*) FROM base b
 WHERE b.residential AND b.exception_number = -1
 GROUP BY b.zone, b.exception_number
UNION ALL
SELECT 'exception_invalid', b.zone, b.exception_number, NULL, count(*) FROM base b
 WHERE b.residential AND b.exception_number <= 0 AND b.exception_number <> -1
 GROUP BY b.zone, b.exception_number
UNION ALL
SELECT 'no_exception', b.zone, NULL, NULL, count(*) FROM base b
 WHERE b.residential AND b.exception_number IS NULL
 GROUP BY b.zone
UNION ALL
SELECT 'unzoned', NULL, NULL, NULL, count(*) FROM base b
 WHERE b.zone IS NULL
UNION ALL
SELECT 'coverage_null', b.zone, NULL, NULL, count(*) FROM base b
 WHERE b.residential AND b.coverage_null
 GROUP BY b.zone
