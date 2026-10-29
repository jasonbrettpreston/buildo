-- 292: the front setback placeholder variables (card FS-SB2).
--
-- Operator ruling 2026-10-29 (card FS-SB2, "FS-SB2 yes"; Spec 69a M-245, M-256, CHAT-198.NN-Q4): where neighbours exist but their
-- front setbacks cannot be measured, the placeholder is the mean of the subject lot's own footprint front setback + 1.0 m and the same-street
-- median + 1.0 m (other lots within the street radius, at least the minimum count, abutters excluded), else the same-zone median + 1.0 m
-- within the zone radius, else 6.0 m, always needs survey. The four values are fitted, not law (Spec 78 6.4 pattern: bounded, held-out test,
-- pinned audit ~/Buildo-scratch/p2close/front-setback-placeholder.md; radius choice flat between 50 and 400 m).
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (M-245, M-256)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('fya_placeholder_street_radius_m', 200,
   'Front setback placeholder (operator ruling 2026-10-29, card FS-SB2; Spec 69a M-245, M-256, CHAT-198.NN-Q4): where neighbours exist but their front setbacks cannot be measured, the placeholder is the mean of the subject lot''s own footprint front setback + fya_porch_allowance_m and the same-street median + fya_porch_allowance_m, else the same-zone median + the allowance, else 6.0 m, always needs survey. This variable: radius (metres) within which other lots on the same street feed the same-street median. A fitted value, not law: bounded, fit_basis the held-out test of ~/Buildo-scratch/p2close/front-setback-placeholder.md (264 lots, radius choice flat between 50 and 400 m), re-fit by re-running that audit. CONSUMED by scripts/analysis/bylaw/front-averaging.mjs.'),
  ('fya_placeholder_street_min_n', 3,
   'Front setback placeholder (operator ruling 2026-10-29, card FS-SB2; Spec 69a M-245, M-256, CHAT-198.NN-Q4): where neighbours exist but their front setbacks cannot be measured, the placeholder is the mean of the subject lot''s own footprint front setback + fya_porch_allowance_m and the same-street median + fya_porch_allowance_m, else the same-zone median + the allowance, else 6.0 m, always needs survey. This variable: minimum number of other same-street lots within that radius for the same-street median to count. A fitted value, not law: bounded, fit_basis the held-out test of ~/Buildo-scratch/p2close/front-setback-placeholder.md (264 lots, radius choice flat between 50 and 400 m), re-fit by re-running that audit. CONSUMED by scripts/analysis/bylaw/front-averaging.mjs.'),
  ('fya_placeholder_zone_radius_m', 500,
   'Front setback placeholder (operator ruling 2026-10-29, card FS-SB2; Spec 69a M-245, M-256, CHAT-198.NN-Q4): where neighbours exist but their front setbacks cannot be measured, the placeholder is the mean of the subject lot''s own footprint front setback + fya_porch_allowance_m and the same-street median + fya_porch_allowance_m, else the same-zone median + the allowance, else 6.0 m, always needs survey. This variable: radius (metres) within which same-zone lots feed the zone median. A fitted value, not law: bounded, fit_basis the held-out test of ~/Buildo-scratch/p2close/front-setback-placeholder.md (264 lots, radius choice flat between 50 and 400 m), re-fit by re-running that audit. CONSUMED by scripts/analysis/bylaw/front-averaging.mjs.'),
  ('fya_placeholder_zone_min_n', 5,
   'Front setback placeholder (operator ruling 2026-10-29, card FS-SB2; Spec 69a M-245, M-256, CHAT-198.NN-Q4): where neighbours exist but their front setbacks cannot be measured, the placeholder is the mean of the subject lot''s own footprint front setback + fya_porch_allowance_m and the same-street median + fya_porch_allowance_m, else the same-zone median + the allowance, else 6.0 m, always needs survey. This variable: minimum number of same-zone lots within that radius for the zone median to count. A fitted value, not law: bounded, fit_basis the held-out test of ~/Buildo-scratch/p2close/front-setback-placeholder.md (264 lots, radius choice flat between 50 and 400 m), re-fit by re-running that audit. CONSUMED by scripts/analysis/bylaw/front-averaging.mjs.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- DELETE FROM logic_variables WHERE variable_key IN ('fya_placeholder_street_radius_m', 'fya_placeholder_street_min_n', 'fya_placeholder_zone_radius_m', 'fya_placeholder_zone_min_n');
