-- 121: Staleness thresholds → logic_variables (WF3 2026-05-08)
--
-- Spec 47 §R4 + §R5: "Any value in a spec's logic_variables or
-- trade_configurations table MUST be loaded from the DB at startup."
-- Spec 44 §4: deepscrapes step 7 (assert_staleness) gates the chain.
-- Spec 86 §1: admin Control Panel surfaces logic_variables via the
-- Marketplace Constants Card; staleness thresholds are now editable
-- from /admin/control-panel.
--
-- Moves the hardcoded `if (stale30d > 0)` gate + the informational
-- floor/ceiling out of scripts/quality/assert-staleness.js into the DB.
-- The script will load these via loadMarketplaceConfigs + Zod schema
-- at startup (Spec 47 §R4-R5).
--
-- Defaults are calibrated against the 2026-05-08 deepscrapes snapshot:
--   total_target=62,888 · scraped=7,477 · coverage=11.9% · max_days_stale=55 · stale_over_30d=6,514
-- Sized so the chain unblocks immediately on merge (verdict WARN, not
-- FAIL) while still catching catastrophic regression (50K+ stale → FAIL).
-- Operators tighten via /admin/control-panel as scrape coverage scales
-- past 50% per Spec 38.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('staleness_max_stale_over_30d',
    10000,
    'Max permits with last inspection scrape older than scrape_stale_days before assert-staleness emits FAIL. Sized at 10000 against the 2026-05-08 snapshot of 6,514 stale → WARN. Operators tighten to <2000 once scrape coverage ≥50% per Spec 38. Catastrophic regression (50K+) still FAILs.'),
  ('staleness_min_coverage_pct',
    10,
    'Scraped/total ratio (percent) below which assert-staleness emits an informational WARN row "below_min_coverage_floor". Today 11.9% — just above floor. Per Spec 44 §3.5 this is informational, not a halt.'),
  ('staleness_max_days_stale',
    60,
    'Single-permit max_days_stale ceiling (days). Above this assert-staleness emits an informational WARN row indicating one or more permits are aging beyond expectation. Today max=55 days → still PASS. Not a halt.')
ON CONFLICT (variable_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Same convention as migrations 118 + 119: a transactional DOWN would
-- risk destroying any operator-tuned values applied via /admin/control-panel
-- after deployment. To roll back manually (only if absolutely required):
--
--   DELETE FROM logic_variables WHERE variable_key IN (
--     'staleness_max_stale_over_30d',
--     'staleness_min_coverage_pct',
--     'staleness_max_days_stale'
--   );
--
-- Then revert scripts/quality/assert-staleness.js LOGIC_VARS_SCHEMA +
-- the GlobalConfigCard.tsx GROUPS array entry + EXPECTED_LOGIC_VAR_KEYS
-- in src/tests/control-panel.logic.test.ts in one commit.
