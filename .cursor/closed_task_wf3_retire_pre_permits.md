# Active Task: WF3 — retire 147 zombie PRE-permits via one-shot cleanup migration
**Status:** Implementation (v2 — reviewers ESCALATEd: comprehensive child-table audit completed; `lifecycle_status_history` HIGH fold from DeepSeek; cascade-table noise retained per original Phase G v2-Q1 "no reliance on CASCADE" precedent)
**Workflow:** WF3 — per-finding fix from Spec 79 SUMMARY.md (CRIT-2; user authorized 2026-05-19; + Independent + DeepSeek)
**Domain Mode:** Backend/Pipeline

---

## Context

* **Goal:** Eliminate 147 zombie `permit_type='Pre-Permit'` rows + their dependent child rows so that `assert-data-bounds.js` Phase G retirement gate (`permits_pre_permit_count == 0`) passes.
* **Surfaced by:** Spec 79 permits chain Step 19 (2026-05-19) — `permits_pre_permit_count=147` (threshold `== 0`) → `FAIL`; script exits 1.
* **Target Spec:** Spec 42 §6.11 row "Phase G" (PRE-permit retirement) — gate is correct; data state diverges from spec.

## Provenance (verified on local DB 2026-05-19)

### Parent table

| Property | Value |
|----------|-------|
| `COUNT(*) WHERE permit_type='Pre-Permit'` | 147 |
| Distinct `permit_type` values starting with PRE | only `'Pre-Permit'` (147 rows) |
| `status` distribution | 146 `Closed`, 1 `Pending Closed` |
| `first_seen_at` range | 2026-03-17 → 2026-05-07 |
| `last_seen_at` range | 2026-03-17 → 2026-05-07 |

### Complete child-table audit (FK-discovered + lead_id-keyed sweep)

| Table | Key | FK on permits | PRE-% rows | Cleanup mechanism |
|-------|-----|---------------|------------|-------------------|
| `permit_trades` | `permit_num` | **none** (FK was dropped/never-applied) | 913 | **explicit DELETE required** |
| `permit_parcels` | `permit_num` | **none** | 45 | **explicit DELETE required** |
| `permit_phase_transitions` | `permit_num` | CASCADE | 294 | CASCADE handles + explicit DELETE for observability (Phase G v2-Q1 precedent) |
| `permit_history` | `permit_num` | CASCADE | 0 | CASCADE handles + explicit no-op DELETE |
| `permit_products` | `permit_num` | CASCADE | 0 | CASCADE handles + explicit no-op DELETE |
| `cost_estimates` | `permit_num` + `lead_id` | CASCADE | 0 | CASCADE handles + explicit no-op DELETE (v2 add) |
| `lead_views` | `permit_num` | CASCADE | 0 | CASCADE handles + explicit no-op DELETE (v2 add) |
| `entity_projects` | `permit_num` | **none** on current DB (mig 057 not applied) | 0 | no DELETE needed |
| `lifecycle_status_history` | `lead_id` | none (Phase I.1.1b independent table) | **147** | **explicit DELETE required (DeepSeek HIGH fold)** |
| `lifecycle_transitions` | `lead_id` | none | 0 | explicit no-op DELETE |
| `lead_trades` | `lead_id` | none (Phase C dual-write target) | 0 | explicit no-op DELETE |
| `lead_parcels` | `lead_id` | none | 0 | explicit no-op DELETE |
| `tracked_projects` | `lead_id` | none | 0 | explicit no-op DELETE |

**Total rows to be deleted:** 147 (permits) + 913 (permit_trades) + 45 (permit_parcels) + 294 (permit_phase_transitions) + 147 (lifecycle_status_history) = **1,546 rows across 5 tables.**

