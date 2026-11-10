-- 302: advertisers, placements and offers (MF-40, admin ads and placements) plus the two Admin Placements tunables.
-- Spec 126 section 6.3 rows 4, 5 and 6 as built (dated note 2026-11-10); operator rulings 2026-11-10 MF-40 D-1, D-3, D-6, D-7.
--   advertisers: minimal (D-3); entered by the admin only, no advertiser principal planned.
--   placements:  the closed slot vocabulary of scripts/surfaces/_schema/ad-contract.json, SEEDED here and written by nothing
--                else (no admin route writes it); max_slots equals report-presentation.json ad_placements[].max_slots (its one
--                home; src/tests/admin-placements-seed.logic.test.ts joins them). disclosure_required is CHECKed true (R-17,
--                R-34 (i)): relaxing it for a placement that does not render to a user needs a dated note and a new migration.
--   offers:      offer_id is client-generated (idempotent upsert); creative_text is the text the slot shows (v1 creatives are
--                text); creative_asset_id is a nullable FK to media_assets (D-6; not rendered until ad contract v2);
--                updated_at drives the form's optimistic concurrency (set by trigger_set_timestamp on every UPDATE). The
--                targeting KEY check is not in SQL (one home: the route validator and the contract); only the shape is.
-- RLS (Spec 114 section 2 dated notes 2026-11-09 and 2026-11-10): placements Class E (one public select policy, no write
--   policy); offers and advertisers the admin-read pattern (one <table>_select_admin policy, no write policy). Writes and
--   admin reads go through the owner connection. No index: the only declared read today is the admin list; the targeting-read
--   index arrives with the serving follow-up row (D-7; Spec 126 section 6.3 "every index names its declared read").
-- WRITTEN, NOT APPLIED here: the operator's DB job applies it after 300 and 301 (298 and 299 are reserved for MB-86).
--
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md section 2 (dated notes 2026-11-09, 2026-11-10; amendment (b))
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md section 6.3 rows 4-6 (dated note 2026-11-10)

-- UP
CREATE TABLE IF NOT EXISTS advertisers (
  advertiser_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  contact_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS placements (
  placement_key       text PRIMARY KEY CHECK (placement_key ~ '^[a-z0-9_]+$'),
  surface_archetype   text NOT NULL,
  max_slots           integer NOT NULL CHECK (max_slots >= 1),
  disclosure_required boolean NOT NULL CHECK (disclosure_required)
);

INSERT INTO placements (placement_key, surface_archetype, max_slots, disclosure_required) VALUES
  ('detail_footer', 'REPORT', 1, true),
  ('renovation_section', 'REPORT', 1, true),
  ('scenario_card', 'REPORT', 1, true)
ON CONFLICT (placement_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS offers (
  offer_id          uuid PRIMARY KEY,
  advertiser_id     uuid NOT NULL REFERENCES advertisers(advertiser_id),
  placement_key     text NOT NULL REFERENCES placements(placement_key),
  targeting         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(targeting) = 'object'),
  flight_start      timestamptz NULL,
  flight_end        timestamptz NULL,
  active            boolean NOT NULL DEFAULT false,
  creative_text     text NOT NULL CHECK (length(btrim(creative_text)) BETWEEN 1 AND 280),
  creative_asset_id uuid NULL REFERENCES media_assets(asset_id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_flight_ordered CHECK (flight_start IS NULL OR flight_end IS NULL OR flight_end >= flight_start)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON advertisers FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;
CREATE POLICY advertisers_select_admin ON advertisers
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND is_admin = true));

ALTER TABLE placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY placements_select_public ON placements
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY offers_select_admin ON offers
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND is_admin = true));

-- The two Admin Placements tunables (descriptor admin_placements config.logic_variables; mirrors scripts/seeds/logic_variables.json,
-- the seed is the test truth). Idempotent: ON CONFLICT (variable_key) DO NOTHING keeps any operator-set value.
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('admin_placement_default_flight_days', 30, NULL, 'MF-40: the flight length the offer form pre-fills, in days (the operator confirms it).'),
  ('admin_placement_max_horizon_days', 365, NULL, 'MF-40: bounds a given flight_end, in days from now; a later end is refused (400). An offer with no end date is allowed (open-ended).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (ALLOW-DESTRUCTIVE: dropping offers and advertisers loses every scheduled ad; the policies go with the tables).
-- DELETE FROM logic_variables WHERE variable_key = 'admin_placement_default_flight_days';
-- DELETE FROM logic_variables WHERE variable_key = 'admin_placement_max_horizon_days';
-- DROP TABLE IF EXISTS offers;
-- DROP TABLE IF EXISTS placements;
-- DROP TABLE IF EXISTS advertisers;
