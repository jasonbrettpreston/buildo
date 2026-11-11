-- 303_parcel_tool_entitlement_usage.sql
-- MF-45: the parcel_tool entitlement and the monthly report limit (operator 2026-11-11: D-1 "a", D-2..D-6 "all five a").
--   1. chk_entitlements_product widens to the four keys in ONE statement ('parcel_tool' R-01, 'agent_reports' R-09). No
--      backfill: the lookup route's transitional lead_gen path covers the App A shelf until MF-50.
--   2. usage_events, the Spec 126 section 7 shape verbatim, in the narrow form ruled as D-1 a: signed-in rows only in use,
--      one select-own policy, NO anon insert (the section 7.1 offer-impression insert lands with MF-61), one event in use
--      (property_view). Closed CHECKs on product, event and subject_kind (R-04; pinned by contracts.infra.test.ts).
--   3. The two monthly allowances as logic variables (20 each; operator rulings 2026-11-10), edited in the existing Admin
--      Control Panel (group "MaxBLD Plan"). Mirrors scripts/seeds/logic_variables.json entry for entry (the seed is the test
--      truth). Idempotent: ON CONFLICT (variable_key) DO NOTHING keeps any operator-set value.
-- WRITTEN, NOT APPLIED here: the operator's DB job applies it (local), then regenerates src/lib/db/generated/schema.ts.
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md section 7, section 6.3 rows 2-3, section 11b.3 and
--            section 11b.7 (dated notes 2026-11-11)
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md section 2 (dated note 2026-11-11), sections 3.1, 8, 10
-- SPEC LINK: docs/specs/00-architecture/116_multi_product_architecture.md section 5 OD5 amendment

-- UP
BEGIN;

ALTER TABLE entitlements
  DROP CONSTRAINT chk_entitlements_product,
  ADD CONSTRAINT chk_entitlements_product
    CHECK (product IN ('lead_gen', 'flight_center', 'parcel_tool', 'agent_reports'));

CREATE TABLE usage_events (
  event_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID            NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   TEXT            NULL,
  product      TEXT        NOT NULL,
  event        TEXT        NOT NULL,
  subject_kind TEXT        NOT NULL,
  subject_key  TEXT        NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT chk_usage_events_principal
    CHECK ((user_id IS NULL) <> (session_id IS NULL)),
  CONSTRAINT chk_usage_events_product
    CHECK (product IN ('lead_gen', 'flight_center', 'parcel_tool', 'agent_reports')),
  CONSTRAINT chk_usage_events_event
    CHECK (event IN ('property_view', 'pdf_send', 'offer_impression', 'offer_click', 'export', 'parcel_id_translated')),
  CONSTRAINT chk_usage_events_subject_kind
    CHECK (subject_kind IN ('parcel_ref', 'parcel_pk', 'permit_rev', 'offer_id'))
);

-- The quota read (Spec 126 section 6.3 row 2): COUNT(DISTINCT subject_key) by user, product, event and subject kind over a
-- period computed at query time (section 7: the period is never stored, so there is no per-period unique index).
CREATE INDEX idx_usage_events_quota
  ON usage_events (user_id, product, event, subject_kind, occurred_at);

-- Class A by name (Spec 114 section 2 dated note 2026-11-11). Rows are server-written through the owner connection (D1,
-- RLS-exempt); no insert / update / delete policy, the reasoning section 3.1 gives for notification_dispatches.
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_events_select_own ON usage_events
  FOR SELECT USING (auth.uid() = user_id);

INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('parcel_tool_report_limit_plan', 20, NULL, 'MF-45: new reports a parcel_tool plan holder (active, past_due, admin_managed) may open per billing month; operator ruling 2026-11-10 "3. 20". Bounds 1-1000; outside them the meter refuses to serve (fail closed). CONSUMED by src/lib/entitlements/index.ts (readReportLimits).'),
  ('parcel_tool_report_limit_trial', 20, NULL, 'MF-45: new reports a parcel_tool trial holder may open per billing month; operator ruling 2026-11-10 (trial 20 reports). Bounds 1-1000; outside them the meter refuses to serve (fail closed). CONSUMED by src/lib/entitlements/index.ts (readReportLimits).')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line). Forward-fix is the normal path.
-- Runbook: restoring the two-key CHECK fails while any parcel_tool or agent_reports entitlements row exists; delete or
-- archive those rows first (a human decision: they are paying customers). Dropping usage_events deletes the report ledger.
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key IN ('parcel_tool_report_limit_plan', 'parcel_tool_report_limit_trial');
--   DROP POLICY IF EXISTS usage_events_select_own ON usage_events;
--   DROP TABLE IF EXISTS usage_events;
--   ALTER TABLE entitlements DROP CONSTRAINT chk_entitlements_product,
--     ADD CONSTRAINT chk_entitlements_product CHECK (product IN ('lead_gen', 'flight_center'));
-- COMMIT;
