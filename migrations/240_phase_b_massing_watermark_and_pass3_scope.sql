-- 240: Phase B B2 — the massing-enrichment watermark (D1') + the pass-3 scope table (D4').
-- FK-EXEMPT: enrich_parcels_pass3_scope.run_id points at prunable pipeline_runs rows (mig 237)
--   and parcel_id at a 486K-row table where the FK adds per-DELETE cost for a scratch set its
--   own cleanup rule already bounds. Rationale in full under "2. enrich_parcels_pass3_scope".
--
-- WHY THIS EXISTS
-- enrich-parcels could not see massing-driven change. Its incremental predicate had no way to
-- ask "did this parcel's building links move since I last enriched it?", so a new massing
-- vintage could only be picked up by a citywide recompute — which is precisely why the sources
-- chain was pinned to --full and then could not finish inside its 210-minute budget (founding
-- incident: run 2179, a 180-minute kill). D1' gives the pass a real watermark; D4' gives pass 3
-- a crash-safe scope hand-off to pass 5.
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 (max-build / massing passes)
-- SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (enrich_parcels step)
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B default-deny)
--
-- ── 1. parcels.massing_enriched_at (D1') ───────────────────────────────────────────────────
-- Nullable TIMESTAMPTZ. The enrich pass stamps it in the SAME transaction as the work it
-- represents (never before — Phase B "Idempotency" ruling), and the incremental predicate
-- becomes `massing_enriched_at IS NULL OR EXISTS (SELECT 1 FROM parcel_buildings pb
-- WHERE pb.parcel_id = p.id AND pb.linked_at > p.massing_enriched_at)`.
-- The probe is index-supported by the EXISTING idx_parcel_buildings_parcel (btree on
-- parcel_id) — verified against the live table, so NO new parcel_buildings index is created
-- here (Phase B round-3 Int F6 ruling; a second index on a 520K-row table earns nothing).
--
-- Backfill = per-parcel MAX(linked_at). Measured premise (dev DB 2026-08-10): ZERO parcels
-- currently have more than one distinct linked_at — one full relink stamped them all — so MAX
-- is future-proofing for the incremental-relink era, not a day-one correction. Parcels with no
-- parcel_buildings row backfill to NULL and form a bounded first-run scope (1,395 on dev;
-- ~11.3K on cloud, which carries more parcels) — that is what the partial index below serves.
--
-- On batching (Phase B round-3 Int F4/F5): "backfill BATCHED (~50K/batch — migrate.js has NO
-- statement_timeout override; single-statement dies at 2 min)". That ruling is MEASURED-CORRECT
-- and is implemented literally below. A single-statement backfill of this table takes
-- **94.06 s** against the dev DB (485,135 rows) — only ~26 s under the 2-minute cloud ceiling,
-- on a box carrying FEWER parcels than cloud (486,530 vs 496,422) and against the same heap the
-- round-3 panel measured as bloated (dead_ratio 0.64-0.73). A single statement would run that
-- gap down to nothing. Batches of ~50K rows land at ~10 s each — an order of magnitude of head-
-- room per statement, which is the whole point (statement_timeout is enforced PER STATEMENT,
-- verified: two 250 ms sleeps survive a 300 ms timeout in one multi-statement message).
--
-- Batched by ROW COUNT (LIMIT 50000), not by id range: parcel ids are sparse (min 1, max
-- 1,944,530 for 486,530 rows), so equal id-spans carry wildly unequal row counts and would need
-- ~39 statements to cover the space. `~50K/batch` is what the panel actually specified; a
-- row-count batch honours it exactly and is insensitive to id distribution. Each statement is
-- self-terminating (it updates only rows still differing) and idempotent, so the fixed list
-- below is safe to over-provision — surplus statements simply update 0 rows.
--
-- SET LOCAL statement_timeout is kept as DEFENCE IN DEPTH, not as the mechanism. It does
-- genuinely override a session timeout mid-transaction (verified: a 1 s sleep survives a 200 ms
-- session timeout under SET LOCAL, and is cancelled without it), but relying on it alone would
-- stake the whole cloud apply on one override behaving identically through Supabase's role and
-- pooler config. Batching does not care whether the override lands. lock_timeout follows
-- 169/172: a migration must never sit blocking the deploy behind someone else's lock.
--
-- ── 2. enrich_parcels_pass3_scope (D4') ────────────────────────────────────────────────────
-- Pass 3 computes a parcel set that pass 5 must consume. Holding it in memory loses it on a
-- crash between the two; holding it in a run-agnostic table lets a crashed run's set leak into
-- a later run's pass 5. So: keyed by (run_id, parcel_id) with an explicit consumed marker.
-- Pass 5 unions its own run's scope with any UNCONSUMED prior scope, which is what makes a
-- crash between scope-write and pass-5 read recoverable instead of silently lossy.
--
-- Deliberately LOGGED, not UNLOGGED: an UNLOGGED table is truncated on crash recovery, which
-- would destroy exactly the unconsumed-scope evidence this table exists to preserve.
--
-- Deliberately NO foreign keys (validate-migration.js Rule 5 will emit its non-blocking
-- FK-signature warning — this comment is the answer): run_id would point at pipeline_runs,
-- whose rows are prunable (migration 237), and parcel_id at a 486K-row table where the FK adds
-- per-DELETE overhead for a scratch set that its own cleanup rule already bounds.
--
-- backup-db EXCLUDED_TABLES ruling (the plan asked for one): NOT excluded. EXCLUDED_TABLES
-- lives in scripts/validation/supabase-load-gates.js:52 and is pinned by an exact toEqual at
-- src/tests/restore-db.logic.test.ts:515 — editing it is a deliberate lock edit that B2 was not
-- authorized to make, and it buys nothing: the table is DELETE+INSERTed per run inside the
-- enrich transaction and is empty or near-empty at rest, so including it in a diff/load is
-- both harmless and marginally better for restore parity.

-- UP
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

ALTER TABLE parcels ADD COLUMN IF NOT EXISTS massing_enriched_at TIMESTAMPTZ;

COMMENT ON COLUMN parcels.massing_enriched_at IS
  'Phase B D1'': watermark for the massing/max-build enrichment pass. Compared against MAX(parcel_buildings.linked_at) to detect massing-driven change; NULL means never enriched (first-run scope). Written in the same transaction as the work it represents.';

-- Backfill, ~50K rows per statement (Int F4/F5). 485,135 rows need 10 batches; 12 are written
-- for headroom against cloud's larger parcel count. Each is identical, self-terminating and
-- idempotent — once no rows differ, the remainder update 0 and cost only the 244 ms aggregate.
-- Deliberately repeated rather than looped: a DO block is ONE statement to the server, which
-- would put the entire backfill back under a single statement_timeout and defeat the batching.
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;
UPDATE parcels p SET massing_enriched_at = b.max_linked_at
  FROM (SELECT p2.id, pb.max_linked_at
          FROM parcels p2
          JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
            ON pb.parcel_id = p2.id
         WHERE p2.massing_enriched_at IS DISTINCT FROM pb.max_linked_at
         LIMIT 50000) b
 WHERE b.id = p.id;

-- Backfill completeness gate: if 12×50K did not finish the job (cloud grew past 600K parcels),
-- FAIL the migration rather than leave a silently half-stamped watermark — a partial backfill
-- would make the D1' predicate treat stamped-but-stale parcels as up to date.
DO $$
DECLARE remaining BIGINT;
BEGIN
  SELECT COUNT(*) INTO remaining
    FROM parcels p
    JOIN (SELECT parcel_id, MAX(linked_at) AS max_linked_at FROM parcel_buildings GROUP BY parcel_id) pb
      ON pb.parcel_id = p.id
   WHERE p.massing_enriched_at IS DISTINCT FROM pb.max_linked_at;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'migration 240: backfill incomplete — % parcels still unstamped. Add more 50K batch statements and re-run.', remaining;
  END IF;
END $$;

-- Serves the first-run / never-enriched scope. Partial, so it indexes only the small NULL set
-- (1,395 dev / ~11.3K cloud) rather than all 486K rows, and shrinks toward empty as the pass
-- stamps parcels. Not CONCURRENTLY: migrate.js runs each file inside a transaction, where
-- CONCURRENTLY is illegal; `parcels` is not in validate-migration.js's LARGE_TABLES list.
CREATE INDEX IF NOT EXISTS idx_parcels_massing_enriched_at_null
  ON parcels (id)
  WHERE massing_enriched_at IS NULL;

CREATE TABLE IF NOT EXISTS enrich_parcels_pass3_scope (
  run_id      INTEGER     NOT NULL,
  parcel_id   INTEGER     NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, parcel_id)
);

