-- Migration 113: trade_suppliers table for onboarding supplier selection
-- SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 7b
-- Stores admin-managed supplier names per trade slug.
-- The GET /api/onboarding/suppliers endpoint queries this table.
-- No FK to user_profiles — decoupled from Spec 95 changes.

-- UP

CREATE TABLE trade_suppliers (
  id            SERIAL PRIMARY KEY,
  trade_slug    VARCHAR(64) NOT NULL,
  name          TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_trade_suppliers_slug ON trade_suppliers(trade_slug) WHERE active = true;

-- Seed: 4-6 real Ontario/Toronto-market suppliers per trade category.
-- These are the initial curated list; admin panel manages updates (Phase 2).

-- Plumbing
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('plumbing', 'Ferguson', 1),
  ('plumbing', 'Wolseley', 2),
  ('plumbing', 'Consolidated Pipe & Supply', 3),
  ('plumbing', 'GF Piping Systems', 4);

-- Drain Plumbing
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('drain-plumbing', 'Ferguson', 1),
  ('drain-plumbing', 'Wolseley', 2),
  ('drain-plumbing', 'ACO Drain', 3),
  ('drain-plumbing', 'Jay R. Smith', 4);

-- HVAC
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('hvac', 'Wesco Distribution', 1),
  ('hvac', 'Lennox Canada', 2),
  ('hvac', 'York', 3),
  ('hvac', 'Carrier Canada', 4),
  ('hvac', 'Trane Technologies', 5);

-- Electrical
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('electrical', 'Rexel Canada', 1),
  ('electrical', 'Anixter', 2),
  ('electrical', 'Nedco', 3),
  ('electrical', 'Sonepar Canada', 4),
  ('electrical', 'Stelpro', 5);

-- Fire Protection
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('fire-protection', 'Victaulic', 1),
  ('fire-protection', 'Viking Group', 2),
  ('fire-protection', 'Tyco Fire Products', 3),
  ('fire-protection', 'AFAC Ltd', 4);

-- Roofing
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('roofing', 'BP Canada', 1),
  ('roofing', 'IKO Industries', 2),
  ('roofing', 'GAF Materials', 3),
  ('roofing', 'Tremco', 4),
  ('roofing', 'Owens Corning Canada', 5);

-- Framing
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('framing', 'Stella-Jones', 1),
  ('framing', 'Sexton Group', 2),
  ('framing', 'Jeld-Wen', 3),
  ('framing', 'LP Building Solutions', 4);

-- Concrete
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('concrete', 'Lafarge Canada', 1),
  ('concrete', 'Holcim Canada', 2),
  ('concrete', 'Boral Industries', 3),
  ('concrete', 'Sika Canada', 4);

-- Structural Steel
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('structural-steel', 'Atlas Steel', 1),
  ('structural-steel', 'Samuel Son & Co.', 2),
  ('structural-steel', 'Canam Group', 3),
  ('structural-steel', 'Russel Metals', 4);

-- Masonry
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('masonry', 'Brampton Brick', 1),
  ('masonry', 'Hanson Building Materials', 2),
  ('masonry', 'Old Mill Brick', 3),
  ('masonry', 'Mortar Net Solutions', 4);

-- Excavation
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('excavation', 'Toromont CAT', 1),
  ('excavation', 'Finning CAT', 2),
  ('excavation', 'Strongco Equipment', 3),
  ('excavation', 'Wajax Equipment', 4);

-- Demolition
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('demolition', 'Epiroc Canada', 1),
  ('demolition', 'Atlas Copco', 2),
  ('demolition', 'Caterpillar Canada', 3);

-- Drywall
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('drywall', 'CGC Inc.', 1),
  ('drywall', 'USG Canada', 2),
  ('drywall', 'Allroc Building Products', 3),
  ('drywall', 'Rona Pro', 4);

-- Insulation
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('insulation', 'Owens Corning Canada', 1),
  ('insulation', 'Roxul (Rockwool)', 2),
  ('insulation', 'Johns Manville', 3),
  ('insulation', 'DuPont Thermax', 4);

-- Painting
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('painting', 'Sherwin-Williams Canada', 1),
  ('painting', 'Benjamin Moore Canada', 2),
  ('painting', 'PPG Paints', 3),
  ('painting', 'ICI Paints', 4);

-- Flooring
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('flooring', 'Shaw Floors', 1),
  ('flooring', 'Armstrong Flooring', 2),
  ('flooring', 'Preverco Hardwood', 3),
  ('flooring', 'Centura Tile', 4);

-- Tiling
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('tiling', 'Centura Tile', 1),
  ('tiling', 'Olympia Tile', 2),
  ('tiling', 'Florida Tile', 3),
  ('tiling', 'LATICRETE International', 4);

-- Waterproofing
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('waterproofing', 'Tremco', 1),
  ('waterproofing', 'BASF MasterSeal', 2),
  ('waterproofing', 'Grace Construction Products', 3),
  ('waterproofing', 'Cetco', 4);

-- Glazing
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('glazing', 'Pilkington Canada', 1),
  ('glazing', 'Guardian Glass', 2),
  ('glazing', 'AGC Glass', 3),
  ('glazing', 'Oldcastle BuildingEnvelope', 4);

-- Eavestrough & Siding
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('eavestrough-siding', 'Gentek Building Products', 1),
  ('eavestrough-siding', 'Ply Gem Canada', 2),
  ('eavestrough-siding', 'Alside', 3),
  ('eavestrough-siding', 'Kaycan Ltd', 4);

-- Landscaping
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('landscaping', 'Permacon', 1),
  ('landscaping', 'Oaks Concrete Products', 2),
  ('landscaping', 'Unilock', 3),
  ('landscaping', 'BEL Air Landscaping', 4);

-- Decking & Fences
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('decking-fences', 'Fortress Building Products', 1),
  ('decking-fences', 'Trex Decking', 2),
  ('decking-fences', 'AZEK Building Products', 3),
  ('decking-fences', 'Fiberon', 4);

-- Pool Installation
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('pool-installation', 'Hayward Pool Products', 1),
  ('pool-installation', 'Pentair', 2),
  ('pool-installation', 'Latham Pool Products', 3),
  ('pool-installation', 'Certikin International', 4);

-- Solar
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('solar', 'Canadian Solar', 1),
  ('solar', 'SunPower', 2),
  ('solar', 'Enphase Energy', 3),
  ('solar', 'SMA Solar Technology', 4);

-- Security
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('security', 'Bosch Security Systems', 1),
  ('security', 'Honeywell Security', 2),
  ('security', 'Avigilon', 3),
  ('security', 'Genetec', 4);

-- Elevator
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('elevator', 'Otis Elevator Canada', 1),
  ('elevator', 'Kone Canada', 2),
  ('elevator', 'ThyssenKrupp Elevator', 3),
  ('elevator', 'Schindler Canada', 4);

-- Trim Work
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('trim-work', 'Windsor Plywood', 1),
  ('trim-work', 'Metrie Inc.', 2),
  ('trim-work', 'Pacific Coast Mouldings', 3);

-- Millwork & Cabinetry
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('millwork-cabinetry', 'Aristokraft Cabinetry', 1),
  ('millwork-cabinetry', 'Merillat Cabinets', 2),
  ('millwork-cabinetry', 'Kitchen Craft', 3),
  ('millwork-cabinetry', 'Cabico Custom Cabinetry', 4);

-- Stone Countertops
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('stone-countertops', 'Caesarstone Canada', 1),
  ('stone-countertops', 'Silestone by Cosentino', 2),
  ('stone-countertops', 'Cambria', 3),
  ('stone-countertops', 'MSI Surfaces', 4);

-- Caulking
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('caulking', 'Sika Canada', 1),
  ('caulking', 'GE Sealants', 2),
  ('caulking', 'DAP Products', 3),
  ('caulking', 'Dow Corning', 4);

-- Shoring
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('shoring', 'Alsina Formwork', 1),
  ('shoring', 'Doka Canada', 2),
  ('shoring', 'ULMA Construction', 3);

-- Temporary Fencing
INSERT INTO trade_suppliers (trade_slug, name, display_order) VALUES
  ('temporary-fencing', 'Ideal Shield', 1),
  ('temporary-fencing', 'National Fencing', 2),
  ('temporary-fencing', 'Rite-Hite', 3);

-- Realtor — no suppliers (client auto-skips on empty array)

-- DOWN
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
-- DROP TABLE IF EXISTS trade_suppliers;
