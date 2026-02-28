-- 028: Add 11 new trade categories (WF3)
-- IDs 21-31 for expanded trade taxonomy

INSERT INTO trades (id, slug, name, icon, color, sort_order) VALUES
  (21, 'trim-work',          'Trim Work',               'Ruler',           '#A1887F', 21),
  (22, 'millwork-cabinetry', 'Millwork & Cabinetry',    'DoorOpen',        '#6D4C41', 22),
  (23, 'tiling',             'Tiling',                  'LayoutGrid',      '#26A69A', 23),
  (24, 'stone-countertops',  'Stone & Countertops',     'Gem',             '#78909C', 24),
  (25, 'decking-fences',     'Decking & Fences',        'Fence',           '#5D4037', 25),
  (26, 'eavestrough-siding', 'Eavestrough & Siding',   'ArrowDownToLine', '#546E7A', 26),
  (27, 'pool-installation',  'Pool Installation',       'Waves',           '#0097A7', 27),
  (28, 'solar',              'Solar',                   'Sun',             '#F57F17', 28),
  (29, 'security',           'Security',                'ShieldCheck',     '#37474F', 29),
  (30, 'temporary-fencing',  'Temporary Fencing',       'AlertTriangle',   '#FF6F00', 30),
  (31, 'caulking',           'Caulking',                'Pipette',         '#B0BEC5', 31)
ON CONFLICT (id) DO NOTHING;

-- Reset sequence to avoid conflicts with future inserts
SELECT setval('trades_id_seq', (SELECT MAX(id) FROM trades));
