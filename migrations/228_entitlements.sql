-- 228_entitlements.sql
-- SPEC LINK: docs/specs/00-architecture/116_multi_product_architecture.md §4
--   N2 (per-product entitlement shape) + docs/specs/00-architecture/114_rls_policy_catalog.md
--   §7 (Class A's 11th table, policies land in migration 230 after D6/229).
--   Authored per the panel-locked `.cursor/phase1_plan.md` Item 3 (P1-F3c),
--   SQL BINDING as written there.

-- UP
BEGIN;

-- Spec 116 §4 N2 base shape + two Phase-1 additions beyond N2's literal
-- 4-column list, both load-bearing (Regression Guardian fence — see
-- phase1_plan.md Item 4's writer-by-writer walk for why each is required,
-- not decorative):
--   * last_stripe_event_at — the anti-replay/out-of-order-event watermark
--     currently on user_profiles (webhook route L291-338); moving it
--     per-product is required because two DIFFERENT products' Stripe
--     events must not gate each other's replay window.
--   * trial_started_at — currently on user_profiles; per-product because
--     a user's trial clock for product A must be independent of product B.
CREATE TABLE entitlements (
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product                TEXT NOT NULL,
  status                 TEXT NOT NULL,
  stripe_subscription_id TEXT,
  current_period_end     TIMESTAMPTZ,
  trial_started_at       TIMESTAMPTZ,
  last_stripe_event_at   TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product),
  CONSTRAINT chk_entitlements_product
    CHECK (product IN ('lead_gen', 'flight_center')),
  CONSTRAINT chk_entitlements_status
    CHECK (status IN ('trial','active','past_due','expired','cancelled_pending_deletion','admin_managed'))
);

CREATE INDEX idx_entitlements_stripe_subscription
  ON entitlements (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Price -> product mapping (phase1_plan.md Item 4). Reuses the mig-219
-- pattern: a JSONB logic_variable, operator-editable without a deploy,
-- single source of truth for both the webhook and the reconcile/reactivate
-- routes.
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
VALUES
  ('stripe_price_product_map', 0, '{}'::jsonb,
   'Spec 116 N2 / Phase 1 — maps a Stripe Price ID (price_...) to the Buildo product it entitles (one of entitlements.product''s CHECK values). Empty object = unconfigured; webhook/reconcile/reactivate fall back to lead_gen (OD5 default) and log a WARN when a price is unmapped. Operator sets real price->product pairs from the Stripe dashboard. CONSUMED by src/lib/stripe/client.ts resolvePriceProduct().')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line).
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key = 'stripe_price_product_map';
--   DROP TABLE IF EXISTS entitlements;
-- COMMIT;
