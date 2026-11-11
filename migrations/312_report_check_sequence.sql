-- 312_report_check_sequence.sql
-- MF-62 follow-up: the report processing sequence (operator 2026-11-11, verbatim, record ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
-- "Processing demo + choose-lot": "the show report button shows before the animation is complete - also why do we need that button - after
-- the each fact runs - we need to paude and then have somet the possibilities report for the address is ready and then transisiton.  Let's
-- slow it down and make it more compelling."). Amends MF-62 D-2 a ("Show report" after 2 s, minimum 6 s; migration 306).
--   1. report_check_min_ms 6000 -> 23000: the whole sequence (facts, a pause, the ready line, then the report); operator 2026-11-11 (D-6,
--      verbatim: "1 acutally think it needs longer", relayed as about 23 s); the seed bound moves to 30000 so that fits.
--   2. report_check_skip_after_ms 2000 -> 0: the quiet "Skip" from the start (WCAG 2.2.2).
--   3. NEW report_check_ready_hold_ms 1500: how long the ready line holds before the report opens by itself. The minimum and the skip delay
--      cannot place the ready line; with the hold, every time on the screen follows from data (Spec 128 Rule 3).
-- Why a migration: scripts/seeds/apply-logic-variables.js is INSERT ... ON CONFLICT DO NOTHING and never updates an existing row (precedent
-- migrations 209 and 238). Each UPDATE is guarded on the exact value 306 inserted, so an operator-set value (and its description) is never
-- clobbered and a re-apply changes 0 rows. Descriptions are byte-identical to scripts/seeds/logic_variables.json.
-- WRITTEN, NOT APPLIED here: the orchestrator's DB job applies it.
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md section 11a.7 (dated note 2026-11-11, MF-62 follow-up)
-- SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35

-- UP
BEGIN;

UPDATE logic_variables
   SET variable_value = 23000,
       description = 'MF-62 (Spec 126 section 11a.7 dated notes 2026-11-11; Spec 135 FE-35; operator 2026-11-11, the processing sequence ("after the each fact runs - we need to paude and then have somet the possibilities report for the address is ready and then transisiton.  Let''s slow it down")): the total time in milliseconds of the report processing screen: the facts, a pause, the ready line, then the report opens by itself (never under a screen reader or reduce motion; never on the web). About 23 s (operator 2026-11-11, verbatim: "1 acutally think it needs longer"). Bounds 1000-30000. Edited in the Admin Control Panel. Migration 306 inserted it (6000), migration 312 set it. Read by the report producer through readReportCheckPace (src/lib/parcels/report-check-pace.ts: a missing or out-of-bounds value, one below report_check_skip_after_ms or not above report_check_ready_hold_ms, skips the screen and the report still opens).',
       updated_at = NOW()
 WHERE variable_key = 'report_check_min_ms'
   AND variable_value = 6000;

UPDATE logic_variables
   SET variable_value = 0,
       description = 'MF-62 (Spec 126 section 11a.7 dated notes 2026-11-11; Spec 135 FE-35; operator 2026-11-11, the processing sequence ("after the each fact runs - we need to paude and then have somet the possibilities report for the address is ready and then transisiton.  Let''s slow it down")): the delay in milliseconds before the quiet "Skip" link shows on the report processing screen; 0 = from the start (WCAG 2.2.2: the user can always leave). Never above report_check_min_ms. Edited in the Admin Control Panel. Migration 306 inserted it (2000), migration 312 set it. Read by the report producer through readReportCheckPace (src/lib/parcels/report-check-pace.ts).',
       updated_at = NOW()
 WHERE variable_key = 'report_check_skip_after_ms'
   AND variable_value = 2000;

INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('report_check_ready_hold_ms', 1500, NULL, 'MF-62 follow-up (Spec 126 section 11a.7 dated note 2026-11-11; Spec 135 FE-35; operator 2026-11-11, the processing sequence ("after the each fact runs - we need to paude and then have somet the possibilities report for the address is ready and then transisiton.  Let''s slow it down")): how long in milliseconds the line "The Building Possibilities Report for {address} is ready." holds before the report opens by itself; the facts and the pause share the rest of report_check_min_ms. Below report_check_min_ms. Edited in the Admin Control Panel. Inserted by migration 312. Read by the report producer through readReportCheckPace (src/lib/parcels/report-check-pace.ts).')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line). Forward-fix is the normal path.
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key = 'report_check_ready_hold_ms';
--   UPDATE logic_variables SET variable_value = 6000, updated_at = NOW() WHERE variable_key = 'report_check_min_ms' AND variable_value = 23000;
--   UPDATE logic_variables SET variable_value = 2000, updated_at = NOW() WHERE variable_key = 'report_check_skip_after_ms' AND variable_value = 0;
-- COMMIT;
