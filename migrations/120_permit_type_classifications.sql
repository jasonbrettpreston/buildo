-- 120: permit_type_class taxonomy + lookup table (WF2 #1)
--
-- 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5 (NEW)
--             docs/specs/01-pipeline/47_pipeline_script_protocol.md §10.2
--             docs/specs/02-web-admin/86_control_panel.md §1
--
-- Foundation for downstream classifier + cost-model gating.
--
-- The permits pipeline today applies the full tag-trade matrix to EVERY
-- permit_type — sign permits ("Designated Structures"), fee deferrals
-- ("DCs DeferredFees"), administrative records, etc. all get plumbing
-- + HVAC + framing classifications, and the cost model produces multi-
-- million-dollar trade slices on permits with zero physical work.
-- WF3 investigation 2026-05-08 found the $29M ZARA two-wall-signs
-- estimate + 12,026 wrong DST permit_trades rows + 1,450 realtor
-- classifications on signage permits as the visible symptoms.
--
-- This migration lands the data structure that WF2 #2 (classifier
-- gating) and WF2 #3 (cost-model gating) will read. No consumer code
-- paths are altered in this migration — those land in #2/#3 once #1
-- is verified.
--
-- Design choice — lookup TABLE not enum-on-permits column:
--   Operators need to tune classifications without code deploys (Spec 86
--   §1 pattern). Adding a permit_type to the wrong bucket today should be
--   a one-row UPDATE in admin tomorrow, not a new migration. The lookup
--   table is also the single source of truth that #2's classifier and
--   #3's cost model both read — Spec 47 §10.2 (shared enum vocabulary).
--
-- Seed source: companion research agent (background task during WF2 #4)
-- surveyed all 247,030 permits in dev DB and classified all 25 distinct
-- permit_type values into the four buckets below. Seed totals match the
-- agent's report 2026-05-08.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- 1. Enum type
--    Five values cover today's needs + reserved future bucket:
--      'construction'    — full tag-trade matrix; cost model uses Surgical Triangle
--      'signage'         — RESERVED for future WF3 description-level subtype
--                          detection inside Designated Structures (1,081 of 1,781
--                          rows are signs). NO rows seeded with this value today.
--      'administrative'  — fee deferrals, zoning paperwork, certificates — NO
--                          trades, NO cost slicing
--      'safety_upgrade'  — fire/security retrofits — only electrical +
--                          fire-protection trades
--      'unclassified'    — DEFAULT for new/unknown permit_types — downstream
--                          MUST treat as safe-skip (no trades, no cost slicing)
CREATE TYPE permit_type_class AS ENUM (
  'construction',
  'signage',
  'administrative',
  'safety_upgrade',
  'unclassified'
);

-- 2. Lookup table
--    permit_type is the PK so a single classify-permits invocation can
--    fetch the entire map in one query at startup (Spec 47 §R5).
CREATE TABLE permit_type_classifications (
  permit_type   TEXT      PRIMARY KEY,
  class         permit_type_class NOT NULL DEFAULT 'unclassified',
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update trigger so operator UPDATE via admin UI bumps updated_at
-- without relying on app-layer remembering to set it (Gemini WF2 #1 review HIGH).
CREATE OR REPLACE FUNCTION trigger_set_permit_type_classifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_permit_type_classifications_updated_at
BEFORE UPDATE ON permit_type_classifications
FOR EACH ROW
EXECUTE FUNCTION trigger_set_permit_type_classifications_updated_at();

-- 3. Seed — 25 rows from research agent's survey of 247,030 dev-DB permits
INSERT INTO permit_type_classifications (permit_type, class, notes) VALUES
  -- ─── 12 construction (~235K permits, 95.5% of total) ─────────────
  ('Small Residential Projects',           'construction',
    'Underpinning, additions, alterations, new garages — full SFD scope, all trades apply.'),
  ('Plumbing(PS)',                         'construction',
    'Plumbing-discipline subpermits — full plumbing/drain trades (specialty discipline, but still construction-trade work).'),
  ('Mechanical(MS)',                       'construction',
    'HVAC-discipline subpermits — full HVAC trades (specialty, but still construction-trade work).'),
  ('Building Additions/Alterations',       'construction',
    'Interior alterations, lobby/elevation alterations — full alteration scope.'),
  ('Drain and Site Service',               'construction',
    'Drain/site-service work tied to new construction or additions — plumbing/site trades.'),
  ('New Houses',                           'construction',
    'Full new SFD construction — full trade matrix applies.'),
  ('Residential Building Permit',          'construction',
    'Generic residential construction wrapper.'),
  ('Demolition Folder (DM)',               'construction',
    'Demolish + new construction; demolition + framing/site trades.'),
  ('New Building',                         'construction',
    'Full new commercial/multifamily — full trade matrix.'),
  ('Non-Residential Building Permit',      'construction',
    'Non-residential construction wrapper — full trade matrix.'),
  ('Portable Classrooms',                  'construction',
    'Erection/relocation of physical classroom structures — framing/electrical/site trades.'),
  ('Building Historical data - Converted', 'construction',
    'Legacy import of construction permits; sample shows real construction (additions, new SFDs).'),

  -- ─── 8 administrative (~1.2K permits, 0.5%) ─────────────────────
  ('DCs DeferredFees',                     'administrative',
    '"Deferred Fees from folder X" — pure fee-deferral records, ZERO physical work. Largest source of $5M+ per-trade outliers per WF3 investigation 2026-05-08.'),
  ('AS Alternative Solution',              'administrative',
    'OBC code-equivalency applications (sprinkler standpipe relief, travel-distance relief) — paperwork process, no construction scope of its own.'),
  ('Multiple Use Permit',                  'administrative',
    'Zoning relief / consent to sever / legalize use — zoning paperwork, not construction.'),
  ('Pre-Permit',                           'administrative',
    'Pre-application zoning/SPA review — paperwork stage; the actual permit follows separately.'),
  ('Toronto Buildings Contacts',           'administrative',
    'Empty descriptions in sample — administrative directory record.'),
  ('Site Inspection(Scarborough)',         'administrative',
    'Inspection wrapper folder; trades belong to the underlying parent permit, not this folder.'),
  ('Rental Renovation Licence',            'administrative',
    'Mostly test/empty rows in sample; licensing artifact, not a construction permit.'),
  ('Toronto Building Standard Attachments','administrative',
    'Empty description — attachment-tracking artifact.'),

  -- ─── 1 safety_upgrade (~6.8K permits, 2.8%) ─────────────────────
  ('Fire/Security Upgrade',                'safety_upgrade',
    '"Install fire alarm", "sprinkler shop drawings", "replace sprinklers in parking garage" — pure fire-protection/electrical retrofits.'),

  -- ─── 4 unclassified (~3.8K permits, 1.5%) — needs WF3 description-level subtype detection
  ('Designated Structures',                'unclassified',
    'MIXED bag: 61% signs (1,081), 13% solar (232), 6% retaining walls (109), 5% telecom antennas (87), residual ~272 includes clock towers/silos/satellite. Description-level signage/accessory split required (separate WF3).'),
  ('Partial Permit',                       'unclassified',
    '"Framing only", "structural framing only", "foundation only" subsets of full construction permits. Trades depend on the partial scope. Default-safe for stopgap; refine in follow-up WF3.'),
  ('Conditional Permit',                   'unclassified',
    '"Conditional permit for structural framing only", "above grade structural only" — same partial-scope pattern as Partial Permit.'),
  ('Temporary Structures',                 'unclassified',
    'Tents, temporary sales offices, service trailers — minimal trades (site, electrical, sometimes plumbing for trailers). Not full construction; not signage. Suggest narrow-trade bucket in follow-up WF3.')
ON CONFLICT (permit_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- ═══════════════════════════════════════════════════════════════════
-- (commented out — scripts/migrate.js executes the entire file as one batch
-- and does NOT respect `-- DOWN` as a section marker. Same convention as
-- migrations 117/118/119. Uncommenting would drop the table + enum mid-apply.)
--
-- Rollback procedure (manual, OUTSIDE a single transaction):
--   1. Verify no consumer scripts have started reading the table:
--        SELECT * FROM pg_stat_user_tables WHERE relname = 'permit_type_classifications';
--   2. DROP TABLE IF EXISTS permit_type_classifications;
--   3. DROP TYPE IF EXISTS permit_type_class;
--   4. Revert any TS/JS files that import from the table or enum
--      (scripts/lib/permit-type-classifier.js, src/lib/classification/permit-type-class.ts).
