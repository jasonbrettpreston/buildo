-- 181: Spec 80 v-next — trade_products link table (which trade INSTALLS which product) + 32 seeds.
--
-- The install-side mirror of Spec 87's sell-side supplier_products. (trade_id, product_id) M:N,
-- both columns FK-constrained to the §5.B.2 trades / §5.B.3 product_groups vocab. Seeds the 32
-- links of §5.B.4. References trades 34/36/37 (migration 179) and products up to 27 (migration
-- 180), so this runs after both. Idempotent (ON CONFLICT DO NOTHING).
-- SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B.4

-- UP
CREATE TABLE IF NOT EXISTS trade_products (
  trade_id    integer NOT NULL REFERENCES trades(id),
  product_id  integer NOT NULL REFERENCES product_groups(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_products_product ON trade_products(product_id);

INSERT INTO trade_products (trade_id, product_id) VALUES
  (5, 11),                          -- framing -> lumber
  (6, 20), (6, 23),                 -- masonry -> exterior-cladding, scaffolding-lifts
  (7, 13),                          -- roofing -> roofing-materials
  (8, 4),                           -- plumbing -> plumbing-fixtures
  (9, 18),                          -- hvac -> hvac-equipment
  (10, 10),                         -- electrical -> lighting
  (12, 19),                         -- insulation -> insulation-materials
  (13, 12),                         -- drywall -> drywall-board
  (14, 9),                          -- painting -> paint
  (15, 8),                          -- flooring -> flooring
  (16, 6), (16, 16),                -- glazing -> windows, mirrors-glass
  (21, 7), (21, 15),                -- trim-work -> doors, staircases
  (22, 1), (22, 3), (22, 2), (22, 15), -- millwork-cabinetry -> kitchen-cabinets, countertops, appliances, staircases
  (23, 5),                          -- tiling -> tiling
  (24, 3),                          -- stone-countertops -> countertops
  (25, 11),                         -- decking-fences -> lumber
  (26, 14), (26, 20), (26, 23),     -- eavestrough-siding -> eavestroughs, exterior-cladding, scaffolding-lifts
  (36, 22), (36, 24), (36, 25), (36, 26), -- site-preparation -> portable-toilet, temp-fencing-rental, surveying, tree-removal
  (34, 17),                         -- overhead-doors -> garage-doors
  (37, 21), (37, 27)                -- site-maintenance -> bin-rental, site-security
ON CONFLICT (trade_id, product_id) DO NOTHING;

DO $mig$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM trade_products;
  RAISE NOTICE 'migration 181: trade_products now holds % links (expected >= 32)', n;
END
$mig$;

-- DOWN
-- Manual rollback only (Rule 6). To revert: DROP TABLE IF EXISTS trade_products;
