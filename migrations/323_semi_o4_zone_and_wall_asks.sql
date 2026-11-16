-- 323: SEMI-O4 operator ruling (a), 2026-11-14 (plan ~/Buildo-scratch/mcbylaws/SEMI-O4/plan.md, last section "Operator 2026-11-14 on the imagery-check
-- results ... verbatim: a"; plan-b2.md). The 50-lot imagery check failed the S1-S3 bar (79 percent against 90, RESULTS-20261114.md). Three rule changes, each a
-- registered setting, amend the view parcel_lot_form (migration 320 is applied on dev and is NOT edited):
--   1. Detection runs only on residential zones: semi_detect_zone_classes (list, default R, RD, RS, RT, RM = the Residential Zone category the repo already
--      uses: Spec 130 parcel_abutments.neighbour_residential, migration 255; Spec 134 section 2 resolve_bylaws_population_zone_classes). A lot whose
--      zoning_class is not listed, or is NULL, is detached (basis o4_not_met) and never asked.
--   2. In the RD zone a two-parcel O-4 match is asked (unsure), not auto-called: semi_ask_two_parcel_zone_classes (list, default RD; Spec 131 LC-17: RD permits
--      no semi, 10.20.20.40(1); the check found 1 semi in 7 RD lots).
--   3. A shared length above semi_auto_max_shared_len_m (default 60, bounds 10..500) is asked, not auto-called (exactly the limit is auto-called).
-- The columns of the view are unchanged (parcel_id, lot_form_detected, lot_form_basis, unsure, linked_parcel_count, best_shared_len_m), so the lookup, the
-- app and the step read it as before; the app already asks on unsure. Items 2 and 3 are not doubt cuts: semi_doubt_enabled = 0 does not switch them off
-- (a reading of the ruling; its description says so, flagged to the operator).
--
-- on_invalid is "default" for every new setting, enforced here in SQL: a missing row, a list that is not a non-empty array of distinct strings from the closed
-- five residential codes (the Q-J list rule), or a number outside 10..500, reads as the seeded default. Lists live in variable_value_json with the sentinel 0
-- in variable_value (the migration 282 precedent). The bounds and closed vocabulary below mirror scripts/seeds/logic_variables.json (a test locks them equal).
--
-- Owed card (corrected here): semi_doubt_min_shared_len_m (and the view comment) said "party wall"; it is the shared lot line, the boundary two lots share.
--
-- WRITTEN, NOT APPLIED: an orchestrator DB job (rehearsed on the test stack, OPERATOR-GO). Idempotent: ON CONFLICT DO NOTHING; CREATE OR REPLACE VIEW; the
-- description UPDATEs set fixed text.
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4, ML-4 (dated note 2026-11-14)
-- SPEC LINK: docs/specs/01-pipeline/131_lot_configuration_policy.md LC-17 (dated note 2026-11-14)
-- SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.8 (externalized settings)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('semi_detect_zone_classes', 0, '["R","RD","RS","RT","RM"]'::jsonb, 'Operator ruling "a" (2026-11-14; ~/Buildo-scratch/mcbylaws/SEMI-O4/plan.md, last section; plan-b2.md). The zones where the semi detector runs at all (item 1): a lot whose zoning_class is not listed (or is NULL) is detached and never asked. A JSON array of zone codes stored in variable_value_json with the sentinel 0 in variable_value (seed type list, Q-J); closed to the five codes of the repo Residential Zone category (R, RD, RS, RT, RM: Spec 130 neighbour_residential, Spec 134 section 2 resolve_bylaws_population_zone_classes); must be non-empty and distinct. on_invalid default: a missing row, a non-array, an empty array or a code outside the five reads as the seeded default. Hidden internal until the admin card renders lists (Q-J). Inserted by migration 323. CONSUMED by the view parcel_lot_form (migration 323).'),
  ('semi_ask_two_parcel_zone_classes', 0, '["RD"]'::jsonb, 'Operator ruling "a" (2026-11-14; ~/Buildo-scratch/mcbylaws/SEMI-O4/plan.md, last section; plan-b2.md). The zones where a two-parcel O-4 match is asked (the semi question) and not auto-called (item 2). Default RD: the by-law permits no semi in RD (Spec 131 LC-17, 10.20.20.40(1)) and the imagery check found 1 semi in 7 RD lots (RESULTS-20261114.md). A JSON array of zone codes stored in variable_value_json with the sentinel 0 in variable_value (seed type list, Q-J); closed to the five codes of the repo Residential Zone category (R, RD, RS, RT, RM: Spec 130 neighbour_residential, Spec 134 section 2 resolve_bylaws_population_zone_classes); must be non-empty and distinct. on_invalid default: a missing row, a non-array, an empty array or a code outside the five reads as the seeded default. Hidden internal until the admin card renders lists (Q-J). Inserted by migration 323. CONSUMED by the view parcel_lot_form (migration 323).'),
  ('semi_auto_max_shared_len_m', 60, NULL, 'Operator ruling "a" (2026-11-14; ~/Buildo-scratch/mcbylaws/SEMI-O4/plan.md, last section; plan-b2.md). The longest shared lot line, in metres, that a semi match may have and still be auto-called (item 3): a shared length ABOVE it is asked (the semi question), exactly it is auto-called. Default 60 from the imagery check (0 semis of 5 lots at 85-247 m; true semis at 21-52 m, one RM at 59 m). on_invalid default: an out-of-bounds or missing value reads as 60. Bounds 10..500. Inserted by migration 323. CONSUMED by the view parcel_lot_form (migration 323).')
ON CONFLICT (variable_key) DO NOTHING;

UPDATE logic_variables SET description = 'Spec 78 O-4 doubt rule (operator "semi all y", 2026-11-13; D4): the shortest shared lot line (the boundary the two lots share, in metres) that counts as a semi. A doubt-rule lot below it stays detached; a strict-O-4 lot below it is still a semi but is asked (unsure). It is the length of the boundary the two lots share, not a building wall (owed card, corrected 2026-11-14). Starting value 5 m from the measured spread (strict pairs: 2 percent under 10.2 m, median 35 m; 706 strict lots under 5 m); to be re-set from the 50-lot imagery check. Bounds 0..50. Inserted by migration 320; description corrected by migration 323. CONSUMED by the view parcel_lot_form (migrations 320 and 323), read by the consumer lookup (src/lib/parcels/lot-form.ts).'
 WHERE variable_key = 'semi_doubt_min_shared_len_m';
UPDATE logic_variables SET description = 'Spec 78 O-4 doubt rule (operator "semi all y", 2026-11-13; D4): 1 = on, 0 = off. On: a lot whose footprint links 2..semi_doubt_max_link_parcels parcels, or whose strict-O-4 shared lot line is shorter than semi_doubt_min_shared_len_m, is treated as a possible semi and the app asks the one-question page before the report (operator "semi ask a"). Off: the doubt rule and the short-shared-line ask are off (strict O-4 only). It does NOT switch off the two asks of the operator ruling "a" (2026-11-14): an RD two-parcel match (semi_ask_two_parcel_zone_classes) and a shared length above semi_auto_max_shared_len_m are asked whatever this switch says. Inserted by migration 320; description amended by migration 323. CONSUMED by the view parcel_lot_form (migrations 320 and 323), read by the consumer lookup (src/lib/parcels/lot-form.ts).'
 WHERE variable_key = 'semi_doubt_enabled';

CREATE OR REPLACE VIEW parcel_lot_form AS
WITH zl AS (
  -- the two list settings, validated once: ok = a non-empty array of distinct strings, every one of the five residential codes (else the default applies)
  SELECT lv.variable_key,
         CASE WHEN jsonb_typeof(lv.variable_value_json) = 'array' THEN
                jsonb_array_length(lv.variable_value_json) > 0
                AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(lv.variable_value_json) e(x)
                                 WHERE jsonb_typeof(e.x) <> 'string' OR (e.x #>> '{}') <> ALL (ARRAY['R','RD','RS','RT','RM']))
                AND (SELECT COUNT(DISTINCT e.x) FROM jsonb_array_elements(lv.variable_value_json) e(x)) = jsonb_array_length(lv.variable_value_json)
              ELSE false END AS ok,
         lv.variable_value_json AS j
    FROM logic_variables lv
   WHERE lv.variable_key IN ('semi_detect_zone_classes', 'semi_ask_two_parcel_zone_classes')
), cfg AS (
  SELECT
    COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'semi_doubt_enabled'), 1) >= 1 AS doubt_on,
    COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'semi_doubt_max_link_parcels'), 3) AS max_link,
    COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'semi_doubt_min_shared_len_m'), 5) AS min_len,
    (SELECT CASE WHEN v.n BETWEEN 10 AND 500 THEN v.n ELSE 60 END
       FROM (SELECT COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'semi_auto_max_shared_len_m'), 60) AS n) v) AS auto_max_len,
    COALESCE((SELECT ARRAY(SELECT jsonb_array_elements_text(z.j)) FROM zl z WHERE z.variable_key = 'semi_detect_zone_classes' AND z.ok),
             ARRAY['R','RD','RS','RT','RM']) AS detect_zones,
    COALESCE((SELECT ARRAY(SELECT jsonb_array_elements_text(z.j)) FROM zl z WHERE z.variable_key = 'semi_ask_two_parcel_zone_classes' AND z.ok),
             ARRAY['RD']) AS ask_zones
)
SELECT
  p.id AS parcel_id,
  CASE WHEN d.in_scope AND (d.strict OR d.doubt) THEN 'semi_half' ELSE 'detached' END AS lot_form_detected,
  CASE WHEN NOT d.in_scope THEN 'o4_not_met'
       WHEN d.strict THEN 'o4_two_parcel_abut'
       WHEN d.doubt THEN 'doubt_multi_parcel_abut'
       ELSE 'o4_not_met' END AS lot_form_basis,
  (d.in_scope AND (d.strict OR d.doubt)
    AND ( (cfg.doubt_on AND d.strict AND f.best_shared_len_m < cfg.min_len)
          OR d.doubt
          OR (d.strict AND COALESCE(p.zoning_class = ANY (cfg.ask_zones), false))
          OR f.best_shared_len_m > cfg.auto_max_len )) AS unsure,
  f.link_parcels AS linked_parcel_count,
  f.best_shared_len_m
