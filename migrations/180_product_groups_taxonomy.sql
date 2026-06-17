-- 180: Spec 80 v-next product taxonomy — add product_groups.type + re-seed to the 27-product vocab.
--
-- Adds `type` (material | rental | service) and re-seeds product_groups to the clean 1-27 layout
-- of §5.B.3, which includes splitting the old `lumber-drywall`(11) into `lumber`(11) +
-- `drywall-board`(12) and adding 11 new products (hvac-equipment, insulation-materials,
-- exterior-cladding, 4 rentals, 3 services). The split shifts the old ids 12-16 (roofing-materials,
-- eavestroughs, staircases, mirrors-glass, garage-doors) up by +1 to 13-17.
--
-- Mechanism: a GUARDED WHOLE-TABLE RE-SEED rather than a by-id cascade re-key (adversarial review
-- flagged the cascade as needless risk). product_groups is migration-seeded vocab and its only FK
-- dependent (permit_products) is dormant (0 rows) — so we abort if permit_products is non-empty,
-- then TRUNCATE + INSERT the canonical 27. Safe, simple, trivially reversible. Idempotent.
-- SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B.3

-- UP
ALTER TABLE product_groups
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'material';

-- Guard: re-seed only while permit_products is dormant (wiring is Phase 2). Abort otherwise so a
-- populated junction table is never silently truncated.
DO $mig$
BEGIN
  IF (SELECT count(*) FROM permit_products) > 0 THEN
    RAISE EXCEPTION 'migration 180: permit_products is not empty (% rows) — product_groups re-seed aborted',
      (SELECT count(*) FROM permit_products);
  END IF;
END
$mig$;

-- ALLOW-DESTRUCTIVE: dormant vocab re-seed. permit_products is guarded empty above; CASCADE clears
-- the (empty) junction rows so the FK does not block the TRUNCATE.
-- NOTE (replay-only footgun): on a `--force` full replay this 180 re-runs AFTER 181 has created
-- trade_products, so CASCADE would also truncate trade_products. This self-heals because 181
-- re-runs immediately after in the same ordered batch and re-seeds its 32 links (verified by the
-- migration-178-181 idempotency test). The forward (migrate-once, in-order) path is unaffected
-- because 180 applies before 181 ever exists. Acceptable; see review_followups.md.
TRUNCATE product_groups RESTART IDENTITY CASCADE;

INSERT INTO product_groups (id, slug, name, sort_order, type) VALUES
  (1,  'kitchen-cabinets',     'Kitchen Cabinets',         1,  'material'),
  (2,  'appliances',           'Appliances',               2,  'material'),
  (3,  'countertops',          'Countertops',              3,  'material'),
  (4,  'plumbing-fixtures',    'Plumbing Fixtures',        4,  'material'),
  (5,  'tiling',               'Tiling',                   5,  'material'),
  (6,  'windows',              'Windows',                  6,  'material'),
  (7,  'doors',                'Doors',                    7,  'material'),
  (8,  'flooring',             'Flooring',                 8,  'material'),
  (9,  'paint',                'Paint',                    9,  'material'),
  (10, 'lighting',             'Lighting',                 10, 'material'),
  (11, 'lumber',               'Lumber',                   11, 'material'),
  (12, 'drywall-board',        'Drywall Board',            12, 'material'),
  (13, 'roofing-materials',    'Roofing Materials',        13, 'material'),
  (14, 'eavestroughs',         'Eavestroughs',             14, 'material'),
  (15, 'staircases',           'Staircases',               15, 'material'),
  (16, 'mirrors-glass',        'Mirrors & Glass',          16, 'material'),
  (17, 'garage-doors',         'Garage Doors',             17, 'material'),
  (18, 'hvac-equipment',       'HVAC Equipment',           18, 'material'),
  (19, 'insulation-materials', 'Insulation Materials',     19, 'material'),
  (20, 'exterior-cladding',    'Exterior Cladding',        20, 'material'),
  (21, 'bin-rental',           'Bin Rental',               21, 'rental'),
  (22, 'portable-toilet',      'Portable Toilet',          22, 'rental'),
  (23, 'scaffolding-lifts',    'Scaffolding & Lifts',      23, 'rental'),
  (24, 'temp-fencing-rental',  'Temporary Fencing Rental', 24, 'rental'),
  (25, 'surveying',            'Surveying',                25, 'service'),
  (26, 'tree-removal',         'Tree Removal',             26, 'service'),
  (27, 'site-security',        'Site Security',            27, 'service');

SELECT setval(pg_get_serial_sequence('product_groups', 'id'), (SELECT MAX(id) FROM product_groups));

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_groups_type_check') THEN
    ALTER TABLE product_groups ADD CONSTRAINT product_groups_type_check
      CHECK (type IN ('material', 'rental', 'service'));
  END IF;
END
$c$;

-- DOWN
-- Manual rollback only (Rule 6). To revert: ALTER TABLE product_groups DROP CONSTRAINT IF EXISTS
-- product_groups_type_check; TRUNCATE product_groups RESTART IDENTITY CASCADE; re-INSERT the prior
-- 16-row layout from migration 031 (lumber-drywall=11, roofing-materials=12 ... garage-doors=16);
-- ALTER TABLE product_groups DROP COLUMN IF EXISTS type.
