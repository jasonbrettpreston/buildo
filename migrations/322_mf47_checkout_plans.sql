-- MF-47 (RULED 2026-11-14 under the operator's acceptance, DECISIONS.md "Ruled 2026-11-14"): the checkout row, as the seat recommended it
-- (reality-check-1114.md). Ledger claim: ~/Buildo-scratch/ids/mig-322.
--   1. entitlements.plan_key text NOT NULL DEFAULT 'basic' (CHECK 'basic' | 'pro'): the tier. No null, so no null rule (C-2).
--      entitlements.overage_cap integer NOT NULL DEFAULT 0 (CHECK >= 0): 0 = the hard stop. Written at consent by the overage row; nothing
--      here writes it, and no setting is inherited by a user who never consented (C-2).
--   2. admin_managed parcel_tool rows -> 'pro' (they read 20 today; Basic is 10), the count printed with RAISE NOTICE for the rehearsal.
--   3. The MF-45 allowances re-set to 10, ONLY where the value is still the seeded 20 (an operator edit survives). parcel_tool_report_limit_plan
--      is the Basic allowance; parcel_tool_report_limit_pro = 25 is new.
--   4. New settings, each mirrored in scripts/seeds/logic_variables.json entry for entry: parcel_tool_trial_months, stripe_tax_enabled,
--      parcel_tool_overage_enabled, parcel_tool_overage_cap_default, parcel_tool_meter_statement_timeout_ms.
--   5. Empty Stripe ids, the migration 219 pattern (JSONB strings, migration-only, never in the seed, named error until the operator sets them):
--      stripe_price_id_parcel_tool_basic, stripe_price_id_parcel_tool_pro, stripe_price_id_parcel_tool_overage (read by the overage row, not by
--      MF-47), stripe_portal_configuration_id_parcel_tool. No Stripe id is typed here.
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING; the UPDATEs are guarded by the old value. Re-running changes nothing.
-- WRITTEN, NOT APPLIED here: the orchestrator's DB job rehearses it on the test stack with the real hooks, then regenerates
-- src/lib/db/generated/schema.ts.
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md section 11b.7 rules 5-6 (dated note 2026-11-14)
-- SPEC LINK: docs/specs/00-architecture/116_multi_product_architecture.md section 5 OD4 (dated note 2026-11-14)
-- SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md section 2 (price ids; migration 219 pattern)

-- UP
BEGIN;

ALTER TABLE entitlements
  ADD COLUMN plan_key    text    NOT NULL DEFAULT 'basic',
  ADD COLUMN overage_cap integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_entitlements_plan_key    CHECK (plan_key IN ('basic', 'pro')),
  ADD CONSTRAINT chk_entitlements_overage_cap CHECK (overage_cap >= 0);

DO $$
DECLARE
  moved integer;
BEGIN
  UPDATE entitlements
     SET plan_key = 'pro'
   WHERE product = 'parcel_tool' AND status = 'admin_managed';
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'MF-47 322: admin_managed parcel_tool rows set to pro: %', moved;
END $$;

-- Re-set only where the value is still the shipped default 20 (a value an operator set to anything else is left alone). Each count and the
-- resulting values are printed: a count of 0 with a value other than 10 means "operator-set, check it", never silent.
DO $
DECLARE
  moved_trial integer;
  moved_plan  integer;
BEGIN
  UPDATE logic_variables SET variable_value = 10, updated_at = NOW()
   WHERE variable_key = 'parcel_tool_report_limit_trial' AND variable_value = 20;
  GET DIAGNOSTICS moved_trial = ROW_COUNT;
  UPDATE logic_variables SET variable_value = 10, updated_at = NOW()
   WHERE variable_key = 'parcel_tool_report_limit_plan' AND variable_value = 20;
  GET DIAGNOSTICS moved_plan = ROW_COUNT;
  RAISE NOTICE 'MF-47 322: trial re-set rows %, plan re-set rows %', moved_trial, moved_plan;
  RAISE NOTICE 'MF-47 322: values now: %', (SELECT string_agg(variable_key || '=' || variable_value::text, ', ' ORDER BY variable_key)
    FROM logic_variables WHERE variable_key IN ('parcel_tool_report_limit_trial', 'parcel_tool_report_limit_plan'));
END $;

INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('parcel_tool_report_limit_pro', 25, NULL, 'MF-47: new reports a parcel_tool Pro plan holder (plan_key pro; active, past_due, admin_managed) may open per billing month; operator ruling 2026-11-12 (Pro 25). Bounds 1-1000; outside them the meter refuses to serve (fail closed). CONSUMED by src/lib/entitlements/index.ts (readReportLimits, PLAN_LIMIT).'),
  ('parcel_tool_trial_months', 1, NULL, 'MF-47: the MaxBLD free trial length in whole calendar months, one value for Basic and Pro; operator ruling 2026-11-12. Bounds 1-12. Sent to Stripe as subscription_data.trial_end per checkout. CONSUMED by src/lib/stripe/parcel-checkout.ts (readTrialMonths).'),
  ('stripe_tax_enabled', 0, NULL, 'MF-47: 1 = MaxBLD checkout passes automatic_tax, customer_update address auto and billing address collection (Stripe Tax); 0 = off. Keep 0 until the Stripe tax registrations are added in the dashboard. CONSUMED by src/lib/stripe/parcel-checkout.ts.'),
  ('parcel_tool_overage_enabled', 0, NULL, 'MF-47: the overage switch (extra reports above the allowance): 0 = off, the hard stop at the allowance. Ships dark; the overage row owns what 1 does. CONSUMED by the overage row (not built in MF-47).'),
  ('parcel_tool_overage_cap_default', 10, NULL, 'MF-47: the default monthly cap on extra reports a user may set when consenting; operator ruling 2026-11-12 (default 10). Written onto the entitlement at consent by the overage row; the cap maximum is an open operator value with no setting yet. CONSUMED by the overage row (not built in MF-47).'),
  ('parcel_tool_meter_statement_timeout_ms', 5000, NULL, 'MF-47: the statement time limit in milliseconds applied inside the report-meter transaction only (SET LOCAL statement_timeout). Bounds 500-60000. CONSUMED by src/lib/entitlements/index.ts (readMeterStatementTimeoutMs; missing or out of bounds fails the meter closed).'),
  ('stripe_price_id_parcel_tool_basic', 0, '""'::jsonb, 'MF-47 / migration 219 pattern: the Stripe Price ID (price_...) of the MaxBLD Basic plan (its own Stripe Product). JSONB string; empty = unconfigured (checkout refuses with the named STRIPE_PRICE_NOT_CONFIGURED). The plan of a subscription is found by matching its price id against this key and the Pro key; the same id must also be in stripe_price_product_map as parcel_tool. CONSUMED by src/lib/stripe/parcel-checkout.ts and the webhook.'),
  ('stripe_price_id_parcel_tool_pro', 0, '""'::jsonb, 'MF-47 / migration 219 pattern: the Stripe Price ID (price_...) of the MaxBLD Pro plan (its own Stripe Product, not a second price on the Basic Product: the portal cannot hold two prices of one Product). JSONB string; empty = unconfigured. CONSUMED by src/lib/stripe/parcel-checkout.ts and the webhook.'),
  ('stripe_price_id_parcel_tool_overage', 0, '""'::jsonb, 'MF-47 / migration 219 pattern: the Stripe Price ID (price_...) of the MaxBLD overage item, for the overage row; empty until the operator sets it. Nothing in MF-47 reads it. JSONB string. CONSUMED by the overage row (not built in MF-47).'),
  ('stripe_portal_configuration_id_parcel_tool', 0, '""'::jsonb, 'MF-47: the Stripe Customer Portal configuration id (bpc_...) for MaxBLD (Switch plan on, the Basic and Pro Products listed, trial_update_behavior keeping the trial). JSONB string; empty = unconfigured (the portal action refuses with the named PORTAL_NOT_CONFIGURED). CONSUMED by src/lib/stripe/parcel-checkout.ts.')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line). Forward-fix is the normal path.
-- Runbook: dropping plan_key returns every parcel_tool holder to the single Basic allowance.
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key IN ('parcel_tool_report_limit_pro', 'parcel_tool_trial_months', 'stripe_tax_enabled',
--     'parcel_tool_overage_enabled', 'parcel_tool_overage_cap_default', 'parcel_tool_meter_statement_timeout_ms',
--     'stripe_price_id_parcel_tool_basic', 'stripe_price_id_parcel_tool_pro', 'stripe_price_id_parcel_tool_overage', 'stripe_portal_configuration_id_parcel_tool');
--   ALTER TABLE entitlements DROP CONSTRAINT chk_entitlements_overage_cap, DROP CONSTRAINT chk_entitlements_plan_key,
--     DROP COLUMN overage_cap, DROP COLUMN plan_key;
-- COMMIT;