**v2 changes from v1:**
- DeepSeek HIGH: ADDED `lifecycle_status_history` — Phase I.1.1b table (postdates Phase G shim) holds **147 PRE-keyed rows that the original shim couldn't have known about**. Confirmed via direct query.
- Independent HIGH (cost_estimates / lead_views / entity_projects): NO PRE rows on current DB; CASCADE handles cost_estimates + lead_views automatically; entity_projects FK from mig 057 is not present on this DB. Adding explicit no-op DELETEs for cost_estimates + lead_views matches the Phase G v2-Q1 "no reliance on CASCADE" precedent (observability via row counts in audit).
- Independent LOW (redundancy): Retained explicit no-op DELETEs because the original shim used this pattern by design (Phase G v2-Q1) — operator can confirm zero from the migration's `RAISE NOTICE` rather than reading FK semantics from schema docs.

### FK survey (information_schema.referential_constraints)

```
cost_estimates.{permit_num,revision_num}        → CASCADE
lead_views.{permit_num,revision_num}            → CASCADE
permit_history.{permit_num,revision_num}        → CASCADE
permit_phase_transitions.{permit_num,revision_num} → CASCADE
permit_products.{permit_num,revision_num}       → CASCADE
```

Notably absent from FK list: `permit_trades`, `permit_parcels`, `entity_projects`, `lifecycle_status_history`, `lifecycle_transitions`, `lead_trades`, `lead_parcels`, `tracked_projects` — these have no FK constraint on the current DB, so explicit DELETE is the only mechanism.

## Root cause

Phase G was a two-commit cutover (`3944f88` + `0de4cab`):

* Commit 1 (`3944f88` — 2026-04-29): converted `scripts/create-pre-permits.js` from a speculative-creation shim into a one-shot **DELETE** shim. Manifest still listed it so the next chain run would wipe Pre-Permits in any DB.
* Commit 2 (`0de4cab` — 2026-04-29): `git rm`'d the shim file + removed from manifest under the assumption that all DBs had run the chain once between commit 1 and commit 2.

This DB's CoA chain did not run in that window. The DELETE shim is gone, so there is no automated path to clear the 147 zombies. Result: assert-data-bounds Phase G gate fires `FAIL` on every run.

**Forward-creation risk:** None. The PRE-creation code path was removed in commit 1; the chain no longer writes PRE-% rows.

## Proposed fix — migration 157 (one-shot cleanup, v2)

Create `migrations/157_retire_pre_permits.sql` that performs the same multi-table DELETE the retired shim performed, plus the Phase I.1.1b `lifecycle_status_history` table that postdates the shim, in one transaction, children before parent:

