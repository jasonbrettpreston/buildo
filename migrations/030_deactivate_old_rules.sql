-- 030: Deactivate Tier 2 and Tier 3 rules (WF3)
-- Tag-trade matrix now handles broad-scope classification.
-- Tier 1 rules remain active for narrow-scope permit codes.

UPDATE trade_mapping_rules
SET is_active = false, updated_at = NOW()
WHERE tier IN (2, 3)
  AND is_active = true;
