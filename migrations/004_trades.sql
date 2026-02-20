-- 004_trades.sql
-- Reference table of construction trade categories.

CREATE TABLE IF NOT EXISTS trades (
    id          SERIAL          PRIMARY KEY,
    slug        VARCHAR(50)     UNIQUE NOT NULL,
    name        VARCHAR(100)    NOT NULL,
    icon        VARCHAR(50),
    color       VARCHAR(7),
    sort_order  INTEGER,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

-- Seed the 20 trades
INSERT INTO trades (slug, name, icon, color, sort_order) VALUES
    ('excavation',       'Excavation',        'shovel',          '#8B4513',  1),
    ('shoring',          'Shoring',           'pillar',          '#A0522D',  2),
    ('concrete',         'Concrete',          'cube',            '#808080',  3),
    ('structural-steel', 'Structural Steel',  'building',        '#4682B4',  4),
    ('framing',          'Framing',           'frame',           '#DEB887',  5),
    ('masonry',          'Masonry',           'bricks',          '#CD853F',  6),
    ('roofing',          'Roofing',           'home',            '#B22222',  7),
    ('plumbing',         'Plumbing',          'droplet',         '#1E90FF',  8),
    ('hvac',             'HVAC',              'thermometer',     '#FF8C00',  9),
    ('electrical',       'Electrical',        'zap',             '#FFD700', 10),
    ('fire-protection',  'Fire Protection',   'flame',           '#FF4500', 11),
    ('insulation',       'Insulation',        'layers',          '#9ACD32', 12),
    ('drywall',          'Drywall',           'layout',          '#D3D3D3', 13),
    ('painting',         'Painting',          'paintbrush',      '#DA70D6', 14),
    ('flooring',         'Flooring',          'grid',            '#8FBC8F', 15),
    ('glazing',          'Glazing',           'maximize',        '#87CEEB', 16),
    ('elevator',         'Elevator',          'arrow-up-down',   '#6A5ACD', 17),
    ('demolition',       'Demolition',        'hammer',          '#DC143C', 18),
    ('landscaping',      'Landscaping',       'tree-pine',       '#228B22', 19),
    ('waterproofing',    'Waterproofing',     'umbrella',        '#4169E1', 20)
ON CONFLICT (slug) DO NOTHING;
