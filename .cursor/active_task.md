# Active Task: Fix composite key relations + add CoA→permits FK
**Status:** Implementation
**Rollback Anchor:** `29336eb`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** (1) Fix drizzle-kit bug: relations.ts uses single-column permit references instead of composite (permit_num, revision_num). (2) Add missing coa_applications.linked_permit_num FK to permits and corresponding Drizzle relation.
* **Target Spec:** `docs/specs/37_corporate_identity_hub.md`, `docs/specs/12_coa_integration.md`
* **Key Files:**
  - `migrations/058_coa_permit_fk.sql` — new FK for coa_applications→permits
  - `src/lib/db/generated/relations.ts` — fix composite refs, add CoA relation
  - `src/lib/db/generated/schema.ts` — regenerate after 058

## Technical Implementation
* **relations.ts:** Patch 3 relations to use composite `[permitNum, revisionNum]` instead of `[permitNum]` alone: entityProjectsRelations, permitParcelsRelations, permitTradesRelations
* **Migration 058:** `ALTER TABLE coa_applications ADD CONSTRAINT fk_coa_linked_permit FOREIGN KEY (linked_permit_num) REFERENCES permits(permit_num)` — single-column FK since CoA links by permit_num only (no revision_num on coa_applications)
* **Database Impact:** YES — 1 new FK on coa_applications (32K rows)

## §10 Plan Compliance Checklist

### If Database Impact = YES:
- [x] UP + DOWN migration (§3.2)
- [x] Backfill: N/A — FK only
- [x] factories.ts: N/A — no new fields
- [x] typecheck after db:generate

### Other categories: ⬜ N/A

## Execution Plan
- [ ] **Rollback Anchor:** `29336eb`
- [ ] **State Verification:** Confirmed single-column refs in relations.ts; no FK on coa_applications
- [ ] **Fix:**
  1. Write + apply migration 058 (coa_applications→permits FK)
  2. `db:generate` to pick up new FK
  3. Patch relations.ts composite references + add coaApplications relation
  4. Patch FTS + remove PostGIS system artifacts (recurring drizzle-kit bug)
- [ ] **Green Light:** typecheck + test pass → WF6
