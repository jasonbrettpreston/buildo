-- 305_parcel_user_inputs.sql
-- MF-19: Add lot size, the minimal input path (operator 2026-11-11, D-1..D-8 "all as recommmended").
--   1. parcel_user_inputs: a user lot-size entry is its OWN record (D-1 a). It wins over the City value for every reader
--      through one server read (src/lib/parcels/lot-size-entry.ts); parcels.lot_size_sqm keeps the City value, which the
--      sheet shows ("City lot record") and a revert needs. The parcels loader never writes this table, so a City re-load
--      cannot put the City value back over an entry.
--      Entered once (one ACTIVE row per lot and key, the partial unique index); history is kept (rows are never deleted;
--      an admin revert flips status, FE-20). source is 'user' and entered_at is stamped (Spec 126 section 11a.4, FE-19).
--      entered_by and reverted_by follow the migration 229 / 300 convention: a uuid FK to auth.users ON DELETE SET NULL,
--      so the offboarding sweep's DELETE FROM auth.users keeps the entry and empties its author (D-7: a shared fact stays).
--   2. Class B (Spec 114 section 2 dated note 2026-11-11): RLS on, NO policy. Server-only through the owner connection; the
--      route's auth, entitlement gate, switch and rate limit are the gate.
--   3. Five logic variables, mirroring scripts/seeds/logic_variables.json entry for entry (the seed is the test truth):
--      the range 46.45-4645.15 m2 (D-2: the sheet reads 500 and 50,000 sq ft), the City-record ratio 3 (D-3), the entries a
--      day 5 (D-4) - all four edited in the existing Admin Control Panel (group "MaxBLD Lot Size") - and the entry switch
--      user_lot_size_entry_enabled = 0 (OFF; not in the Admin Control Panel; the reader treats anything but 1 within the
--      seed bounds 0-0 as off, so turning it on is a code change with its own panel). Idempotent: ON CONFLICT DO NOTHING.
-- WRITTEN, NOT APPLIED here: the operator's DB job applies it (local), then regenerates src/lib/db/generated/schema.ts.
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md section 11a.4, section 11a.9 (dated notes 2026-11-11)
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md section 2 (dated note 2026-11-11), section 4 (Class B)
-- SPEC LINK: docs/specs/00-architecture/115_scheduling.md offboarding_sweep_30day (dated note 2026-11-11)

-- UP
BEGIN;

CREATE TABLE parcel_user_inputs (
  id           BIGSERIAL     PRIMARY KEY,
  parcel_id    INTEGER       NOT NULL REFERENCES parcels(id),
  input_key    TEXT          NOT NULL,
  value_sqm    NUMERIC(12,2) NOT NULL,
  typed_value  NUMERIC(12,2) NOT NULL,
  typed_unit   TEXT          NOT NULL,
  source       TEXT          NOT NULL DEFAULT 'user',
  entered_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  entered_by   UUID              NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status       TEXT          NOT NULL DEFAULT 'active',
  reverted_at  TIMESTAMPTZ       NULL,
  reverted_by  UUID              NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_parcel_user_inputs_key      CHECK (input_key IN ('lot_area')),
  CONSTRAINT chk_parcel_user_inputs_value    CHECK (value_sqm > 0),
  CONSTRAINT chk_parcel_user_inputs_typed    CHECK (typed_value > 0),
  CONSTRAINT chk_parcel_user_inputs_unit     CHECK (typed_unit IN ('sqft', 'm2')),
  CONSTRAINT chk_parcel_user_inputs_source   CHECK (source = 'user'),
  CONSTRAINT chk_parcel_user_inputs_status   CHECK (status IN ('active', 'reverted')),
  CONSTRAINT chk_parcel_user_inputs_reverted CHECK ((status = 'reverted') = (reverted_at IS NOT NULL))
);

-- Entered once: at most one active entry per lot and key; a reverted row leaves room for a new entry.
CREATE UNIQUE INDEX uq_parcel_user_inputs_active
  ON parcel_user_inputs (parcel_id, input_key) WHERE status = 'active';
-- History per lot, newest first (the revert and the audit read).
CREATE INDEX idx_parcel_user_inputs_history
  ON parcel_user_inputs (parcel_id, input_key, entered_at DESC);
-- The erasure path: ON DELETE SET NULL looks rows up by author.
CREATE INDEX idx_parcel_user_inputs_entered_by
  ON parcel_user_inputs (entered_by) WHERE entered_by IS NOT NULL;

ALTER TABLE parcel_user_inputs ENABLE ROW LEVEL SECURITY;

INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('user_lot_size_entry_enabled', 0, NULL, 'MF-19: the lot-size entry switch. 0 = OFF: the entry route refuses (403 ENTRY_OFF) before any other read and the report leaves the lot-size box and sheet out (D-6). Seed bounds 0-0: a value of 1 reads as OFF until the flip (W1 MB-42 and the one-lot re-evaluation row) raises the bound in code with its own panel. Not in the Admin Control Panel. CONSUMED by the lot-size entry library (src/lib/parcels/lot-size-entry.ts: readLotSizeSettings).'),
  ('user_lot_size_min_sqm', 46.45, NULL, 'MF-19 D-2: the smallest lot size a user may enter, in m2 (500 sq ft). Edited in the Admin Control Panel. CONSUMED by the lot-size entry library (src/lib/parcels/lot-size-entry.ts: readLotSizeSettings, lotSizeProblems).'),
  ('user_lot_size_max_sqm', 4645.15, NULL, 'MF-19 D-2: the largest lot size a user may enter, in m2 (50,000 sq ft). Edited in the Admin Control Panel. CONSUMED by the lot-size entry library (src/lib/parcels/lot-size-entry.ts: readLotSizeSettings, lotSizeProblems).'),
  ('user_lot_size_city_ratio_max', 3, NULL, 'MF-19 D-3: an entry more than this many times, or less than one over this many times, the City lot record is refused (catches a sq ft number typed as m2). Edited in the Admin Control Panel. CONSUMED by the lot-size entry library (src/lib/parcels/lot-size-entry.ts: lotSizeProblems).'),
  ('user_lot_size_entries_per_day', 5, NULL, 'MF-19 D-4: lot-size entries one user may submit in a day (the existing withRateLimit, bucket parcels-lot-size:{uid}, window one day). Edited in the Admin Control Panel. CONSUMED by the lot-size entry route (src/app/api/parcels/lot-size/route.ts, via readLotSizeSettings).')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line). Forward-fix is the normal path.
-- Runbook: dropping parcel_user_inputs deletes every user entry and its history (a human decision: the entries are shared
-- facts other viewers rely on); export the table first.
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key IN ('user_lot_size_entry_enabled', 'user_lot_size_min_sqm',
--     'user_lot_size_max_sqm', 'user_lot_size_city_ratio_max', 'user_lot_size_entries_per_day');
--   DROP TABLE IF EXISTS parcel_user_inputs;
-- COMMIT;