COMMENT ON TABLE enrich_parcels_pass3_scope IS
  'Phase B D4'': the parcel set pass 3 hands to pass 5, keyed by run_id with an explicit consumed marker so a crash between scope-write and pass-5 read is recoverable (pass 5 unions unconsumed prior scopes). Written in-transaction with the enrich work; cleaned per the retention rule in enrich-parcels.js.';

-- Pass 5's recovery read is "unconsumed rows, any run" — this partial index serves exactly
-- that predicate and stays tiny because the normal path marks rows consumed immediately.
CREATE INDEX IF NOT EXISTS idx_pass3_scope_unconsumed
  ON enrich_parcels_pass3_scope (run_id)
  WHERE consumed_at IS NULL;

-- Spec 114 §4 Class B (mig 227 pattern): ENABLE ROW LEVEL SECURITY with ZERO policies is a
-- total, uniform deny for anon/authenticated. The pipeline's raw `pg` connections are the table
-- owner and RLS-exempt, so this is zero-behaviour-change.
ALTER TABLE enrich_parcels_pass3_scope ENABLE ROW LEVEL SECURITY;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert:
--   DROP TABLE IF EXISTS enrich_parcels_pass3_scope;
--   DROP INDEX IF EXISTS idx_parcels_massing_enriched_at_null;
--   ALTER TABLE parcels DROP COLUMN IF EXISTS massing_enriched_at;
-- Reverting also requires reverting enrich-parcels.js to the pre-D1' predicate: without the
-- column the massing arm of the incremental gate cannot evaluate, and without the scope table
-- pass 5 loses its crash-safe hand-off. Drop the column LAST — the partial index depends on it.
