-- 320: the semi detector (Spec 78 O-4 + the doubt rule; operator "semi all y" and "semi ask a", 2026-11-13; plan
-- ~/Buildo-scratch/mcbylaws/SEMI-O4/plan.md, D1 = C, D2 = b, D4): one read-only view `parcel_lot_form` and the three settings it reads.
-- No stored column (O-4 "derived on read"; ST-1..ST-8 unchanged). The view is the ONE source: the address lookup reads it before the
-- report shows, and the step's `flags.semiHalf` reads the same row (parked patch, D-78), so the two cannot drift (L-SEMI h).
--
-- THE RULE (every cut is a logic variable, read here; none in code)
--   strict O-4   the parcel's primary footprint is primary-linked to exactly 2 parcels and the other one abuts this one in parcel_abutments
--                -> lot_form_detected = semi_half, basis o4_two_parcel_abut
--   doubt        (semi_doubt_enabled = 1) the footprint links 3..semi_doubt_max_link_parcels parcels and a linked parcel abuts this one with a
--                shared boundary of at least semi_doubt_min_shared_len_m -> semi_half, basis doubt_multi_parcel_abut, unsure = true
--   weak party   strict O-4 holds but the longest shared boundary is under semi_doubt_min_shared_len_m (switch on) -> semi_half, unsure = true
--   else         detached, basis o4_not_met, unsure = false
-- `unsure` is the "ask" band: the app shows the one-question page only when unsure is true (operator "semi ask a"); a clear semi and a clear
-- detached lot go straight to the report. The link confidence is NOT a gate (plan key finding: the `nearest` 0.60 link is the semi signature).
-- Switch off (semi_doubt_enabled = 0) gives strict O-4 only and never unsure.
-- Fidelity stays `differs` (O-4, ML-4) until the 50-lot imagery check (operator) is done.
--
-- Settings are read with COALESCE to the defaults below, so the view works before the rows exist and a missing row never changes the rule.
-- The bounds are the seed's (scripts/seeds/logic_variables.json). WRITTEN, NOT APPLIED: an orchestrator job (rehearsed on the test stack).
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value; CREATE OR REPLACE VIEW.
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4, ML-4, the lot_form_detected row
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CV; R-DE (v))

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('semi_doubt_enabled', 1, NULL, 'Spec 78 O-4 doubt rule (operator "semi all y", 2026-11-13; D4): 1 = on, 0 = off. On: a lot whose footprint links 2..semi_doubt_max_link_parcels parcels, or whose strict-O-4 party wall is shorter than semi_doubt_min_shared_len_m, is treated as a possible semi and the app asks the one-question page before the report (operator "semi ask a"). Off: strict O-4 only, never asks. CONSUMED by the view parcel_lot_form (migration 320).'),
  ('semi_doubt_max_link_parcels', 3, NULL, 'Spec 78 O-4 doubt rule (operator "semi all y", 2026-11-13; D4): the most parcels the primary footprint may link to for the doubt rule to apply (strict O-4 is exactly 2; a semi whose footprint also touches a sliver, laneway or garage lot links 3; measured 1,525 of 3,239 undetected permit-semi lots). Bounds 2..6 (2 = strict only). CONSUMED by the view parcel_lot_form (migration 320).'),
  ('semi_doubt_min_shared_len_m', 5, NULL, 'Spec 78 O-4 doubt rule (operator "semi all y", 2026-11-13; D4): the shortest shared boundary, in metres, that counts as a party wall. A doubt-rule lot below it stays detached; a strict-O-4 lot below it is still a semi but is asked (unsure). Starting value 5 m from the measured spread (strict pairs: 2 percent under 10.2 m, median 35 m; 706 strict lots under 5 m); to be re-set from the 50-lot imagery check. Bounds 0..50. CONSUMED by the view parcel_lot_form (migration 320).')
ON CONFLICT (variable_key) DO NOTHING;

CREATE OR REPLACE VIEW parcel_lot_form AS
WITH cfg AS (
  SELECT
    COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'semi_doubt_enabled'), 1) >= 1 AS doubt_on,
    COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'semi_doubt_max_link_parcels'), 3) AS max_link,
    COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'semi_doubt_min_shared_len_m'), 5) AS min_len
)
SELECT
  p.id AS parcel_id,
  CASE WHEN f.link_parcels IS NOT NULL
        AND ( (f.link_parcels = 2)
              OR (cfg.doubt_on AND f.link_parcels <= cfg.max_link AND f.best_shared_len_m >= cfg.min_len) )
       THEN 'semi_half' ELSE 'detached' END AS lot_form_detected,
  CASE WHEN f.link_parcels IS NULL THEN 'o4_not_met'
       WHEN f.link_parcels = 2 THEN 'o4_two_parcel_abut'
       WHEN cfg.doubt_on AND f.link_parcels <= cfg.max_link AND f.best_shared_len_m >= cfg.min_len THEN 'doubt_multi_parcel_abut'
       ELSE 'o4_not_met' END AS lot_form_basis,
  (f.link_parcels IS NOT NULL AND cfg.doubt_on
    AND ( (f.link_parcels = 2 AND f.best_shared_len_m < cfg.min_len)
          OR (cfg.doubt_on AND f.link_parcels > 2 AND f.link_parcels <= cfg.max_link AND f.best_shared_len_m >= cfg.min_len) )) AS unsure,
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
) f ON TRUE;

COMMENT ON VIEW parcel_lot_form IS
  'Spec 78 O-4 + the doubt rule (migration 320): one row per parcel. lot_form_detected semi_half | detached; lot_form_basis o4_two_parcel_abut | doubt_multi_parcel_abut | o4_not_met; unsure = the ask band (the app shows the one-question page); linked_parcel_count and best_shared_len_m are the evidence. Cuts are logic variables semi_doubt_enabled, semi_doubt_max_link_parcels, semi_doubt_min_shared_len_m. Derived on read; fidelity differs (O-4, ML-4).';

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 294, 296, 310).
-- DROP VIEW IF EXISTS parcel_lot_form;
-- DELETE FROM logic_variables WHERE variable_key IN ('semi_doubt_enabled', 'semi_doubt_max_link_parcels', 'semi_doubt_min_shared_len_m');
