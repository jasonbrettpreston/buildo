-- 314_maxbld_support_inbox.sql
-- MF-46: the MaxBLD Help & Support inbox as ONE operator setting (operator 2026-11-11, small pages item 6: the support inbox is held as ONE
-- setting, never typed into a page, a content file or a spec; Spec 126 §11b.7 dated note 2026-11-11 item 3). DECISIONS-v1 D-6 (a): Help &
-- Support is a mailto link to this inbox. Operator 2026-11-12: "All recommendations accepted as long as they are complaint and are standardized,
-- observable, scalable, accurate and understandable ie simple and understandable. Ensure the least amount of code and use schema's".
--
-- Seeded EMPTY (""): the operator sets the address. Until then the Help page shows no contact links (never a typed or guessed address).
-- Stored as a JSONB string, the migration 219 precedent (stripe_price_id_default): a text value cannot live in the DECIMAL variable_value
-- (sentinel 0), and scripts/seeds/logic_variables.json writes numeric values only, so this row is migration-only.
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING keeps an operator-set value. WRITTEN, NOT APPLIED here: the operator's DB job applies it.
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 (dated note 2026-11-11 item 3), §11b.3 (dated note 2026-11-12, MF-46)

-- UP
BEGIN;

INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('maxbld_support_inbox', 0, '""'::jsonb, 'MF-46 (Spec 126 section 11b.7 dated note 2026-11-11 item 3; section 11b.3 dated note 2026-11-12): the MaxBLD Help & Support inbox, ONE operator setting (never typed into a page, content file or spec). JSONB string; empty or not an email address = unset, and the Help page shows no contact links. Inserted by migration 314. CONSUMED by src/lib/surfaces/maxbld-support.ts (readSupportInbox) for src/app/(maxbld)/parcel-tool/(static)/help/page.tsx.')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line). Forward-fix is the normal path.
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key = 'maxbld_support_inbox';
-- COMMIT;
