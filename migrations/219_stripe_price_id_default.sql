-- 219: P26-26B — stripe_price_id_default logic variable (single-price v1).
--
-- The /api/subscribe/exchange checkout-session route reads the Stripe Price ID
-- from this row (variable_value_json, JSONB string) instead of a hardcoded
-- constant or env var, so live pricing changes need no deployment (Spec 20 §2).
-- Single-price v1 is the ratified ruling: the Spec 20 role matrix
-- (trade/realtor/manufacturer price keys) was never built and is documented as
-- v-next in the Spec 20 rewrite.
--
-- Seeded EMPTY (''): the operator must set the real `price_...` id from the
-- Stripe dashboard before checkout can work. The route treats an empty or
-- non-`price_`-prefixed value as unconfigured and returns the named
-- STRIPE_PRICE_NOT_CONFIGURED 500 — fail-loud, never a silent deep failure.
--
-- Stored as a JSONB string (non-numeric → cannot live in the DECIMAL
-- variable_value; sentinel 0 mirrors mig 211 coa_gate_policy). Migration-only —
-- NOT in scripts/seeds/logic_variables.json (that loader writes numeric
-- variable_value only).
--
-- SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §2, §3.2

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
VALUES
  ('stripe_price_id_default', 0, '""'::jsonb,
   'Spec 20 §2 / P26-26B — the Stripe Price ID (price_...) for the single-price v1 subscription checkout. JSONB string; empty = unconfigured (checkout-session route returns the named STRIPE_PRICE_NOT_CONFIGURED 500). Set from the Stripe dashboard (Products -> Price -> API ID). Role-based pricing (stripe_price_id_trade/realtor/manufacturer) is v-next per the Spec 20 rewrite. CONSUMED by src/app/api/subscribe/exchange/route.ts.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert:
--   DELETE FROM logic_variables WHERE variable_key = 'stripe_price_id_default';
