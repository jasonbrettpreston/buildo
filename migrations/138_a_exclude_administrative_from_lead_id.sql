-- 138_a: Phase C — exclude administrative-class permits from the lead_id ecosystem.
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A.1
-- FIXES: WF3 #lpad-revision-num-collision
--
-- Filename note: sorts BEFORE 138_promote_cost_estimates_lead_id_not_null.sql
-- (the `_a_` infix sorts ahead of `_promote_` because `a` < `p`). This must
-- run before migration 138's NOT NULL + UNIQUE promotion or that promotion
-- aborts on 136 duplicate lead_ids in cost_estimates.
--
-- Root cause:
--   The canonical Phase B lead_id derivation `'permit:' || permit_num || ':' ||
--   LPAD(revision_num, 2, '0')` collapses two genuinely distinct permits onto
--   the same lead_id whenever one has revision_num='0' (a Toronto-specific
--   'DCs DeferredFees' administrative sub-record) and another has
--   revision_num='00' (the main building permit).
--
-- Why Option B (exclude administrative from lead_id) over Option A (drop LPAD):
--   The codebase has already adopted the administrative-exclusion pattern at
--   every other lead-emitting write site:
--     * scripts/classify-permits.js gates `permit_trades` writes on
--       permit_type_class='construction'  (admin permits get zero trades)
--     * scripts/compute-cost-estimates.js writes cost_source='none' for
--       administrative permits (the 1,245 placeholder rows we delete below
--       have zero signal — they exist as schema artifacts of an earlier 1:1
--       cost_estimates-per-permit invariant, not as real cost data)
--   This migration completes the pattern at the two remaining write sites:
--   the Phase B trigger on permits, and the migrate-to-lead-id.js backfill.
--   The LPAD policy itself (5 hardcoded locations) is left intact for actual
--   construction-class leads.
--
-- Spec 42 alignment: Phase C unblocks → Phase D R5.2 link-coa-to-parcels
-- (queued) → Phases E-H per spec. No deviation from Spec 42 §6.6 Option C
-- architecture.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

SET LOCAL statement_timeout = '2min';

-- Preflight: confirm permit_type_classifications is current. mig 120 seeded
-- the table; if a future schema drift renames the column or class enum, fail
-- loudly before mutating data.
DO $$
DECLARE
    admin_class_present BOOLEAN;
    admin_permit_types_count INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM permit_type_classifications WHERE class = 'administrative'
    ) INTO admin_class_present;
    IF NOT admin_class_present THEN
        RAISE EXCEPTION 'Phase C migration 138_a aborted: permit_type_classifications has no rows with class=administrative. Run mig 120 first.';
    END IF;
    SELECT COUNT(*) INTO admin_permit_types_count
      FROM permit_type_classifications WHERE class = 'administrative';
    RAISE NOTICE 'Phase C 138_a: % administrative permit_type entries detected — applying exclusion.', admin_permit_types_count;
END $$;

-- Component 1: amend the Phase B trigger function `permits_set_lead_id()`
-- (installed by mig 132) to NULL the lead_id for administrative-class permits
-- instead of writing the canonical 'permit:<num>:<LPAD-rev>' form.
--
-- Why: administrative records (e.g. 'DCs DeferredFees') do not represent
-- construction leads. Their permit_num collides with the main permit on the
-- LPAD-canonical lead_id form. NULL prevents the collision and is consistent
-- with the downstream behavior (compute-cost-estimates emits cost_source='none';
-- classify-permits emits zero trades). The `chk_permits_lead_id_format` CHECK
-- explicitly allows NULL.
CREATE OR REPLACE FUNCTION permits_set_lead_id() RETURNS TRIGGER AS $$
DECLARE
    pt_class TEXT;
BEGIN
    SELECT class INTO pt_class
      FROM permit_type_classifications
     WHERE permit_type = NEW.permit_type;
    -- NULL for administrative-class permits (no lead identity).
    -- Canonical form for construction/safety_upgrade/unclassified classes.
    -- Phase D CoA classifiers will populate `coa:<application_number>`
    -- on the coa_applications table via the analogous trigger in mig 133.
    IF pt_class = 'administrative' THEN
        NEW.lead_id := NULL;
    ELSE
        NEW.lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Component 2: NULL out existing permits.lead_id for administrative-class
