-- ═══════════════════════════════════════════════════════════════════
-- Migration 099: logic_variables seed loader contract (WF3-0)
-- ═══════════════════════════════════════════════════════════════════
--
-- This migration contains no schema changes and inserts no rows directly.
-- It documents the new seeding contract for future auditors.
--
-- BEFORE this migration:
--   logic_variables rows were inserted by individual migration files
--   (092, 093, 096, 097). Adding a new key required a new migration +
--   manually syncing FALLBACK_LOGIC_VARS (scripts/lib/config-loader.js)
--   + LOGIC_VAR_DEFAULTS (src/lib/admin/control-panel.ts).
--
-- AFTER this migration:
--   The canonical source of truth is scripts/seeds/logic_variables.json.
--   scripts/seeds/apply-logic-variables.js reads the JSON and executes
--   INSERT ... ON CONFLICT DO NOTHING for each entry. This script is
--   called automatically at the end of `npm run migrate`.
--
--   Adding a new logic variable now requires only:
--     1. Edit scripts/seeds/logic_variables.json
--     2. Add key to the consumer script's Zod LOGIC_VARS_SCHEMA
--     3. Replace hardcoded value with logicVars[key]
--   No new migration file. No FALLBACK_LOGIC_VARS sync. No LOGIC_VAR_DEFAULTS sync.
--
-- FALLBACK_LOGIC_VARS (config-loader.js) and LOGIC_VAR_DEFAULTS (control-panel.ts)
-- are both derived programmatically from logic_variables.json. The parity test
-- in src/tests/control-panel.logic.test.ts verifies derivation at CI time.
--
-- This migration is intentionally a no-op so that the new contract is
-- recorded in schema_migrations and visible to future auditors.
-- ═══════════════════════════════════════════════════════════════════

-- UP
SELECT 1; -- no-op: seed insertion is handled by apply-logic-variables.js

-- DOWN
-- No rollback needed: this migration records process, not schema state.
-- To undo: DELETE FROM schema_migrations WHERE filename = '099_logic_variables_seed_loader.sql';
SELECT 1;