FROM parcels p
CROSS JOIN cfg
LEFT JOIN LATERAL (
  SELECT x.link_parcels, MAX(a.shared_len_m) AS best_shared_len_m
  FROM parcel_buildings pb
  CROSS JOIN LATERAL (
    SELECT COUNT(DISTINCT o.parcel_id)::int AS link_parcels
    FROM parcel_buildings o
    WHERE o.building_id = pb.building_id AND o.is_primary
  ) x
  JOIN parcel_buildings q ON q.building_id = pb.building_id AND q.is_primary AND q.parcel_id <> pb.parcel_id
  JOIN parcel_abutments a ON a.parcel_id = pb.parcel_id AND a.neighbour_id = q.parcel_id
  WHERE pb.parcel_id = p.id AND pb.is_primary AND x.link_parcels BETWEEN 2 AND cfg.max_link
  GROUP BY x.link_parcels
) f ON TRUE
CROSS JOIN LATERAL (
  SELECT (f.link_parcels IS NOT NULL AND COALESCE(p.zoning_class = ANY (cfg.detect_zones), false)) AS in_scope,
         (f.link_parcels = 2) AS strict,
         (cfg.doubt_on AND f.link_parcels > 2 AND f.link_parcels <= cfg.max_link AND f.best_shared_len_m >= cfg.min_len) AS doubt
) d;

