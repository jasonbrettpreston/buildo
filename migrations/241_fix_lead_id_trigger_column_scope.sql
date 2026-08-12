-- 241: fix `trg_permits_lead_id` column scope + repair the administrative lead_id drift
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md (lead_id ecosystem)
-- Follows: migrations/132 (trigger install), migrations/138_a (administrative exclusion)
-- Severity: CRITICAL — silent, ongoing data corruption of the lead_id join key.
--
-- ============================================================================
-- THE DEFECT
-- ============================================================================
-- Migration 132 installed the trigger as:
--
--     BEFORE INSERT OR UPDATE OF permit_num, revision_num
--
-- and 138_a amended the FUNCTION to NULL `lead_id` for administrative-class
-- permits — but never touched the TRIGGER's column scope. Confirmed live
-- 2026-08-12: `pg_trigger.tgattr` = {permit_num, revision_num}.
--
-- A row's administrative-ness is a function of `permit_type`, which is ABSENT
-- from that column list — while `permit_type` IS in `load-permits.js`'s
-- `ON CONFLICT (permit_num, revision_num) DO UPDATE SET ...` list. So when CKAN
-- reclassifies a permit into an administrative type on re-ingest, the trigger
-- NEVER FIRES and the stale lead_id persists forever. For an existing row the
-- key columns are the PK and essentially never change, so the UPDATE path was
-- dead in practice: 138_a's exclusion only ever applied to fresh INSERTs.
--
-- Reproduced three times in rolled-back transactions, including a controlled
-- `permit_type` flip construction -> 'DCs DeferredFees' that left lead_id set.
-- (`tgenabled`/`tgtype` were red herrings — tgtype does NOT encode column
-- scoping; tgattr does.)
--
-- MEASURED IMPACT (cloud, 2026-08-12):
--   * 1,190 administrative rows carry a non-NULL lead_id
--   * 171 duplicate lead_id groups live in `permits` right now
--     (e.g. 'permit:20 202524 BLD:00' shared by the DCs stub and the real permit)
--   * 1,303 lifecycle_status_history rows sit under those colliding keys
--   * only 34 rows repo-wide have NULL lead_id, all 2026-vintage
--   * first-seen dates cluster Feb/Jun/Jul 2026 => ONGOING drift, not residue
--   * 138_a's own post-condition would RAISE EXCEPTION if re-run today
--
-- Corrupts lead_id-keyed joins into cost_estimates, trade_forecasts,
-- tracked_projects.
--
-- ============================================================================
-- WHY NOT AN UNSCOPED TRIGGER
-- ============================================================================
-- `BEFORE INSERT OR UPDATE` with no column list would fire on every row of the
-- nightly 257K-row upsert, adding a permit_type_classifications lookup per row.
-- Adding `permit_type` to the scope closes the measured drift path at no such
-- cost. It does NOT close the OTHER staleness path — reclassifying a row in
-- `permit_type_classifications` itself performs no `permits` UPDATE, so no
-- trigger of any scope can fire. That path is why Component 3 exists: an
-- invariant that only runs at apply time is exactly how 138_a passed and then
-- silently went false for months.

-- UP

BEGIN;

-- ---------------------------------------------------------------------------
-- Component 1: re-scope the trigger to include permit_type.
-- The FUNCTION (permits_set_lead_id, as amended by 138_a) is already correct
-- and is deliberately NOT redefined here.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_permits_lead_id ON permits;

CREATE TRIGGER trg_permits_lead_id
    BEFORE INSERT OR UPDATE OF permit_num, revision_num, permit_type
    ON permits
    FOR EACH ROW
    EXECUTE FUNCTION permits_set_lead_id();

-- ---------------------------------------------------------------------------
-- Component 2: repair the drift 138_a's Component 2 was supposed to leave
-- permanently true. Small and bounded (measured 1,190 rows) — unbatched, matching
-- 138_a's own precedent. Contrast migrations/240, where batching was required for
-- a 485K-row backfill; that ruling is about magnitude and does not reach here.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    drifted_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO drifted_count
      FROM permits p
      JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
     WHERE ptc.class = 'administrative'
       AND p.lead_id IS NOT NULL;
    RAISE NOTICE 'mig 241: % administrative rows carry a stale lead_id — repairing.', drifted_count;
END $$;

UPDATE permits p
   SET lead_id = NULL
  FROM permit_type_classifications ptc
 WHERE ptc.permit_type = p.permit_type
   AND ptc.class = 'administrative'
   AND p.lead_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Component 3: apply-time verification.
-- NOTE (the actual lesson): this check is NECESSARY BUT NOT SUFFICIENT. 138_a
-- carried the identical assertion, passed it at apply time, and went silently
-- false afterwards. The durable enforcement is the standing audit row emitted by
-- scripts/quality/assert-global-coverage.js (`lead_id_administrative_drift` and
-- `lead_id_duplicates`), which re-checks this on EVERY chain_permits run.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    remaining INTEGER;
    dupes INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining
      FROM permits p
      JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
     WHERE ptc.class = 'administrative'
       AND p.lead_id IS NOT NULL;
    IF remaining > 0 THEN
        RAISE EXCEPTION 'mig 241: % administrative rows still carry a lead_id after repair', remaining;
    END IF;

    SELECT COUNT(*) INTO dupes FROM (
        SELECT lead_id FROM permits
         WHERE lead_id IS NOT NULL
         GROUP BY lead_id HAVING COUNT(*) > 1
    ) d;
    IF dupes > 0 THEN
        RAISE WARNING 'mig 241: % duplicate lead_id groups remain in permits (not administrative-caused; see assert-global-coverage audit row)', dupes;
    ELSE
        RAISE NOTICE 'mig 241: zero duplicate lead_id groups remain.';
    END IF;
END $$;

COMMIT;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert the trigger scope:
--   DROP TRIGGER IF EXISTS trg_permits_lead_id ON permits;
--   CREATE TRIGGER trg_permits_lead_id
--       BEFORE INSERT OR UPDATE OF permit_num, revision_num
--       ON permits FOR EACH ROW EXECUTE FUNCTION permits_set_lead_id();
-- Component 2's repair is NOT reversible and MUST NOT be reverted: restoring the
-- administrative lead_ids would re-create the 171 duplicate lead_id groups this
-- migration exists to remove. If the trigger scope is rolled back, the drift simply
-- resumes from a clean baseline — which is why the standing audit rows in
-- scripts/quality/assert-global-coverage.js (`lead_id_administrative_drift`,
-- `lead_id_duplicate_groups`) are the durable guard, not this migration.