```sql
-- migrations/157_retire_pre_permits.sql
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 row "Phase G" (PRE-permit retirement)
-- SPEC LINK: docs/specs/01-pipeline/79_pipeline_step_validation.md (Step 19 CRIT-2 trigger)
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md (Phase I.1.1b lifecycle_status_history)
--
-- Surfaced by Spec 79 permits chain Step 19 (2026-05-19):
-- assert-data-bounds.js reported permits_pre_permit_count=147 (threshold == 0) → FAIL.
--
-- ROOT CAUSE: Phase G's one-shot DELETE shim (scripts/create-pre-permits.js, commit 3944f88)
-- was git-rm'd in commit 0de4cab before this DB's CoA chain ran it. The shim is gone, so
-- there is no automated path to remove the 1,546 zombie rows (147 parents + 913 + 45 + 294
-- + 147 children verified 2026-05-19 via complete FK + lead_id child-table audit).
--
-- Phase G's original shim couldn't have included lifecycle_status_history because that
-- table was introduced later (Phase I.1.1b, commit 73b257b). This migration adds it.
--
-- This migration performs an extended multi-table DELETE, in one transaction, children
-- before parent. CASCADE-protected children (cost_estimates, lead_views, permit_history,
-- permit_products, permit_phase_transitions) are explicitly DELETEd despite the CASCADE
-- because the original Phase G v2-Q1 design ("no reliance on CASCADE") required per-table
-- row counts in audit_table; preserving that here via RAISE NOTICE.
--
-- IDEMPOTENT: Re-running on a clean DB deletes 0 rows. No-op safe.
-- IRREVERSIBLE: PRE-% data is speculative substrate and Phase G design treats deletion as
-- terminal per Spec 42 §6.11. DOWN section is comment-only.

-- ============================================================================
-- UP
-- ============================================================================
DO $$
DECLARE
  v_parent_count               int;
  v_lead_trades                int;
  v_lead_parcels               int;
  v_tracked_projects           int;
  v_lifecycle_transitions      int;
  v_lifecycle_status_history   int;
  v_permit_history             int;
  v_permit_products            int;
  v_permit_phase_transitions   int;
  v_cost_estimates             int;
  v_lead_views                 int;
  v_permit_trades              int;
  v_permit_parcels             int;
  v_permits_deleted            int;
BEGIN
  SELECT COUNT(*) INTO v_parent_count FROM permits WHERE permit_type = 'Pre-Permit';
  RAISE NOTICE 'mig 157: % Pre-Permit parent rows present before DELETE', v_parent_count;

  -- lead_id-keyed children (Phase C dual-write targets + Phase I.1.1b history)
  WITH d AS (DELETE FROM lead_trades            WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lead_trades             FROM d;
  WITH d AS (DELETE FROM lead_parcels           WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lead_parcels            FROM d;
  WITH d AS (DELETE FROM tracked_projects       WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_tracked_projects        FROM d;
  WITH d AS (DELETE FROM lifecycle_transitions  WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lifecycle_transitions   FROM d;
  WITH d AS (DELETE FROM lifecycle_status_history WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lifecycle_status_history FROM d;

  -- permit_num-keyed children (FK CASCADE-protected per FK survey 2026-05-19, but
  -- explicit DELETE preserves Phase G v2-Q1 observability precedent)
  WITH d AS (DELETE FROM permit_history           WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_history           FROM d;
  WITH d AS (DELETE FROM permit_products          WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_products          FROM d;
  WITH d AS (DELETE FROM permit_phase_transitions WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_phase_transitions FROM d;
  WITH d AS (DELETE FROM cost_estimates           WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_cost_estimates           FROM d;
  WITH d AS (DELETE FROM lead_views               WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lead_views               FROM d;

  -- permit_num-keyed children (NO FK, must precede parent)
  WITH d AS (DELETE FROM permit_trades            WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_trades            FROM d;
  WITH d AS (DELETE FROM permit_parcels           WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_parcels           FROM d;

  -- Parent
  WITH d AS (DELETE FROM permits                  WHERE permit_type = 'Pre-Permit' RETURNING 1) SELECT COUNT(*) INTO v_permits_deleted          FROM d;

  RAISE NOTICE 'mig 157 deletions: permits=% permit_trades=% permit_parcels=% permit_history=% permit_products=% permit_phase_transitions=% cost_estimates=% lead_views=% lead_trades=% lead_parcels=% tracked_projects=% lifecycle_transitions=% lifecycle_status_history=%',
    v_permits_deleted, v_permit_trades, v_permit_parcels, v_permit_history, v_permit_products, v_permit_phase_transitions,
    v_cost_estimates, v_lead_views, v_lead_trades, v_lead_parcels, v_tracked_projects, v_lifecycle_transitions, v_lifecycle_status_history;

  IF v_permits_deleted != v_parent_count THEN
    RAISE EXCEPTION 'mig 157 sanity: deleted % parents but expected %', v_permits_deleted, v_parent_count;
  END IF;
END$$;

-- ============================================================================
-- DOWN — comment-only per Rule 6
-- ============================================================================
-- IRREVERSIBLE: PRE-permit retirement is one-way per Spec 42 §6.11.
-- DOWN is intentionally empty.
```

