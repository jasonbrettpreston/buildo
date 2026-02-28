-- 031: Product groups for material supplier leads (WF3)

CREATE TABLE IF NOT EXISTS product_groups (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_groups_slug ON product_groups(slug);

INSERT INTO product_groups (id, slug, name, sort_order) VALUES
  (1,  'kitchen-cabinets',  'Kitchen Cabinets',    1),
  (2,  'appliances',        'Appliances',          2),
  (3,  'countertops',       'Countertops',         3),
  (4,  'plumbing-fixtures', 'Plumbing Fixtures',   4),
  (5,  'tiling',            'Tiling',              5),
  (6,  'windows',           'Windows',             6),
  (7,  'doors',             'Doors',               7),
  (8,  'flooring',          'Flooring',            8),
  (9,  'paint',             'Paint',               9),
  (10, 'lighting',          'Lighting',            10),
  (11, 'lumber-drywall',    'Lumber & Drywall',    11),
  (12, 'roofing-materials', 'Roofing Materials',   12),
  (13, 'eavestroughs',      'Eavestroughs',        13),
  (14, 'staircases',        'Staircases',          14),
  (15, 'mirrors-glass',     'Mirrors & Glass',     15),
  (16, 'garage-doors',      'Garage Doors',        16)
ON CONFLICT (id) DO NOTHING;

-- Junction table: permits <-> product groups
CREATE TABLE IF NOT EXISTS permit_products (
  permit_num    VARCHAR(20) NOT NULL,
  revision_num  VARCHAR(10) NOT NULL,
  product_id    INTEGER NOT NULL REFERENCES product_groups(id),
  product_slug  VARCHAR(50) NOT NULL,
  product_name  VARCHAR(100) NOT NULL,
  confidence    DECIMAL(3,2) NOT NULL DEFAULT 0.75,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_num, revision_num, product_id)
);

CREATE INDEX IF NOT EXISTS idx_permit_products_product ON permit_products(product_id);

SELECT setval('product_groups_id_seq', (SELECT MAX(id) FROM product_groups));
