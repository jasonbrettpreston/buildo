-- 290: resolve_bylaws -- the bylaw_resolution_lots evidence_kinds closed-set check admits null slots (CHAT-101.MIG-290, operator-ruled 2026-10-23).
--
-- McDonald's Airtight V3 (Spec 132 §core.12 (R-CT); R-EU). Migration 282 is APPLIED on the local DB, and an applied migration is never edited
-- (migrate.js skips a changed checksum and --verify reports DRIFT; precedent: 286's header), so the fix is this new migration.
-- Defect: evidence_kinds holds one slot per result (cardinality 53); a result that is not `applies` has no evidence, so its slot is NULL
-- (scripts/lib/bylaw-materialize.js:154,165). In Postgres `ARRAY[0, NULL] <@ ARRAY[0,1,2,3,4]` is false, so 282's check rejected every lot row.
-- Red evidence: docs/reports/red-evidence/resolve_bylaws/mig290-evidence-kinds-null-red.json (migration.db.test.ts, 1 failed / 5 passed).
-- Only this check is affected: codes and permitted carry no null slots; no other 282 check uses <@ on a nullable-element array.
-- Number 290 skips the reserved 287 (P3 parcel_maxbld_scenarios), 288 (ALPD), 289 (RLS, CHAT-99).
--
-- Idempotent: DROP CONSTRAINT IF EXISTS, then ADD. The non-null codes stay closed to 0..4 exactly as 282 meant.
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md (§3, option 4)
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-EU)

-- UP
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_evidence_kinds_closed;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_evidence_kinds_closed
  CHECK (evidence_kinds IS NULL OR array_remove(evidence_kinds, NULL) <@ ARRAY[0, 1, 2, 3, 4]::smallint[]);

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_evidence_kinds_closed;
-- ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_evidence_kinds_closed CHECK (evidence_kinds IS NULL OR evidence_kinds <@ ARRAY[0, 1, 2, 3, 4]::smallint[]);
