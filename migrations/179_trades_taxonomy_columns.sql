-- 179: Spec 80 v-next taxonomy columns on trades + the 3 new trades + temporary-fencing deprecation.
--
-- Adds the per-trade taxonomy attributes from the §5.B.2 master table directly to `trades`
-- (the single correct home — services and the realtor persona have NO trade_sqft_rates row, so
-- cost_basis cannot live there):
--   kind        construction | service | persona | deprecated
--   seq         build-stage band 1-12 (NULL for spans/lifecycle/deprecated; concurrent trades share)
--   cost_basis  per_sqft (default) | per_unit | fixed | rental | commission
-- The existing `phase` column is intentionally NOT re-seeded (phase_match lead scoring is unchanged
-- in Phase 1; band->phase re-seed + consumer audit is deferred).
--
-- Adds 3 new trades at FREE ids (verified): overhead-doors=34, site-preparation=36,
-- site-maintenance=37. IDs 1-32 are the never-renumber invariant; these are new high ids.
-- temporary-fencing KEEPS id 30 but is marked kind='deprecated' (folded into site-preparation +
-- the temp-fencing-rental product) — NOT deleted, NOT renumbered. Runs AFTER migration 178 (fold).
-- Idempotent. SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B.2

-- UP
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS kind       text NOT NULL DEFAULT 'construction',
  ADD COLUMN IF NOT EXISTS seq        int,
  ADD COLUMN IF NOT EXISTS cost_basis text NOT NULL DEFAULT 'per_sqft';

-- Set kind / seq / cost_basis for the 33 canonical trades (per §5.B.2 master).
UPDATE trades t SET seq = v.seq, kind = v.kind, cost_basis = v.cost_basis
FROM (VALUES
  ('excavation',          3,  'construction', 'per_sqft'),
  ('shoring',             3,  'construction', 'per_sqft'),
  ('concrete',            4,  'construction', 'per_sqft'),
  ('structural-steel',    6,  'construction', 'per_sqft'),
  ('framing',             6,  'construction', 'per_sqft'),
  ('masonry',             7,  'construction', 'per_sqft'),
  ('roofing',             7,  'construction', 'per_sqft'),
  ('plumbing',            8,  'construction', 'per_sqft'),
  ('hvac',                8,  'construction', 'per_sqft'),
  ('electrical',          8,  'construction', 'per_sqft'),
  ('fire-protection',     8,  'construction', 'per_sqft'),
  ('insulation',          9,  'construction', 'per_sqft'),
  ('drywall',             10, 'construction', 'per_sqft'),
  ('painting',            11, 'construction', 'per_sqft'),
  ('flooring',            11, 'construction', 'per_sqft'),
  ('glazing',             7,  'construction', 'per_unit'),
  ('elevator',            11, 'construction', 'per_unit'),
  ('demolition',          2,  'construction', 'per_sqft'),
  ('landscaping',         12, 'construction', 'fixed'),
  ('waterproofing',       5,  'construction', 'per_sqft'),
  ('trim-work',           11, 'construction', 'per_sqft'),
  ('millwork-cabinetry',  11, 'construction', 'per_unit'),
  ('tiling',              11, 'construction', 'per_sqft'),
  ('stone-countertops',   11, 'construction', 'per_unit'),
  ('decking-fences',      12, 'construction', 'per_sqft'),
  ('eavestrough-siding',  7,  'construction', 'per_sqft'),
  ('pool-installation',   12, 'construction', 'fixed'),
  ('solar',               7,  'construction', 'per_unit'),
  ('security',            11, 'construction', 'fixed'),
  ('temporary-fencing',   NULL, 'deprecated', 'per_sqft'),
  ('caulking',            7,  'construction', 'per_sqft'),
  ('drain-plumbing',      5,  'construction', 'per_sqft'),
  ('realtor',             NULL, 'persona',    'commission')
) AS v(slug, seq, kind, cost_basis)
WHERE t.slug = v.slug;

-- Add the 3 new trades at their canonical FREE ids (guarded + idempotent).
DO $mig$
BEGIN
  -- Guard: the target ids must be free OR already hold the intended slug (re-run safety).
  IF EXISTS (
    SELECT 1 FROM trades
    WHERE id IN (34, 36, 37)
      AND slug NOT IN ('overhead-doors', 'site-preparation', 'site-maintenance')
  ) THEN
    RAISE EXCEPTION 'migration 179: id 34/36/37 occupied by an unexpected slug — aborting';
  END IF;

  INSERT INTO trades (id, slug, name, icon, color, sort_order, kind, seq, cost_basis) VALUES
    (34, 'overhead-doors',   'Overhead Doors',   'warehouse',    '#8B5A2B', 34, 'construction', 11,   'per_unit'),
    (36, 'site-preparation', 'Site Preparation', 'traffic-cone', '#C19A6B', 36, 'service',       1,   'fixed'),
    (37, 'site-maintenance', 'Site Maintenance', 'trash-2',      '#808080', 37, 'service',       NULL, 'fixed')
  -- DO UPDATE (not DO NOTHING): the guard above ensures a conflict on id means the slug already
  -- matches, so re-correct the taxonomy columns rather than silently keeping stale defaults.
  ON CONFLICT (id) DO UPDATE SET
    slug       = EXCLUDED.slug,
    name       = EXCLUDED.name,
    icon       = EXCLUDED.icon,
    color      = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order,
    kind       = EXCLUDED.kind,
    seq        = EXCLUDED.seq,
    cost_basis = EXCLUDED.cost_basis;

  -- Keep the SERIAL sequence above the highest explicit id so future inserts don't collide.
  PERFORM setval(pg_get_serial_sequence('trades', 'id'), (SELECT MAX(id) FROM trades));
END
$mig$;

-- Enum guards (added last, after all values are valid; idempotent via catalog check).
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_kind_check') THEN
    ALTER TABLE trades ADD CONSTRAINT trades_kind_check
      CHECK (kind IN ('construction', 'service', 'persona', 'deprecated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_cost_basis_check') THEN
    ALTER TABLE trades ADD CONSTRAINT trades_cost_basis_check
      CHECK (cost_basis IN ('per_sqft', 'per_unit', 'fixed', 'rental', 'commission'));
  END IF;
END
$c$;

-- DOWN
-- Manual rollback only (Rule 6). To revert: DELETE FROM trades WHERE id IN (34,36,37);
-- ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_kind_check, DROP CONSTRAINT IF EXISTS
-- trades_cost_basis_check; ALTER TABLE trades DROP COLUMN IF EXISTS cost_basis, DROP COLUMN IF
-- EXISTS seq, DROP COLUMN IF EXISTS kind; and reset temporary-fencing kind back to 'construction'.