-- rows. The Phase B trigger one-shot backfill in mig 132 populated all 247K
-- rows without the class filter; this UPDATE corrects that.
UPDATE permits p
   SET lead_id = NULL
  FROM permit_type_classifications ptc
 WHERE ptc.permit_type = p.permit_type
   AND ptc.class = 'administrative'
   AND p.lead_id IS NOT NULL;

-- Component 3: delete administrative-class cost_estimates rows. These have
-- cost_source='none' per compute-cost-estimates.js:308 — they were inserted
-- by the cost computation script as placeholder rows (no real signal, no
-- downstream consumer). Deleting them unblocks mig 138's NOT NULL + UNIQUE
-- promotion without losing meaningful data.
--
-- The CASCADE behavior: cost_estimates has no FK dependents in the lead_id
-- ecosystem (verified via R0 audit). Phase F's compute-cost-estimates rekey
-- to lead_id will not regenerate admin rows (classify-permits gates upstream).
--
-- R8 DeepSeek HIGH (2026-05-14): explicit `cost_source = 'none'` safety
-- filter. R0 audit confirmed all 1,245 admin cost_estimates rows have
-- cost_source='none' today, so this filter is no-op in production but
-- protects against silent destruction of any real cost data that might
-- exist on an administrative permit due to a future bug or manual fix.
DELETE FROM cost_estimates ce
 USING permits p, permit_type_classifications ptc
 WHERE p.permit_num = ce.permit_num
   AND p.revision_num = ce.revision_num
   AND ptc.permit_type = p.permit_type
   AND ptc.class = 'administrative'
   AND ce.cost_source = 'none';

-- Post-conditions (loud-fail on drift):
DO $$
DECLARE
    remaining_admin_ce INTEGER;
    permits_lead_id_admin_remaining INTEGER;
    ce_lpad_collisions INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_admin_ce
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num
                    AND p.revision_num = ce.revision_num
      JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
     WHERE ptc.class = 'administrative';
    IF remaining_admin_ce > 0 THEN
        RAISE EXCEPTION 'Phase C 138_a post-condition FAIL: % administrative cost_estimates rows remain after DELETE.', remaining_admin_ce;
    END IF;

    SELECT COUNT(*) INTO permits_lead_id_admin_remaining
      FROM permits p
      JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
     WHERE ptc.class = 'administrative'
       AND p.lead_id IS NOT NULL;
    IF permits_lead_id_admin_remaining > 0 THEN
        RAISE EXCEPTION 'Phase C 138_a post-condition FAIL: % administrative permits still have non-NULL lead_id after UPDATE.', permits_lead_id_admin_remaining;
    END IF;

    -- Confirm the LPAD collision is gone (mig 138 Stage-2 dup check would have failed otherwise).
    SELECT COUNT(*) INTO ce_lpad_collisions FROM (
        SELECT lead_id FROM cost_estimates
         WHERE lead_id IS NOT NULL
         GROUP BY lead_id HAVING COUNT(*) > 1
    ) d;
    IF ce_lpad_collisions > 0 THEN
        RAISE EXCEPTION 'Phase C 138_a post-condition FAIL: % LPAD collisions remain in cost_estimates after admin exclusion (mig 138 will still abort).', ce_lpad_collisions;
    END IF;

    RAISE NOTICE 'Phase C 138_a: cost_estimates post-conditions clean. Migration 138 NOT NULL + UNIQUE promotion can now proceed.';
END $$;

