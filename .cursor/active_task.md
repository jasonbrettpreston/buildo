# Active Task: Fix FTS Index Truncation + Standardize Timestamps to TIMESTAMPTZ
**Status:** Green Light — awaiting WF6
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix 2 bugs: (1) Drizzle schema.ts has a truncated FTS index definition that would cause a syntax error if ever pushed; (2) 30 timestamp columns across 17 tables use `TIMESTAMP` instead of `TIMESTAMPTZ`, creating a timezone trap for Cloud SQL deployment.
* **Target Spec:** `docs/specs/00_engineering_standards.md` §3.1 (Zero-Downtime Migration), §3.2 (Migration Rollback Safety)
* **Key Files:**
  - `src/lib/db/generated/schema.ts` — truncated FTS index on line 526
  - `migrations/054_standardize_timestamptz.sql` — new migration
  - 17 tables with 30 TIMESTAMP columns to convert

## Technical Implementation
* **Bug 1 (FTS):** Re-run `npm run db:generate` after fixing timestamps — the regenerated schema will pick up the corrected index from the live DB. If drizzle-kit still truncates, manually patch line 526.
* **Bug 2 (Timestamps):** `ALTER COLUMN ... TYPE TIMESTAMPTZ` is metadata-only in PostgreSQL (no row rewrite when converting from TIMESTAMP). Safe on 237K+ row tables.
* **Database Impact:** YES — ALTER COLUMN TYPE on 17 tables (30 columns). No row rewrite. No backfill needed.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** Verify `npm run typecheck` passes after db:generate; verify timestamps are TIMESTAMPTZ in DB
* **logError Mandate:** N/A
* **Mobile-First:** N/A — backend-only

## §10 Plan Compliance Checklist

### If Database Impact = YES:
- [x] UP + DOWN migration in `migrations/054_standardize_timestamptz.sql` (§3.2)
- [x] Backfill strategy: N/A — ALTER TYPE TIMESTAMPTZ is metadata-only, no row rewrite (§3.1)
- [x] `src/tests/factories.ts` — no new fields, timestamp types unchanged in TS (§5.1)
- [x] `npm run typecheck` planned after `db:generate` (§8.2)

### If API Route Created/Modified:
- ⬜ N/A all sub-items

### If UI Component Created/Modified:
- ⬜ N/A all sub-items

### If Shared Logic Touched:
- ⬜ N/A all sub-items

### If Pipeline Script Created/Modified:
- ⬜ N/A all sub-items

## Execution Plan
- [ ] **Rollback Anchor:** `eef8e72`
- [ ] **State Verification:** 30 TIMESTAMP columns confirmed across 17 tables. FTS index truncation confirmed on schema.ts:526. Live DB has correct index.
- [ ] **Spec Review:** §3.1 zero-downtime pattern applies, but ALTER TYPE timestamp→timestamptz is metadata-only in PostgreSQL (no table rewrite). §3.2 requires UP+DOWN.
- [ ] **Reproduction:** Query DB to confirm mixed TIMESTAMP/TIMESTAMPTZ. Read schema.ts:526 to confirm truncation.
- [ ] **Red Light:** N/A — these are DB-layer bugs, not testable via vitest. Verification is via psql + db:generate.
- [ ] **Fix:**
  1. Write `migrations/054_standardize_timestamptz.sql` with UP (ALTER all 30 columns) + DOWN (ALTER back to TIMESTAMP)
  2. Run `npm run migrate`
  3. Run `npm run db:generate` to regenerate schema.ts + relations.ts (fixes FTS truncation too)
  4. Run `npm run typecheck`
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.

## Tables & Columns (30 TIMESTAMP → TIMESTAMPTZ)
| Table | Columns |
|-------|---------|
| permits | first_seen_at, last_seen_at, geocoded_at |
| permit_history | changed_at |
| sync_runs | started_at, completed_at |
| trades | created_at |
| trade_mapping_rules | created_at |
| permit_trades | classified_at |
| builders | first_seen_at, last_seen_at, enriched_at |
| builder_contacts | created_at |
| coa_applications | first_seen_at, last_seen_at |
| notifications | sent_at, created_at |
| parcels | created_at |
| permit_parcels | linked_at |
| neighbourhoods | created_at |
| building_footprints | created_at |
| parcel_buildings | linked_at |
| entities | first_seen_at, last_seen_at, last_enriched_at |
| entity_projects | observed_at |
| wsib_registry | matched_at, first_seen_at, last_seen_at |
| permit_inspections | scraped_at, created_at |
