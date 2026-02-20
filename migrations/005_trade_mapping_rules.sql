-- 005_trade_mapping_rules.sql
-- Rules engine that classifies permits into trades.
-- Tier 1 = permit_type (highest signal), Tier 2 = work field, Tier 3 = description keywords.

CREATE TABLE IF NOT EXISTS trade_mapping_rules (
    id              SERIAL          PRIMARY KEY,
    trade_id        INTEGER         NOT NULL REFERENCES trades(id),
    tier            INTEGER         NOT NULL CHECK (tier IN (1, 2, 3)),
    match_field     VARCHAR(50)     NOT NULL,
    match_pattern   VARCHAR(500)    NOT NULL,
    confidence      DECIMAL(3,2)    NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    phase_start     INTEGER,        -- months after issued_date
    phase_end       INTEGER,        -- months after issued_date
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_mapping_rules_trade
    ON trade_mapping_rules (trade_id);

CREATE INDEX IF NOT EXISTS idx_trade_mapping_rules_tier
    ON trade_mapping_rules (tier, is_active);

-- ============================================================
-- TIER 1 RULES: Direct permit_type mapping  (confidence 0.95)
-- ============================================================

INSERT INTO trade_mapping_rules (trade_id, tier, match_field, match_pattern, confidence, phase_start, phase_end) VALUES
    -- Plumbing(PS) -> plumbing
    ((SELECT id FROM trades WHERE slug = 'plumbing'),       1, 'permit_type', 'Plumbing(PS)',             0.95, NULL, NULL),
    -- Demolition Folder (DM) -> demolition
    ((SELECT id FROM trades WHERE slug = 'demolition'),     1, 'permit_type', 'Demolition Folder (DM)',   0.95, NULL, NULL),
    -- Mechanical/HVAC(MH) -> hvac
    ((SELECT id FROM trades WHERE slug = 'hvac'),           1, 'permit_type', 'Mechanical/HVAC(MH)',      0.95, NULL, NULL),
    -- Electrical(EL) -> electrical
    ((SELECT id FROM trades WHERE slug = 'electrical'),     1, 'permit_type', 'Electrical(EL)',           0.95, NULL, NULL),
    -- Sprinkler/Fire(SP) -> fire-protection
    ((SELECT id FROM trades WHERE slug = 'fire-protection'),1, 'permit_type', 'Sprinkler/Fire(SP)',       0.95, NULL, NULL),
    -- Drain(DR) -> plumbing (drain work is plumbing scope)
    ((SELECT id FROM trades WHERE slug = 'plumbing'),       1, 'permit_type', 'Drain(DR)',                0.90, NULL, NULL)
;

-- ============================================================
-- TIER 2 RULES: WORK field mapping  (confidence 0.80-0.90)
-- ============================================================

INSERT INTO trade_mapping_rules (trade_id, tier, match_field, match_pattern, confidence, phase_start, phase_end) VALUES
    -- Re-Roofing -> roofing
    ((SELECT id FROM trades WHERE slug = 'roofing'),        2, 'work', 'Re-Roofing',               0.90, NULL, NULL),
    -- Underpinning -> shoring
    ((SELECT id FROM trades WHERE slug = 'shoring'),        2, 'work', 'Underpinning',             0.90, NULL, NULL),
    -- Interior Alterations -> drywall, painting, flooring
    ((SELECT id FROM trades WHERE slug = 'drywall'),        2, 'work', 'Interior Alterations',     0.80, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'painting'),       2, 'work', 'Interior Alterations',     0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'flooring'),       2, 'work', 'Interior Alterations',     0.75, NULL, NULL),
    -- New Building -> excavation, concrete, structural-steel, framing (phased)
    ((SELECT id FROM trades WHERE slug = 'excavation'),     2, 'work', 'New Building',             0.85,  0,  3),
    ((SELECT id FROM trades WHERE slug = 'concrete'),       2, 'work', 'New Building',             0.85,  1,  6),
    ((SELECT id FROM trades WHERE slug = 'structural-steel'),2,'work', 'New Building',             0.80,  2,  8),
    ((SELECT id FROM trades WHERE slug = 'framing'),        2, 'work', 'New Building',             0.85,  3, 10),
    -- Addition -> concrete, framing, roofing
    ((SELECT id FROM trades WHERE slug = 'concrete'),       2, 'work', 'Addition',                 0.75,  0,  4),
    ((SELECT id FROM trades WHERE slug = 'framing'),        2, 'work', 'Addition',                 0.80,  1,  6),
    ((SELECT id FROM trades WHERE slug = 'roofing'),        2, 'work', 'Addition',                 0.75,  3,  8),
    -- Demolition -> demolition
    ((SELECT id FROM trades WHERE slug = 'demolition'),     2, 'work', 'Demolition',               0.90, NULL, NULL),
    -- Shoring / Foundation -> shoring, excavation
    ((SELECT id FROM trades WHERE slug = 'shoring'),        2, 'work', 'Shoring',                  0.90,  0,  3),
    ((SELECT id FROM trades WHERE slug = 'excavation'),     2, 'work', 'Shoring',                  0.80,  0,  3),
    -- Alterations -> drywall, painting
    ((SELECT id FROM trades WHERE slug = 'drywall'),        2, 'work', 'Alterations',              0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'painting'),       2, 'work', 'Alterations',              0.65, NULL, NULL),
    -- Mechanical Work -> hvac
    ((SELECT id FROM trades WHERE slug = 'hvac'),           2, 'work', 'Mechanical Work',          0.85, NULL, NULL),
    -- Fire Alarm/Suppression -> fire-protection
    ((SELECT id FROM trades WHERE slug = 'fire-protection'),2, 'work', 'Fire Alarm',               0.85, NULL, NULL),
    -- Elevator Installation -> elevator
    ((SELECT id FROM trades WHERE slug = 'elevator'),       2, 'work', 'Elevator Installation',    0.90, NULL, NULL)
