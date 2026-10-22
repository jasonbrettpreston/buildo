-- 281: coa_applications.ward is two digits ('03') — COA-D17 (CHAT-38.D-WARD, operator y 2026-10-21).
--
-- The CoA load step (scripts/lib/compute/load-coa.js normalizeWard) now writes the ward as two digits. CKAN's Active and
-- Closed resources published '3' and '03' for the same ward, so grouping by ward split one ward in two. This backfills the
-- rows already stored (measured read-only 2026-10-21: 12,998 rows hold '1'..'9'; 36 other forms are already two digits).
--
-- APPLIED 2026-10-22 (Night A; npm run migrate). Data-only, idempotent (a second run matches 0 rows),
-- no DDL. data_hash is deliberately NOT written (JS-computed over the mapped record): the next load recomputes the hash
-- with the padded ward and rewrites each of those rows once (the measured re-upsert of Spec 132 ingestor.6; the Closed
-- resource rows only on a --full run).
--
-- SPEC LINK: docs/specs/01-pipeline/51_source_coa.md §3; docs/reports/defect-ledger.md COA-D17

-- UP
UPDATE coa_applications SET ward = lpad(ward, 2, '0') WHERE ward ~ '^[0-9]$';

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159). Lossy: cannot tell which rows were
-- '3' and which were '03' before the backfill, so none is attempted.