COMMENT ON VIEW parcel_lot_form IS
  'Spec 78 O-4 + the doubt rule + the operator ruling a of 2026-11-14 (migrations 320 and 323): one row per parcel. lot_form_detected semi_half | detached; lot_form_basis o4_two_parcel_abut | doubt_multi_parcel_abut | o4_not_met; unsure = the ask band (the app shows the one-question page): a short shared lot line, the doubt band, a two-parcel match in an ask zone (default RD), or a shared lot line above semi_auto_max_shared_len_m. Detection runs only in the zones of semi_detect_zone_classes. linked_parcel_count and best_shared_len_m (the shared lot line) are the evidence. Cuts are logic variables semi_doubt_enabled, semi_doubt_max_link_parcels, semi_doubt_min_shared_len_m, semi_auto_max_shared_len_m, semi_detect_zone_classes, semi_ask_two_parcel_zone_classes. Derived on read; fidelity differs (O-4, ML-4).';

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 294, 296, 310, 320). To go back: re-run the CREATE OR REPLACE VIEW and COMMENT of
-- migration 320 (it has the same columns), then DELETE the three settings below. The two description UPDATEs are intentionally not reversed: the old text said
-- "party wall" for the shared lot line, which was the error.
-- DELETE FROM logic_variables WHERE variable_key IN ('semi_detect_zone_classes', 'semi_ask_two_parcel_zone_classes', 'semi_auto_max_shared_len_m');
