/**
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §3 (level 0)
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md tier 1a (§6.5 step 9)
 *
 * CoA parcel-linking SQL — THE BRIDGE PATH SQL TEXT ONLY.
 *
 * WHAT THIS FILE IS (mirrors `compute/link-parcels.js`'s buildMatchSql split):
 *   tier1aBridgeSql(hasPostGIS) — the Tier 1a `address_points` bridge SQL text, pure,
 *   no pool. The CoA script tries this FIRST; the legacy parcels-table query remains
 *   the fall-through on miss.
 *
 * The text below is moved byte-for-byte out of scripts/link-coa-to-parcels.js (WF2
 * brief L, 2026-10-10); only the `${hasPostGIS ? ', p.geom' : ', p.geometry'}` template
 * wrapper is added, so the two call sites (PostGIS / JS-fallback) can share it.
 *
 * Toronto stripped ADDRESS_NUMBER, LINEAR_NAME_FULL, DATE_EFFECTIVE from the Property
 * Boundaries CSV on 2026-05-20. address_points is now the canonical address source;
 * parcel_address_points (mig 162 + Phase 2c) guarantees the AP geom is inside the
 * parcel polygon.
 *
 * Plan v4 fold F17: this match increments BOTH tier1aExact (legacy counter preserved)
 * AND tier1aViaBridge (new INFO sibling). match_type='address_points_exact' is the new
 * value surfacing the bridge-path provenance at the row level (consistent with
 * Phase 2d link-parcels Strategy 1a).
 *
 * Disambiguation (plan v4 H5/C2/F19 uniform 3-level rule):
 *   1. ADDRESS_CLASS_DESC priority (Structure > Structure Entrance > Land)
 *   2. ST_Area(p.geom::geography) ASC — narrower parcel wins;
 *      ::geography cast yields square meters (raw on GEOMETRY
 *      (*, 4326) would return square degrees — fold C2).
 *   3. ap.address_point_id ASC — stable deterministic final tie.
 *
 * MAINT_STAGE=REGULAR + ADDRESS_STATUS=CURRENT filters retired
 * records with NULL fallback for pre-Phase-2b imports.
 *
 * Params: $1 street_num, $2 street_name_normalized, $3 parsed street type.
 */
'use strict';

/**
 * The Tier 1a bridge query (Spec 54 §3 level 0): prefer the address point's own parsed
 * street type, the parcel's column as fallback; unknown on either side stays tolerant.
 *
 * @param {boolean} hasPostGIS true when the run targets a PostGIS-enabled DB (`p.geom`
 *   is used); false on the JS-fallback path (`p.geometry`).
 * @returns {string} the parameterized SQL text ($1/$2/$3 — see the file header).
 */
function tier1aBridgeSql(hasPostGIS) {
  return `SELECT p.id, p.centroid_lat, p.centroid_lng${hasPostGIS ? ', p.geom' : ', p.geometry'}
                   , (COALESCE(ap.street_type_normalized, p.street_type_normalized) = $3) AS type_confirmed
                   FROM address_points ap
                   JOIN parcel_address_points pap ON pap.address_point_id = ap.address_point_id
                   JOIN parcels p ON p.id = pap.parcel_id
                  WHERE ap.addr_num_normalized = $1
                    AND ap.linear_name_normalized = $2
                    AND (ap.maint_stage IS NULL OR UPPER(ap.maint_stage) = 'REGULAR')
                    -- WF3 hotfix #2 (2026-05-23): see link-parcels.js
                    -- equivalent block. Toronto's actual ADDRESS_STATUS
                    -- column contains 'None' for 100% of rows; accept
                    -- 'NONE' alongside 'CURRENT' as the in-use state.
                    AND (ap.address_status IS NULL OR UPPER(ap.address_status) IN ('CURRENT', 'NONE'))
                    -- fold 10 item 4 (registry-truth, 2026-10-03): a soft-retired address point never matches.
                    AND ap.retired_at IS NULL
                    -- Spec 54 §3 level 0 (2026-10-10): the address point's own type first, parcel as fallback; unknown on either side stays tolerant.
                    AND ($3 = '' OR COALESCE(ap.street_type_normalized, p.street_type_normalized) IS NULL OR COALESCE(ap.street_type_normalized, p.street_type_normalized) = $3)
                  ORDER BY
                    (COALESCE(ap.street_type_normalized, p.street_type_normalized) = $3) DESC NULLS LAST,
                    CASE UPPER(COALESCE(ap.address_class_desc, ''))
                      WHEN 'STRUCTURE'           THEN 1
                      WHEN 'STRUCTURE ENTRANCE'  THEN 2
                      WHEN 'LAND'                THEN 3
                      ELSE 4
                    END,
                    ST_Area(p.geom::geography) ASC,
                    ap.address_point_id ASC
                  LIMIT 1`;
}

module.exports = { tier1aBridgeSql };
