-- 184: lead_products — unified product-classification ledger keyed on lead_id.
--
-- The product analogue of lead_trades (mig 124). Holds tag/archetype-derived
-- product-group classifications for lead-bearing rows. Currently written by the
-- CoA chain only (classify-coa-trades.js → 'coa:<application_number>'); the
-- permit path keeps writing the legacy denormalized permit_products until a
-- future phase folds it in (same permit_trades→lead_trades trajectory).
--
-- SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B (products owner)
--            docs/specs/01-pipeline/42_chain_coa.md §6 (CoA chain)
--
-- Normalized (mirrors lead_trades, NOT permit_products): stores product_id only
-- (FK → product_groups); consumers JOIN product_groups for slug/name. The
-- denormalized product_slug/product_name on permit_products is the anti-pattern
-- NOT copied here. No cross-table FK on lead_id (targets permits OR
-- coa_applications — a single FK can't express it); the CHECK enforces format,
-- and the mig 137 orphan-audit view detects dangling rows.
--
-- Purely additive. permit_products remains the live permit writer.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_products (
    id              SERIAL          PRIMARY KEY,
    lead_id         TEXT            NOT NULL CHECK (lead_id ~ '^(permit|coa):.+$'),
    product_id      INTEGER         NOT NULL REFERENCES product_groups(id),
    confidence      DECIMAL(3,2)    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    classified_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (lead_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_products_product ON lead_products (product_id);
CREATE INDEX IF NOT EXISTS idx_lead_products_lead    ON lead_products (lead_id);

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, comment-only per Rule 6 (migrate.js runs the
-- whole file in one batch; executable SQL after -- DOWN would run on every apply).
-- ═══════════════════════════════════════════════════════════════════
-- Reverting erases unified product-classification storage. Manual:
-- ALLOW-DESTRUCTIVE
--   DROP TABLE IF EXISTS lead_products;