;

-- ============================================================
-- TIER 3 RULES: Description keyword matching  (confidence 0.50-0.75)
-- Patterns use SQL ILIKE syntax (case-insensitive).
-- ============================================================

INSERT INTO trade_mapping_rules (trade_id, tier, match_field, match_pattern, confidence, phase_start, phase_end) VALUES
    -- excavation
    ((SELECT id FROM trades WHERE slug = 'excavation'),       3, 'description', '%excavat%',            0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'excavation'),       3, 'description', '%site grading%',       0.65, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'excavation'),       3, 'description', '%dig %foundation%',    0.60, NULL, NULL),
    -- shoring
    ((SELECT id FROM trades WHERE slug = 'shoring'),          3, 'description', '%shoring%',            0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'shoring'),          3, 'description', '%underpin%',           0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'shoring'),          3, 'description', '%retention wall%',     0.60, NULL, NULL),
    -- concrete
    ((SELECT id FROM trades WHERE slug = 'concrete'),         3, 'description', '%concrete%',           0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'concrete'),         3, 'description', '%foundation%',         0.60, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'concrete'),         3, 'description', '%slab%',               0.65, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'concrete'),         3, 'description', '%footing%',            0.65, NULL, NULL),
    -- structural-steel
    ((SELECT id FROM trades WHERE slug = 'structural-steel'), 3, 'description', '%structural steel%',   0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'structural-steel'), 3, 'description', '%steel frame%',        0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'structural-steel'), 3, 'description', '%steel beam%',         0.70, NULL, NULL),
    -- framing
    ((SELECT id FROM trades WHERE slug = 'framing'),          3, 'description', '%framing%',            0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'framing'),          3, 'description', '%wood frame%',         0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'framing'),          3, 'description', '%stud wall%',          0.65, NULL, NULL),
    -- masonry
    ((SELECT id FROM trades WHERE slug = 'masonry'),          3, 'description', '%masonry%',            0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'masonry'),          3, 'description', '%brick%',              0.65, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'masonry'),          3, 'description', '%block wall%',         0.65, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'masonry'),          3, 'description', '%stone veneer%',       0.60, NULL, NULL),
    -- roofing
    ((SELECT id FROM trades WHERE slug = 'roofing'),          3, 'description', '%roof%',               0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'roofing'),          3, 'description', '%shingle%',            0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'roofing'),          3, 'description', '%membrane roof%',      0.70, NULL, NULL),
    -- plumbing
    ((SELECT id FROM trades WHERE slug = 'plumbing'),         3, 'description', '%plumbing%',           0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'plumbing'),         3, 'description', '%water main%',         0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'plumbing'),         3, 'description', '%sanitary%',           0.65, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'plumbing'),         3, 'description', '%drain%',              0.60, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'plumbing'),         3, 'description', '%backflow%',           0.70, NULL, NULL),
    -- hvac
    ((SELECT id FROM trades WHERE slug = 'hvac'),             3, 'description', '%hvac%',               0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'hvac'),             3, 'description', '%mechanical%',         0.55, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'hvac'),             3, 'description', '%air condition%',      0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'hvac'),             3, 'description', '%furnace%',            0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'hvac'),             3, 'description', '%ductwork%',           0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'hvac'),             3, 'description', '%heat pump%',          0.70, NULL, NULL),
    -- electrical
    ((SELECT id FROM trades WHERE slug = 'electrical'),       3, 'description', '%electrical%',         0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'electrical'),       3, 'description', '%wiring%',             0.65, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'electrical'),       3, 'description', '%panel upgrade%',      0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'electrical'),       3, 'description', '%transformer%',        0.60, NULL, NULL),
    -- fire-protection
    ((SELECT id FROM trades WHERE slug = 'fire-protection'),  3, 'description', '%sprinkler%',          0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'fire-protection'),  3, 'description', '%fire alarm%',         0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'fire-protection'),  3, 'description', '%fire suppression%',   0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'fire-protection'),  3, 'description', '%fire protection%',    0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'fire-protection'),  3, 'description', '%standpipe%',          0.70, NULL, NULL),
    -- insulation
    ((SELECT id FROM trades WHERE slug = 'insulation'),       3, 'description', '%insulation%',         0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'insulation'),       3, 'description', '%vapour barrier%',     0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'insulation'),       3, 'description', '%thermal%',            0.55, NULL, NULL),
    -- drywall
    ((SELECT id FROM trades WHERE slug = 'drywall'),          3, 'description', '%drywall%',            0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'drywall'),          3, 'description', '%gypsum%',             0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'drywall'),          3, 'description', '%partition wall%',     0.65, NULL, NULL),
    -- painting
    ((SELECT id FROM trades WHERE slug = 'painting'),         3, 'description', '%paint%',              0.65, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'painting'),         3, 'description', '%finish%coat%',        0.55, NULL, NULL),
    -- flooring
    ((SELECT id FROM trades WHERE slug = 'flooring'),         3, 'description', '%flooring%',           0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'flooring'),         3, 'description', '%hardwood floor%',     0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'flooring'),         3, 'description', '%tile floor%',         0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'flooring'),         3, 'description', '%carpet%',             0.65, NULL, NULL),
    -- glazing
    ((SELECT id FROM trades WHERE slug = 'glazing'),          3, 'description', '%glazing%',            0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'glazing'),          3, 'description', '%window%',             0.60, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'glazing'),          3, 'description', '%curtain wall%',       0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'glazing'),          3, 'description', '%storefront%',         0.65, NULL, NULL),
    -- elevator
    ((SELECT id FROM trades WHERE slug = 'elevator'),         3, 'description', '%elevator%',           0.80, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'elevator'),         3, 'description', '%escalator%',          0.80, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'elevator'),         3, 'description', '%lift%',               0.50, NULL, NULL),
    -- demolition
    ((SELECT id FROM trades WHERE slug = 'demolition'),       3, 'description', '%demolit%',            0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'demolition'),       3, 'description', '%tear down%',          0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'demolition'),       3, 'description', '%strip out%',          0.60, NULL, NULL),
    -- landscaping
    ((SELECT id FROM trades WHERE slug = 'landscaping'),      3, 'description', '%landscap%',           0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'landscaping'),      3, 'description', '%grading%',            0.55, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'landscaping'),      3, 'description', '%retaining wall%',     0.60, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'landscaping'),      3, 'description', '%paving%',             0.60, NULL, NULL),
    -- waterproofing
    ((SELECT id FROM trades WHERE slug = 'waterproofing'),    3, 'description', '%waterproof%',         0.80, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'waterproofing'),    3, 'description', '%damp proof%',         0.75, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'waterproofing'),    3, 'description', '%moisture barrier%',   0.70, NULL, NULL),
    ((SELECT id FROM trades WHERE slug = 'waterproofing'),    3, 'description', '%weeping tile%',       0.70, NULL, NULL)
;