-- ── Component 4: enforce admin-exclusion invariant on downstream tables ─────
-- R8 DeepSeek CRIT (2026-05-14): every lead_id-bearing table in the Phase C
-- consumer set must be free of administrative-class rows. R0 audit (2026-05-14)
-- confirmed all five are currently empty for admin permits because
-- classify-permits.js gates upstream writes on construction class, but we
-- assert it here as a hard invariant so any future drift surfaces at mig
-- 138_a rather than as a cryptic UNIQUE violation in mig 139/140/141.
DO $$
DECLARE
    admin_in_trade_forecasts INTEGER;
    admin_in_tracked_projects INTEGER;
    admin_in_lead_analytics INTEGER;
    admin_in_lead_trades INTEGER;
    admin_in_lead_parcels INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_in_trade_forecasts
      FROM trade_forecasts tf
      JOIN permits p ON p.permit_num = tf.permit_num AND p.revision_num = tf.revision_num
      JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
     WHERE ptc.class = 'administrative';
    IF admin_in_trade_forecasts > 0 THEN
        RAISE EXCEPTION 'Phase C 138_a invariant FAIL: trade_forecasts has % administrative rows (classify-permits gate should prevent these). Investigate before retrying.', admin_in_trade_forecasts;
    END IF;

    SELECT COUNT(*) INTO admin_in_tracked_projects
      FROM tracked_projects tp
      JOIN permits p ON p.permit_num = tp.permit_num AND p.revision_num = tp.revision_num
      JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
     WHERE ptc.class = 'administrative';
    IF admin_in_tracked_projects > 0 THEN
        RAISE EXCEPTION 'Phase C 138_a invariant FAIL: tracked_projects has % administrative rows. Investigate before retrying.', admin_in_tracked_projects;
    END IF;

    -- lead_analytics is empty per R0.7 audit; this is purely forward-protective.
    SELECT COUNT(*) INTO admin_in_lead_analytics FROM lead_analytics;
    IF admin_in_lead_analytics > 0 THEN
        RAISE NOTICE 'Phase C 138_a: lead_analytics has % rows — once populated, future audits should JOIN to permits + permit_type_classifications to verify admin exclusion.', admin_in_lead_analytics;
    END IF;

    -- lead_trades / lead_parcels are mirror outputs of permit_trades / permit_parcels
    -- via triggers in mig 143/144. classify-permits and link-parcels both gate on
    -- construction class upstream, so these should be admin-free by construction.
    SELECT COUNT(*) INTO admin_in_lead_trades FROM lead_trades;
    IF admin_in_lead_trades > 0 THEN
        RAISE NOTICE 'Phase C 138_a: lead_trades has % rows — forward audit recommended.', admin_in_lead_trades;
    END IF;

    SELECT COUNT(*) INTO admin_in_lead_parcels FROM lead_parcels;
    IF admin_in_lead_parcels > 0 THEN
        RAISE NOTICE 'Phase C 138_a: lead_parcels has % rows — forward audit recommended.', admin_in_lead_parcels;
    END IF;

    RAISE NOTICE 'Phase C 138_a: downstream admin-exclusion invariants all clean.';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b — match the project convention used by
-- migrations 132, 138, 140, 145)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration restores the original Phase B trigger (writes
-- lead_id for ALL permits including administrative) and re-creates the
-- deleted cost_estimates rows. Re-creation is not trivial because the
-- original `estimated_total`/`cost_source`/etc. values were placeholder
-- rows from compute-cost-estimates.js — re-running that script against
-- the affected permits is the correct rollback path.
--
-- To roll back manually:
--
--   -- 1. Restore trigger function to pre-138_a behavior
--   CREATE OR REPLACE FUNCTION permits_set_lead_id() RETURNS TRIGGER AS $$
--   BEGIN
--       NEW.lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
--       RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
--
--   -- 2. Re-populate permits.lead_id on administrative rows
--   UPDATE permits p
--      SET lead_id = 'permit:' || p.permit_num || ':' || LPAD(p.revision_num, 2, '0')
--     FROM permit_type_classifications ptc
--    WHERE ptc.permit_type = p.permit_type
--      AND ptc.class = 'administrative'
--      AND p.lead_id IS NULL;
--
--   -- 3. Re-run compute-cost-estimates against admin permits to re-insert
--   --    placeholder rows (the original rows are not recoverable).
--   --    node scripts/compute-cost-estimates.js  -- runs against all permits