**Why DO block instead of plain BEGIN/COMMIT:**
- Independent LOW raised concern about double-wrapped transactions if migrate.js already opens one. The DO block runs in a single implicit transaction (PostgreSQL guarantee), avoiding BEGIN/COMMIT ambiguity.
- Per-table RAISE NOTICE counts preserve the Phase G v2-Q1 observability precedent (`audit_table.rows` in the original shim) without needing a separate audit-table emission path inside a migration.
- The sanity-check `IF v_permits_deleted != v_parent_count` provides built-in regression protection: if anything writes new PRE-Permit rows concurrently between the count and the DELETE, the migration raises and rolls back the whole DO block.

### Why a migration and not a restored shim?

| Option | Pros | Cons |
|--------|------|------|
| Restore shim as scripts/`one-shot/...` | Matches original Phase G design | Operator-discipline-dependent; no invocation tracking; recreates the deleted file the chain no longer expects |
| Migration 157 (this plan) | Tracked in `schema_migrations`; runs idempotently in any DB at next deploy; no operator step needed; aligns with mig 156's "stale state needs catch-up" pattern | Slight design-departure from Spec 42 §6.11 "shim" wording |
| Manual psql | Fastest | No track record; doesn't help fresh-staging or other future DBs that may also be in this state |

→ Migration 157 wins on per-environment idempotency. Spec 42 §6.11 is documentation; the operational mechanism (shim vs migration) is implementation choice as long as the gate passes.

## Test plan

1. **Regression-lock test** (`migration-157-retire-pre-permits.infra.test.ts`):
   - `BEGIN` + `COMMIT` present (multi-table DELETE atomicity)
   - All 10 DELETE statements present, in correct order (lead_id children → permit_num children → parent)
   - Parent DELETE comes last
   - DOWN section comment-only
   - SPEC LINK header references Spec 42 §6.11 + Spec 79
2. **Apply migration directly via psql** (same path mig 156 took; `npm run migrate` halted at 148 + record in `schema_migrations`)
3. **Verify:** re-run `node scripts/quality/assert-data-bounds.js` — `permits_pre_permit_count` row must show `value=0, status=PASS`; script exits 0

## Standards Compliance

* **Spec 42 §6.11 row "Phase G":** retirement gate; this fix achieves the post-state the spec expects
* **§3 Zero-Downtime Migration Pattern:** DELETE-only on parent + children with PRE-% prefix; no schema change; concurrent writes to non-PRE rows unaffected (CoA + permits chains write `Building Permit`/`Demolition Permit`/etc., never `Pre-Permit` post-3944f88)
* **Operating Boundaries:** see below
* **Spec 47 §10 (one-shot migration safety):** idempotent — re-applying deletes 0 rows on clean DB

## Execution Plan

- [x] Spec touchpoint: Spec 42 §6.11 + Spec 79
- [x] Reproduction: verified 147 parents + 1,252 children via DB query 2026-05-19
- [ ] **Red Light:** regression-lock test asserting migration 157 shape
- [ ] **Implementation:** create `migrations/157_retire_pre_permits.sql`
- [ ] Multi-Agent Review: Independent + DeepSeek
- [ ] **Apply migration:** run directly via psql (mirror mig 156 procedure)
- [ ] **Verify:** re-run `node scripts/quality/assert-data-bounds.js` — gate passes
- [ ] Green Light: typecheck + tests + Phase G gate verified
- [ ] WF6 close-out: commit + archive

## Operating Boundaries

* **Target files:** `migrations/157_retire_pre_permits.sql` (new file, ~30 LOC) + 1 regression-lock test
* **Out-of-scope:**
  - Investigating the 1,341 `ghost_permits_30d` WARN (MED-5; separate finding)
  - Investigating the `null_status_24h=2` WARN (separate)
  - Restoring `scripts/create-pre-permits.js` (deliberately retired)
  - Updating spec documentation for the migration-not-shim choice (separate doc-WF if needed)
  - Adding a `permit_type` CHECK constraint to block future PRE writes (defensive; out of scope — Phase G already removed the write path)
