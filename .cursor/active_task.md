# Active Task: Add entity_projects→permits FK + annotate sync_runs
**Status:** Implementation
**Rollback Anchor:** `a92b8c8`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** (1) Add missing composite FK from entity_projects(permit_num, revision_num) → permits(permit_num, revision_num). (2) Add clarifying comment to sync_runs in schema explaining its distinct purpose vs pipeline_runs.
* **Target Spec:** `docs/specs/37_corporate_identity_hub.md`
* **Key Files:**
  - `migrations/057_entity_projects_permit_fk.sql` — new FK constraint
  - `src/lib/db/generated/schema.ts` — regenerated after migration

## Technical Implementation
* **Migration 057:** `ALTER TABLE entity_projects ADD CONSTRAINT fk_entity_projects_permits FOREIGN KEY (permit_num, revision_num) REFERENCES permits(permit_num, revision_num)`
* **sync_runs:** NOT dropped — actively used by `src/lib/sync/process.ts` for per-run permit sync tracking. Add clarifying comment in schema.ts.
* **Database Impact:** YES — FK constraint on entity_projects (~45K rows). No data changes.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** N/A — FK is additive
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist

### If Database Impact = YES:
- [x] UP + DOWN migration in `migrations/057_entity_projects_permit_fk.sql` (§3.2)
- [x] Backfill: N/A — FK only, no data changes
- [x] factories.ts: N/A — no new fields
- [x] `npm run typecheck` after `db:generate`

### If API/UI/Shared Logic/Pipeline:
- ⬜ N/A all sub-items

## Execution Plan
- [ ] **Rollback Anchor:** `a92b8c8`
- [ ] **State Verification:** entity_projects has only entity_id FK, no permits FK
- [ ] **Spec Review:** Spec 37 §3 lists entity_projects junction with permit_num/revision_num
- [ ] **Reproduction:** Confirmed via pg_constraint query
- [ ] **Red Light:** N/A — DB constraint, not testable via vitest
- [ ] **Fix:**
  1. Write `migrations/057_entity_projects_permit_fk.sql`
  2. Apply migration
  3. `npm run db:generate` + patch FTS + add sync_runs comment
  4. `npm run typecheck && npm run test`
- [ ] **Green Light:** All pass. → WF6.
