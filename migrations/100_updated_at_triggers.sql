-- UP
-- Bug Prevention Strategy §5: Move updated_at invariant enforcement to PostgreSQL.
-- A single reusable trigger function auto-sets updated_at = NOW() on every UPDATE,
-- eliminating the risk of application code forgetting to set it.
--
-- Applies to all 9 tables with updated_at columns (confirmed from schema.ts):
--   trade_mapping_rules, user_profiles, pipeline_schedules, tracked_projects,
--   lead_analytics, logic_variables, trade_configurations,
--   trade_sqft_rates, scope_intensity_matrix

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON trade_mapping_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON pipeline_schedules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tracked_projects
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON lead_analytics
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON logic_variables
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON trade_configurations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON trade_sqft_rates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON scope_intensity_matrix
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- DOWN
DROP TRIGGER IF EXISTS set_updated_at ON trade_mapping_rules;
DROP TRIGGER IF EXISTS set_updated_at ON user_profiles;
DROP TRIGGER IF EXISTS set_updated_at ON pipeline_schedules;
DROP TRIGGER IF EXISTS set_updated_at ON tracked_projects;
DROP TRIGGER IF EXISTS set_updated_at ON lead_analytics;
DROP TRIGGER IF EXISTS set_updated_at ON logic_variables;
DROP TRIGGER IF EXISTS set_updated_at ON trade_configurations;
DROP TRIGGER IF EXISTS set_updated_at ON trade_sqft_rates;
DROP TRIGGER IF EXISTS set_updated_at ON scope_intensity_matrix;
DROP FUNCTION IF EXISTS trigger_set_timestamp();
