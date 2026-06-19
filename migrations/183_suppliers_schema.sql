-- 183: Spec 87 sell-side schema — suppliers + supplier_products (SCHEMA ONLY, empty).
--
-- The sell-side mirror of Spec 80's install-side trade_products. `suppliers` are real
-- marketplace accounts onboarded over time (NOT seeded vocabulary — Spec 87 §3 caveat),
-- so this migration creates the tables EMPTY. Real account onboarding + the audience
-- matching/read layer + supplier lead production are a later feature WF (Spec 87 §6).
-- The product hub is product_groups (Spec 80 §5.B.3) — FK target. This is distinct from
-- the existing `trade_suppliers` (mig 113, slug-based mobile-onboarding table).
-- SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §3

-- UP
CREATE TABLE IF NOT EXISTS suppliers (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('supplier_retailer', 'manufacturer', 'rental_co', 'service_co')),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_products (
  supplier_id  integer NOT NULL REFERENCES suppliers(id),
  product_id   integer NOT NULL REFERENCES product_groups(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON supplier_products(product_id);

-- DOWN
-- Manual rollback only (Rule 6). To revert:
-- DROP TABLE IF EXISTS supplier_products; DROP TABLE IF EXISTS suppliers;
